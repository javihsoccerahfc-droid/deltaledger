import { describe, it, expect, beforeAll } from "vitest";
import { resetTestDatabase } from "./testDb";
import { db } from "../client";
import { partNumberCrosswalks } from "../schema";
import { eq } from "drizzle-orm";
import * as crosswalkRepo from "../repositories/crosswalk";
import { getOrCreateDefaultOrganization } from "../repositories/organizations";

beforeAll(async () => {
  await resetTestDatabase();
});

/**
 * Phase 6A -- item 2. Proves the fix at both the layer that matters most for the normal
 * (non-racing) case -- the repository proactively skipping pairs that already have an active
 * row -- and the layer that matters for the racing case -- the database-level partial unique
 * index refusing a duplicate even if the repository's own check were ever bypassed.
 */
describe("crosswalk generation idempotency", () => {
  it("running generation twice for the same parts does not increase the active row count", async () => {
    const first = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-IDEMPOTENT"], ["PN-IDEMPOTENT"]);
    expect(first).toHaveLength(1);

    const second = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-IDEMPOTENT"], ["PN-IDEMPOTENT"]);
    expect(second).toHaveLength(0); // nothing new created -- the pair is already covered

    const active = await db
      .select()
      .from(partNumberCrosswalks)
      .where(eq(partNumberCrosswalks.plmPartId, "PN-IDEMPOTENT"));
    expect(active).toHaveLength(1);
  });

  it("a mixed batch still creates suggestions for genuinely new parts while skipping already-covered ones", async () => {
    await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-MIXED-OLD"], ["PN-MIXED-OLD"]);

    const created = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(
      ["PN-MIXED-OLD", "PN-MIXED-NEW"],
      ["PN-MIXED-OLD", "PN-MIXED-NEW"]
    );
    expect(created).toHaveLength(1);
    expect(created[0].plmPartId).toBe("PN-MIXED-NEW");

    const oldRows = await db.select().from(partNumberCrosswalks).where(eq(partNumberCrosswalks.plmPartId, "PN-MIXED-OLD"));
    expect(oldRows).toHaveLength(1); // still exactly one -- not duplicated
  });

  it("a rejected suggestion for an exact pair is not silently regenerated", async () => {
    const [created] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-REJECTED"], ["PN-REJECTED"]);
    await crosswalkRepo.rejectCrosswalkById(created.id, { id: "u-1", name: "Pat", role: "part_data_owner" });

    const regenerated = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-REJECTED"], ["PN-REJECTED"]);
    expect(regenerated).toHaveLength(0); // the rejection is a real decision -- it must not be silently duplicated

    const rows = await db.select().from(partNumberCrosswalks).where(eq(partNumberCrosswalks.plmPartId, "PN-REJECTED"));
    expect(rows).toHaveLength(1);
    expect(rows[0].reviewStatus).toBe("rejected");
  });

  it("a superseded row does not block a new suggestion for the same pair (Item 3 interaction)", async () => {
    const [created] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-SUPERSEDED"], ["PN-SUPERSEDED"]);
    // Simulate what Item 3's supersession lifecycle will do: mark this row superseded by a
    // new row rather than mutating it in place.
    await db.update(partNumberCrosswalks).set({ supersededById: "some-replacement-id" }).where(eq(partNumberCrosswalks.id, created.id));

    const regenerated = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-SUPERSEDED"], ["PN-SUPERSEDED"]);
    expect(regenerated).toHaveLength(1); // superseded rows genuinely free up the pair for a new active suggestion

    const activeRows = await db
      .select()
      .from(partNumberCrosswalks)
      .where(eq(partNumberCrosswalks.plmPartId, "PN-SUPERSEDED"));
    const stillActive = activeRows.filter((r) => r.supersededById === null);
    expect(stillActive).toHaveLength(1);
    expect(stillActive[0].id).toBe(regenerated[0].id);
  });

  it("the database itself refuses a duplicate active pair, independent of the repository's own filtering", async () => {
    const org = await getOrCreateDefaultOrganization();
    await db.insert(partNumberCrosswalks).values({
      organizationId: org.id,
      plmPartId: "PN-RAW-DUPLICATE",
      erpPartId: "PN-RAW-DUPLICATE",
      matchMethod: "manual",
      confidence: 1,
      reviewStatus: "unreviewed",
      effectiveDate: "2026-01-01",
      mappingType: "one_to_one",
    });

    await expect(
      db.insert(partNumberCrosswalks).values({
        organizationId: org.id,
        plmPartId: "PN-RAW-DUPLICATE",
        erpPartId: "PN-RAW-DUPLICATE",
        matchMethod: "manual",
        confidence: 1,
        reviewStatus: "unreviewed",
        effectiveDate: "2026-01-01",
        mappingType: "one_to_one",
      })
    ).rejects.toThrow();
  });

  it("a genuine one-PLM-to-many-ERP split is still allowed -- the constraint is scoped to the pair, not the PLM part alone", async () => {
    const org = await getOrCreateDefaultOrganization();
    await db.insert(partNumberCrosswalks).values({
      organizationId: org.id,
      plmPartId: "PN-SPLIT",
      erpPartId: "ERP-SPLIT-A",
      matchMethod: "manual",
      confidence: 1,
      reviewStatus: "approved",
      effectiveDate: "2026-01-01",
      mappingType: "one_to_many",
    });

    // Same PLM part, DIFFERENT resolved ERP identifier -- a real, supported split, not a duplicate.
    await expect(
      db.insert(partNumberCrosswalks).values({
        organizationId: org.id,
        plmPartId: "PN-SPLIT",
        erpPartId: "ERP-SPLIT-B",
        matchMethod: "manual",
        confidence: 1,
        reviewStatus: "approved",
        effectiveDate: "2026-01-01",
        mappingType: "one_to_many",
      })
    ).resolves.toBeDefined();

    const rows = await db
      .select()
      .from(partNumberCrosswalks)
      .where(eq(partNumberCrosswalks.plmPartId, "PN-SPLIT"));
    expect(rows.filter((r) => r.supersededById === null)).toHaveLength(2);
  });
});

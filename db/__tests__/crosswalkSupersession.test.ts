import { describe, it, expect, beforeAll, vi } from "vitest";
import { resetTestDatabase } from "./testDb";
import { db } from "../client";
import { partNumberCrosswalks } from "../schema";
import { eq } from "drizzle-orm";
import * as crosswalkRepo from "../repositories/crosswalk";
import { reviseMappingAction, approveMappingAction, rejectMappingAction, getCrosswalksAction } from "@/app/actions";
import { User } from "@/domains/deltaledger/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const owner: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };
const otherOwner: User = { id: "u-2", name: "Sam Reviewer", role: "part_data_owner" };
const buyer: User = { id: "u-buyer", name: "Bob Buyer", role: "buyer" };

beforeAll(async () => {
  await resetTestDatabase();
});

async function makeUnreviewedCrosswalk(plmPartId: string, erpPartId: string) {
  const [cw] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions([plmPartId], [erpPartId]);
  return cw;
}

describe("crosswalk supersession lifecycle", () => {
  it("unreviewed -> approved works exactly as before", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T1", "ERP-T1");
    const result = await crosswalkRepo.approveCrosswalkById(cw.id, owner);
    expect(result.success).toBe(true);
    const after = await crosswalkRepo.getCrosswalkById(cw.id);
    expect(after?.reviewStatus).toBe("approved");
    expect(after?.supersededById).toBeNull();
  });

  it("unreviewed -> rejected works exactly as before", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T2", "ERP-T2");
    const result = await crosswalkRepo.rejectCrosswalkById(cw.id, owner);
    expect(result.success).toBe(true);
    const after = await crosswalkRepo.getCrosswalkById(cw.id);
    expect(after?.reviewStatus).toBe("rejected");
  });

  it("an already-approved row cannot be re-approved or rejected in place -- the repository itself refuses it, not just the UI", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T3", "ERP-T3");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);

    const reapprove = await crosswalkRepo.approveCrosswalkById(cw.id, otherOwner);
    expect(reapprove.success).toBe(false);

    const rejectAfterApprove = await crosswalkRepo.rejectCrosswalkById(cw.id, otherOwner);
    expect(rejectAfterApprove.success).toBe(false);

    // Unaffected -- still the original approver, never silently overwritten.
    const after = await crosswalkRepo.getCrosswalkById(cw.id);
    expect(after?.reviewedBy).toBe(owner.id);
  });

  it("approved -> superseded: a revision creates a new row and marks the prior one superseded, never mutating it", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T4", "ERP-T4-OLD");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);

    const revision = await crosswalkRepo.reviseCrosswalk(
      cw.id,
      { erpPartId: "ERP-T4-NEW", mappingType: "one_to_one" },
      otherOwner,
      "Corrected after supplier feedback."
    );
    expect(revision.success).toBe(true);
    if (!revision.success) return;

    const oldRow = await crosswalkRepo.getCrosswalkById(cw.id);
    expect(oldRow?.reviewStatus).toBe("approved"); // never mutated
    expect(oldRow?.erpPartId).toBe("ERP-T4-OLD"); // never mutated
    expect(oldRow?.reviewedBy).toBe(owner.id); // never mutated
    expect(oldRow?.supersededById).toBe(revision.created.id);

    expect(revision.created.reviewStatus).toBe("approved");
    expect(revision.created.erpPartId).toBe("ERP-T4-NEW");
    expect(revision.created.reviewedBy).toBe(otherOwner.id);
    expect(revision.created.supersededById).toBeNull();
  });

  it("rejected -> reconsidered: a revision on a rejected row produces a new approved row", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T5", "ERP-T5-WRONG");
    await crosswalkRepo.rejectCrosswalkById(cw.id, owner);

    const revision = await crosswalkRepo.reviseCrosswalk(
      cw.id,
      { erpPartId: "ERP-T5-RIGHT", mappingType: "one_to_one" },
      owner,
      "Found the correct ERP part after checking with the supplier."
    );
    expect(revision.success).toBe(true);
    if (!revision.success) return;
    expect(revision.created.reviewStatus).toBe("approved");

    const oldRow = await crosswalkRepo.getCrosswalkById(cw.id);
    expect(oldRow?.reviewStatus).toBe("rejected"); // the rejection itself is preserved, not erased
    expect(oldRow?.supersededById).toBe(revision.created.id);
  });

  it("an unreviewed row cannot be revised -- it must be approved or rejected first", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T6", "ERP-T6");
    const revision = await crosswalkRepo.reviseCrosswalk(cw.id, { erpPartId: "ERP-T6-X", mappingType: "one_to_one" }, owner, "test");
    expect(revision.success).toBe(false);
  });

  it("an already-superseded row cannot be revised again through it -- revise the CURRENT active row instead", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T7", "ERP-T7-A");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);
    const firstRevision = await crosswalkRepo.reviseCrosswalk(cw.id, { erpPartId: "ERP-T7-B", mappingType: "one_to_one" }, owner, "first correction");
    expect(firstRevision.success).toBe(true);

    // Attempting to revise the now-superseded ORIGINAL row again must fail.
    const revisionOfStaleRow = await crosswalkRepo.reviseCrosswalk(cw.id, { erpPartId: "ERP-T7-C", mappingType: "one_to_one" }, owner, "second correction");
    expect(revisionOfStaleRow.success).toBe(false);

    // Revising the CURRENT active row (the first revision's result) works fine.
    if (firstRevision.success) {
      const secondRevision = await crosswalkRepo.reviseCrosswalk(
        firstRevision.created.id,
        { erpPartId: "ERP-T7-C", mappingType: "one_to_one" },
        owner,
        "second correction"
      );
      expect(secondRevision.success).toBe(true);
    }
  });

  it("only one active row exists per (plmPartId, erpPartId) pair at any point in the revision chain", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T8", "ERP-T8-A");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);
    await crosswalkRepo.reviseCrosswalk(cw.id, { erpPartId: "ERP-T8-B", mappingType: "one_to_one" }, owner, "correction");

    const allRows = await db.select().from(partNumberCrosswalks).where(eq(partNumberCrosswalks.plmPartId, "PN-T8"));
    const active = allRows.filter((r) => r.supersededById === null);
    expect(active).toHaveLength(1);
    expect(active[0].erpPartId).toBe("ERP-T8-B");
    expect(allRows).toHaveLength(2); // history preserved -- both rows still exist
  });

  it("a user without approval authority cannot revise a mapping", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T9", "ERP-T9");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);
    const revision = await crosswalkRepo.reviseCrosswalk(cw.id, { erpPartId: "ERP-T9-X", mappingType: "one_to_one" }, buyer, "unauthorized attempt");
    expect(revision.success).toBe(false);
  });

  it("getCrosswalksAction (the Server Action every UI consumer uses) returns only active rows, never superseded history", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T10", "ERP-T10-A");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);
    await crosswalkRepo.reviseCrosswalk(cw.id, { erpPartId: "ERP-T10-B", mappingType: "one_to_one" }, owner, "correction");

    const active = await getCrosswalksAction();
    const matchesForThisPart = active.filter((c) => c.plmPartId === "PN-T10");
    expect(matchesForThisPart).toHaveLength(1);
    expect(matchesForThisPart[0].erpPartId).toBe("ERP-T10-B");
  });

  it("the full Server Action path records an audit event naming both the old and new mapping", async () => {
    const ecActions = await import("@/app/actions");
    const cw = await makeUnreviewedCrosswalk("PN-T11", "ERP-T11-OLD");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);

    // Use a real EC id so the audit event has somewhere to attach.
    const ecRepo = await import("../repositories/engineeringChanges");
    const ec = await ecRepo.createEngineeringChange("ECO-SUPERSESSION-AUDIT", "desc", owner.id);

    const result = await reviseMappingAction(
      ec.id,
      cw.id,
      { erpPartId: "ERP-T11-NEW", mappingType: "one_to_one" },
      "Corrected after supplier confirmation.",
      owner
    );
    expect(result.success).toBe(true);

    const timeline = await ecActions.getTimelineEntriesAction(ec.id);
    const revisionEntry = timeline.find((t) => t.action.includes("Revised the mapping"));
    expect(revisionEntry).toBeDefined();
    expect(revisionEntry?.action).toContain("ERP-T11-OLD");
    expect(revisionEntry?.action).toContain("ERP-T11-NEW");
    expect(revisionEntry?.action).toContain("Corrected after supplier confirmation");
  });

  it("approveMappingAction and rejectMappingAction (the real Server Actions) also refuse to act on an already-decided mapping", async () => {
    const ecRepo = await import("../repositories/engineeringChanges");
    const ec = await ecRepo.createEngineeringChange("ECO-GUARD-CHECK", "desc", owner.id);
    const cw = await makeUnreviewedCrosswalk("PN-T12", "ERP-T12");
    await approveMappingAction(ec.id, cw.id, owner);

    const secondApprove = await approveMappingAction(ec.id, cw.id, otherOwner);
    expect(secondApprove.success).toBe(false);

    const rejectAttempt = await rejectMappingAction(ec.id, cw.id, otherOwner);
    expect(rejectAttempt.success).toBe(false);
  });

  it("a revision that keeps the SAME erpPartId (correcting only the mapping type) still works -- regression test for a transaction-ordering bug where the old row briefly looked active during the insert", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T13", "ERP-T13-SAME");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);

    const revision = await crosswalkRepo.reviseCrosswalk(
      cw.id,
      { erpPartId: "ERP-T13-SAME", mappingType: "one_to_many" },
      owner,
      "Correcting the mapping type only, ERP part number was already right."
    );
    expect(revision.success).toBe(true);
    if (!revision.success) return;
    expect(revision.created.erpPartId).toBe("ERP-T13-SAME");
    expect(revision.created.mappingType).toBe("one_to_many");

    const oldRow = await crosswalkRepo.getCrosswalkById(cw.id);
    expect(oldRow?.supersededById).toBe(revision.created.id);
  });

  it("approved -> revoked (no replacement yet): supersedes with a rejected row, and resolvePartIdentity correctly reports the part as unresolved going forward", async () => {
    const cw = await makeUnreviewedCrosswalk("PN-T14", "ERP-T14");
    await crosswalkRepo.approveCrosswalkById(cw.id, owner);

    const revocation = await crosswalkRepo.revokeCrosswalk(cw.id, owner, "No longer trust this mapping; replacement not yet confirmed.");
    expect(revocation.success).toBe(true);
    if (!revocation.success) return;
    expect(revocation.created.reviewStatus).toBe("rejected");
    expect(revocation.created.erpPartId).toBe("ERP-T14"); // same pair, just no longer approved

    const oldRow = await crosswalkRepo.getCrosswalkById(cw.id);
    expect(oldRow?.reviewStatus).toBe("approved"); // never mutated
    expect(oldRow?.supersededById).toBe(revocation.created.id);

    const { resolvePartIdentity } = await import("@/domains/deltaledger/identityResolution");
    const active = await getCrosswalksAction();
    const resolution = resolvePartIdentity("PN-T14", active);
    expect(resolution.status).toBe("unresolved");
  });

  it("only an approved mapping can be revoked -- an unreviewed or already-rejected row cannot be", async () => {
    const unreviewedCw = await makeUnreviewedCrosswalk("PN-T15", "ERP-T15");
    const revokeUnreviewed = await crosswalkRepo.revokeCrosswalk(unreviewedCw.id, owner, "attempt");
    expect(revokeUnreviewed.success).toBe(false);

    const rejectedCw = await makeUnreviewedCrosswalk("PN-T16", "ERP-T16");
    await crosswalkRepo.rejectCrosswalkById(rejectedCw.id, owner);
    const revokeRejected = await crosswalkRepo.revokeCrosswalk(rejectedCw.id, owner, "attempt");
    expect(revokeRejected.success).toBe(false);
  });
});

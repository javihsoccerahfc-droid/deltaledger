import { describe, it, expect, beforeAll, vi } from "vitest";
import { resetTestDatabase } from "./testDb";
import * as ecRepo from "../repositories/engineeringChanges";
import * as crosswalkRepo from "../repositories/crosswalk";
import {
  importBomAction,
  importPurchaseOrderAction,
  generateMappingSuggestionsAction,
  approveMappingAction,
  calculateExposureAction,
  getCrosswalksAction,
  getEvidenceExplanationAction,
  getTimelineEntriesAction,
  getActiveExposureRecordsAction,
} from "@/app/actions";
import { User } from "@/domains/deltaledger/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actor: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };
const otherReviewer: User = { id: "u-2", name: "Sam Reviewer", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

function csvFile(csv: string, name: string): File {
  return new File([csv], name, { type: "text/csv" });
}

async function setUpCalculatedEc(name: string) {
  const partNumber = `PN-EVID-${name}`;
  const ec = await ecRepo.createEngineeringChange(name, "desc", actor.id);

  const currentFd = new FormData();
  currentFd.set("ecId", ec.id);
  currentFd.set("versionLabel", "current");
  currentFd.set("file", csvFile(`Part Number,Description,Quantity Per\n${partNumber},x,200`, "current.csv"));
  currentFd.set("actor", JSON.stringify(actor));
  expect((await importBomAction(currentFd)).success).toBe(true);

  const proposedFd = new FormData();
  proposedFd.set("ecId", ec.id);
  proposedFd.set("versionLabel", "proposed");
  proposedFd.set("file", csvFile("Part Number,Description,Quantity Per\n", "proposed.csv"));
  proposedFd.set("actor", JSON.stringify(actor));
  expect((await importBomAction(proposedFd)).success).toBe(true);

  const poFd = new FormData();
  poFd.set("ecId", ec.id);
  poFd.set(
    "file",
    csvFile(
      `PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-EVID,Bosch,771-EVID-${name},200,92,USD,2026-09-01`,
      "po.csv"
    )
  );
  poFd.set("actor", JSON.stringify(actor));
  expect((await importPurchaseOrderAction(poFd)).success).toBe(true);

  await generateMappingSuggestionsAction(ec.id, actor);
  const crosswalks = await getCrosswalksAction();
  const cw = crosswalks.find((c) => c.plmPartId.toUpperCase() === partNumber.toUpperCase());
  expect(cw).toBeDefined();
  expect((await approveMappingAction(ec.id, cw!.id, actor)).success).toBe(true);

  const calcResult = await calculateExposureAction(ec.id, actor);
  expect(calcResult.createdRecordIds).toHaveLength(1);

  return { ec, crosswalkId: cw!.id, recordId: calcResult.createdRecordIds[0], erpPartId: `771-EVID-${name}` };
}

describe("Milestone 3.75 -- Evidence Integrity, verified through the real Server Action path", () => {
  it("Case 1 -- crosswalk later revised by a different reviewer: historical explanation is completely unaffected", async () => {
    const { ec, crosswalkId, recordId, erpPartId } = await setUpCalculatedEc("Evidence integrity: Case 1");

    const before = await getEvidenceExplanationAction(recordId);
    expect(before).not.toBeNull();

    // Revise the crosswalk's live state in a way that would previously have leaked into the
    // historical explanation: a different reviewer corrects the mapping.
    const { reviseMappingAction } = await import("@/app/actions");
    const revised = await reviseMappingAction(
      ec.id,
      crosswalkId,
      { erpPartId: `${erpPartId}-CORRECTED`, mappingType: "one_to_one" },
      "Correcting a data-entry error caught during review.",
      otherReviewer
    );
    expect(revised.success).toBe(true);

    const after = await getEvidenceExplanationAction(recordId);
    expect(after).not.toBeNull();
    expect(after).toEqual(before); // completely unaffected, not just the numbers
  });

  it("Case 3 -- reviewer changes via a revision: historical explanation still names the ORIGINAL reviewer, not the new one", async () => {
    const { ec, crosswalkId, recordId, erpPartId } = await setUpCalculatedEc("Evidence integrity: Case 3");

    const before = await getEvidenceExplanationAction(recordId);
    const originalReviewerFact = before!.facts.find((f) => f.label === "Crosswalk approval")?.value;
    expect(originalReviewerFact).toContain(actor.id); // reviewedBy stores user.id, confirmed in crosswalk.ts

    // A different reviewer revises the mapping (simulating a reviewer change via correction).
    const { reviseMappingAction } = await import("@/app/actions");
    const revised = await reviseMappingAction(
      ec.id,
      crosswalkId,
      { erpPartId: `${erpPartId}-CORRECTED`, mappingType: "one_to_one" },
      "Reviewer correction.",
      otherReviewer
    );
    expect(revised.success).toBe(true);

    // Confirm the LIVE, ACTIVE crosswalk really did change to the new reviewer's revision (sanity check the test itself).
    const liveCrosswalks = await getCrosswalksAction();
    const liveCrosswalk = revised.success ? liveCrosswalks.find((c) => c.id === revised.created.id) : undefined;
    expect(liveCrosswalk?.reviewedBy).toBe(otherReviewer.id);

    // But the historical explanation still names the ORIGINAL reviewer.
    const after = await getEvidenceExplanationAction(recordId);
    const historicalReviewerFact = after!.facts.find((f) => f.label === "Crosswalk approval")?.value;
    expect(historicalReviewerFact).toContain(actor.id);
    expect(historicalReviewerFact).not.toContain(otherReviewer.id);
  });

  it("Case 4 -- Timeline and Evidence Explorer both remain historically correct after the crosswalk is revised", async () => {
    const { ec, crosswalkId, recordId, erpPartId } = await setUpCalculatedEc("Evidence integrity: Case 4");

    const timelineBefore = await getTimelineEntriesAction(ec.id);
    const explanationBefore = await getEvidenceExplanationAction(recordId);

    const { reviseMappingAction } = await import("@/app/actions");
    const revised = await reviseMappingAction(
      ec.id,
      crosswalkId,
      { erpPartId: `${erpPartId}-CORRECTED`, mappingType: "one_to_one" },
      "Correcting the mapping.",
      actor
    );
    expect(revised.success).toBe(true);

    // The Timeline is built entirely from audit_log_entries, which are themselves
    // append-only (a new entry is recorded for the revision; no existing entry is edited) --
    // so every PRIOR entry must be byte-identical; only a new entry is appended.
    const timelineAfter = await getTimelineEntriesAction(ec.id);
    expect(timelineAfter.length).toBe(timelineBefore.length + 1);
    expect(timelineAfter.slice(1)).toEqual(timelineBefore); // reverse-chronological -- prior entries unchanged, new one prepended

    // The Evidence Explorer for the historical record is also completely unaffected.
    const explanationAfter = await getEvidenceExplanationAction(recordId);
    expect(explanationAfter).toEqual(explanationBefore);
  });

  it("legacy snapshots (predating evidence freezing) are handled honestly, not silently backfilled or guessed at", async () => {
    // Simulate what a genuine pre-Milestone-3.75 snapshot looks like: the new evidence
    // columns are NULL, exactly as they are for every row that existed before this
    // migration -- never backfilled, per the same honest-legacy-gap precedent already
    // established for purchaseOrderImportId on this same table.
    const { recordId } = await setUpCalculatedEc("Evidence integrity: legacy snapshot simulation");
    const { db } = await import("../client");
    const { sql } = await import("drizzle-orm");
    const { getExposureRecordById } = await import("../repositories/exposure");
    const record = await getExposureRecordById(recordId);
    await db.execute(
      sql`update exposure_source_snapshots set crosswalk_erp_part_id = null, crosswalk_match_method = null, crosswalk_review_status = null, crosswalk_reviewed_by = null, crosswalk_reviewed_at = null, allocation_method = null where id = ${record!.exposureSourceSnapshotId}`
    );

    const explanation = await getEvidenceExplanationAction(recordId);
    expect(explanation).not.toBeNull();
    const crosswalkFact = explanation!.facts.find((f) => f.label === "Crosswalk approval")?.value;
    expect(crosswalkFact).toContain("Historical evidence unavailable");
    expect(crosswalkFact).not.toContain("approved"); // never a guessed/implied status
    expect(explanation!.appliedRules.map((r) => r.label)).not.toContain("Match method"); // never fabricated
  });
});

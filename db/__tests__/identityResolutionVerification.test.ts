import { describe, it, expect, beforeAll, vi } from "vitest";
import { resetTestDatabase } from "./testDb";
import * as ecRepo from "../repositories/engineeringChanges";
import * as crosswalkRepo from "../repositories/crosswalk";
import {
  importBomAction,
  importPurchaseOrderAction,
  generateMappingSuggestionsAction,
  approveMappingAction,
  rejectMappingAction,
  calculateExposureAction,
  getActiveExposureRecordsAction,
  getCrosswalksAction,
} from "@/app/actions";
import { User } from "@/domains/deltaledger/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actor: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

function csvFile(csv: string, name: string): File {
  return new File([csv], name, { type: "text/csv" });
}

/** Imports a minimal BOM (one removed part) + one PO line, through the real Server Actions. */
async function setUpEcWithBomAndPo(plmPart: string, erpPart: string, quantity = 200, unitPrice = 92) {
  const ec = await ecRepo.createEngineeringChange(`Identity resolution test: ${plmPart}->${erpPart}`, "desc", actor.id);

  const currentFd = new FormData();
  currentFd.set("ecId", ec.id);
  currentFd.set("versionLabel", "current");
  currentFd.set("file", csvFile(`Part Number,Description,Quantity Per\n${plmPart},x,${quantity}`, "current.csv"));
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
      `PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-${erpPart},Bosch,${erpPart},${quantity},${unitPrice},USD,2026-09-01`,
      "po.csv"
    )
  );
  poFd.set("actor", JSON.stringify(actor));
  expect((await importPurchaseOrderAction(poFd)).success).toBe(true);

  return ec;
}

describe("Identity Resolution (Milestone 3.5) -- six required regression cases, verified through the real Server Action path", () => {
  it("Case 1 -- PLM identifier equal to ERP identifier: exposure behaves exactly as before this milestone", async () => {
    const ec = await setUpEcWithBomAndPo("PN-SAME", "PN-SAME");
    await generateMappingSuggestionsAction(ec.id, actor);
    const crosswalks = await getCrosswalksAction();
    const cw = crosswalks.find((c) => c.plmPartId.toUpperCase() === "PN-SAME");
    expect(cw).toBeDefined();
    expect((await approveMappingAction(ec.id, cw!.id, actor)).success).toBe(true);

    const calcResult = await calculateExposureAction(ec.id, actor);
    expect(calcResult.gaps).toHaveLength(0);
    expect(calcResult.createdRecordIds).toHaveLength(1);

    const records = await getActiveExposureRecordsAction(ec.id);
    expect(records).toHaveLength(1);
    expect(records[0].grossCommittedValueReporting).toBe(200 * 92);
  });

  it("Case 2 -- PLM identifier differs from ERP identifier, with an approved crosswalk: exposure is calculated correctly (the exact scenario that previously silently produced nothing)", async () => {
    const ec = await setUpEcWithBomAndPo("PN-4471", "771-4471");
    await generateMappingSuggestionsAction(ec.id, actor);
    const crosswalks = await getCrosswalksAction();
    const cw = crosswalks.find((c) => c.plmPartId.toUpperCase() === "PN-4471");
    expect(cw).toBeDefined();
    expect(cw!.erpPartId).toBe("771-4471");
    expect((await approveMappingAction(ec.id, cw!.id, actor)).success).toBe(true);

    const calcResult = await calculateExposureAction(ec.id, actor);
    expect(calcResult.gaps).toHaveLength(0); // NOT silently empty with no explanation
    expect(calcResult.createdRecordIds).toHaveLength(1); // NOT silently zero records

    const records = await getActiveExposureRecordsAction(ec.id);
    expect(records).toHaveLength(1);
    expect(records[0].grossCommittedValueReporting).toBe(200 * 92);
    // "estimated," not "known" -- confidence classification is driven purely by whether
    // alternate demand has been explicitly reviewed for this part (see calculateExposure.ts's
    // classifyConfidence), entirely unrelated to identity resolution or match method. A fresh
    // calculation with no alternate-demand review yet is "estimated" by design, exactly as
    // exposureFlow.test.ts's own first test already establishes for an unrelated scenario.
    expect(records[0].confidenceClassification).toBe("estimated");
  });

  it("Case 3 -- no approved crosswalk exists: exposure is NOT silently zero -- an explicit, specific gap is reported", async () => {
    const ec = await setUpEcWithBomAndPo("PN-UNMAPPED", "771-UNMAPPED");
    await generateMappingSuggestionsAction(ec.id, actor);
    // Deliberately do NOT approve the generated suggestion.

    const calcResult = await calculateExposureAction(ec.id, actor);
    expect(calcResult.createdRecordIds).toHaveLength(0);
    expect(calcResult.gaps).toHaveLength(1);
    expect(calcResult.gaps[0].reason).toContain("No approved crosswalk exists for PN-UNMAPPED");

    const records = await getActiveExposureRecordsAction(ec.id);
    expect(records).toHaveLength(0); // confirmed absent, not a hidden $0 record
  });

  it("Case 3b -- an explicitly REJECTED crosswalk is also treated as unresolved, not silently matched", async () => {
    const ec = await setUpEcWithBomAndPo("PN-REJECTED", "771-REJECTED");
    await generateMappingSuggestionsAction(ec.id, actor);
    const crosswalks = await getCrosswalksAction();
    const cw = crosswalks.find((c) => c.plmPartId.toUpperCase() === "PN-REJECTED");
    expect((await rejectMappingAction(ec.id, cw!.id, actor)).success).toBe(true);

    const calcResult = await calculateExposureAction(ec.id, actor);
    expect(calcResult.createdRecordIds).toHaveLength(0);
    expect(calcResult.gaps).toHaveLength(1);
    expect(calcResult.gaps[0].reason).toContain("No approved crosswalk exists");
  });

  it("Case 5 -- many PLM identifiers resolving to one ERP identifier: each EC's allocation is independently correct (fully reachable through the real app flow -- two different ECs, each mapping its own PLM part to the same ERP part)", async () => {
    const ecA = await setUpEcWithBomAndPo("PN-LEGACY-A", "771-CONSOLIDATED", 100, 10);
    const ecB = await setUpEcWithBomAndPo("PN-LEGACY-B", "771-CONSOLIDATED", 50, 10);

    for (const ec of [ecA, ecB]) {
      await generateMappingSuggestionsAction(ec.id, actor);
    }

    // Re-fetch once both suggestions exist, approve each against its OWN EC's PO data.
    const allCrosswalks = await getCrosswalksAction();
    const cwA = allCrosswalks.find((c) => c.plmPartId.toUpperCase() === "PN-LEGACY-A");
    const cwB = allCrosswalks.find((c) => c.plmPartId.toUpperCase() === "PN-LEGACY-B");
    expect(cwA).toBeDefined();
    expect(cwB).toBeDefined();
    expect((await approveMappingAction(ecA.id, cwA!.id, actor)).success).toBe(true);
    expect((await approveMappingAction(ecB.id, cwB!.id, actor)).success).toBe(true);

    const resultA = await calculateExposureAction(ecA.id, actor);
    const resultB = await calculateExposureAction(ecB.id, actor);
    expect(resultA.gaps).toHaveLength(0);
    expect(resultB.gaps).toHaveLength(0);

    const recordsA = await getActiveExposureRecordsAction(ecA.id);
    const recordsB = await getActiveExposureRecordsAction(ecB.id);
    expect(recordsA[0].grossCommittedValueReporting).toBe(100 * 10);
    expect(recordsB[0].grossCommittedValueReporting).toBe(50 * 10);
  });

  it("Case 6 -- crosswalk approval later removed (rejected): the PRIOR calculation remains fully, historically explainable; a NEW calculation reflects the current (now unapproved) state", async () => {
    const ec = await setUpEcWithBomAndPo("PN-REVOKED", "771-REVOKED");
    await generateMappingSuggestionsAction(ec.id, actor);
    const crosswalks = await getCrosswalksAction();
    const cw = crosswalks.find((c) => c.plmPartId.toUpperCase() === "PN-REVOKED");
    expect((await approveMappingAction(ec.id, cw!.id, actor)).success).toBe(true);

    const firstCalc = await calculateExposureAction(ec.id, actor);
    expect(firstCalc.createdRecordIds).toHaveLength(1);
    const firstRecordId = firstCalc.createdRecordIds[0];

    // Historical evidence must remain fully intact and explainable -- unaffected by anything
    // that happens to the crosswalk afterward.
    const { getEvidenceExplanationAction } = await import("@/app/actions");
    const historicalExplanation = await getEvidenceExplanationAction(firstRecordId);
    expect(historicalExplanation).not.toBeNull();
    expect(historicalExplanation!.facts.some((f) => f.label === "Crosswalk approval" && f.value.includes("approved"))).toBe(true);

    // Now revoke approval (no confirmed replacement mapping exists yet).
    const { revokeMappingAction } = await import("@/app/actions");
    expect((await revokeMappingAction(ec.id, cw!.id, "Discovered this mapping was incorrect.", actor)).success).toBe(true);

    const historicalExplanationAfterRevoke = await getEvidenceExplanationAction(firstRecordId);
    expect(historicalExplanationAfterRevoke).not.toBeNull();

    // The NUMERIC evidence -- the calculation itself -- is genuinely immutable: every
    // financial figure and every fact drawn directly from the frozen snapshot (PO number,
    // supplier, quantity, unit cost) is byte-identical before and after the crosswalk is
    // rejected. This is the core "historical calculations remain historically explainable"
    // promise, and it holds.
    const numericFacts = (facts: { label: string; value: string }[]) => facts.filter((f) => f.label !== "Crosswalk approval");
    expect(numericFacts(historicalExplanationAfterRevoke!.facts)).toEqual(numericFacts(historicalExplanation!.facts));
    expect(historicalExplanationAfterRevoke!.calculationSteps).toEqual(historicalExplanation!.calculationSteps);
    expect(historicalExplanationAfterRevoke!.conclusion).toEqual(historicalExplanation!.conclusion);

    // Milestone 3.75 FIXED this exact inconsistency: the "Crosswalk approval" fact is now
    // frozen at calculation time (see db/schema.ts's exposure_source_snapshots evidence
    // columns), not a live lookup. It correctly no longer changes after the mapping is later
    // revoked -- fulfilling this milestone's own Case 2 requirement precisely.
    expect(historicalExplanationAfterRevoke!.facts).toEqual(historicalExplanation!.facts);
    const crosswalkFact = (facts: { label: string; value: string }[]) => facts.find((f) => f.label === "Crosswalk approval")?.value;
    expect(crosswalkFact(historicalExplanation!.facts)).toContain("approved");
    expect(crosswalkFact(historicalExplanationAfterRevoke!.facts)).toContain("approved"); // unchanged, not "not yet approved"
    expect(crosswalkFact(historicalExplanationAfterRevoke!.facts)).not.toContain("not yet approved");

    // A NEW calculation now reflects the current, unapproved state -- unresolved, not a stale
    // silent reuse of the old approved figure.
    const secondCalc = await calculateExposureAction(ec.id, actor);
    expect(secondCalc.createdRecordIds).toHaveLength(0);
    expect(secondCalc.gaps).toHaveLength(1);
    expect(secondCalc.gaps[0].reason).toContain("No approved crosswalk exists");

    // The old record correctly REMAINS active: the second calculation produced zero new
    // records (a gap, since the crosswalk is no longer approved), so nothing ever superseded
    // it. This is the right behavior, not a bug -- revoking a mapping's approval doesn't
    // retroactively delete or hide the last valid calculation; it only means the NEXT
    // recalculation can't produce a fresh number until the mapping is corrected. The old
    // figure remains the last-known-active exposure until something actually supersedes it.
    const activeAfter = await getActiveExposureRecordsAction(ec.id);
    expect(activeAfter.map((r) => r.id)).toContain(firstRecordId);
    expect(activeAfter).toHaveLength(1);
  });

  it("Case 4 -- one PLM identifier resolving to many ERP identifiers: allocation is correct across all resolved identities (NOTE: there is no single real UI action that creates a genuine one-to-many mapping today -- see the implementation report. This test invokes generateAndSaveCrosswalkSuggestions directly, the exact same repository function the real 'generate suggestions' Server Action calls internally, to construct the two-row scenario, then verifies every subsequent step -- approval and calculation -- through the real Server Actions.)", async () => {
    const ec = await ecRepo.createEngineeringChange("Identity resolution test: one-to-many", "desc", actor.id);

    const currentFd = new FormData();
    currentFd.set("ecId", ec.id);
    currentFd.set("versionLabel", "current");
    currentFd.set("file", csvFile("Part Number,Description,Quantity Per\nPN-SPLIT,x,150", "current.csv"));
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
        "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\n" +
          "PO-A,Bosch,771-SPLIT-A,90,10,USD,2026-09-01\n" +
          "PO-B,Bosch,771-SPLIT-B,60,10,USD,2026-09-01",
        "po.csv"
      )
    );
    poFd.set("actor", JSON.stringify(actor));
    expect((await importPurchaseOrderAction(poFd)).success).toBe(true);

    // Construct two approved crosswalk rows for the same PLM part, one per ERP target.
    const [cwA] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-SPLIT"], ["771-SPLIT-A"]);
    const [cwB] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-SPLIT"], ["771-SPLIT-B"]);
    expect(cwA.erpPartId).toBe("771-SPLIT-A");
    expect(cwB.erpPartId).toBe("771-SPLIT-B");

    // Approval itself IS the real Server Action.
    expect((await approveMappingAction(ec.id, cwA.id, actor)).success).toBe(true);
    expect((await approveMappingAction(ec.id, cwB.id, actor)).success).toBe(true);

    const calcResult = await calculateExposureAction(ec.id, actor);
    expect(calcResult.gaps).toHaveLength(0);
    expect(calcResult.createdRecordIds).toHaveLength(2); // one record per resolved identity

    const records = await getActiveExposureRecordsAction(ec.id);
    const totals = records.map((r) => r.grossCommittedValueReporting).sort((a, b) => a - b);
    expect(totals).toEqual([600, 900]); // 60*10 and 90*10 -- both PO lines correctly matched and calculated
  });
});

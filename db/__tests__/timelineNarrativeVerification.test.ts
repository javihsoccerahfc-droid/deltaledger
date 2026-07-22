import { describe, it, expect, beforeAll, vi } from "vitest";
import { resetTestDatabase } from "./testDb";
import * as ecRepo from "../repositories/engineeringChanges";
import {
  importBomAction,
  importPurchaseOrderAction,
  generateMappingSuggestionsAction,
  approveMappingAction,
  calculateExposureAction,
  getTimelineEntriesAction,
  getEvidenceExplanationAction,
  getActiveExposureRecordsAction,
} from "@/app/actions";
import { User } from "@/domains/deltaledger/types";
import { parseCsvFile } from "@/core/ingestion/parseCsv";

// See db/__tests__/importActions.test.ts for the full rationale: actions.ts calls
// revalidatePath(), which requires a live Next.js request context that doesn't exist when a
// Server Action is invoked directly outside a real Next.js server.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actor: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

function csvFile(csv: string, name: string): File {
  return new File([csv], name, { type: "text/csv" });
}

/**
 * This is the exact scenario the earlier manual smoke-test script got wrong: it called
 * bomRepo.saveBomImport / crosswalkRepo.approveCrosswalkById / etc. directly, bypassing
 * actions.ts entirely -- so the enriched audit-narrative text (added to actions.ts, not to
 * the repository layer) never had a chance to be written. This test instead calls the real
 * Server Actions with FormData, exactly as the browser does, to verify the actual product
 * behavior rather than a shortcut around it.
 */
describe("Timeline narrative -- verified through the real Server Action execution path", () => {
  it("produces the full enriched story: BOM+PO import, mapping approval, and exposure recalculation all read as narrative, not a database log", async () => {
    const ec = await ecRepo.createEngineeringChange("Timeline verification EC", "desc", actor.id);

    // Step 1: BOM import (both sides, so a diff exists).
    const currentBomFd = new FormData();
    currentBomFd.set("ecId", ec.id);
    currentBomFd.set("versionLabel", "current");
    currentBomFd.set("file", csvFile("Part Number,Description,Quantity Per\nPN-4471,Sensor,200", "current.csv"));
    currentBomFd.set("actor", JSON.stringify(actor));
    const currentBomResult = await importBomAction(currentBomFd);
    expect(currentBomResult.success).toBe(true);

    const proposedBomFd = new FormData();
    proposedBomFd.set("ecId", ec.id);
    proposedBomFd.set("versionLabel", "proposed");
    proposedBomFd.set("file", csvFile("Part Number,Description,Quantity Per\n", "proposed.csv"));
    proposedBomFd.set("actor", JSON.stringify(actor));
    const proposedBomResult = await importBomAction(proposedBomFd);
    expect(proposedBomResult.success).toBe(true);

    // Step 2: PO import, via the real Server Action.
    const poFd = new FormData();
    poFd.set("ecId", ec.id);
    poFd.set(
      "file",
      csvFile(
        "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-88213,Bosch,PN-4471,200,92,USD,2026-09-01",
        "po.csv"
      )
    );
    poFd.set("actor", JSON.stringify(actor));
    const poResult = await importPurchaseOrderAction(poFd);
    expect(poResult.success).toBe(true);

    // Step 3: mapping generation + approval, via the real Server Actions.
    await generateMappingSuggestionsAction(ec.id, actor);
    const activeExposureBefore = await getActiveExposureRecordsAction(ec.id);
    expect(activeExposureBefore).toHaveLength(0); // nothing calculated yet -- sanity check

    // Find the generated crosswalk id by reading it back through the real timeline (proves
    // the mapping-generation event itself is also on the timeline).
    const timelineAfterMapping = await getTimelineEntriesAction(ec.id);
    const mappingGeneratedEntry = timelineAfterMapping.find((e) => e.action.includes("mapping suggestion"));
    expect(mappingGeneratedEntry).toBeDefined();

    // Approve it -- need the crosswalk id, fetched via the real getCrosswalksAction path.
    const { getCrosswalksAction } = await import("@/app/actions");
    const crosswalks = await getCrosswalksAction();
    const crosswalk = crosswalks.find((c) => c.plmPartId.toUpperCase() === "PN-4471");
    expect(crosswalk).toBeDefined();
    const approvalResult = await approveMappingAction(ec.id, crosswalk!.id, actor);
    expect(approvalResult.success).toBe(true);

    // Step 4: calculate exposure via the real Server Action.
    const calcResult = await calculateExposureAction(ec.id, actor);
    expect(calcResult.gaps).toHaveLength(0);

    // --- Now verify the FULL, REAL timeline reads as a story, not a log ---
    const timeline = await getTimelineEntriesAction(ec.id);

    const mappingApprovedEntry = timeline.find((e) => e.action.includes("is now linked to ERP part"));
    expect(mappingApprovedEntry).toBeDefined();
    expect(mappingApprovedEntry!.action).toContain("PN-4471");
    expect(mappingApprovedEntry!.action).not.toMatch(/^Approved mapping [a-z0-9]+\.$/); // not the old raw-id phrasing
    // NOTE: this test intentionally uses the SAME part number on both the BOM and PO sides,
    // matching every other existing test in this codebase (see exposureFlow.test.ts). An
    // earlier version of this test used genuinely different PLM/ERP part numbers (the crosswalk's
    // actual real-world purpose) and discovered that calculateAndPersistExposure's PO-line
    // matching (db/repositories/exposure.ts) compares PO lines directly against the BOM diff
    // entry's part id -- the crosswalk's erpPartId is used only for allocation AFTER a line is
    // found this way, never for locating it in the first place. That's a pre-existing
    // characteristic of the deterministic calculation engine, not something this milestone
    // introduced or is permitted to change -- flagged prominently in the implementation report
    // as a discovered, out-of-scope finding rather than worked around silently.

    const exposureEntry = timeline.find((e) => e.action.startsWith("Exposure recalculated"));
    expect(exposureEntry).toBeDefined();
    expect(exposureEntry!.action).toMatch(/\$[\d,]+\.\d{2}/); // a real dollar figure, not just a record count

    // --- Verify the Evidence Explorer is linked correctly from a REAL calculated record ---
    const activeExposureAfter = await getActiveExposureRecordsAction(ec.id);
    expect(activeExposureAfter).toHaveLength(1);
    const explanation = await getEvidenceExplanationAction(activeExposureAfter[0].id);
    expect(explanation).not.toBeNull();
    expect(explanation!.facts.some((f) => f.label === "Purchase Order" && f.value === "PO-88213")).toBe(true);
    expect(explanation!.facts.some((f) => f.label === "Supplier" && f.value === "Bosch")).toBe(true);
    expect(explanation!.facts.some((f) => f.label === "Crosswalk approval" && f.value.includes("approved"))).toBe(true);
    expect(explanation!.calculationSteps.at(-1)?.label).toBe("Net financial exposure");
    expect(explanation!.nextStep.label).not.toBe("Review Crosswalk"); // it's approved, so this must not be the suggestion
  });
});

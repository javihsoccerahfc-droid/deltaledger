import { describe, it, expect, beforeAll, vi } from "vitest";
import { resetTestDatabase } from "./testDb";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { exposureRecords, exposureSourceSnapshots } from "../schema";
import * as ecRepo from "../repositories/engineeringChanges";
import * as crosswalkRepo from "../repositories/crosswalk";
import {
  importBomAction,
  importPurchaseOrderAction,
  approveMappingAction,
  calculateExposureAction,
  runExposureScenarioAction,
  getPurchaseDataAction,
} from "@/app/actions";
import { User } from "@/domains/deltaledger/types";
import { ScenarioAssumption } from "@/domains/deltaledger/exposure/scenarioAssumptions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actor: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

function csvFile(csv: string, name: string): File {
  return new File([csv], name, { type: "text/csv" });
}

async function setUpEcWithExposure(name: string, quantity = 1000, unitPrice = 15) {
  const ec = await ecRepo.createEngineeringChange(name, "desc", actor.id);
  // Crosswalks are organization-wide, not EC-scoped, so a literal part number reused across
  // tests would collide against the Phase 6A idempotency constraint -- correctly, since two
  // tests both claiming "PN-SCN" really would be the same identity in the real product. Each
  // test gets its own genuinely distinct part number instead.
  const partNumber = `PN-SCN-${name}`;

  const currentFd = new FormData();
  currentFd.set("ecId", ec.id);
  currentFd.set("versionLabel", "current");
  currentFd.set("file", csvFile(`Part Number,Description,Quantity Per\n${partNumber},Widget,${quantity}`, "current.csv"));
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
      `PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-SCN,Zenith Supply,${partNumber},${quantity},${unitPrice},USD,2026-09-01`,
      "po.csv"
    )
  );
  poFd.set("actor", JSON.stringify(actor));
  expect((await importPurchaseOrderAction(poFd)).success).toBe(true);

  const [cw] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions([partNumber], [partNumber]);
  expect((await approveMappingAction(ec.id, cw.id, actor)).success).toBe(true);

  const calcResult = await calculateExposureAction(ec.id, actor);
  expect(calcResult.createdRecordIds).toHaveLength(1);

  return { ec, poLineId: await getPoLineId(ec.id) };
}

async function getPoLineId(ecId: string): Promise<string> {
  const purchaseData = await getPurchaseDataAction(ecId);
  return purchaseData.poLines[0].id;
}

describe("Interactive Exposure Explorer -- scenario runs never touch persisted exposure state", () => {
  it("running a scenario produces zero new rows in exposure_source_snapshots or exposure_records", async () => {
    const { ec, poLineId } = await setUpEcWithExposure("ECO-SCENARIO-NO-WRITES");

    const [snapshotsBefore, recordsBefore] = await Promise.all([
      db.select().from(exposureSourceSnapshots),
      db.select().from(exposureRecords),
    ]);

    const assumptions: ScenarioAssumption[] = [{ kind: "quantityOverride", purchaseOrderLineId: poLineId, quantityOpen: 400 }];
    const outcome = await runExposureScenarioAction(ec.id, assumptions);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.persisted).toBe(false);
      expect(outcome.result.scenarioTotal).toBe(6000); // 400 * 15
    }

    const [snapshotsAfter, recordsAfter] = await Promise.all([
      db.select().from(exposureSourceSnapshots),
      db.select().from(exposureRecords),
    ]);

    expect(snapshotsAfter).toHaveLength(snapshotsBefore.length);
    expect(recordsAfter).toHaveLength(recordsBefore.length);
  });

  it("running the SAME scenario twice in a row produces byte-identical results and still zero writes (pure, deterministic, no side effects)", async () => {
    const { ec, poLineId } = await setUpEcWithExposure("ECO-SCENARIO-DETERMINISM");
    const assumptions: ScenarioAssumption[] = [
      { kind: "priceOverride", purchaseOrderLineId: poLineId, unitPriceTransactionCurrency: 22 },
    ];

    const [recordsBefore] = await Promise.all([db.select().from(exposureRecords)]);

    const first = await runExposureScenarioAction(ec.id, assumptions);
    const second = await runExposureScenarioAction(ec.id, assumptions);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.result.scenarioTotal).toBe(second.result.scenarioTotal);
      expect(first.result.deltaAbsolute).toBe(second.result.deltaAbsolute);
    }

    const recordsAfter = await db.select().from(exposureRecords);
    expect(recordsAfter).toHaveLength(recordsBefore.length);
  });

  it("the real, persisted baseline exposure record is untouched (same id, same values) after a scenario run", async () => {
    const { ec, poLineId } = await setUpEcWithExposure("ECO-SCENARIO-BASELINE-INTACT", 1000, 15);
    const [baselineRecord] = await db.select().from(exposureRecords).where(eq(exposureRecords.engineeringChangeId, ec.id));

    await runExposureScenarioAction(ec.id, [{ kind: "quantityOverride", purchaseOrderLineId: poLineId, quantityOpen: 1 }]);

    const [baselineRecordAfter] = await db.select().from(exposureRecords).where(eq(exposureRecords.engineeringChangeId, ec.id));
    expect(baselineRecordAfter.id).toBe(baselineRecord.id);
    expect(baselineRecordAfter.netExposureValueReporting).toBe(baselineRecord.netExposureValueReporting);
    expect(baselineRecordAfter.supersededById).toBeNull();
  });

  it("computes correct baseline vs scenario comparison, variance, and assumption labels through the real Server Action", async () => {
    const { ec, poLineId } = await setUpEcWithExposure("ECO-SCENARIO-COMPARISON", 1000, 15);
    // Baseline: 1000 * 15 = 15000.
    const assumptions: ScenarioAssumption[] = [
      { kind: "quantityOverride", purchaseOrderLineId: poLineId, quantityOpen: 800 },
      { kind: "alternateDemandOverride", purchaseOrderLineId: poLineId, allocatedQuantity: 200 },
    ];
    const outcome = await runExposureScenarioAction(ec.id, assumptions);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // gross = 800 * 15 = 12000; netted qty = 600; net = 600 * 15 = 9000
    expect(outcome.result.baselineTotal).toBe(15000);
    expect(outcome.result.scenarioTotal).toBe(9000);
    expect(outcome.result.deltaAbsolute).toBe(-6000);
    expect(outcome.result.deltaPercent).toBeCloseTo(-40, 5);
    expect(outcome.result.assumptions).toHaveLength(2);
    expect(outcome.result.assumptions[0].label).toContain("Quantity changed");
    expect(outcome.result.assumptions[0].label).toContain("PN-SCN"); // real part number, not the raw PO line id
    expect(outcome.result.assumptions[0].label).not.toContain(poLineId);
    expect(outcome.result.lines[0].changed).toBe(true);
    expect(outcome.result.lines[0].scenario.kind).toBe("created");
    if (outcome.result.lines[0].scenario.kind === "created") {
      expect(outcome.result.lines[0].scenario.confidenceClassification).toBe("known");
      expect(outcome.result.lines[0].scenario.explanation.facts.length).toBeGreaterThan(0);
    }
  });

  it("an assumption targeting an unrelated PO line has zero blast radius on other lines (baseline carried forward unchanged)", async () => {
    const { ec, poLineId } = await setUpEcWithExposure("ECO-SCENARIO-ISOLATED-BLAST-RADIUS", 1000, 15);
    const assumptions: ScenarioAssumption[] = [{ kind: "quantityOverride", purchaseOrderLineId: "nonexistent-line-id", quantityOpen: 500 }];
    const outcome = await runExposureScenarioAction(ec.id, assumptions);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.scenarioTotal).toBe(outcome.result.baselineTotal);
    const line = outcome.result.lines.find((l) => l.purchaseOrderLineId === poLineId);
    expect(line?.changed).toBe(false);
  });

  it("returns an honest ok:false result (not a crash) when the EC has no purchase order data at all", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO-SCENARIO-NO-PO-DATA", "desc", actor.id);
    const outcome = await runExposureScenarioAction(ec.id, []);
    expect(outcome.ok).toBe(false);
  });
});

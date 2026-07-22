import { describe, it, expect } from "vitest";
import { compareScenarioToBaseline, BaselineExposureLine } from "@/domains/deltaledger/exposure/scenarioComparison";
import { ExposurePipelineOutcome } from "@/domains/deltaledger/exposure/exposurePipeline";
import { ExposureRecord, ExposureSourceSnapshot } from "@/domains/deltaledger/types";

function makeRecord(overrides: Partial<ExposureRecord> = {}): ExposureRecord {
  return {
    id: "exp-1",
    engineeringChangeId: "ec-1",
    partId: "PN-001",
    purchaseOrderLineId: "poline-1",
    exposureSourceSnapshotId: "snap-1",
    grossCommittedValueTransaction: 10000,
    grossCommittedValueReporting: 10000,
    alternateDemandAdjustmentTransaction: 0,
    alternateDemandAdjustmentReporting: 0,
    netExposureValueTransaction: 10000,
    netExposureValueReporting: 10000,
    confidenceClassification: "estimated",
    cancellationStatus: "cancellation_terms_missing",
    cancellationConfidence: "unverified",
    formulaVersion: "v1",
    calculatedAt: "2026-07-01T00:00:00Z",
    classificationReason: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ExposureSourceSnapshot> = {}): ExposureSourceSnapshot {
  return {
    id: "snap-1",
    engineeringChangeId: "ec-1",
    bomDiffEntryId: "diff-1",
    purchaseOrderId: "po-1",
    purchaseOrderLineId: "poline-1",
    supplierId: "sup-1",
    rawPartId: "ERP-001",
    normalizedPartId: "ERP-001",
    quantityOpen: 1000,
    unitPriceTransactionCurrency: 10,
    transactionCurrency: "USD",
    reportingCurrency: "USD",
    exchangeRate: 1,
    exchangeRateDate: "",
    exchangeRateSnapshotId: null,
    promisedReceiptDate: "2026-09-01",
    lineStatus: "open",
    supplierTermsVersionId: null,
    crosswalkVersionId: "cw-1",
    alternateDemandAllocationIds: [],
    sourceFiles: ["po.xlsx"],
    sourceRows: [1],
    calculatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function createdOutcome(overrides: { purchaseOrderLineId?: string; record?: Partial<ExposureRecord> } = {}): ExposurePipelineOutcome {
  return {
    kind: "created",
    diffEntryId: "diff-1",
    purchaseOrderLineId: overrides.purchaseOrderLineId ?? "poline-1",
    snapshot: makeSnapshot(),
    record: makeRecord({ purchaseOrderLineId: overrides.purchaseOrderLineId ?? "poline-1", ...overrides.record }),
    crosswalk: {
      id: "cw-1",
      plmPartId: "PN-001",
      erpPartId: "ERP-001",
      matchMethod: "exact",
      confidence: 1,
      reviewStatus: "approved",
      reviewedBy: null,
      reviewedAt: null,
      effectiveDate: "2026-01-01",
      notes: null,
      mappingType: "one_to_one",
      supersededById: null,
    },
    allocation: { resolved: true, allocatedQuantity: 1000, method: "fixed_quantity" },
  };
}

describe("compareScenarioToBaseline", () => {
  it("reports zero delta and unchanged when the scenario reproduces the exact baseline figure", () => {
    const baseline: BaselineExposureLine[] = [
      { purchaseOrderLineId: "poline-1", partId: "PN-001", netExposureValueReporting: 10000, confidenceClassification: "estimated" },
    ];
    const outcomes = [createdOutcome({ record: { netExposureValueReporting: 10000, confidenceClassification: "estimated" } })];
    const summary = compareScenarioToBaseline(baseline, outcomes);
    expect(summary.baselineTotal).toBe(10000);
    expect(summary.scenarioTotal).toBe(10000);
    expect(summary.deltaAbsolute).toBe(0);
    expect(summary.deltaPercent).toBe(0);
    expect(summary.lines[0].changed).toBe(false);
  });

  it("computes absolute and percent variance when the scenario figure differs", () => {
    const baseline: BaselineExposureLine[] = [
      { purchaseOrderLineId: "poline-1", partId: "PN-001", netExposureValueReporting: 10000, confidenceClassification: "estimated" },
    ];
    const outcomes = [createdOutcome({ record: { netExposureValueReporting: 7500, confidenceClassification: "known" } })];
    const summary = compareScenarioToBaseline(baseline, outcomes);
    expect(summary.deltaAbsolute).toBe(-2500);
    expect(summary.deltaPercent).toBe(-25);
    expect(summary.lines[0].changed).toBe(true); // confidence changed even though we're checking amount here too
  });

  it("marks a line changed when only confidence classification differs, even if the dollar amount is identical", () => {
    const baseline: BaselineExposureLine[] = [
      { purchaseOrderLineId: "poline-1", partId: "PN-001", netExposureValueReporting: 10000, confidenceClassification: "estimated" },
    ];
    const outcomes = [createdOutcome({ record: { netExposureValueReporting: 10000, confidenceClassification: "known" } })];
    const summary = compareScenarioToBaseline(baseline, outcomes);
    expect(summary.lines[0].deltaAbsolute).toBe(0);
    expect(summary.lines[0].changed).toBe(true);
  });

  it("reports a new gap when a scenario assumption breaks a previously-known figure", () => {
    const baseline: BaselineExposureLine[] = [
      { purchaseOrderLineId: "poline-1", partId: "PN-001", netExposureValueReporting: 10000, confidenceClassification: "estimated" },
    ];
    const outcomes: ExposurePipelineOutcome[] = [
      { kind: "gap", diffEntryId: "diff-1", purchaseOrderLineId: "poline-1", rawPartNumber: "ERP-001", reason: "PO line quantity is missing or unparseable." },
    ];
    const summary = compareScenarioToBaseline(baseline, outcomes);
    expect(summary.gaps).toHaveLength(1);
    expect(summary.gaps[0].reason).toContain("quantity is missing");
    expect(summary.lines[0].changed).toBe(true);
    expect(summary.lines[0].scenario.kind).toBe("gap");
    // A gap contributes nothing to the scenario total -- the baseline dollar figure must not
    // silently carry over as if it still held.
    expect(summary.scenarioTotal).toBe(0);
  });

  it("handles a PO line untouched by any scenario assumption by carrying the baseline figure forward unchanged", () => {
    const baseline: BaselineExposureLine[] = [
      { purchaseOrderLineId: "poline-1", partId: "PN-001", netExposureValueReporting: 5000, confidenceClassification: "known" },
      { purchaseOrderLineId: "poline-2", partId: "PN-002", netExposureValueReporting: 3000, confidenceClassification: "known" },
    ];
    // Only poline-1 appears in the scenario outcomes -- poline-2 wasn't affected by the assumptions applied.
    const outcomes = [createdOutcome({ purchaseOrderLineId: "poline-1", record: { purchaseOrderLineId: "poline-1", netExposureValueReporting: 4000 } })];
    const summary = compareScenarioToBaseline(baseline, outcomes);
    expect(summary.baselineTotal).toBe(8000);
    expect(summary.scenarioTotal).toBe(7000); // 4000 (changed) + 3000 (carried forward)
    const untouchedLine = summary.lines.find((l) => l.purchaseOrderLineId === "poline-2")!;
    expect(untouchedLine.changed).toBe(false);
    expect(untouchedLine.deltaAbsolute).toBe(0);
  });

  it("treats a baseline-total of zero as having no meaningful percent variance", () => {
    const baseline: BaselineExposureLine[] = [];
    const outcomes = [createdOutcome({ record: { netExposureValueReporting: 5000 } })];
    const summary = compareScenarioToBaseline(baseline, outcomes);
    expect(summary.baselineTotal).toBe(0);
    expect(summary.deltaPercent).toBeNull();
  });
});

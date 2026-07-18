import { describe, it, expect } from "vitest";
import { buildEcoReport, summarizeExposure, summarizeOutcomes } from "@/domains/deltaledger/reports/ecoReport";
import { buildMonthlyReport } from "@/domains/deltaledger/reports/monthlyReport";
import { buildFinancialOutcome } from "@/domains/deltaledger/mitigation/outcome";
import { ExposureRecord } from "@/domains/deltaledger/types";

function makeExposureRecord(overrides: Partial<ExposureRecord> = {}): ExposureRecord {
  return {
    id: "exp-1",
    engineeringChangeId: "ec-1",
    partId: "ERP-001",
    purchaseOrderLineId: "poline-1",
    exposureSourceSnapshotId: "snap-1",
    grossCommittedValueTransaction: 10000,
    grossCommittedValueReporting: 10000,
    alternateDemandAdjustmentTransaction: 0,
    alternateDemandAdjustmentReporting: 0,
    netExposureValueTransaction: 10000,
    netExposureValueReporting: 10000,
    confidenceClassification: "known",
    cancellationStatus: "known_cancellable",
    cancellationConfidence: "verified",
    formulaVersion: "v1",
    calculatedAt: "2026-07-16T00:00:00Z",
    classificationReason: null,
    ...overrides,
  };
}

describe("summarizeExposure", () => {
  it("sums known + estimated dollar totals exactly, to the cent", () => {
    const records = [
      makeExposureRecord({ confidenceClassification: "known", grossCommittedValueReporting: 10000.5, netExposureValueReporting: 9000.25 }),
      makeExposureRecord({ confidenceClassification: "estimated", grossCommittedValueReporting: 500.25, netExposureValueReporting: 500.25 }),
    ];
    const summary = summarizeExposure(records);
    expect(summary.totalGrossReporting).toBeCloseTo(10500.75, 10);
    expect(summary.totalNetReporting).toBeCloseTo(9500.5, 10);
  });

  it("NEVER includes an Unresolved record's amount in any dollar total, even if one were nonzero", () => {
    const records = [
      makeExposureRecord({ confidenceClassification: "known", grossCommittedValueReporting: 1000, netExposureValueReporting: 1000 }),
      // Deliberately nonzero to prove the summary logic itself excludes it
      // by confidence classification, not merely because it happens to be 0
      // by construction elsewhere.
      makeExposureRecord({
        confidenceClassification: "unresolved",
        grossCommittedValueReporting: 999999,
        netExposureValueReporting: 999999,
      }),
    ];
    const summary = summarizeExposure(records);
    expect(summary.totalGrossReporting).toBe(1000);
    expect(summary.totalNetReporting).toBe(1000);
    expect(summary.countByConfidence.unresolved).toBe(1);
  });

  it("known-only totals exclude estimated records", () => {
    const records = [
      makeExposureRecord({ confidenceClassification: "known", grossCommittedValueReporting: 1000, netExposureValueReporting: 1000 }),
      makeExposureRecord({ confidenceClassification: "estimated", grossCommittedValueReporting: 500, netExposureValueReporting: 500 }),
    ];
    const summary = summarizeExposure(records);
    expect(summary.totalGrossReportingKnownOnly).toBe(1000);
    expect(summary.totalGrossReporting).toBe(1500);
  });

  it("counts by cancellation status", () => {
    const records = [
      makeExposureRecord({ cancellationStatus: "known_cancellable" }),
      makeExposureRecord({ cancellationStatus: "known_cancellable" }),
      makeExposureRecord({ cancellationStatus: "cancellation_terms_missing" }),
    ];
    const summary = summarizeExposure(records);
    expect(summary.countByCancellationStatus.known_cancellable).toBe(2);
    expect(summary.countByCancellationStatus.cancellation_terms_missing).toBe(1);
  });
});

describe("summarizeOutcomes — exact-to-the-cent totals including net_mitigation_benefit", () => {
  it("aggregates the exact acceptance-case example correctly", () => {
    const outcome = buildFinancialOutcome({
      exposureRecordId: "exp-1",
      frozenUnitPrice: 100,
      quantityCancelled: 1000,
      quantityRedirected: 0,
      quantityReceivedBeforeAction: 0,
      recoverableUnitValue: null,
      recoverableUnitValueBasis: null,
      recoverableUnitValueJustificationNote: null,
      recoverableUnitValueReviewedBy: null,
      cancellationFee: 10000,
      supplierCreditValue: 0,
      writeOffValue: 0,
      reworkCost: null,
      disposalCost: null,
      estimatedCostAvoidedFrozen: 100000,
      outcomeExchangeRateSnapshotId: null,
    });
    const closed = { ...outcome, closedAt: "2026-08-01T00:00:00Z", closedBy: "finance-1" };

    const summary = summarizeOutcomes([closed]);
    expect(summary.totalActualCostAvoided).toBe(100000);
    expect(summary.totalActualRealizedLoss).toBe(10000);
    expect(summary.totalNetMitigationBenefit).toBe(90000);
    expect(summary.countClosed).toBe(1);
    expect(summary.countOpen).toBe(0);
  });
});

describe("buildEcoReport / buildMonthlyReport", () => {
  it("rolls up correctly across multiple ECOs, including unmapped-gap counts", () => {
    const ecoOneRecords = [
      makeExposureRecord({ engineeringChangeId: "ec-1", grossCommittedValueReporting: 1000, netExposureValueReporting: 1000 }),
    ];
    const ecoTwoRecords = [
      makeExposureRecord({ engineeringChangeId: "ec-2", grossCommittedValueReporting: 2000, netExposureValueReporting: 2000 }),
    ];

    const ecoOneReport = buildEcoReport("ec-1", ecoOneRecords, [], 2);
    const ecoTwoReport = buildEcoReport("ec-2", ecoTwoRecords, [], 1);

    const monthly = buildMonthlyReport([...ecoOneRecords, ...ecoTwoRecords], [], [ecoOneReport, ecoTwoReport]);

    expect(monthly.ecoCount).toBe(2);
    expect(monthly.exposure.totalGrossReporting).toBe(3000);
    expect(monthly.totalUnmappedGaps).toBe(3);
  });
});

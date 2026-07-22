import { describe, it, expect } from "vitest";
import {
  AS_OF_DATE,
  REPORTING_CONFIG,
  DIFF_PN_100,
  PO_LINE_PN_100,
  CROSSWALK_PN_100,
  TERMS_SUPPLIER_A,
  DIFF_PN_200,
  PO_LINE_PN_200,
  CROSSWALK_PN_200,
  TERMS_SUPPLIER_B,
  DIFF_PN_300,
  PO_LINE_PN_300,
  CROSSWALK_PN_300,
  DIFF_PN_400,
  PO_LINE_PN_400,
  CROSSWALK_PN_400,
  CROSSWALK_PN_400_RULES,
  EXCHANGE_RATES,
} from "@/domains/deltaledger/testFixtures/syntheticWorkbook";
import { calculateExposure } from "@/domains/deltaledger/exposure/calculateExposure";
import { resolveCrosswalkAllocation } from "@/domains/deltaledger/crosswalkAllocation";
import { approveAlternateDemand } from "@/domains/deltaledger/alternateDemand/review";
import { allocateAlternateDemand } from "@/domains/deltaledger/alternateDemand/ledger";
import { buildEcoReport } from "@/domains/deltaledger/reports/ecoReport";
import { buildFinancialOutcome, closeFinancialOutcome } from "@/domains/deltaledger/mitigation/outcome";
import { recordSupplierResponse } from "@/domains/deltaledger/mitigation/supplierResponse";
import { AlternateDemandRecord, ExposureRecord, User } from "@/domains/deltaledger/types";

const scm: User = { id: "scm-1", name: "Sam SCM", role: "supply_chain_manager" };
const buyer = { id: "buyer-1", name: "Bob Buyer", role: "buyer" as const };

describe("DeltaLedger V1 — full acceptance pass against the synthetic multi-currency fixture", () => {
  // --- Case A: PN-100, USD, approved alternate demand -> Known ---
  const altDemandPn100: AlternateDemandRecord = {
    id: "adr-100",
    partId: "ERP-100",
    demandSourceType: "unaffected_assembly",
    demandSourceId: "bom-import-9",
    affectedAssemblyId: "assy-9",
    quantityAvailableForOffset: 100,
    demandDate: "2026-07-01",
    sourceReference: "Assembly 9 BOM",
    sourceFile: "assembly_9.xlsx",
    sourceRow: 4,
    confidence: 0.95,
    reviewStatus: "unreviewed",
    reviewedBy: null,
    reviewedAt: null,
    allocationStatus: "unallocated",
  };

  const approvedAltDemandPn100 = approveAlternateDemand(altDemandPn100, scm, "2026-07-10T00:00:00Z");
  const allocationPn100 = allocateAlternateDemand(
    approvedAltDemandPn100,
    "exp-100-placeholder",
    100,
    scm.id,
    "2026-07-10T00:05:00Z",
    []
  );
  if (!allocationPn100.success) throw new Error("expected allocation to succeed in fixture setup");

  const allocationResolutionPn100 = resolveCrosswalkAllocation(CROSSWALK_PN_100, undefined, [], { quantity: 500 });

  const outcomePn100 = calculateExposure({
    formulaVersion: REPORTING_CONFIG.formulaVersion,
    engineeringChangeId: "ec-1",
    bomDiffEntry: DIFF_PN_100,
    purchaseOrderId: PO_LINE_PN_100.purchaseOrderId,
    purchaseOrderLine: PO_LINE_PN_100,
    supplierId: "supplier-a",
    crosswalk: CROSSWALK_PN_100,
    allocation: allocationResolutionPn100,
    supplierTerms: TERMS_SUPPLIER_A,
    exchangeRates: EXCHANGE_RATES,
    reportingCurrency: REPORTING_CONFIG.reportingCurrency,
    alternateDemand: { allocatedQuantity: 100, allocationIds: [allocationPn100.allocation.id], explicitlyConfirmedZero: false },
    asOfDate: AS_OF_DATE,
    calculatedAt: "2026-07-16T12:00:00Z",
    sourceFile: "synthetic-po-export.xlsx",
    sourceRow: 1,
  });

  it("PN-100 (USD, netted against approved alternate demand): Known, exact gross/net, known_cancellable", () => {
    expect(outcomePn100.created).toBe(true);
    if (!outcomePn100.created) throw new Error("expected created");
    const r = outcomePn100.record;
    expect(r.confidenceClassification).toBe("known");
    expect(r.grossCommittedValueReporting).toBe(10000); // 500 * 20
    expect(r.netExposureValueReporting).toBe(8000); // (500-100) * 20
    expect(r.cancellationStatus).toBe("known_cancellable");
    expect(r.cancellationConfidence).toBe("verified");
    // Provenance: the snapshot names the actual allocation used, not an
    // empty placeholder array.
    expect(outcomePn100.snapshot.alternateDemandAllocationIds).toEqual([allocationPn100.allocation.id]);
    // Provenance: source file/row are populated by the application layer's
    // ingestion step, never left blank in a newly generated snapshot.
    expect(outcomePn100.snapshot.sourceFiles).toEqual(["synthetic-po-export.xlsx"]);
    expect(outcomePn100.snapshot.sourceRows).toEqual([1]);
  });

  // --- Case B: PN-200, EUR -> USD conversion, no alternate demand, expired terms ---
  const allocationResolutionPn200 = resolveCrosswalkAllocation(CROSSWALK_PN_200, undefined, [], { quantity: 600 });

  const outcomePn200 = calculateExposure({
    formulaVersion: REPORTING_CONFIG.formulaVersion,
    engineeringChangeId: "ec-1",
    bomDiffEntry: DIFF_PN_200,
    purchaseOrderId: PO_LINE_PN_200.purchaseOrderId,
    purchaseOrderLine: PO_LINE_PN_200,
    supplierId: "supplier-b",
    crosswalk: CROSSWALK_PN_200,
    allocation: allocationResolutionPn200,
    supplierTerms: TERMS_SUPPLIER_B,
    exchangeRates: EXCHANGE_RATES,
    reportingCurrency: REPORTING_CONFIG.reportingCurrency,
    alternateDemand: { allocatedQuantity: 0, allocationIds: [], explicitlyConfirmedZero: false },
    asOfDate: AS_OF_DATE,
    calculatedAt: "2026-07-16T12:00:00Z",
    sourceFile: "synthetic-po-export.xlsx",
    sourceRow: 1,
  });

  it("PN-200 (EUR->USD, no alt demand reviewed, expired terms): Estimated exposure, exact FX conversion, degraded cancellation status only", () => {
    expect(outcomePn200.created).toBe(true);
    if (!outcomePn200.created) throw new Error("expected created");
    const r = outcomePn200.record;
    // 600 * 15 = 9000 EUR; 9000 * 1.08 = 9720 USD, to the cent.
    expect(r.grossCommittedValueTransaction).toBe(9000);
    expect(r.grossCommittedValueReporting).toBeCloseTo(9720, 10);
    expect(r.netExposureValueReporting).toBeCloseTo(9720, 10); // no netting applied
    // Confidence is ESTIMATED because alt demand wasn't reviewed — NOT
    // because the terms are expired. Those are independent findings.
    expect(r.confidenceClassification).toBe("estimated");
    // Cancellation status IS degraded by the expired terms:
    expect(r.cancellationStatus).toBe("supplier_confirmation_required");
    expect(r.cancellationConfidence).toBe("unverified");
  });

  // --- Case C: PN-300, unapproved crosswalk -> Unmapped Exposure Gap ---
  const allocationResolutionPn300 = resolveCrosswalkAllocation(CROSSWALK_PN_300, undefined, [], { quantity: 50 });
  const outcomePn300 = calculateExposure({
    formulaVersion: REPORTING_CONFIG.formulaVersion,
    engineeringChangeId: "ec-1",
    bomDiffEntry: DIFF_PN_300,
    purchaseOrderId: PO_LINE_PN_300.purchaseOrderId,
    purchaseOrderLine: PO_LINE_PN_300,
    supplierId: "supplier-a",
    crosswalk: CROSSWALK_PN_300,
    allocation: allocationResolutionPn300,
    supplierTerms: undefined,
    exchangeRates: EXCHANGE_RATES,
    reportingCurrency: REPORTING_CONFIG.reportingCurrency,
    alternateDemand: { allocatedQuantity: 0, allocationIds: [], explicitlyConfirmedZero: false },
    asOfDate: AS_OF_DATE,
    calculatedAt: "2026-07-16T12:00:00Z",
    sourceFile: "synthetic-po-export.xlsx",
    sourceRow: 1,
  });

  it("PN-300 (unapproved crosswalk): creates NO exposure record at all — an Unmapped Exposure Gap", () => {
    expect(outcomePn300.created).toBe(false);
  });

  // --- Case D: PN-400, one_to_many crosswalk with invalid percentages -> Unresolved ---
  const percentRule = CROSSWALK_PN_400_RULES[0];
  const allocationResolutionPn400 = resolveCrosswalkAllocation(
    CROSSWALK_PN_400,
    percentRule,
    CROSSWALK_PN_400_RULES,
    { quantity: 200 }
  );
  const outcomePn400 = calculateExposure({
    formulaVersion: REPORTING_CONFIG.formulaVersion,
    engineeringChangeId: "ec-1",
    bomDiffEntry: DIFF_PN_400,
    purchaseOrderId: PO_LINE_PN_400.purchaseOrderId,
    purchaseOrderLine: PO_LINE_PN_400,
    supplierId: "supplier-a",
    crosswalk: CROSSWALK_PN_400,
    allocation: allocationResolutionPn400,
    supplierTerms: undefined,
    exchangeRates: EXCHANGE_RATES,
    reportingCurrency: REPORTING_CONFIG.reportingCurrency,
    alternateDemand: { allocatedQuantity: 0, allocationIds: [], explicitlyConfirmedZero: false },
    asOfDate: AS_OF_DATE,
    calculatedAt: "2026-07-16T12:00:00Z",
    sourceFile: "synthetic-po-export.xlsx",
    sourceRow: 1,
  });

  it("PN-400 (percentages sum to 95%, not 100%): exposure record IS created but Unresolved, $0, never guessed", () => {
    expect(outcomePn400.created).toBe(true);
    if (!outcomePn400.created) throw new Error("expected created");
    expect(outcomePn400.record.confidenceClassification).toBe("unresolved");
    expect(outcomePn400.record.grossCommittedValueReporting).toBe(0);
    expect(outcomePn400.record.classificationReason).toContain("95%");
  });

  // --- Report rollup across all created records ---
  it("ECO report totals exclude the Unresolved record's $0 from being confused with a real $0, via count + total", () => {
    if (!outcomePn100.created || !outcomePn200.created || !outcomePn400.created) throw new Error("setup failed");
    const records: ExposureRecord[] = [outcomePn100.record, outcomePn200.record, outcomePn400.record];
    const report = buildEcoReport("ec-1", records, [], 1 /* PN-300 gap */);

    expect(report.exposure.countByConfidence.known).toBe(1);
    expect(report.exposure.countByConfidence.estimated).toBe(1);
    expect(report.exposure.countByConfidence.unresolved).toBe(1);
    expect(report.exposure.totalGrossReporting).toBeCloseTo(10000 + 9720, 10);
    expect(report.exposure.totalGrossReportingKnownOnly).toBe(10000);
    expect(report.unmappedGapCount).toBe(1);
  });

  // --- Mitigation + outcome for PN-100 ---
  it("PN-100 mitigation: full cancellation with a fee nets to the exact corrected amount", () => {
    if (!outcomePn100.created) throw new Error("expected created");
    const responseResult = recordSupplierResponse(
      "mit-100",
      "accepted",
      500, // cancelled all 500 units
      0,
      0,
      500,
      "2026-07-20T00:00:00Z",
      buyer.id
    );
    expect(responseResult.success).toBe(true);
    if (!responseResult.success) throw new Error("expected success");

    const outcome = buildFinancialOutcome({
      exposureRecordId: outcomePn100.record.id,
      frozenUnitPrice: 20,
      quantityCancelled: responseResult.response.quantityCancelled,
      quantityRedirected: 0,
      quantityReceivedBeforeAction: 0,
      recoverableUnitValue: null,
      recoverableUnitValueBasis: null,
      recoverableUnitValueJustificationNote: null,
      recoverableUnitValueReviewedBy: null,
      cancellationFee: 500,
      supplierCreditValue: 0,
      writeOffValue: 0,
      reworkCost: null,
      disposalCost: null,
      estimatedCostAvoidedFrozen: outcomePn100.record.netExposureValueReporting,
      outcomeExchangeRateSnapshotId: null,
    });

    expect(outcome.actualCostAvoided).toBe(10000); // 500 * 20
    expect(outcome.actualRealizedLoss).toBe(500);

    const closed = closeFinancialOutcome(outcome, "finance-1", "2026-07-21T00:00:00Z");
    expect(closed.success).toBe(true);
    if (closed.success) {
      expect(closed.outcome.closedAt).toBe("2026-07-21T00:00:00Z");
    }
  });
});

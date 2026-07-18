import { describe, it, expect } from "vitest";
import { calculateExposure, ExposureCalculationInput } from "@/domains/deltaledger/exposure/calculateExposure";
import { BomDiffEntry, PartNumberCrosswalk, PurchaseOrderLine, SupplierCommitmentTerms } from "@/domains/deltaledger/types";

function makeCrosswalk(overrides: Partial<PartNumberCrosswalk> = {}): PartNumberCrosswalk {
  return {
    id: "cw-1",
    plmPartId: "PN-001",
    erpPartId: "ERP-001",
    matchMethod: "exact",
    confidence: 1,
    reviewStatus: "approved",
    reviewedBy: "u1",
    reviewedAt: "2026-07-01T00:00:00Z",
    effectiveDate: "2026-07-01",
    notes: null,
    mappingType: "one_to_one",
    supersededById: null,
    ...overrides,
  };
}

function makePoLine(overrides: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
  return {
    id: "poline-1",
    purchaseOrderId: "po-1",
    partId: null,
    rawPartNumber: "PN-001",
    quantityOpen: 1000,
    quantityParseStatus: "ok",
    transactionCurrency: "USD",
    unitPriceTransactionCurrency: 10,
    priceParseStatus: "ok",
    promisedReceiptDate: "2026-09-01",
    lineStatus: "open",
    ...overrides,
  };
}

function makeDiffEntry(overrides: Partial<BomDiffEntry> = {}): BomDiffEntry {
  return {
    id: "diff-1",
    engineeringChangeId: "ec-1",
    partId: "PN-001",
    changeType: "removed",
    fromQuantity: 5,
    toQuantity: null,
    replacementPartId: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ExposureCalculationInput> = {}): ExposureCalculationInput {
  return {
    formulaVersion: "v1",
    engineeringChangeId: "ec-1",
    bomDiffEntry: makeDiffEntry(),
    purchaseOrderId: "po-1",
    purchaseOrderLine: makePoLine(),
    supplierId: "sup-1",
    crosswalk: makeCrosswalk(),
    allocation: { resolved: true, allocatedQuantity: 1000, method: "fixed_quantity" },
    supplierTerms: undefined,
    exchangeRates: [],
    reportingCurrency: "USD",
    alternateDemand: { allocatedQuantity: 0, allocationIds: [], explicitlyConfirmedZero: false },
    asOfDate: "2026-07-16",
    calculatedAt: "2026-07-16T12:00:00Z",
    sourceFile: "test-po-export.xlsx",
    sourceRow: 1,
    ...overrides,
  };
}

describe("calculateExposure — exposure confidence is independent of cancellation terms", () => {
  it("produces a KNOWN gross exposure even with no supplier cancellation terms at all", () => {
    const outcome = calculateExposure(baseInput({ alternateDemand: { allocatedQuantity: 0, allocationIds: [], explicitlyConfirmedZero: true } }));
    expect(outcome.created).toBe(true);
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.grossCommittedValueTransaction).toBe(10000); // 1000 * 10
    expect(outcome.record.confidenceClassification).toBe("known");
    // Cancellation status is a SEPARATE, independent finding:
    expect(outcome.record.cancellationStatus).toBe("cancellation_terms_missing");
    expect(outcome.record.cancellationConfidence).toBe("unknown");
  });

  it("produces an ESTIMATED net exposure when alternate demand has not been explicitly reviewed", () => {
    const outcome = calculateExposure(baseInput()); // explicitlyConfirmedZero: false, allocatedQuantity: 0
    expect(outcome.created).toBe(true);
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.confidenceClassification).toBe("estimated");
    // The gross/net VALUE is still fully computed and correct — being
    // "estimated" is about netting confidence, not about the arithmetic:
    expect(outcome.record.grossCommittedValueTransaction).toBe(10000);
    expect(outcome.record.netExposureValueTransaction).toBe(10000);
  });

  it("becomes KNOWN once an approved alternate-demand allocation is netted, regardless of cancellation terms", () => {
    const outcome = calculateExposure(
      baseInput({ alternateDemand: { allocatedQuantity: 200, allocationIds: ["alloc-test-1"], explicitlyConfirmedZero: false } })
    );
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.confidenceClassification).toBe("known");
    expect(outcome.record.netExposureValueTransaction).toBe(8000); // (1000-200)*10
  });

  it("expired supplier terms prevent a verified cancellation status but never touch the exposure amount", () => {
    const expiredTerms: SupplierCommitmentTerms = {
      id: "terms-1",
      supplierId: "sup-1",
      partId: null,
      ncnr: false,
      standardLeadTimeDays: 45,
      cancellationWindowDays: 30,
      source: "verified_contract",
      effectiveDate: "2025-01-01",
      notes: null,
      verifiedAt: "2025-01-01T00:00:00Z",
      verifiedBy: "u1",
      validUntil: "2025-06-01",
      stalenessStatus: "expired",
    };
    const outcome = calculateExposure(
      baseInput({
        supplierTerms: expiredTerms,
        alternateDemand: { allocatedQuantity: 0, allocationIds: [], explicitlyConfirmedZero: true },
      })
    );
    if (!outcome.created) throw new Error("expected created");
    // Cancellation status downgraded due to staleness:
    expect(outcome.record.cancellationStatus).toBe("supplier_confirmation_required");
    expect(outcome.record.cancellationConfidence).toBe("unverified");
    // But the exposure amount and its confidence are completely untouched:
    expect(outcome.record.confidenceClassification).toBe("known");
    expect(outcome.record.grossCommittedValueTransaction).toBe(10000);
    expect(outcome.record.netExposureValueTransaction).toBe(10000);
  });

  it("a verified, current NCNR term yields known_non_cancellable with verified confidence", () => {
    const terms: SupplierCommitmentTerms = {
      id: "terms-2",
      supplierId: "sup-1",
      partId: null,
      ncnr: true,
      standardLeadTimeDays: 45,
      cancellationWindowDays: null,
      source: "verified_contract",
      effectiveDate: "2026-01-01",
      notes: null,
      verifiedAt: "2026-06-01T00:00:00Z",
      verifiedBy: "u1",
      validUntil: "2027-01-01",
      stalenessStatus: "current",
    };
    const outcome = calculateExposure(baseInput({ supplierTerms: terms }));
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.cancellationStatus).toBe("known_non_cancellable");
    expect(outcome.record.cancellationConfidence).toBe("verified");
  });
});

describe("calculateExposure — Unresolved cases (financial inputs, not cancellation terms)", () => {
  it("is Unresolved when quantity is missing", () => {
    const outcome = calculateExposure(
      baseInput({ purchaseOrderLine: makePoLine({ quantityOpen: null, quantityParseStatus: "missing" }) })
    );
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.confidenceClassification).toBe("unresolved");
    expect(outcome.record.grossCommittedValueTransaction).toBe(0);
    expect(outcome.record.classificationReason).toContain("quantity");
  });

  it("is Unresolved when unit price is invalid", () => {
    const outcome = calculateExposure(
      baseInput({ purchaseOrderLine: makePoLine({ unitPriceTransactionCurrency: null, priceParseStatus: "invalid" }) })
    );
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.confidenceClassification).toBe("unresolved");
    expect(outcome.record.classificationReason).toContain("price");
  });

  it("is Unresolved when the crosswalk allocation could not be resolved", () => {
    const outcome = calculateExposure(
      baseInput({ allocation: { resolved: false, reason: "percentage rules sum to 95%" } })
    );
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.confidenceClassification).toBe("unresolved");
    expect(outcome.record.classificationReason).toContain("95%");
  });

  it("is Unresolved when no exchange rate is available for the currency pair", () => {
    const outcome = calculateExposure(
      baseInput({
        purchaseOrderLine: makePoLine({ transactionCurrency: "EUR" }),
        reportingCurrency: "USD",
        exchangeRates: [],
      })
    );
    if (!outcome.created) throw new Error("expected created");
    expect(outcome.record.confidenceClassification).toBe("unresolved");
    expect(outcome.record.classificationReason).toContain("EUR");
  });

  it("creates NO record at all (an Unmapped Exposure Gap) when the crosswalk is not approved", () => {
    const outcome = calculateExposure(
      baseInput({ crosswalk: makeCrosswalk({ reviewStatus: "unreviewed" }) })
    );
    expect(outcome.created).toBe(false);
    if (outcome.created) throw new Error("expected gap");
    expect(outcome.gapReason).toContain("not approved");
  });

  it("creates NO record at all when the PO line is not open", () => {
    const outcome = calculateExposure(baseInput({ purchaseOrderLine: makePoLine({ lineStatus: "received" }) }));
    expect(outcome.created).toBe(false);
  });
});

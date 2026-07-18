import { describe, it, expect } from "vitest";
import { buildFinancialOutcome, closeFinancialOutcome, OutcomeInputs } from "@/domains/deltaledger/mitigation/outcome";

function baseInputs(overrides: Partial<OutcomeInputs> = {}): OutcomeInputs {
  return {
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
    ...overrides,
  };
}

describe("buildFinancialOutcome — uses the single corrected formula source", () => {
  it("matches the exact acceptance case end-to-end", () => {
    const outcome = buildFinancialOutcome(baseInputs());
    expect(outcome.actualCostAvoided).toBe(100000);
    expect(outcome.actualRealizedLoss).toBe(10000);
    expect(outcome.closedAt).toBeNull();
  });
});

describe("closeFinancialOutcome — full-value-redirect must be explicitly justified", () => {
  it("closes freely when there's no redirected quantity at all", () => {
    const outcome = buildFinancialOutcome(baseInputs());
    const result = closeFinancialOutcome(outcome, "finance-1", "2026-08-01T00:00:00Z");
    expect(result.success).toBe(true);
  });

  it("closes freely when recoverable_unit_value is below the frozen unit price (a write-down, not a claim)", () => {
    const outcome = buildFinancialOutcome(
      baseInputs({ quantityCancelled: 0, quantityRedirected: 100, recoverableUnitValue: 60 })
    );
    const result = closeFinancialOutcome(outcome, "finance-1", "2026-08-01T00:00:00Z");
    expect(result.success).toBe(true);
  });

  it("refuses to close when recoverable_unit_value equals frozen_unit_price without justification", () => {
    const outcome = buildFinancialOutcome(
      baseInputs({ quantityCancelled: 0, quantityRedirected: 100, recoverableUnitValue: 100 })
    );
    const result = closeFinancialOutcome(outcome, "finance-1", "2026-08-01T00:00:00Z");
    expect(result.success).toBe(false);
  });

  it("allows closing a full-value redirect once explicitly justified with a basis and reviewer", () => {
    const outcome = buildFinancialOutcome(
      baseInputs({
        quantityCancelled: 0,
        quantityRedirected: 100,
        recoverableUnitValue: 100,
        recoverableUnitValueBasis: "supplier_confirmed",
        recoverableUnitValueJustificationNote: "Supplier accepted full-value credit note for redirected units.",
        recoverableUnitValueReviewedBy: "finance-2",
      })
    );
    const result = closeFinancialOutcome(outcome, "finance-1", "2026-08-01T00:00:00Z");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outcome.closedBy).toBe("finance-1");
      expect(result.outcome.closedAt).toBe("2026-08-01T00:00:00Z");
    }
  });

  it("still requires justification even if only the basis is set but no reviewer", () => {
    const outcome = buildFinancialOutcome(
      baseInputs({
        quantityCancelled: 0,
        quantityRedirected: 100,
        recoverableUnitValue: 100,
        recoverableUnitValueBasis: "same_as_original",
        recoverableUnitValueReviewedBy: null,
      })
    );
    const result = closeFinancialOutcome(outcome, "finance-1", "2026-08-01T00:00:00Z");
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { computeFinancialOutcome, netMitigationBenefit } from "@/domains/deltaledger/financialOutcome";

describe("computeFinancialOutcome — corrected cancellation-fee treatment", () => {
  it("matches the exact acceptance case: $100,000 cancelled, $10,000 fee, nothing else", () => {
    const result = computeFinancialOutcome({
      frozenUnitPrice: 100,
      quantityCancelled: 1000, // 1000 * 100 = 100,000
      quantityRedirected: 0,
      recoverableUnitValue: null,
      cancellationFee: 10000,
      supplierCreditValue: 0,
      writeOffValue: 0,
      reworkCost: null,
      disposalCost: null,
    });

    expect(result.grossCancelledCommitmentValue).toBe(100000);
    expect(result.cancelledCommitmentAvoidance).toBe(100000);
    expect(result.actualCostAvoided).toBe(100000);
    expect(result.actualRealizedLoss).toBe(10000);

    const netBenefit = netMitigationBenefit(result.actualCostAvoided, result.actualRealizedLoss);
    expect(netBenefit).toBe(90000);
  });

  it("does NOT reproduce the old double-count bug ($80,000 net)", () => {
    const result = computeFinancialOutcome({
      frozenUnitPrice: 100,
      quantityCancelled: 1000,
      quantityRedirected: 0,
      recoverableUnitValue: null,
      cancellationFee: 10000,
      supplierCreditValue: 0,
      writeOffValue: 0,
      reworkCost: null,
      disposalCost: null,
    });
    const netBenefit = netMitigationBenefit(result.actualCostAvoided, result.actualRealizedLoss);
    // The bug produced $80,000 (fee subtracted once in avoidance, added again in loss).
    expect(netBenefit).not.toBe(80000);
    expect(netBenefit).toBe(90000);
  });

  it("includes redirected value and supplier credit in actual_cost_avoided", () => {
    const result = computeFinancialOutcome({
      frozenUnitPrice: 50,
      quantityCancelled: 100, // 100 * 50 = 5,000
      quantityRedirected: 40,
      recoverableUnitValue: 30, // 40 * 30 = 1,200
      cancellationFee: 500,
      supplierCreditValue: 300,
      writeOffValue: 0,
      reworkCost: null,
      disposalCost: null,
    });
    expect(result.cancelledCommitmentAvoidance).toBe(5000);
    expect(result.redirectedValuePreserved).toBe(1200);
    expect(result.actualCostAvoided).toBe(5000 + 1200 + 300); // 6500
    expect(result.actualRealizedLoss).toBe(500);
    expect(netMitigationBenefit(result.actualCostAvoided, result.actualRealizedLoss)).toBe(6000);
  });

  it("includes write-off, rework, and disposal costs in actual_realized_loss, each to the cent", () => {
    const result = computeFinancialOutcome({
      frozenUnitPrice: 10,
      quantityCancelled: 0,
      quantityRedirected: 0,
      recoverableUnitValue: null,
      cancellationFee: 250.5,
      supplierCreditValue: 0,
      writeOffValue: 1000.25,
      reworkCost: 75.1,
      disposalCost: 20,
    });
    expect(result.actualRealizedLoss).toBeCloseTo(1000.25 + 250.5 + 75.1 + 20, 10);
    expect(result.actualCostAvoided).toBe(0);
  });

  it("treats a fully write-off outcome (no mitigation) as zero avoided, full loss", () => {
    const result = computeFinancialOutcome({
      frozenUnitPrice: 200,
      quantityCancelled: 0,
      quantityRedirected: 0,
      recoverableUnitValue: null,
      cancellationFee: 0,
      supplierCreditValue: 0,
      writeOffValue: 20000,
      reworkCost: null,
      disposalCost: null,
    });
    expect(result.actualCostAvoided).toBe(0);
    expect(result.actualRealizedLoss).toBe(20000);
    expect(netMitigationBenefit(result.actualCostAvoided, result.actualRealizedLoss)).toBe(-20000);
  });
});

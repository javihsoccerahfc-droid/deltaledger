import { FinancialOutcome } from "./types";

/**
 * Computes the derived fields on a FinancialOutcome from its raw inputs.
 *
 * CORRECTED (see CORRECTIONS.md): earlier draft subtracted cancellation_fee
 * inside cancelled_commitment_avoidance AND added it again inside
 * actual_realized_loss — double-penalizing the same dollar. The fee is now
 * counted exactly once, inside actual_realized_loss only.
 */
export function computeFinancialOutcome(
  input: Pick<
    FinancialOutcome,
    | "frozenUnitPrice"
    | "quantityCancelled"
    | "quantityRedirected"
    | "recoverableUnitValue"
    | "cancellationFee"
    | "supplierCreditValue"
    | "writeOffValue"
    | "reworkCost"
    | "disposalCost"
  >
): Pick<
  FinancialOutcome,
  "grossCancelledCommitmentValue" | "cancelledCommitmentAvoidance" | "redirectedValuePreserved" | "actualCostAvoided" | "actualRealizedLoss"
> {
  const grossCancelledCommitmentValue = input.quantityCancelled * input.frozenUnitPrice;

  // The fee is NOT subtracted here. It belongs only in actualRealizedLoss.
  const cancelledCommitmentAvoidance = grossCancelledCommitmentValue;

  const redirectedValuePreserved = input.quantityRedirected * (input.recoverableUnitValue ?? 0);

  const actualCostAvoided = cancelledCommitmentAvoidance + redirectedValuePreserved + input.supplierCreditValue;

  const actualRealizedLoss =
    input.writeOffValue + input.cancellationFee + (input.reworkCost ?? 0) + (input.disposalCost ?? 0);

  return {
    grossCancelledCommitmentValue,
    cancelledCommitmentAvoidance,
    redirectedValuePreserved,
    actualCostAvoided,
    actualRealizedLoss,
  };
}

/** Reporting-only derivation — never persisted, always computed fresh from its two inputs. */
export function netMitigationBenefit(actualCostAvoided: number, actualRealizedLoss: number): number {
  return actualCostAvoided - actualRealizedLoss;
}

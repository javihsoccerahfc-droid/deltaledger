import { defaultIdGenerator } from "../idGenerator";
import { computeFinancialOutcome } from "../financialOutcome";
import { FinancialOutcome, RecoverableValueBasis } from "../types";

export interface OutcomeInputs {
  exposureRecordId: string;
  frozenUnitPrice: number;
  quantityCancelled: number;
  quantityRedirected: number;
  quantityReceivedBeforeAction: number;
  recoverableUnitValue: number | null;
  recoverableUnitValueBasis: RecoverableValueBasis | null;
  recoverableUnitValueJustificationNote: string | null;
  recoverableUnitValueReviewedBy: string | null;
  cancellationFee: number;
  supplierCreditValue: number;
  writeOffValue: number;
  reworkCost: number | null;
  disposalCost: number | null;
  estimatedCostAvoidedFrozen: number;
  outcomeExchangeRateSnapshotId: string | null;
}

function nextId() {
  return defaultIdGenerator.next("outcome");
}

/**
 * Builds a FinancialOutcome in draft (unclosed) state. The derived fields
 * come exclusively from computeFinancialOutcome() — this function does not
 * duplicate that arithmetic, so there is exactly one place the corrected
 * (fee-counted-once) formula lives.
 */
export function buildFinancialOutcome(inputs: OutcomeInputs): FinancialOutcome {
  const computed = computeFinancialOutcome({
    frozenUnitPrice: inputs.frozenUnitPrice,
    quantityCancelled: inputs.quantityCancelled,
    quantityRedirected: inputs.quantityRedirected,
    recoverableUnitValue: inputs.recoverableUnitValue,
    cancellationFee: inputs.cancellationFee,
    supplierCreditValue: inputs.supplierCreditValue,
    writeOffValue: inputs.writeOffValue,
    reworkCost: inputs.reworkCost,
    disposalCost: inputs.disposalCost,
  });

  return {
    id: nextId(),
    exposureRecordId: inputs.exposureRecordId,
    frozenUnitPrice: inputs.frozenUnitPrice,
    quantityCancelled: inputs.quantityCancelled,
    quantityRedirected: inputs.quantityRedirected,
    quantityReceivedBeforeAction: inputs.quantityReceivedBeforeAction,
    recoverableUnitValue: inputs.recoverableUnitValue,
    recoverableUnitValueBasis: inputs.recoverableUnitValueBasis,
    recoverableUnitValueJustificationNote: inputs.recoverableUnitValueJustificationNote,
    recoverableUnitValueReviewedBy: inputs.recoverableUnitValueReviewedBy,
    cancellationFee: inputs.cancellationFee,
    supplierCreditValue: inputs.supplierCreditValue,
    writeOffValue: inputs.writeOffValue,
    reworkCost: inputs.reworkCost,
    disposalCost: inputs.disposalCost,
    ...computed,
    estimatedCostAvoidedFrozen: inputs.estimatedCostAvoidedFrozen,
    outcomeExchangeRateSnapshotId: inputs.outcomeExchangeRateSnapshotId,
    closedAt: null,
    closedBy: null,
  };
}

export type CloseOutcomeResult = { success: true; outcome: FinancialOutcome } | { success: false; reason: string };

/**
 * Closes a FinancialOutcome, enforcing the one hard rule from the spec:
 * recoverable_unit_value may only equal frozen_unit_price (i.e. redirected
 * material assumed to preserve 100% of its original value) if that
 * assumption is explicitly justified — a basis and a reviewer, not just a
 * number typed into a field. Anything below full value needs no
 * justification, since assuming a write-down is conservative, not a claim
 * that could inflate reported savings.
 */
export function closeFinancialOutcome(outcome: FinancialOutcome, closedBy: string, closedAt: string): CloseOutcomeResult {
  const claimsFullOriginalValue =
    outcome.quantityRedirected > 0 && outcome.recoverableUnitValue === outcome.frozenUnitPrice;

  if (claimsFullOriginalValue) {
    const isJustified = Boolean(outcome.recoverableUnitValueBasis) && Boolean(outcome.recoverableUnitValueReviewedBy);
    if (!isJustified) {
      return {
        success: false,
        reason:
          "recoverable_unit_value equals the original frozen unit price, which assumes redirected material preserved 100% of its value. This requires an explicit basis and reviewer before it can be closed.",
      };
    }
  }

  return { success: true, outcome: { ...outcome, closedAt, closedBy } };
}

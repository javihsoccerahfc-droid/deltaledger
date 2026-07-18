import { eq } from "drizzle-orm";
import { db } from "../client";
import { financialOutcomes } from "../schema";
import { buildFinancialOutcome, closeFinancialOutcome, OutcomeInputs } from "@/domains/deltaledger/mitigation/outcome";

export async function createFinancialOutcomeInDb(inputs: OutcomeInputs) {
  const built = buildFinancialOutcome(inputs);
  const [row] = await db
    .insert(financialOutcomes)
    .values({
      exposureRecordId: built.exposureRecordId,
      frozenUnitPrice: built.frozenUnitPrice,
      quantityCancelled: built.quantityCancelled,
      quantityRedirected: built.quantityRedirected,
      quantityReceivedBeforeAction: built.quantityReceivedBeforeAction,
      recoverableUnitValue: built.recoverableUnitValue,
      recoverableUnitValueBasis: built.recoverableUnitValueBasis,
      recoverableUnitValueJustificationNote: built.recoverableUnitValueJustificationNote,
      recoverableUnitValueReviewedBy: built.recoverableUnitValueReviewedBy,
      cancellationFee: built.cancellationFee,
      supplierCreditValue: built.supplierCreditValue,
      writeOffValue: built.writeOffValue,
      reworkCost: built.reworkCost,
      disposalCost: built.disposalCost,
      grossCancelledCommitmentValue: built.grossCancelledCommitmentValue,
      cancelledCommitmentAvoidance: built.cancelledCommitmentAvoidance,
      redirectedValuePreserved: built.redirectedValuePreserved,
      actualCostAvoided: built.actualCostAvoided,
      actualRealizedLoss: built.actualRealizedLoss,
      estimatedCostAvoidedFrozen: built.estimatedCostAvoidedFrozen,
      outcomeExchangeRateSnapshotId: built.outcomeExchangeRateSnapshotId,
      closedAt: null,
      closedBy: null,
    })
    .returning();
  return row;
}

export type CloseResult = { success: true } | { success: false; message: string };

export async function closeFinancialOutcomeInDb(outcomeId: string, closedBy: string): Promise<CloseResult> {
  const [existing] = await db.select().from(financialOutcomes).where(eq(financialOutcomes.id, outcomeId)).limit(1);
  if (!existing) return { success: false, message: "Outcome not found." };

  const result = closeFinancialOutcome(
    {
      id: existing.id,
      exposureRecordId: existing.exposureRecordId,
      frozenUnitPrice: existing.frozenUnitPrice,
      quantityCancelled: existing.quantityCancelled,
      quantityRedirected: existing.quantityRedirected,
      quantityReceivedBeforeAction: existing.quantityReceivedBeforeAction,
      recoverableUnitValue: existing.recoverableUnitValue,
      recoverableUnitValueBasis: existing.recoverableUnitValueBasis,
      recoverableUnitValueJustificationNote: existing.recoverableUnitValueJustificationNote,
      recoverableUnitValueReviewedBy: existing.recoverableUnitValueReviewedBy,
      cancellationFee: existing.cancellationFee,
      supplierCreditValue: existing.supplierCreditValue,
      writeOffValue: existing.writeOffValue,
      reworkCost: existing.reworkCost,
      disposalCost: existing.disposalCost,
      grossCancelledCommitmentValue: existing.grossCancelledCommitmentValue,
      cancelledCommitmentAvoidance: existing.cancelledCommitmentAvoidance,
      redirectedValuePreserved: existing.redirectedValuePreserved,
      actualCostAvoided: existing.actualCostAvoided,
      actualRealizedLoss: existing.actualRealizedLoss,
      estimatedCostAvoidedFrozen: existing.estimatedCostAvoidedFrozen,
      outcomeExchangeRateSnapshotId: existing.outcomeExchangeRateSnapshotId,
      closedAt: existing.closedAt,
      closedBy: existing.closedBy,
    },
    closedBy,
    new Date().toISOString()
  );
  if (!result.success) return { success: false, message: result.reason };

  await db
    .update(financialOutcomes)
    .set({ closedAt: result.outcome.closedAt, closedBy: result.outcome.closedBy })
    .where(eq(financialOutcomes.id, outcomeId));
  return { success: true };
}

export async function getFinancialOutcomesForEc() {
  return db.select().from(financialOutcomes);
}

export async function getFinancialOutcomeForExposureRecord(exposureRecordId: string) {
  const [row] = await db
    .select()
    .from(financialOutcomes)
    .where(eq(financialOutcomes.exposureRecordId, exposureRecordId))
    .limit(1);
  return row ?? null;
}

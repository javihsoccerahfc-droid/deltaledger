import { netMitigationBenefit } from "../financialOutcome";
import { CancellationStatus, ExposureConfidence, ExposureRecord, FinancialOutcome } from "../types";

export interface ExposureSummary {
  countByConfidence: Record<ExposureConfidence, number>;
  countByCancellationStatus: Partial<Record<CancellationStatus, number>>;
  // Dollar totals are summed ONLY from known + estimated records.
  // Unresolved records carry $0 by construction (see calculateExposure.ts)
  // and are deliberately excluded here too, so an Unresolved record can
  // never quietly pad a total — its presence is visible only via the count.
  totalGrossReporting: number;
  totalNetReporting: number;
  totalGrossReportingKnownOnly: number;
  totalNetReportingKnownOnly: number;
}

export interface OutcomeSummary {
  countClosed: number;
  countOpen: number;
  totalEstimatedCostAvoidedFrozen: number;
  totalActualCostAvoided: number;
  totalActualRealizedLoss: number;
  totalNetMitigationBenefit: number;
}

export interface EcoReport {
  engineeringChangeId: string;
  exposure: ExposureSummary;
  outcomes: OutcomeSummary;
  unmappedGapCount: number;
}

export function summarizeExposure(records: ExposureRecord[]): ExposureSummary {
  const countByConfidence: Record<ExposureConfidence, number> = { known: 0, estimated: 0, unresolved: 0 };
  const countByCancellationStatus: Partial<Record<CancellationStatus, number>> = {};

  let totalGrossReporting = 0;
  let totalNetReporting = 0;
  let totalGrossReportingKnownOnly = 0;
  let totalNetReportingKnownOnly = 0;

  for (const r of records) {
    countByConfidence[r.confidenceClassification] += 1;
    countByCancellationStatus[r.cancellationStatus] = (countByCancellationStatus[r.cancellationStatus] ?? 0) + 1;

    if (r.confidenceClassification !== "unresolved") {
      totalGrossReporting += r.grossCommittedValueReporting;
      totalNetReporting += r.netExposureValueReporting;
    }
    if (r.confidenceClassification === "known") {
      totalGrossReportingKnownOnly += r.grossCommittedValueReporting;
      totalNetReportingKnownOnly += r.netExposureValueReporting;
    }
  }

  return {
    countByConfidence,
    countByCancellationStatus,
    totalGrossReporting,
    totalNetReporting,
    totalGrossReportingKnownOnly,
    totalNetReportingKnownOnly,
  };
}

export function summarizeOutcomes(outcomes: FinancialOutcome[]): OutcomeSummary {
  let countClosed = 0;
  let countOpen = 0;
  let totalEstimatedCostAvoidedFrozen = 0;
  let totalActualCostAvoided = 0;
  let totalActualRealizedLoss = 0;
  let totalNetMitigationBenefit = 0;

  for (const o of outcomes) {
    if (o.closedAt) countClosed += 1;
    else countOpen += 1;

    totalEstimatedCostAvoidedFrozen += o.estimatedCostAvoidedFrozen;
    totalActualCostAvoided += o.actualCostAvoided;
    totalActualRealizedLoss += o.actualRealizedLoss;
    totalNetMitigationBenefit += netMitigationBenefit(o.actualCostAvoided, o.actualRealizedLoss);
  }

  return {
    countClosed,
    countOpen,
    totalEstimatedCostAvoidedFrozen,
    totalActualCostAvoided,
    totalActualRealizedLoss,
    totalNetMitigationBenefit,
  };
}

export function buildEcoReport(
  engineeringChangeId: string,
  exposureRecords: ExposureRecord[],
  outcomes: FinancialOutcome[],
  unmappedGapCount: number
): EcoReport {
  return {
    engineeringChangeId,
    exposure: summarizeExposure(exposureRecords),
    outcomes: summarizeOutcomes(outcomes),
    unmappedGapCount,
  };
}

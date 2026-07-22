import { EcoReport, ExposureSummary, OutcomeSummary, summarizeExposure, summarizeOutcomes } from "./ecoReport";
import { ExposureRecord, FinancialOutcome } from "../types";

export interface MonthlyReport {
  ecoCount: number;
  exposure: ExposureSummary;
  outcomes: OutcomeSummary;
  totalUnmappedGaps: number;
}

/**
 * Builds a monthly rollup directly from the underlying records across all
 * ECOs in the period, rather than summing already-summarized per-ECO
 * reports — avoids any risk of double-rounding or drift between the two
 * levels of aggregation.
 */
export function buildMonthlyReport(
  allExposureRecords: ExposureRecord[],
  allOutcomes: FinancialOutcome[],
  ecoReports: EcoReport[]
): MonthlyReport {
  return {
    ecoCount: ecoReports.length,
    exposure: summarizeExposure(allExposureRecords),
    outcomes: summarizeOutcomes(allOutcomes),
    totalUnmappedGaps: ecoReports.reduce((sum, r) => sum + r.unmappedGapCount, 0),
  };
}

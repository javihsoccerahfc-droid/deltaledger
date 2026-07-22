import type { EcoReport } from "./ecoReport";

/**
 * Phase 6C -- Decision Storytelling. The single canonical place the Report's executive
 * narrative is assembled, mirroring exposureNarrative.ts's discipline: every figure here is
 * read directly from the already-computed EcoReport (itself a pure summary of persisted
 * ExposureRecord/FinancialOutcome rows) -- nothing is recalculated, and nothing claims a trend.
 *
 * Same unresolved-record rule as exposureNarrative.ts: an unresolved exposure record carries
 * $0 net exposure by construction (see calculateExposure.ts), so it is described by COUNT
 * ("N records not yet determinable"), never as a $0 dollar claim that would be technically
 * true but misleading.
 *
 * No trend language anywhere in this file ("improving," "up from," "since last report") --
 * EcoReport is a snapshot of the current, persisted state with no structured prior-period
 * comparison to draw from. Every sentence here is a current-state fact or an accumulated
 * to-date total, never a claim about direction or change over time.
 */

export interface ReportNarrative {
  /** Current exposure state: total, and its known/estimated/unresolved composition. */
  exposureLine: string;
  /** Mitigation activity to date -- avoided vs. realized loss, and how much is still open. */
  mitigationLine: string;
  /** The accumulated net financial outcome of mitigation to date. */
  netPositionLine: string;
  /** Present only when at least one part is excluded from every total above. */
  gapCaveat: string | null;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function summarizeReportNarrative(report: EcoReport): ReportNarrative | null {
  const totalRecords =
    report.exposure.countByConfidence.known + report.exposure.countByConfidence.estimated + report.exposure.countByConfidence.unresolved;
  if (totalRecords === 0) return null;

  const knownTotal = report.exposure.totalNetReportingKnownOnly;
  // totalNetReporting is defined (see ecoReport.ts) as known + estimated only -- unresolved
  // records are $0 by construction and already excluded, so this subtraction isolates the
  // estimated-only portion without recomputing anything.
  const estimatedTotal = report.exposure.totalNetReporting - report.exposure.totalNetReportingKnownOnly;
  const unresolvedCount = report.exposure.countByConfidence.unresolved;

  const dollarParts: string[] = [];
  if (knownTotal > 0) dollarParts.push(`${money(knownTotal)} known`);
  if (estimatedTotal > 0) dollarParts.push(`${money(estimatedTotal)} estimated`);
  if (unresolvedCount > 0) dollarParts.push(`${unresolvedCount} record${unresolvedCount === 1 ? "" : "s"} not yet determinable`);

  const exposureLine =
    dollarParts.length > 1
      ? `${money(report.exposure.totalNetReporting)} of total net exposure across ${totalRecords} record${totalRecords === 1 ? "" : "s"}: ${joinWithAnd(dollarParts)}.`
      : dollarParts.length === 1 && (knownTotal > 0 || estimatedTotal > 0)
        ? `${money(report.exposure.totalNetReporting)} of net exposure across ${totalRecords} record${totalRecords === 1 ? "" : "s"}.`
        : `${totalRecords} exposure record${totalRecords === 1 ? "" : "s"}, none yet determinable.`;

  const outcomeCount = report.outcomes.countClosed + report.outcomes.countOpen;
  const mitigationLine =
    outcomeCount === 0
      ? "No mitigation outcomes have been recorded yet."
      : `Of ${outcomeCount} recorded mitigation outcome${outcomeCount === 1 ? "" : "s"}, ${money(report.outcomes.totalActualCostAvoided)} has been avoided and ${money(report.outcomes.totalActualRealizedLoss)} realized as loss to date${report.outcomes.countOpen > 0 ? ` (${report.outcomes.countOpen} still open)` : ""}.`;

  const netPositionLine =
    outcomeCount === 0
      ? "No net mitigation benefit to report yet."
      : `Net mitigation benefit to date: ${money(report.outcomes.totalNetMitigationBenefit)}.`;

  const gapCaveat =
    report.unmappedGapCount > 0
      ? `${report.unmappedGapCount} part${report.unmappedGapCount === 1 ? "" : "s"} could not be mapped as of the last calculation and ${report.unmappedGapCount === 1 ? "is" : "are"} excluded from every total above, not counted as zero exposure.`
      : null;

  return { exposureLine, mitigationLine, netPositionLine, gapCaveat };
}

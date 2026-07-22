import type { DecisionReadiness, DecisionReadinessReasonCode, EvidenceCoverage } from "./workspaceSummary";
import { REASON_CODE_TO_ACTION } from "./workspaceSummary";

/**
 * Everything the Portfolio Command Center needs, derived from data already computed per-EC
 * (see workspaceSummary.ts). No new financial calculations here -- this file only aggregates
 * and prioritizes, the same "fetch/derive separately, compose here" discipline used
 * throughout this domain layer.
 */

export interface EcPortfolioEntry {
  ecId: string;
  ecName: string;
  readiness: DecisionReadiness;
  coverage: EvidenceCoverage;
}

export interface AttentionItem {
  ecId: string;
  ecName: string;
  /** The single most specific reason this EC needs attention, in plain language. */
  reasonLabel: string;
  /** Label for the single most useful next action. */
  ctaLabel: string;
  /** Workspace tab this action lives on, e.g. "mapping" -- caller builds the full route. */
  ctaTab: string;
  /** not_ready is more urgent than needs_attention -- used for sort order, not just display. */
  urgency: "not_ready" | "needs_attention";
}

/** Every EC that isn't fully "ready," ordered by urgency (blocking issues before advisory ones). */
export function getPortfolioAttentionItems(entries: EcPortfolioEntry[]): AttentionItem[] {
  return entries
    .filter((e): e is EcPortfolioEntry & { readiness: DecisionReadiness & { primaryReasonCode: NonNullable<DecisionReadinessReasonCode> } } =>
      e.readiness.status !== "ready"
    )
    .map((e) => {
      const action = REASON_CODE_TO_ACTION[e.readiness.primaryReasonCode];
      const urgency: AttentionItem["urgency"] = e.readiness.status === "not_ready" ? "not_ready" : "needs_attention";
      return {
        ecId: e.ecId,
        ecName: e.ecName,
        reasonLabel: e.readiness.blockingReasons[0] ?? "",
        ctaLabel: action.label,
        ctaTab: action.tab,
        urgency,
      };
    })
    .sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "not_ready" ? -1 : 1));
}

export interface PortfolioMetrics {
  totalOpenEcs: number;
  totalExposure: number;
  /** Same Phase 6C discipline as exposureNarrative.ts: known/estimated are real dollar totals; unresolved is a count, never a $0 dollar claim (unresolved records carry $0 by construction). */
  knownTotal: number;
  estimatedTotal: number;
  unresolvedCount: number;
  needsActionCount: number;
  staleOrUnverifiedCount: number;
}

export function getPortfolioMetrics(entries: EcPortfolioEntry[]): PortfolioMetrics {
  return {
    totalOpenEcs: entries.length,
    totalExposure: entries.reduce((sum, e) => sum + e.coverage.grandTotal, 0),
    knownTotal: entries.reduce((sum, e) => sum + e.coverage.knownTotal, 0),
    estimatedTotal: entries.reduce((sum, e) => sum + e.coverage.estimatedTotal, 0),
    unresolvedCount: entries.reduce((sum, e) => sum + e.coverage.unresolvedCount, 0),
    needsActionCount: entries.filter((e) => e.readiness.status !== "ready").length,
    staleOrUnverifiedCount: entries.filter((e) => e.readiness.primaryReasonCode === "stale_exposure").length,
  };
}

/** ECs with real exposure calculated, ordered largest-first -- for the "largest exposure" list. */
export function getLargestExposureEntries(entries: EcPortfolioEntry[], limit: number): EcPortfolioEntry[] {
  return entries
    .filter((e) => e.coverage.grandTotal > 0)
    .sort((a, b) => b.coverage.grandTotal - a.coverage.grandTotal)
    .slice(0, limit);
}

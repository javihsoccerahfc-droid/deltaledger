import type { PartNumberCrosswalk, ExposureRecord, BomDiffEntry } from "./types";

/**
 * Single source of truth for "how far along is this engineering change." Previously this
 * derivation (eligible-crosswalk filtering, completion flags, exposure totals) was inlined
 * directly in engineering-changes/[id]/layout.tsx. Extracted here as a pure function --
 * takes already-fetched data, returns derived facts, no I/O -- so the Context Bar, the
 * workspace tab bar, and the Overview page all compute the same answer from the same place,
 * rather than three copies that could quietly drift apart.
 */

export interface MitigationOutcomeLike {
  exposureRecordId: string;
  closedAt: string | null;
}

export interface WorkspaceCompletion {
  bomComplete: boolean;
  poComplete: boolean;
  mappingComplete: boolean;
  mappingPending: number;
  exposureComplete: boolean;
  mitigationComplete: boolean;
  mitigationPending: number;
}

export interface EvidenceCoverage {
  knownTotal: number;
  estimatedTotal: number;
  unresolvedTotal: number;
  grandTotal: number;
  /** knownTotal / grandTotal, 0 when there's nothing to divide (no exposure calculated yet). */
  coverageFraction: number;
  knownCount: number;
  estimatedCount: number;
  unresolvedCount: number;
}

export type DecisionReadinessStatus = "ready" | "needs_attention" | "not_ready";

export type DecisionReadinessReasonCode =
  | "no_bom"
  | "no_po"
  | "mapping_pending"
  | "no_exposure"
  | "stale_exposure"
  | "mapping_changed_since_calculation"
  | null;

export interface DecisionReadiness {
  status: DecisionReadinessStatus;
  /**
   * Every reason this isn't fully "ready," in the exact order checked. Deliberately a list of
   * concrete, checkable facts -- never a single opaque verdict -- so "why isn't this ready"
   * is always answerable in one glance, consistent with every other trust-first surface in
   * this product.
   */
  blockingReasons: string[];
  /**
   * The single highest-priority reason, as a structured code rather than a string to parse.
   * Exists specifically so a UI (e.g. the Portfolio Command Center) can deterministically map
   * "why isn't this ready" to "what specific action fixes it" (a route, a button label)
   * without matching against human-readable sentences, which is fragile and couples display
   * copy to logic. null only when status is "ready".
   */
  primaryReasonCode: DecisionReadinessReasonCode;
}

export interface WorkspaceSummaryInput {
  bomDiff: Pick<BomDiffEntry, "partId" | "changeType">[];
  poLineCount: number;
  /** All crosswalks for the org -- eligibility filtering happens inside this function. */
  crosswalks: Pick<PartNumberCrosswalk, "plmPartId" | "reviewStatus">[];
  exposureRecords: Pick<ExposureRecord, "id" | "confidenceClassification" | "netExposureValueReporting">[];
  /** provenance state per exposure record id, from db/repositories/exposure.ts's provenanceState(). */
  provenanceByRecordId: Record<string, "current" | "stale" | "legacy_unknown">;
  mitigationOutcomes: MitigationOutcomeLike[];
}

const EXPOSURE_ELIGIBLE_CHANGE_TYPES = new Set(["removed", "qty_reduced", "replaced"]);

function getEligiblePartIds(bomDiff: WorkspaceSummaryInput["bomDiff"]): Set<string> {
  return new Set(
    bomDiff.filter((d) => EXPOSURE_ELIGIBLE_CHANGE_TYPES.has(d.changeType)).map((d) => d.partId.toUpperCase())
  );
}

export function getWorkspaceCompletion(input: WorkspaceSummaryInput): WorkspaceCompletion {
  const eligiblePartIds = getEligiblePartIds(input.bomDiff);
  const relevantCrosswalks = input.crosswalks.filter((c) => eligiblePartIds.has(c.plmPartId.toUpperCase()));
  const relevantOutcomes = input.mitigationOutcomes.filter((o) => input.exposureRecords.some((r) => r.id === o.exposureRecordId));

  return {
    bomComplete: input.bomDiff.length > 0,
    poComplete: input.poLineCount > 0,
    mappingComplete: relevantCrosswalks.length > 0 && relevantCrosswalks.every((c) => c.reviewStatus !== "unreviewed"),
    mappingPending: relevantCrosswalks.filter((c) => c.reviewStatus === "unreviewed").length,
    exposureComplete: input.exposureRecords.length > 0,
    mitigationComplete:
      input.exposureRecords.length > 0 &&
      input.exposureRecords.every((r) => relevantOutcomes.some((o) => o.exposureRecordId === r.id && o.closedAt)),
    mitigationPending: input.exposureRecords.filter((r) => !relevantOutcomes.some((o) => o.exposureRecordId === r.id && o.closedAt))
      .length,
  };
}

export function getEvidenceCoverage(exposureRecords: WorkspaceSummaryInput["exposureRecords"]): EvidenceCoverage {
  const known = exposureRecords.filter((r) => r.confidenceClassification === "known");
  const estimated = exposureRecords.filter((r) => r.confidenceClassification === "estimated");
  const unresolved = exposureRecords.filter((r) => r.confidenceClassification === "unresolved");

  const knownTotal = known.reduce((s, r) => s + r.netExposureValueReporting, 0);
  const estimatedTotal = estimated.reduce((s, r) => s + r.netExposureValueReporting, 0);
  const unresolvedTotal = unresolved.reduce((s, r) => s + r.netExposureValueReporting, 0);
  const grandTotal = knownTotal + estimatedTotal + unresolvedTotal;

  return {
    knownTotal,
    estimatedTotal,
    unresolvedTotal,
    grandTotal,
    coverageFraction: grandTotal > 0 ? knownTotal / grandTotal : 0,
    knownCount: known.length,
    estimatedCount: estimated.length,
    unresolvedCount: unresolved.length,
  };
}

/**
 * Deterministic, explainable readiness check -- deliberately NOT a black-box verdict.
 * "not_ready" blocks financial review outright; "needs_attention" means a number exists but
 * shouldn't be relied on without checking it first; "ready" means every check passed.
 */
export function getDecisionReadiness(
  completion: WorkspaceCompletion,
  provenanceByRecordId: Record<string, string>,
  supersededMappingCount = 0
): DecisionReadiness {
  const blockingReasons: string[] = [];
  let primaryReasonCode: DecisionReadinessReasonCode = null;

  if (!completion.bomComplete) {
    blockingReasons.push("No BOM diff yet -- import the current and proposed BOM.");
    primaryReasonCode = primaryReasonCode ?? "no_bom";
  }
  if (!completion.poComplete) {
    blockingReasons.push("No open PO data yet -- import the open-PO export.");
    primaryReasonCode = primaryReasonCode ?? "no_po";
  }
  if (completion.mappingPending > 0) {
    blockingReasons.push(
      `${completion.mappingPending} crosswalk mapping${completion.mappingPending === 1 ? "" : "s"} still need${
        completion.mappingPending === 1 ? "s" : ""
      } review.`
    );
    primaryReasonCode = primaryReasonCode ?? "mapping_pending";
  }
  if (!completion.exposureComplete) {
    blockingReasons.push("Exposure hasn't been calculated yet.");
    primaryReasonCode = primaryReasonCode ?? "no_exposure";
  }

  if (blockingReasons.length > 0) {
    return { status: "not_ready", blockingReasons, primaryReasonCode };
  }

  // Phase 6B -- checked before PO-provenance staleness: a changed mapping is the more direct,
  // more actionable cause ("go revise/recalculate this specific part") versus PO provenance
  // being a broader, less specific signal. Only the single highest-priority reason surfaces
  // as primaryReasonCode either way (see that field's own docs on why it's deliberately one
  // structured code, not a list to parse).
  if (supersededMappingCount > 0) {
    return {
      status: "needs_attention",
      blockingReasons: [
        `${supersededMappingCount} exposure record${supersededMappingCount === 1 ? "" : "s"} ${
          supersededMappingCount === 1 ? "was" : "were"
        } calculated against a part mapping that has since been revised or revoked -- recalculate to reflect the current mapping.`,
      ],
      primaryReasonCode: "mapping_changed_since_calculation",
    };
  }

  const staleOrUnknown = Object.values(provenanceByRecordId).filter((p) => p !== "current");
  if (staleOrUnknown.length > 0) {
    return {
      status: "needs_attention",
      blockingReasons: [
        `${staleOrUnknown.length} exposure record${staleOrUnknown.length === 1 ? "" : "s"} ${
          staleOrUnknown.length === 1 ? "is" : "are"
        } based on superseded or unverifiable PO data -- recalculate before relying on this number.`,
      ],
      primaryReasonCode: "stale_exposure",
    };
  }

  return { status: "ready", blockingReasons: [], primaryReasonCode: null };
}

export interface NextAction {
  label: string;
  href: string;
}

/**
 * Phase 6B -- the single canonical mapping from a readiness reason code to the concrete
 * action that resolves it. Previously portfolioSummary.ts had its own private copy of
 * essentially this same map for the Attention List's CTA labels; this is now the one source
 * both that and the per-workspace next-action strip (see getNextAction below) build on, so a
 * new reason code is added in exactly one place, not two that could quietly drift apart.
 */
export const REASON_CODE_TO_ACTION: Record<Exclude<DecisionReadinessReasonCode, null>, { label: string; tab: string }> = {
  no_bom: { label: "Import BOM Diff", tab: "boms" },
  no_po: { label: "Import Open PO Data", tab: "po" },
  mapping_pending: { label: "Review Mapping", tab: "mapping" },
  no_exposure: { label: "Calculate Exposure", tab: "exposure" },
  mapping_changed_since_calculation: { label: "Recalculate Exposure", tab: "exposure" },
  stale_exposure: { label: "Recalculate Exposure", tab: "exposure" },
};

/**
 * Maps a readiness verdict to the one concrete thing to do about it: a real button with a
 * real destination, not another sentence to read.
 */
export function getNextAction(ecId: string, readiness: DecisionReadiness): NextAction | null {
  if (readiness.primaryReasonCode === null) return null;
  const action = REASON_CODE_TO_ACTION[readiness.primaryReasonCode];
  return { label: action.label, href: `/engineering-changes/${ecId}/${action.tab}` };
}

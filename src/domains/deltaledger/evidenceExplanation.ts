import type { ExposureConfidence } from "./types";

/**
 * The Evidence Explorer's "financial explanation engine" -- not a data viewer. Every piece of
 * evidence is classified as either FACTUAL (observed directly: a real PO, a real quantity, an
 * approved crosswalk) or APPLIED (a rule DeltaLedger used to interpret those facts: an
 * allocation method, an exchange rate, alternate-demand netting). The two are never blended --
 * that distinction is one of this product's core trust properties. Nothing here recomputes a
 * financial value; every number narrated is read directly from the already-persisted,
 * authoritative ExposureRecord/ExposureSourceSnapshot -- this function only explains numbers
 * that already exist, it never derives new ones (avoiding any risk of drifting from the real
 * calculation engine).
 */

export interface EvidenceItem {
  label: string;
  value: string;
}

export interface CalculationStep {
  label: string;
  value: string;
  /** How this step combines with the next one, for narrative rendering (e.g. "×", "-"). */
  operator?: string;
}

export type NextStepAction =
  | { label: "Review Crosswalk"; tab: "mapping"; reason: string }
  | { label: "Recalculate Exposure"; tab: "exposure"; reason: string }
  | { label: "Review Purchase Order"; tab: "po"; reason: string }
  | { label: "Open Mitigation"; tab: "mitigation"; reason: string }
  | { label: "Evaluate Alternate Demand"; tab: "alternate-demand"; reason: string }
  | { label: "No further action needed"; tab: null; reason: string };

export interface EvidenceExplanation {
  facts: EvidenceItem[];
  appliedRules: EvidenceItem[];
  calculationSteps: CalculationStep[];
  conclusion: {
    netExposure: number;
    confidence: ExposureConfidence;
    /** Plain-language explanation of what the number means -- never just the number restated. */
    explanation: string;
  };
  nextStep: NextStepAction;
  /** Present only when provenance isn't "current" -- surfaced inside the explanation itself. */
  provenanceNote: string | null;
}

/**
 * Milestone 3.75 -- Evidence Integrity. `crosswalkEvidence` and `allocationMethod` are frozen
 * values read directly from the snapshot (see db/schema.ts's exposure_source_snapshots), NOT
 * a live join to the current crosswalk/allocation-rule tables. Previously this function took
 * a live `crosswalk` object and a live `allocationRuleMethod` string, both re-derived at
 * explanation time -- but approveCrosswalkById/rejectCrosswalkById mutate a crosswalk row's
 * reviewStatus in place, and upsertAllocationRule deletes and re-inserts allocation rules
 * entirely, rather than superseding either. That meant a historical explanation could
 * silently change to reflect facts that were not true when the calculation actually ran.
 * "legacy_unavailable" is an honest, explicit third state -- for snapshots calculated before
 * this evidence-freezing existed -- never blended with "not approved" or guessed at.
 */
export type CrosswalkEvidence =
  | {
      status: "recorded";
      erpPartId: string;
      matchMethod: string;
      reviewStatus: string;
      reviewedBy: string | null;
      reviewedAt: string | null;
    }
  | { status: "legacy_unavailable" };

export interface EvidenceExplanationInput {
  record: {
    partId: string;
    grossCommittedValueReporting: number;
    alternateDemandAdjustmentReporting: number;
    netExposureValueReporting: number;
    reportingCurrency?: string;
    confidenceClassification: ExposureConfidence;
    classificationReason: string | null;
  };
  snapshot: {
    quantityOpen: number | null;
    unitPriceTransactionCurrency: number | null;
    transactionCurrency: string;
    reportingCurrency: string;
    exchangeRate: number;
    promisedReceiptDate: string | null;
  };
  supplierName: string;
  poNumber: string;
  crosswalkEvidence: CrosswalkEvidence;
  /** Frozen at calculation time, same reasoning as crosswalkEvidence above. */
  allocationMethod: string | null;
  provenance: "current" | "stale" | "legacy_unknown";
  hasOpenMitigationAction: boolean;
  hasAlternateDemandAllocation: boolean;
}

function money(n: number, currency = "USD"): string {
  return n.toLocaleString(undefined, { style: "currency", currency });
}

export function buildEvidenceExplanation(input: EvidenceExplanationInput): EvidenceExplanation {
  const { record, snapshot, crosswalkEvidence } = input;

  // --- Facts: directly observed, from real source documents ---
  const facts: EvidenceItem[] = [
    { label: "Purchase Order", value: input.poNumber },
    { label: "Supplier", value: input.supplierName },
    { label: "Quantity open", value: snapshot.quantityOpen !== null ? snapshot.quantityOpen.toLocaleString() : "Not available" },
    {
      label: "Unit cost",
      value:
        snapshot.unitPriceTransactionCurrency !== null
          ? money(snapshot.unitPriceTransactionCurrency, snapshot.transactionCurrency)
          : "Not available",
    },
    { label: "Promised receipt date", value: snapshot.promisedReceiptDate ?? "Not provided" },
  ];
  if (crosswalkEvidence.status === "recorded") {
    facts.push({
      label: "Crosswalk approval",
      value: `${record.partId} -> ${crosswalkEvidence.erpPartId}, ${crosswalkEvidence.reviewStatus}${crosswalkEvidence.reviewedBy ? ` by ${crosswalkEvidence.reviewedBy}` : ""}${crosswalkEvidence.reviewedAt ? ` on ${new Date(crosswalkEvidence.reviewedAt).toLocaleDateString()}` : ""} (recorded at calculation time).`,
    });
  } else {
    facts.push({
      label: "Crosswalk approval",
      value: "Historical evidence unavailable -- this record was calculated before evidence freezing was introduced.",
    });
  }

  // --- Applied Rules: how DeltaLedger interpreted the facts above ---
  const appliedRules: EvidenceItem[] = [];
  if (input.allocationMethod) {
    appliedRules.push({ label: "Allocation rule", value: input.allocationMethod });
  }
  if (crosswalkEvidence.status === "recorded") {
    appliedRules.push({ label: "Match method", value: crosswalkEvidence.matchMethod });
  }
  if (snapshot.transactionCurrency !== snapshot.reportingCurrency) {
    appliedRules.push({
      label: "Exchange rate",
      value: `1 ${snapshot.transactionCurrency} = ${snapshot.exchangeRate} ${snapshot.reportingCurrency}`,
    });
  }
  if (record.alternateDemandAdjustmentReporting !== 0) {
    appliedRules.push({ label: "Alternate demand applied", value: money(Math.abs(record.alternateDemandAdjustmentReporting)) });
  }

  // --- Calculation narrative: cause before consequence, using only already-persisted values ---
  const calculationSteps: CalculationStep[] = [];
  if (snapshot.quantityOpen !== null && snapshot.unitPriceTransactionCurrency !== null) {
    calculationSteps.push({
      label: `${snapshot.quantityOpen.toLocaleString()} units × ${money(snapshot.unitPriceTransactionCurrency, snapshot.transactionCurrency)}`,
      value: money(record.grossCommittedValueReporting),
      operator: "=",
    });
  }
  calculationSteps.push({ label: "Gross committed value", value: money(record.grossCommittedValueReporting) });
  if (record.alternateDemandAdjustmentReporting !== 0) {
    calculationSteps.push({
      label: "Alternate demand adjustment",
      value: `${record.alternateDemandAdjustmentReporting > 0 ? "-" : "+"}${money(Math.abs(record.alternateDemandAdjustmentReporting))}`,
    });
  }
  calculationSteps.push({ label: "Net financial exposure", value: money(record.netExposureValueReporting) });

  // --- Conclusion: explain what the number means, never just restate it ---
  const confidenceExplanation: Record<ExposureConfidence, string> = {
    known: "Every fact behind this figure is backed by an approved crosswalk and a real, current purchase order line -- this number is fully defensible.",
    estimated:
      "This figure relies on at least one applied rule (an allocation, an exchange rate, or similar) rather than a direct one-to-one fact -- reasonable, but not as certain as a Known figure.",
    unresolved:
      record.classificationReason ?? "This figure could not be fully determined -- one or more required facts is missing or ambiguous.",
  };

  // --- Next step: deterministic priority, never AI/predicted ---
  let nextStep: NextStepAction;
  if (crosswalkEvidence.status === "recorded" && crosswalkEvidence.reviewStatus !== "approved") {
    // Practically unreachable for any record calculated after Milestone 3.5's Identity
    // Resolution stage (which requires an approved crosswalk to produce a record at all) --
    // kept as a defensive check, not removed, since it costs nothing and protects against a
    // future change to that guarantee going unnoticed here.
    nextStep = { label: "Review Crosswalk", tab: "mapping", reason: "This exposure depends on a mapping that hasn't been approved yet." };
  } else if (input.provenance !== "current") {
    nextStep = {
      label: "Recalculate Exposure",
      tab: "exposure",
      reason:
        input.provenance === "stale"
          ? "This was calculated against PO data that's since been replaced by a corrected import."
          : "This predates per-import PO tracking and its provenance can't be verified.",
    };
  } else if (record.confidenceClassification === "unresolved") {
    nextStep = { label: "Review Purchase Order", tab: "po", reason: "A required fact is missing or invalid in the PO data." };
  } else if (!input.hasOpenMitigationAction) {
    nextStep = { label: "Open Mitigation", tab: "mitigation", reason: "No mitigation action has been started for this exposure yet." };
  } else if (!input.hasAlternateDemandAllocation) {
    nextStep = {
      label: "Evaluate Alternate Demand",
      tab: "alternate-demand",
      reason: "No alternate demand has been evaluated against this exposure yet.",
    };
  } else {
    nextStep = { label: "No further action needed", tab: null, reason: "This exposure is current, approved, and being actively mitigated." };
  }

  const provenanceNote: string | null =
    input.provenance === "stale"
      ? "This calculation used open-PO data that has since been replaced by a corrected import -- the figures below may no longer reflect the current PO data."
      : input.provenance === "legacy_unknown"
        ? "This calculation predates per-import PO tracking -- whether it reflects current PO data cannot be automatically verified."
        : null;

  return {
    facts,
    appliedRules,
    calculationSteps,
    conclusion: {
      netExposure: record.netExposureValueReporting,
      confidence: record.confidenceClassification,
      explanation: confidenceExplanation[record.confidenceClassification],
    },
    nextStep,
    provenanceNote,
  };
}

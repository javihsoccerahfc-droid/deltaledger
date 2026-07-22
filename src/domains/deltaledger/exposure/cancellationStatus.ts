import { CancellationConfidence, CancellationStatus, SupplierCommitmentTerms } from "../types";

export interface CancellationStatusResult {
  status: CancellationStatus;
  confidence: CancellationConfidence;
  // A deadline is only ever populated when it's backed by a verified,
  // non-stale contractual/supplier-provided date — never computed from
  // standard_lead_time_days alone. Most branches leave this null.
  deadlineDate: string | null;
}

/**
 * Determines cancellation status from supplier terms. This deliberately
 * does NOT use `standardLeadTimeDays` at all — that field describes typical
 * replenishment lead time, not a legal cancellation right, and the spec is
 * explicit that a cancellation window must never be inferred from it.
 * `cancellationWindowDays` is a distinct, explicitly-verified contractual
 * term and is the only day-count this function will use to compute a
 * deadline, and only when its source is a verified contract.
 */
export function determineCancellationStatus(
  terms: SupplierCommitmentTerms | undefined,
  promisedReceiptDate: string | null,
  asOfDate: string
): CancellationStatusResult {
  if (!terms) {
    return { status: "cancellation_terms_missing", confidence: "unknown", deadlineDate: null };
  }

  // Expired or unverified terms cannot support a Known-grade cancellation
  // STATUS, even if the underlying data would otherwise look favorable —
  // per spec §8, staleness gates new calculations. This does NOT delete or
  // downgrade a previously-frozen ExposureRecord (see ExposureSourceSnapshot
  // immutability) — it only affects what a *new* calculation may conclude.
  // Note this affects cancellation_status/cancellation_confidence ONLY —
  // it has no bearing on the exposure amount's own confidence (see
  // calculateExposure.ts, which never reads this result for that purpose).
  if (terms.stalenessStatus === "expired" || terms.stalenessStatus === "unverified") {
    return { status: "supplier_confirmation_required", confidence: "unverified", deadlineDate: null };
  }

  if (terms.source === "unconfirmed") {
    return { status: "supplier_confirmation_required", confidence: "unverified", deadlineDate: null };
  }

  if (terms.source === "supplier_provided") {
    // Real information from the supplier, just not contractually verified —
    // can inform an estimate but is never "known"-grade certainty.
    if (terms.ncnr) {
      return { status: "known_non_cancellable", confidence: "supplier_reported", deadlineDate: null };
    }
    if (terms.cancellationWindowDays !== null && promisedReceiptDate) {
      const deadline = addDays(promisedReceiptDate, -terms.cancellationWindowDays);
      const stillCancellable = asOfDate <= deadline;
      return {
        status: stillCancellable ? "known_cancellable" : "known_non_cancellable",
        confidence: "supplier_reported",
        deadlineDate: deadline,
      };
    }
    return { status: "supplier_confirmation_required", confidence: "supplier_reported", deadlineDate: null };
  }

  // source === "verified_contract" and staleness is current or review_due
  if (terms.ncnr) {
    return { status: "known_non_cancellable", confidence: "verified", deadlineDate: null };
  }
  if (terms.cancellationWindowDays !== null && promisedReceiptDate) {
    const deadline = addDays(promisedReceiptDate, -terms.cancellationWindowDays);
    const stillCancellable = asOfDate <= deadline;
    return {
      status: stillCancellable ? "known_cancellable" : "known_non_cancellable",
      confidence: "verified",
      deadlineDate: deadline,
    };
  }
  // Verified contract exists but doesn't specify NCNR or a cancellation
  // window — genuinely incomplete data, not something to guess past.
  return { status: "supplier_confirmation_required", confidence: "verified", deadlineDate: null };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

import { CancellationConfidence, CancellationStatus, ExposureConfidence } from "@/domains/deltaledger/types";

const EXPOSURE_CONFIDENCE_STYLES: Record<ExposureConfidence, string> = {
  known: "bg-status-successBg text-status-success border-status-success/30",
  estimated: "bg-status-warningBg text-status-warning border-status-warning/30",
  unresolved: "bg-status-criticalBg text-status-critical border-status-critical/30",
};

const EXPOSURE_CONFIDENCE_LABEL: Record<ExposureConfidence, string> = {
  known: "Known",
  estimated: "Estimated",
  unresolved: "Unresolved",
};

/** Square badge — used ONLY for exposure_confidence (the financial-amount trust level). */
export function ExposureConfidenceBadge({ value }: { value: ExposureConfidence }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-semibold ${EXPOSURE_CONFIDENCE_STYLES[value]}`}
      title="Exposure confidence: is the dollar amount trustworthy?"
    >
      <span className="h-1.5 w-1.5 rounded-sm bg-current" />
      {EXPOSURE_CONFIDENCE_LABEL[value]}
    </span>
  );
}

const CANCELLATION_STATUS_LABEL: Record<CancellationStatus, string> = {
  known_cancellable: "Known cancellable",
  known_non_cancellable: "Known non-cancellable",
  supplier_confirmation_required: "Supplier confirmation required",
  cancellation_terms_missing: "Cancellation terms missing",
  cancellation_requested: "Cancellation requested",
  cancellation_accepted: "Cancellation accepted",
  cancellation_partially_accepted: "Partially accepted",
  cancellation_rejected: "Cancellation rejected",
  received_before_action: "Received before action",
  redirected_to_alternate_demand: "Redirected to alternate demand",
};

const CANCELLATION_CONFIDENCE_STYLES: Record<CancellationConfidence, string> = {
  verified: "bg-accent-soft text-accent border-accent/30",
  supplier_reported: "bg-accent-soft text-accent border-accent/30",
  unverified: "bg-paper text-ink-soft border-line",
  unknown: "bg-paper text-ink-soft border-line",
};

const CANCELLATION_CONFIDENCE_LABEL: Record<CancellationConfidence, string> = {
  verified: "Verified",
  supplier_reported: "Supplier-reported",
  unverified: "Unverified",
  unknown: "Unknown",
};

/**
 * Round-pill badge (deliberately a different shape from ExposureConfidenceBadge's
 * square) — used ONLY for cancellation_status/cancellation_confidence. This
 * shape difference is intentional: exposure confidence and cancellation
 * confidence answer different questions and must never be visually merged.
 */
export function CancellationStatusPill({ status, confidence }: { status: CancellationStatus; confidence: CancellationConfidence }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs text-ink" title="Cancellation status">
        {CANCELLATION_STATUS_LABEL[status]}
      </span>
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CANCELLATION_CONFIDENCE_STYLES[confidence]}`}
        title="Cancellation confidence: how trustworthy is the cancellation information itself?"
      >
        {CANCELLATION_CONFIDENCE_LABEL[confidence]}
      </span>
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: "unreviewed" | "approved" | "rejected" }) {
  const styles: Record<string, string> = {
    unreviewed: "bg-paper text-ink-soft border-line",
    approved: "bg-status-successBg text-status-success border-status-success/30",
    rejected: "bg-status-criticalBg text-status-critical border-status-critical/30",
  };
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

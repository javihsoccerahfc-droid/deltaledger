import { formatMoney, formatPercent } from "@/lib/format";
import type { EvidenceCoverage } from "@/domains/deltaledger/workspaceSummary";

/**
 * DeltaLedger's signature trust metric. Not a generic progress bar -- it answers one specific
 * question: "of the total dollars at stake, how much is backed by real evidence (an approved
 * mapping and an actual PO line), versus estimated or unresolved?" This is not a new
 * calculation -- it's a purpose-built visualization of the existing confidenceClassification
 * breakdown already computed by the deterministic exposure engine
 * (see src/domains/deltaledger/workspaceSummary.ts's getEvidenceCoverage()).
 *
 * "compact" is for the always-visible Context Bar (bar + headline % only). "full" is for the
 * Overview page (adds the dollar legend and per-tier counts). One component, two densities --
 * not two components -- so the underlying visual language never drifts between the two places
 * it appears, and every later reuse (Portfolio Command Center, Exposure Explorer) starts from
 * the same source of truth.
 */
export function EvidenceCoverageBar({
  coverage,
  variant = "full",
}: {
  coverage: EvidenceCoverage;
  variant?: "compact" | "full";
}) {
  const { knownTotal, estimatedTotal, unresolvedTotal, grandTotal, coverageFraction, knownCount, estimatedCount, unresolvedCount } =
    coverage;

  const hasData = grandTotal > 0;
  const knownPct = hasData ? (knownTotal / grandTotal) * 100 : 0;
  const estimatedPct = hasData ? (estimatedTotal / grandTotal) * 100 : 0;
  const unresolvedPct = hasData ? (unresolvedTotal / grandTotal) * 100 : 0;

  return (
    <div className={variant === "compact" ? "min-w-[140px]" : "min-w-[240px]"}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`font-semibold text-ink ${variant === "compact" ? "text-sm" : "text-xl"}`}>
          {hasData ? formatPercent(coverageFraction) : "—"}
        </p>
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">Evidence Coverage</p>
      </div>

      <div
        className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={
          hasData
            ? `Evidence coverage: ${formatPercent(coverageFraction)} known, backed by ${knownCount} record(s) totaling ${formatMoney(knownTotal)}`
            : "No exposure calculated yet"
        }
      >
        {hasData ? (
          <>
            <div className="h-full bg-status-success" style={{ width: `${knownPct}%` }} />
            <div className="h-full bg-status-warning" style={{ width: `${estimatedPct}%` }} />
            <div className="h-full bg-status-critical" style={{ width: `${unresolvedPct}%` }} />
          </>
        ) : (
          <div className="h-full w-full bg-line" />
        )}
      </div>

      {variant === "full" && (
        <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <dt className="flex items-center gap-1.5 text-ink-soft">
              <span className="h-2 w-2 rounded-full bg-status-success" /> Known
            </dt>
            <dd className="data-num mt-0.5 font-semibold text-ink">{formatMoney(knownTotal)}</dd>
            <dd className="text-[11px] text-ink-soft">{knownCount} record(s)</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-ink-soft">
              <span className="h-2 w-2 rounded-full bg-status-warning" /> Estimated
            </dt>
            <dd className="data-num mt-0.5 font-semibold text-ink">{formatMoney(estimatedTotal)}</dd>
            <dd className="text-[11px] text-ink-soft">{estimatedCount} record(s)</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-ink-soft">
              <span className="h-2 w-2 rounded-full bg-status-critical" /> Unresolved
            </dt>
            <dd className="data-num mt-0.5 font-semibold text-ink">{formatMoney(unresolvedTotal)}</dd>
            <dd className="text-[11px] text-ink-soft">{unresolvedCount} record(s)</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

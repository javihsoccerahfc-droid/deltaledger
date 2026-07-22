import { ReactNode } from "react";

export type HeroTone = "neutral" | "success" | "warning" | "critical";

const TONE_DOT: Record<HeroTone, string> = {
  neutral: "bg-accent",
  success: "bg-status-success",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
};

/**
 * Phase 6D -- DeltaLedger's signature focal-point pattern. Every important page gets exactly
 * ONE of these: a confident, dark, high-contrast surface for the single most important
 * conclusion on the page (a Phase 6C narrative headline, a portfolio total, an exposure
 * result). Reuses the existing `ink` color as a background rather than introducing a new
 * color token -- DeltaLedger's palette already contained a rich navy, it just never used it
 * as a surface, only as text.
 *
 * This is deliberately NOT a general-purpose card variant. A Hero appears once per page,
 * maximum. Using it twice on the same screen defeats its entire purpose -- if there are two
 * "most important things," neither one actually is, and the page should decide which one
 * truly is before reaching for this component again. The restraint is the hierarchy signal:
 * everything else on the page reads as supporting detail specifically because this is the
 * only surface that looks like this.
 *
 * The tone dot (not a colored numeral) is deliberate -- a colored figure on a dark background
 * tends to read as muddy or alarming rather than confident; a small, precise indicator dot
 * carries the same status meaning without compromising the surface's calm authority.
 */
/**
 * Phase 6D -- the aligned Known/Estimated/Unresolved breakdown rows used inside a Hero's
 * `supporting` slot. A separate small component rather than inline JSX in every page that
 * needs it, so the alignment and the Phase 6C unresolved-as-count discipline (never a $0
 * dollar claim) can't drift between the Portfolio hero and the Exposure hero independently.
 */
export function HeroBreakdown({
  knownTotal,
  estimatedTotal,
  unresolvedCount,
  unresolvedLabel = "record",
}: {
  knownTotal: number;
  estimatedTotal: number;
  unresolvedCount: number;
  /** Singular noun for what's being counted, e.g. "supplier" or "record" -- pluralized automatically. */
  unresolvedLabel?: string;
}) {
  const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  const rows: { label: string; value: string }[] = [];
  if (knownTotal > 0) rows.push({ label: "Known", value: money(knownTotal) });
  if (estimatedTotal > 0) rows.push({ label: "Estimated", value: money(estimatedTotal) });
  if (unresolvedCount > 0) rows.push({ label: "Unresolved", value: `${unresolvedCount} ${unresolvedLabel}${unresolvedCount === 1 ? "" : "s"}` });

  if (rows.length === 0) return null;

  return (
    <dl className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-6 text-sm">
          <dt className="text-white/60">{r.label}</dt>
          <dd className="data-num font-medium text-white/90">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Hero({
  eyebrow,
  value,
  tone = "neutral",
  supporting,
  meta,
  action,
}: {
  /** Small label above the value, e.g. "EXPOSURE" or "PORTFOLIO". */
  eyebrow?: string;
  /** The headline itself -- a number, or a full Phase 6C narrative sentence. */
  value: ReactNode;
  tone?: HeroTone;
  /** Secondary supporting line(s) beneath the value -- e.g. a scope line or confidence composition. */
  supporting?: ReactNode;
  /** Small, muted trailing metadata -- e.g. "Calculated Jul 21, 2026". */
  meta?: ReactNode;
  /** Optional action slot (a button/link) -- kept visually quiet against the dark surface. */
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-ink px-6 py-6 shadow-md sm:px-8 sm:py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">{eyebrow}</p>
            </div>
          )}
          <div className="data-num mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{value}</div>
          {supporting && <div className="mt-3 max-w-2xl text-sm text-white/70">{supporting}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {meta && <div className="mt-4 text-xs text-white/40">{meta}</div>}
    </div>
  );
}

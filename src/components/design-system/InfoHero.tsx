import { ReactNode } from "react";

/**
 * Phase 6D, Phase 4 -- Level 3 emphasis. The dark, high-contrast Hero (Hero.tsx) is reserved
 * for pages centered on a DECISION (Overview, Mapping, Mitigation, Exposure, Evidence,
 * Report) -- using it here too would put a BOM diff or a PO import on the same visual footing
 * as "should we approve this mapping," which is exactly the false equivalence the three-level
 * emphasis system exists to prevent. This is a quieter, light-surface treatment: enough
 * hierarchy that the page has a clear opening fact, not enough to compete with the shell's
 * own figure or with a true Decision Hero elsewhere in the workspace.
 */
export function InfoHero({
  eyebrow,
  value,
  supporting,
}: {
  eyebrow?: string;
  value: ReactNode;
  supporting?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-white px-6 py-5 shadow-sm">
      {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{eyebrow}</p>}
      <div className="data-num mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {supporting && <div className="mt-2 text-sm text-ink-soft">{supporting}</div>}
    </div>
  );
}

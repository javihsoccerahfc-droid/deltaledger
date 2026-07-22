"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceCompletion, DecisionReadinessReasonCode } from "@/domains/deltaledger/workspaceSummary";

/**
 * Evolved from the original EcStepper (see git history) rather than replaced -- the
 * completion-signal logic (which tabs are done, which have pending reviews) was already
 * correct and stays exactly as it was. What changes is the visual metaphor: a sequential
 * "step 1 of 8, connected by a line" stepper implies a wizard you complete once and move
 * past. A workspace isn't that -- users return to any tab at any time, in any order, for the
 * life of the engineering change. So the connecting hairline and ordinal step numbers are
 * gone; the underline-on-active-tab pattern and the complete/pending signals (still genuinely
 * useful) remain.
 *
 * "Overview" is new and always available (never shown as pending/incomplete -- it's a
 * destination, not a step to finish). "Explore" and "Alt. Demand" are parallel, optional
 * analyses off Exposure, not sequential steps either -- never shown with a completion signal,
 * only ever a plain tab.
 *
 * Phase 6B -- one new signal: a stale dot on Exposure when the readiness check's
 * primaryReasonCode says a mapping or PO change since the last calculation means the current
 * figure should be recalculated. Reuses the same reason code the ContextBar's next-action
 * strip already computes -- one source of truth, two small, calm surfaces.
 */

const STALE_REASON_CODES: Set<DecisionReadinessReasonCode> = new Set(["stale_exposure", "mapping_changed_since_calculation"]);

interface TabDef {
  href: string;
  label: string;
  isComplete?: (c: WorkspaceCompletion) => boolean;
  pendingCount?: (c: WorkspaceCompletion) => number;
  isOptional?: boolean;
}

const TABS: TabDef[] = [
  { href: "overview", label: "Overview" },
  { href: "boms", label: "BOM Diff", isComplete: (c) => c.bomComplete },
  { href: "po", label: "Open PO", isComplete: (c) => c.poComplete },
  { href: "mapping", label: "Mapping", isComplete: (c) => c.mappingComplete, pendingCount: (c) => c.mappingPending },
  { href: "exposure", label: "Exposure", isComplete: (c) => c.exposureComplete },
  { href: "explore", label: "Explore", isOptional: true },
  { href: "alternate-demand", label: "Alt. Demand", isOptional: true },
  { href: "mitigation", label: "Mitigation", isComplete: (c) => c.mitigationComplete, pendingCount: (c) => c.mitigationPending },
  { href: "report", label: "Report" },
  { href: "timeline", label: "Timeline" },
  { href: "audit", label: "Audit Trail" },
];

export function WorkspaceTabs({
  ecId,
  completion,
  staleReasonCode,
}: {
  ecId: string;
  completion: WorkspaceCompletion;
  staleReasonCode?: DecisionReadinessReasonCode;
}) {
  const pathname = usePathname();
  const isStale = staleReasonCode ? STALE_REASON_CODES.has(staleReasonCode) : false;

  return (
    <nav className="border-b border-line bg-white px-6" aria-label="Engineering change workspace">
      <ul className="flex items-center gap-1 overflow-x-auto" role="tablist">
        {TABS.map((tab) => {
          const href = `/engineering-changes/${ecId}/${tab.href}`;
          const active = pathname === href;
          const complete = tab.isComplete?.(completion);
          const pending = tab.pendingCount?.(completion) ?? 0;
          const staleHere = tab.href === "exposure" && isStale;

          return (
            <li key={tab.href} role="presentation">
              <Link
                href={href}
                role="tab"
                aria-selected={active}
                className={`group flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-medium transition-colors ${
                  active ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {tab.label}
                {tab.isOptional && <span className="text-[10px] font-normal uppercase tracking-wide text-ink-soft">optional</span>}
                {complete && !staleHere && <span className="text-status-success">✓</span>}
                {staleHere && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-status-warning"
                    role="img"
                    aria-label="Exposure may be out of date -- recalculate to refresh it"
                    title="Exposure may be out of date -- recalculate to refresh it"
                  />
                )}
                {pending > 0 && (
                  <span className="rounded-full bg-status-warning px-1.5 py-0.5 text-[10px] font-semibold text-white">{pending}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

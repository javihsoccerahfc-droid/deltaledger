import Link from "next/link";
import { EvidenceCoverageBar } from "./EvidenceCoverageBar";
import { StatusPanel } from "./StatusPanel";
import type { EvidenceCoverage, NextAction, DecisionReadinessStatus } from "@/domains/deltaledger/workspaceSummary";

/**
 * Phase 6D -- DeltaLedger's persistent workspace shell (identity strip). This is the first
 * concrete answer to "does this feel like one workspace or a collection of pages connected by
 * tabs" -- previously this component and WorkspaceTabs were two independently-bordered white
 * boxes stacked with nothing tying them together; they now share one continuous surface (this
 * component carries no bottom border of its own -- WorkspaceTabs' border is the shell's only
 * edge), so the two read as one persistent unit, not two.
 *
 * The second, larger change: "current financial position" used to be a conditional, compact
 * coverage bar that vanished entirely when there was nothing to show. It's now an always-
 * present, legible figure -- exactly the always-there anchor Stripe/Linear/Mercury keep
 * visible regardless of which specific screen you're on, including an honest "not calculated
 * yet" state rather than disappearing. This is what lets individual pages stop needing to
 * restate the overall exposure total in their own Hero -- the shell already carries it; a
 * page's own Hero (where it has one) is free to lead with what's specific to THAT page.
 *
 * V3 -- the financial-position block now renders through the shared StatusPanel primitive
 * rather than its own hand-rolled layout, so it reads as a contained surface belonging to the
 * page instead of a widget floating in the flex gap (the V2 feedback this addresses).
 *
 * Responsive behavior is deliberate, not incidental:
 *  - the EC name truncates with an ellipsis and a native title tooltip rather than wrapping
 *    or pushing the financial readout off-screen, however long the name is;
 *  - below the `lg` breakpoint, the financial readout and next-action drop to their own row
 *    beneath the title instead of being squeezed into an unreadable sliver next to it.
 *
 * `nextAction` surfaces here because this is the one place already guaranteed visible no
 * matter which tab a person is on. Deliberately a single, calm line -- not a banner, not a
 * list. When readiness is "ready," nextAction is null and that slot renders nothing --
 * silence is the correct state for a workspace with nothing left to flag.
 */
const STATUS_TONE: Record<Exclude<DecisionReadinessStatus, "ready">, string> = {
  not_ready: "border-status-critical/30 bg-status-criticalBg text-status-critical",
  needs_attention: "border-status-warning/30 bg-status-warningBg text-status-warning",
};

export function ContextBar({
  ecId,
  name,
  description,
  coverage,
  lastActivity,
  nextAction,
  readinessStatus,
  isReadOnly,
}: {
  ecId: string;
  name: string;
  description: string;
  coverage: EvidenceCoverage;
  lastActivity: string | null;
  nextAction?: NextAction | null;
  readinessStatus?: DecisionReadinessStatus;
  isReadOnly?: boolean;
}) {
  const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  return (
    <div className="bg-white px-6 py-4">
      <Link href="/engineering-changes" className="text-xs font-medium text-ink-soft hover:text-accent">
        ← All engineering changes
      </Link>

      <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0 lg:flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-ink" title={name}>
              {name}
            </h1>
            {isReadOnly && (
              <span
                className="shrink-0 rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft"
                title="This engineering change is read-only. Every screen, calculation, and simulation is fully interactive to explore -- creating, editing, or deleting data is disabled."
              >
                Read-only
              </span>
            )}
          </div>
          {description && <p className="mt-0.5 line-clamp-1 max-w-2xl text-xs text-ink-soft">{description}</p>}
          {lastActivity && <p className="mt-1 text-[11px] text-ink-soft">{lastActivity}</p>}
        </div>

        <div className="flex shrink-0 items-end gap-4" data-testid={`context-bar-coverage-${ecId}`}>
          <StatusPanel
            title="Current financial position"
            value={coverage.grandTotal > 0 ? money(coverage.grandTotal) : <span className="text-sm text-ink-soft">Not calculated yet</span>}
            indicator={
              coverage.grandTotal > 0 ? (
                <div className="w-16">
                  <EvidenceCoverageBar coverage={coverage} variant="compact" />
                </div>
              ) : undefined
            }
          />

          {nextAction && readinessStatus && readinessStatus !== "ready" && (
            <Link
              href={nextAction.href}
              className={`whitespace-nowrap rounded-sm border px-3 py-1.5 text-xs font-semibold transition-colors ${STATUS_TONE[readinessStatus]}`}
            >
              {nextAction.label} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

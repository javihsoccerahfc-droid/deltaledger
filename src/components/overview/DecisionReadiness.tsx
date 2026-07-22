import { Hero, HeroTone } from "@/components/design-system/Hero";
import type { DecisionReadiness as DecisionReadinessData, NextAction } from "@/domains/deltaledger/workspaceSummary";

const STATUS_CONFIG: Record<DecisionReadinessData["status"], { label: string; tone: HeroTone; helperText: string }> = {
  ready: {
    label: "Ready for financial review",
    tone: "success",
    helperText: "Every check passed and exposure reflects the current PO data.",
  },
  needs_attention: {
    label: "Needs attention before you rely on this number",
    tone: "warning",
    helperText: "The workflow is complete, but part of the exposure figure should be double-checked.",
  },
  not_ready: {
    label: "Not ready for financial review",
    tone: "critical",
    helperText: "One or more required steps aren't done yet.",
  },
};

/**
 * Phase 6D, Phase 4 -- Level 2 Decision Hero. Overview's entire purpose is answering "can
 * someone make a financial decision based on this engineering change right now?" -- so that
 * verdict IS the one thing to understand within three seconds of opening this page, not a
 * plain card among others. The verdict is always paired with the exact, checkable reasons
 * behind it (see getDecisionReadiness in workspaceSummary.ts): never an opaque status alone.
 */
export function DecisionReadiness({ readiness, nextAction }: { readiness: DecisionReadinessData; nextAction?: NextAction | null }) {
  const config = STATUS_CONFIG[readiness.status];

  return (
    <Hero
      eyebrow="READINESS"
      tone={config.tone}
      value={config.label}
      supporting={
        <div className="space-y-2">
          <p>{config.helperText}</p>
          {readiness.blockingReasons.length > 0 && (
            <ul className="space-y-1">
              {readiness.blockingReasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/50" />
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      }
      action={
        nextAction ? (
          <a
            href={nextAction.href}
            className="whitespace-nowrap rounded-sm bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            {nextAction.label} →
          </a>
        ) : undefined
      }
    />
  );
}

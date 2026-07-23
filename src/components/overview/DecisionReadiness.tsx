import { Hero, HeroTone } from "@/components/design-system/Hero";
import type { DecisionReadiness as DecisionReadinessData, NextAction, EvidenceCoverage } from "@/domains/deltaledger/workspaceSummary";

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
 *
 * V3 UX fix -- readiness and evidence coverage answer two genuinely different, both-correct
 * questions: readiness is workflow completeness (did every required step happen), coverage is
 * data-quality confidence (how much of the dollar figure is Known vs. Estimated). Both being
 * true at once -- "ready" alongside 0% known -- isn't a bug in either calculation, but showing
 * them with no bridge between them reads as a contradiction. Neither calculation changes here;
 * only the helper text gains one clause, and only in the specific case that would otherwise
 * look contradictory, so this Hero explains itself instead of leaving the visitor to reconcile
 * two numbers alone.
 */
export function DecisionReadiness({
  readiness,
  nextAction,
  coverage,
}: {
  readiness: DecisionReadinessData;
  nextAction?: NextAction | null;
  coverage?: EvidenceCoverage;
}) {
  const config = STATUS_CONFIG[readiness.status];
  const allEstimated = Boolean(coverage && coverage.grandTotal > 0 && coverage.knownTotal === 0);
  const tone: HeroTone = readiness.status === "ready" && allEstimated ? "neutral" : config.tone;
  const helperText =
    readiness.status === "ready" && allEstimated
      ? `${config.helperText} Every figure here is currently Estimated rather than Known — reasonable, and still worth a second look before treating it as final.`
      : config.helperText;

  return (
    <Hero
      eyebrow="READINESS"
      tone={tone}
      value={config.label}
      supporting={
        <div className="space-y-2">
          <p>{helperText}</p>
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

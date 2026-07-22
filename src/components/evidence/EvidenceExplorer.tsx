"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Hero } from "@/components/design-system/Hero";
import type { EvidenceExplanation } from "@/domains/deltaledger/evidenceExplanation";
import type { HeroTone } from "@/components/design-system/Hero";

const CONFIDENCE_TONE: Record<string, HeroTone> = {
  known: "success",
  estimated: "warning",
  unresolved: "critical",
};

/**
 * DeltaLedger's financial explanation engine, not a data viewer. Every open of this panel
 * should answer: what happened, why did it happen, and what should the user do next -- never
 * just a list of fields. Facts (observed) and Applied Rules (DeltaLedger's own interpretation)
 * are always visually and structurally separate, never blended, per this product's core trust
 * principle.
 *
 * Slides in from the right (never a full-screen modal, per the Experience Specification) so
 * the page behind it is never fully lost -- closing returns the user to exactly where they
 * were. Respects prefers-reduced-motion via the `motion-reduce:` utility variants below rather
 * than a fixed transition duration.
 */
export function EvidenceExplorer({
  partId,
  ecId,
  explanation,
  onClose,
}: {
  partId: string;
  ecId: string;
  explanation: EvidenceExplanation;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl transition-transform duration-200 motion-reduce:transition-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Evidence for</p>
            <h2 className="mt-0.5 font-mono text-lg font-semibold text-ink">{partId}</h2>
          </div>
          <button onClick={onClose} className="rounded-sm border border-line px-2 py-1 text-xs text-ink-soft hover:text-ink">
            Close
          </button>
        </div>

        {explanation.provenanceNote && (
          <div className="mt-4 rounded-sm border border-status-warning/30 bg-status-warningBg px-3 py-2 text-xs text-status-warning">
            {explanation.provenanceNote}
          </div>
        )}

        <Hero
          eyebrow="CONCLUSION"
          tone={CONFIDENCE_TONE[explanation.conclusion.confidence]}
          value={explanation.conclusion.netExposure.toLocaleString(undefined, { style: "currency", currency: "USD" })}
          supporting={
            <div className="space-y-2">
              <p>{explanation.conclusion.explanation}</p>
              {explanation.nextStep.reason && <p className="font-medium text-white/90">{explanation.nextStep.reason}</p>}
            </div>
          }
          action={
            explanation.nextStep.tab ? (
              <Link
                href={`/engineering-changes/${ecId}/${explanation.nextStep.tab}`}
                className="whitespace-nowrap rounded-sm bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                {explanation.nextStep.label} →
              </Link>
            ) : undefined
          }
        />

        <Section title="Facts" subtitle="Observed directly from source documents">
          <dl className="space-y-2.5">
            {explanation.facts.map((f) => (
              <Field key={f.label} label={f.label} value={f.value} />
            ))}
          </dl>
        </Section>

        {explanation.appliedRules.length > 0 && (
          <Section title="Applied Rules" subtitle="How DeltaLedger interpreted the facts above">
            <dl className="space-y-2.5">
              {explanation.appliedRules.map((r) => (
                <Field key={r.label} label={r.label} value={r.value} accentBorder />
              ))}
            </dl>
          </Section>
        )}

        <Section title="Calculation">
          <ol className="space-y-1.5">
            {explanation.calculationSteps.map((step, idx) => (
              <li key={idx}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-soft">{step.label}</span>
                  <span className="data-num font-semibold text-ink">{step.value}</span>
                </div>
                {idx < explanation.calculationSteps.length - 1 && (
                  <div className="my-1 text-center text-ink-soft" aria-hidden="true">
                    ↓
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-ink-soft">{subtitle}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Field({ label, value, accentBorder }: { label: string; value: string; accentBorder?: boolean }) {
  return (
    <div className={`border-b pb-2 ${accentBorder ? "border-accent/20" : "border-line"}`}>
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useCountUp } from "@/lib/useCountUp";

interface StoryStep {
  label: string;
  /** One short fragment -- never a paragraph. The visual carries the explanation. */
  line: string;
  detail: string;
}

const STEPS: StoryStep[] = [
  { label: "Engineering", line: "A single part revision.", detail: "APX-8801 · Rev B → Rev C" },
  { label: "Suppliers", line: "It touches two suppliers who have never spoken to each other.", detail: "Sunrise Electronics · Harness Works" },
  { label: "Purchase Orders", line: "Purchase orders were already placed for the part that's about to change.", detail: "PO-3301 · PO-3302" },
  { label: "Inventory", line: "Inventory already on the shelf doesn't know it either.", detail: "On-hand + WIP" },
  { label: "Financial Exposure", line: "Add it up, and the number is real.", detail: "" },
  { label: "Executive Decision", line: "DeltaLedger sees the whole chain before it becomes a problem.", detail: "" },
];

/**
 * DeltaLedger's homepage centerpiece, not a supporting section. A single IntersectionObserver
 * watches every story beat at once (one entry per beat, centered rootMargin) and promotes
 * whichever beat is currently centered to "active" -- the standard sticky-visual/scrolling-text
 * pattern, built with no scroll library: rootMargin + one observer does the whole thing.
 *
 * The product isn't named until the final beat. Everything before that is the problem,
 * demonstrated rather than explained -- minimal copy is the point, not an oversight.
 *
 * Colors are the dark-surface palette (white-on-ink), matching the same `bg-ink` token
 * Hero.tsx uses elsewhere in the product -- this section lives inside a dark `bg-ink` wrapper
 * on the homepage, not the paper/ink-text palette the rest of the marketing pages use.
 */
export function EngineeringChangeStory() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = stepRefs.current.findIndex((el) => el === entry.target);
            if (index !== -1) setActive(index);
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
    );
    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const exposure = useCountUp(45_660, 1200, active >= 4);

  return (
    <div className="relative mx-auto max-w-[1400px] px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
      {/* Scrolling narrative beats */}
      <div>
        {STEPS.map((step, i) => (
          <div
            key={step.label}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
            className="flex min-h-[70vh] flex-col justify-center py-12 lg:min-h-[85vh]"
          >
            <p
              className={`text-[11px] font-semibold uppercase tracking-widest motion-safe:transition-colors motion-safe:duration-500 ${
                active === i ? "text-accent" : "text-white/40"
              }`}
            >
              {step.label}
            </p>
            <p
              className={`mt-4 max-w-md text-2xl font-semibold leading-snug tracking-tight motion-safe:transition-all motion-safe:duration-500 sm:text-3xl ${
                active === i ? "text-white opacity-100" : "text-white/50 opacity-60"
              }`}
            >
              {i === STEPS.length - 1 ? (
                <>
                  <span className="text-accent">DeltaLedger</span> sees the whole chain before it becomes a problem.
                </>
              ) : (
                step.line
              )}
            </p>
            <div className={`mt-4 motion-safe:transition-opacity motion-safe:duration-500 lg:hidden ${active === i ? "opacity-100" : "opacity-0"}`}>
              {step.label === "Financial Exposure" ? (
                <p className="data-num text-xl font-semibold tracking-tight text-white">
                  {exposure.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                </p>
              ) : step.label === "Executive Decision" ? (
                <p className="inline-block rounded-sm bg-status-successBg px-1.5 py-0.5 text-[11px] font-semibold text-status-success">
                  Ready for financial review
                </p>
              ) : (
                <p className="font-mono text-xs text-white/40">{step.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky visual rail -- desktop only; mobile gets the beats' own detail text instead */}
      <div className="hidden lg:block">
        <div className="sticky top-24 space-y-0">
          {STEPS.map((step, i) => {
            const lit = i <= active;
            return (
              <div key={step.label} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full motion-safe:transition-colors motion-safe:duration-500 ${
                      lit ? "bg-accent" : "bg-white/15"
                    }`}
                  />
                  {i < STEPS.length - 1 && (
                    <span
                      className={`w-px flex-1 motion-safe:transition-colors motion-safe:duration-500 ${
                        i < active ? "bg-accent" : "bg-white/15"
                      }`}
                      style={{ minHeight: "3.5rem" }}
                    />
                  )}
                </div>
                <div className={`pb-14 motion-safe:transition-opacity motion-safe:duration-500 ${lit ? "opacity-100" : "opacity-40"}`}>
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  {step.label === "Financial Exposure" ? (
                    <p className="data-num mt-1 text-xl font-semibold tracking-tight text-white">
                      {exposure.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                    </p>
                  ) : step.label === "Executive Decision" ? (
                    <p
                      className={`mt-1 inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-semibold motion-safe:transition-opacity motion-safe:duration-500 ${
                        active >= 5 ? "bg-status-successBg text-status-success opacity-100" : "opacity-0"
                      }`}
                    >
                      Ready for financial review
                    </p>
                  ) : (
                    <p className="mt-1 font-mono text-xs text-white/40">{step.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

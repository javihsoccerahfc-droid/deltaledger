"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface EcStepCompletion {
  bomComplete: boolean;
  poComplete: boolean;
  mappingComplete: boolean;
  mappingPending: number;
  exposureComplete: boolean;
  altDemandPending: number;
  mitigationComplete: boolean;
  mitigationPending: number;
}

interface StepDef {
  href: string;
  label: string;
  isComplete: (c: EcStepCompletion) => boolean;
  pendingCount?: (c: EcStepCompletion) => number;
}

const STEPS: StepDef[] = [
  { href: "boms", label: "BOM Diff", isComplete: (c) => c.bomComplete },
  { href: "po", label: "Open PO", isComplete: (c) => c.poComplete },
  { href: "mapping", label: "Mapping", isComplete: (c) => c.mappingComplete, pendingCount: (c) => c.mappingPending },
  { href: "exposure", label: "Exposure", isComplete: (c) => c.exposureComplete },
  { href: "alternate-demand", label: "Alt. Demand", isComplete: () => true, pendingCount: (c) => c.altDemandPending },
  { href: "mitigation", label: "Mitigation", isComplete: (c) => c.mitigationComplete, pendingCount: (c) => c.mitigationPending },
  { href: "report", label: "Report", isComplete: () => true },
  { href: "audit", label: "Audit Trail", isComplete: () => true },
];

export function EcStepper({ ecId, completion }: { ecId: string; completion: EcStepCompletion }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-line bg-white px-6 py-3">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((step, idx) => {
          const href = `/engineering-changes/${ecId}/${step.href}`;
          const active = pathname === href;
          const complete = step.isComplete(completion);
          const pending = step.pendingCount?.(completion) ?? 0;

          return (
            <li key={step.href} className="flex items-center">
              <Link
                href={href}
                className={`group flex items-center gap-2 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-paper hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    complete
                      ? "border-status-success bg-status-success text-white"
                      : active
                        ? "border-accent text-accent"
                        : "border-line text-ink-soft"
                  }`}
                >
                  {complete ? "✓" : idx + 1}
                </span>
                {step.label}
                {pending > 0 && (
                  <span className="rounded-full bg-status-warning px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pending}
                  </span>
                )}
              </Link>
              {idx < STEPS.length - 1 && <span className="mx-0.5 h-px w-3 bg-line" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

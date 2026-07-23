import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Card, CardBody } from "@/components/design-system/Card";

const STAGES = [
  {
    stage: "Engineering",
    headline: "The change is proposed and diffed.",
    body: "Current and proposed BOMs are imported and compared. A replacement — one part swapped for another — is always paired explicitly by an engineer, never inferred.",
  },
  {
    stage: "Procurement",
    headline: "The commitments are made visible.",
    body: "Open purchase orders, supplier cancellation terms, and exchange rates are brought in alongside the BOM — the commercial fact base exposure is calculated from.",
  },
  {
    stage: "Operations",
    headline: "Identity is resolved, exposure is calculated.",
    body: "PLM part numbers are mapped to ERP part numbers with a confidence score. Every dollar of exposure is then classified — known, estimated, or unresolved — with full evidence behind it.",
  },
  {
    stage: "Finance",
    headline: "Mitigation is tracked to a real outcome.",
    body: "Cancellations, redirections, and negotiated outcomes are recorded against the frozen figures — cost avoided versus loss realized, never blended.",
  },
  {
    stage: "Executive decision-making",
    headline: "The evidence becomes a decision.",
    body: "A report leads with the conclusion, then the confidence, then the next step — with every supporting figure still one click from its source.",
  },
];

export const metadata = {
  title: "Product — DeltaLedger",
};

export default function ProductPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-20">
      <ScrollReveal>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">Product</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          One engineering change, traced through five decisions.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft">
          DeltaLedger doesn&apos;t replace your PLM or ERP — it connects what each already knows,
          so the financial consequence of a change is visible before it&apos;s realized.
        </p>
      </ScrollReveal>

      <div className="mt-16 space-y-6">
        {STAGES.map((s, i) => (
          <ScrollReveal key={s.stage} delayMs={i * 80}>
            <Card className="p-6 sm:p-8">
              <CardBody className="p-0">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
                  <div className="sm:w-48 sm:shrink-0">
                    <p className="font-mono text-xs text-ink-soft">{`0${i + 1}`}</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{s.stage}</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-ink">{s.headline}</p>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{s.body}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            {i < STAGES.length - 1 && (
              <div className="ml-6 h-6 w-px bg-line sm:ml-[calc(12rem+2rem)]" aria-hidden />
            )}
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}

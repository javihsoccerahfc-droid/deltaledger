import type { CutoverSimulationResponse } from "@/app/actions";
import type { LineItemProvenance } from "@/domains/deltaledger/cutover/dispositionModel";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const PROVENANCE_LABEL: Record<LineItemProvenance, string> = {
  scenario_seeded_inventory: "Scenario-seeded inventory fact",
  scenario_seeded_wip: "Scenario-seeded WIP fact",
  scenario_seeded_po_terms: "Scenario-seeded PO/supplier-term fact",
  calculated_disposition_outcome: "Calculated disposition outcome",
};

/**
 * Two reports, not three (V3 design review: the originally proposed standalone Scrap and
 * Rework Assignment Matrix is folded into the Disposition Directive below rather than
 * justifying a fourth audience-specific document). Both render directly from `response` --
 * the exact same disposition result the simulator screen above is already showing -- so there
 * is no second calculation path for either report to drift from.
 */
export function CutoverReports({ ecName, response }: { ecName: string; response: CutoverSimulationResponse }) {
  const { disposition, persistedExposureTotal, grossAffectedCommitment } = response;
  const scenarioSeededTotal = grossAffectedCommitment - persistedExposureTotal;

  const cancellationLines = disposition.lineItems.filter(
    (l) => l.provenance === "scenario_seeded_po_terms"
  );
  const dispositionLines = disposition.lineItems.filter(
    (l) => l.provenance === "scenario_seeded_inventory" || l.provenance === "scenario_seeded_wip"
  );
  const otherLines = disposition.lineItems.filter(
    (l) => l.provenance === "calculated_disposition_outcome"
  );

  return (
    <div className="space-y-8">
      {/* ECO Financial Liability Statement */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
          ECO Financial Liability Statement
        </p>
        <h3 className="mt-1 text-lg font-semibold text-ink">{ecName}</h3>
        <p className="mt-1 text-xs text-ink-soft">{disposition.narrative}</p>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border border-line bg-white p-3">
            <dt className="text-[10px] uppercase tracking-wide text-ink-soft">Gross affected commitment</dt>
            <dd className="data-num mt-1 font-semibold text-ink">{money(grossAffectedCommitment)}</dd>
          </div>
          <div className="rounded-md border border-line bg-white p-3">
            <dt className="text-[10px] uppercase tracking-wide text-ink-soft">Net exposure (selected strategy)</dt>
            <dd className="data-num mt-1 font-semibold text-ink">{money(disposition.netExposure)}</dd>
          </div>
          <div className="rounded-md border border-line bg-white p-3">
            <dt className="text-[10px] uppercase tracking-wide text-ink-soft">Mitigation value</dt>
            <dd className="data-num mt-1 font-semibold text-ink">
              {money(grossAffectedCommitment - disposition.netExposure)}
            </dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-md border border-line bg-white p-3">
            <p className="font-semibold text-ink">Known</p>
            <p className="data-num mt-1 text-ink">{money(disposition.knownExposure)}</p>
          </div>
          <div className="rounded-md border border-line bg-white p-3">
            <p className="font-semibold text-ink">Estimated</p>
            <p className="data-num mt-1 text-ink">{money(disposition.estimatedExposure)}</p>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
          {money(persistedExposureTotal)} of the gross figure is persisted supplier/PO evidence
          (real <code className="font-mono">ExposureRecord</code> rows); {money(scenarioSeededTotal)} is
          Nova Robotics scenario-seeded on-hand inventory and WIP facts, not persisted database evidence.
        </p>
      </section>

      {/* PO Cancellation and Disposition Directive */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
          PO Cancellation and Disposition Directive
        </p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Actions for procurement and materials</h3>

        <div className="mt-4 space-y-2">
          {cancellationLines.length === 0 && dispositionLines.length === 0 ? (
            <p className="text-sm text-ink-soft">No PO or material disposition actions at this cutover week.</p>
          ) : (
            [...cancellationLines, ...dispositionLines, ...otherLines].map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-4 rounded-md border border-line bg-white px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-ink">{line.label}</p>
                  <p className="text-[10px] text-ink-soft">{PROVENANCE_LABEL[line.provenance]}</p>
                </div>
                <span className="data-num shrink-0 font-semibold text-ink">{money(line.amount)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

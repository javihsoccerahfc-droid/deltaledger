"use client";

import { useState, useTransition } from "react";
import { runCutoverSimulationAction } from "@/app/actions";
import type { CutoverSimulationResponse } from "@/app/actions";
import type { CutoverSimulationInputs, DispositionLineItem, LineItemProvenance } from "@/domains/deltaledger/cutover/dispositionModel";
import { Card, CardBody } from "@/components/design-system/Card";
import { Hero } from "@/components/design-system/Hero";
import { StatusPanel } from "@/components/design-system/StatusPanel";
import { CutoverReports } from "./CutoverReports";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const PROVENANCE_LABEL: Record<LineItemProvenance, string> = {
  scenario_seeded_inventory: "Nova Robotics scenario-seeded inventory fact",
  scenario_seeded_wip: "Nova Robotics scenario-seeded WIP fact",
  scenario_seeded_po_terms: "Nova Robotics scenario-seeded PO/supplier-term fact",
  calculated_disposition_outcome: "Calculated disposition outcome",
};

/**
 * The Cutover Simulator -- the interactive decision surface for evaluating a cutover strategy.
 * A permanent workspace capability (see dispositionModel.ts's header comment): this component
 * has no Nova-Robotics-specific logic of its own. It calls one Server Action with an EC id and
 * a small set of inputs, and renders whatever comes back -- it would run identically against a
 * real customer's engineering change once that dataset exists.
 *
 * Deliberately four blocks, not a dense configuration panel: the verdict (Hero), the controls,
 * the line items (click to inspect), and the source-honesty summary. Progressive disclosure
 * over explanation -- clicking a line item expands its formula and provenance in place rather
 * than opening a fifth surface.
 */
export function CutoverSimulatorClient({
  ecId,
  ecName,
  initialResponse,
}: {
  ecId: string;
  ecName: string;
  initialResponse: CutoverSimulationResponse;
}) {
  const [response, setResponse] = useState(initialResponse);
  const [inputs, setInputs] = useState<CutoverSimulationInputs>({
    cutoverWeek: initialResponse.disposition.cutoverWeek,
    wipReworkEnabled: true,
    sparesReserveQty: 50,
    harnessConvertEnabled: true,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runWith = (next: CutoverSimulationInputs) => {
    setInputs(next);
    startTransition(async () => {
      const outcome = await runCutoverSimulationAction(ecId, next);
      if (outcome.ok) {
        setResponse(outcome.response);
        setError(null);
      } else {
        // A failed recalculation must be visible, not silent -- the control that triggered it
        // stays at its new position (so the person isn't confused about what they touched),
        // but the figures below keep showing the last successful result rather than nothing.
        setError(outcome.reason);
      }
    });
  };

  const { disposition, persistedExposureTotal, grossAffectedCommitment } = response;
  const maxRunOutWeek = disposition.maxRunOutWeek;

  return (
    <div className="space-y-6">
      {/* Verdict */}
      <Hero
        eyebrow="CUTOVER SIMULATOR"
        tone={disposition.strategy.kind === "optimized_phased" ? "success" : "neutral"}
        value={money(disposition.netExposure)}
        supporting={<p>{disposition.narrative}</p>}
        meta={isPending ? "Recalculating…" : undefined}
      />

      {error && (
        <div className="rounded-md border border-status-critical/30 bg-status-criticalBg px-4 py-3 text-sm text-status-critical">
          Couldn&apos;t recalculate: {error} The figures below still reflect the last successful run.
        </div>
      )}

      {/* Controls -- exactly four, all backed by the tested domain model */}
      <Card className="p-5">
        <CardBody className="space-y-5 p-0">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "Immediate Cutover", week: 0 },
              { label: "Optimized Phased Cutover", week: 8 },
              { label: "Controlled Run-Out", week: maxRunOutWeek },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => runWith({ ...inputs, cutoverWeek: preset.week })}
                className={`rounded-sm border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  Math.abs(inputs.cutoverWeek - preset.week) < 0.05
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-white text-ink-soft hover:border-accent hover:text-accent"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="cutover-week" className="text-xs font-medium text-ink-soft">
                Cutover week
              </label>
              <span className="data-num text-sm font-semibold text-ink">
                {inputs.cutoverWeek <= 0 ? "Week 0" : `Week ${Math.round(inputs.cutoverWeek * 10) / 10}`}
              </span>
            </div>
            <input
              id="cutover-week"
              type="range"
              min={0}
              max={maxRunOutWeek}
              step={0.1}
              value={inputs.cutoverWeek}
              onChange={(e) => runWith({ ...inputs, cutoverWeek: Number(e.target.value) })}
              aria-valuetext={inputs.cutoverWeek <= 0 ? "Week 0" : `Week ${Math.round(inputs.cutoverWeek * 10) / 10}`}
              className="mt-2 w-full accent-accent"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 text-xs text-ink-soft">
              Rework WIP instead of scrapping it
              <input
                type="checkbox"
                checked={inputs.wipReworkEnabled}
                onChange={(e) => runWith({ ...inputs, wipReworkEnabled: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-ink-soft">
              Convert harness stock instead of scrapping it
              <input
                type="checkbox"
                checked={inputs.harnessConvertEnabled}
                onChange={(e) => runWith({ ...inputs, harnessConvertEnabled: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
            </label>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="spares-reserve" className="text-xs font-medium text-ink-soft">
                Field-service spares reserve
              </label>
              <span className="data-num text-sm font-semibold text-ink">{inputs.sparesReserveQty} units</span>
            </div>
            <input
              id="spares-reserve"
              type="range"
              min={0}
              max={50}
              step={1}
              value={inputs.sparesReserveQty}
              onChange={(e) => runWith({ ...inputs, sparesReserveQty: Number(e.target.value) })}
              aria-valuetext={`${inputs.sparesReserveQty} units`}
              className="mt-2 w-full accent-accent"
            />
          </div>
        </CardBody>
      </Card>

      {/* Line items -- click to inspect */}
      <Card>
        <CardBody className="space-y-1 p-0">
          {disposition.lineItems.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">No disposition cost at this cutover week.</p>
          ) : (
            disposition.lineItems.map((item) => (
              <LineItemRow key={item.id} item={item} expanded={expandedId === item.id} onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)} />
            ))
          )}
        </CardBody>
      </Card>

      {/* Source honesty summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatusPanel title="Persisted PO exposure" value={money(persistedExposureTotal)} />
        <StatusPanel title="Scenario-seeded inventory & WIP" value={money(grossAffectedCommitment - persistedExposureTotal)} />
        <StatusPanel title="Gross affected commitment" value={money(grossAffectedCommitment)} />
      </div>
      <p className="text-xs text-ink-soft">
        Persisted PO exposure comes from real <code className="font-mono">ExposureRecord</code> rows. On-hand
        inventory and WIP are Nova Robotics scenario-seeded operational facts, not persisted database
        evidence — see each line item above for its individual source.
      </p>

      <div>
        <button
          onClick={() => setShowReports((v) => !v)}
          className="text-xs font-semibold text-accent hover:text-accent-deep"
        >
          {showReports ? "Hide reports" : "View reports for this strategy →"}
        </button>
        {showReports && (
          <Card className="mt-3 p-5">
            <CardBody className="p-0">
              <CutoverReports ecName={ecName} response={response} />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function LineItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: DispositionLineItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-paper">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{item.label}</p>
          {item.confidence === "estimated" && (
            <span className="mt-0.5 inline-block rounded-sm bg-status-warningBg px-1.5 py-0.5 text-[10px] font-semibold text-status-warning">
              Estimated
            </span>
          )}
        </div>
        <span className="data-num shrink-0 text-sm font-semibold text-ink">{money(item.amount)}</span>
      </button>
      {expanded && (
        <div className="space-y-2 bg-paper px-5 py-4 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wide text-ink-soft">Formula</p>
            <p className="font-mono text-ink">{item.formula}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-ink-soft">Source</p>
            <p className="text-ink">{PROVENANCE_LABEL[item.provenance]}</p>
          </div>
        </div>
      )}
    </div>
  );
}

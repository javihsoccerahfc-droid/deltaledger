"use client";

import { useMemo, useState, useTransition } from "react";
import { runExposureScenarioAction } from "@/app/actions";
import type { ScenarioRunResult, ScenarioLineResult } from "@/app/actions";
import { describeScenarioAssumption } from "@/domains/deltaledger/exposure/scenarioAssumptions";
import type { ScenarioAssumption } from "@/domains/deltaledger/exposure/scenarioAssumptions";
import type { CrosswalkAllocationMethod } from "@/domains/deltaledger/types";
import { Card, CardHeader, CardBody } from "@/components/design-system/Card";
import { Button } from "@/components/design-system/Button";
import { Hero } from "@/components/design-system/Hero";
import { InfoHero } from "@/components/design-system/InfoHero";
import { EmptyState, FailureState } from "@/components/shared/States";
import { ExposureConfidenceBadge } from "@/components/shared/Badges";
import { buildCsv, downloadCsv } from "@/core/export/exportCsv";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

interface PoLineRow {
  id: string;
  purchaseOrderId: string;
  rawPartNumber: string;
  quantityOpen: number | null;
  unitPriceTransactionCurrency: number | null;
  transactionCurrency: string;
}
interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  supplierId: string;
}
interface SupplierRow {
  id: string;
  name: string;
}
interface CrosswalkRow {
  id: string;
  plmPartId: string;
  erpPartId: string;
  mappingType: string;
}
interface BaselineRecordRow {
  id: string;
  purchaseOrderLineId: string;
  netExposureValueReporting: number;
  confidenceClassification: "known" | "estimated" | "unresolved";
}

type DraftAssumption = { key: string; assumption: ScenarioAssumption };

const ASSUMPTION_KINDS = [
  { value: "quantityOverride", label: "Change quantity" },
  { value: "priceOverride", label: "Change unit price" },
  { value: "supplierReassignment", label: "Reassign supplier" },
  { value: "alternateDemandOverride", label: "Alternate demand absorbs quantity" },
] as const;

const ALLOCATION_METHODS: CrosswalkAllocationMethod[] = ["fixed_quantity", "percentage", "plant_specific", "supplier_specific", "manual"];
const ALLOCATION_METHOD_LABELS: Record<CrosswalkAllocationMethod, string> = {
  fixed_quantity: "Fixed quantity",
  percentage: "Percentage",
  plant_specific: "Plant-specific",
  supplier_specific: "Supplier-specific",
  manual: "Manual",
};

export function ExposureExplorerClient({
  ecId,
  baselineRecords,
  poLines,
  purchaseOrders,
  suppliers,
  crosswalks,
  canExplore,
}: {
  ecId: string;
  baselineRecords: BaselineRecordRow[];
  poLines: PoLineRow[];
  purchaseOrders: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  crosswalks: CrosswalkRow[];
  canExplore: boolean;
}) {
  const [drafts, setDrafts] = useState<DraftAssumption[]>([]);
  const [result, setResult] = useState<ScenarioRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  // -- Draft builder state --
  const [kind, setKind] = useState<(typeof ASSUMPTION_KINDS)[number]["value"]>("quantityOverride");
  const [selectedPoLineId, setSelectedPoLineId] = useState(poLines[0]?.id ?? "");
  const [numberValue, setNumberValue] = useState<string>("");
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id ?? "");
  const [selectedCrosswalkId, setSelectedCrosswalkId] = useState(crosswalks[0]?.id ?? "");
  const [allocationMethod, setAllocationMethod] = useState<CrosswalkAllocationMethod>("manual");
  const [allocationQuantity, setAllocationQuantity] = useState<string>("");
  const [showIntro, setShowIntro] = useState(true);

  const supplierNameById = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const poNumberById = useMemo(() => new Map(purchaseOrders.map((p) => [p.id, p.poNumber])), [purchaseOrders]);
  const currentBaselineTotal = useMemo(
    () => baselineRecords.reduce((sum, r) => sum + r.netExposureValueReporting, 0),
    [baselineRecords]
  );
  const poLineLabel = (line: PoLineRow) => {
    const po = purchaseOrders.find((p) => p.id === line.purchaseOrderId);
    const poNumber = poNumberById.get(line.purchaseOrderId) ?? "?";
    const supplierName = po ? (supplierNameById.get(po.supplierId) ?? "Unknown supplier") : "Unknown supplier";
    return `${line.rawPartNumber} — ${poNumber} (${supplierName})`;
  };
  const labelContext = useMemo(
    () => ({
      poLineLabel: (id: string) => {
        const line = poLines.find((l) => l.id === id);
        return line ? poLineLabel(line) : `an unrecognized purchase order line`;
      },
      crosswalkLabel: (id: string) => {
        const c = crosswalks.find((cw) => cw.id === id);
        return c ? `${c.plmPartId} → ${c.erpPartId}` : `an unrecognized mapping`;
      },
    }),
    [poLines, purchaseOrders, suppliers, crosswalks] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const numberFieldHelp: Record<string, string> = {
    quantityOverride: "Compared against this line's current open quantity in the active baseline.",
    priceOverride: "Compared against this line's current unit price in the active baseline.",
    alternateDemandOverride: "The portion of this line's quantity assumed to be reused elsewhere instead of purchased new.",
  };

  function addExampleScenario() {
    const firstLine = poLines[0];
    if (!firstLine || !firstLine.quantityOpen) return;
    const halved = Math.round(firstLine.quantityOpen / 2);
    setDrafts((prev) => [
      ...prev,
      {
        key: `example-${Date.now()}`,
        assumption: { kind: "quantityOverride", purchaseOrderLineId: firstLine.id, quantityOpen: halved },
      },
    ]);
    setShowIntro(false);
  }

  function addDraft() {
    let assumption: ScenarioAssumption;
    if (kind === "quantityOverride") {
      const value = Number(numberValue);
      if (!selectedPoLineId || Number.isNaN(value) || value < 0) return;
      assumption = { kind: "quantityOverride", purchaseOrderLineId: selectedPoLineId, quantityOpen: value };
    } else if (kind === "priceOverride") {
      const value = Number(numberValue);
      if (!selectedPoLineId || Number.isNaN(value) || value < 0) return;
      assumption = { kind: "priceOverride", purchaseOrderLineId: selectedPoLineId, unitPriceTransactionCurrency: value };
    } else if (kind === "supplierReassignment") {
      if (!selectedPoLineId || !selectedSupplierId) return;
      assumption = {
        kind: "supplierReassignment",
        purchaseOrderLineId: selectedPoLineId,
        supplierId: selectedSupplierId,
        supplierName: supplierNameById.get(selectedSupplierId),
      };
    } else {
      const value = Number(numberValue);
      if (!selectedPoLineId || Number.isNaN(value) || value < 0) return;
      assumption = { kind: "alternateDemandOverride", purchaseOrderLineId: selectedPoLineId, allocatedQuantity: value };
    }
    setDrafts((prev) => [...prev, { key: `${Date.now()}-${Math.random()}`, assumption }]);
    setNumberValue("");
    setShowIntro(false);
  }

  function addAllocationDraft() {
    if (!selectedCrosswalkId) return;
    const manualAllocationQuantity = allocationQuantity ? Number(allocationQuantity) : undefined;
    const assumption: ScenarioAssumption = {
      kind: "allocationOverride",
      crosswalkId: selectedCrosswalkId,
      method: allocationMethod,
      manualAllocationQuantity,
    };
    setDrafts((prev) => [...prev, { key: `${Date.now()}-${Math.random()}`, assumption }]);
    setAllocationQuantity("");
    setShowIntro(false);
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function reset() {
    setDrafts([]);
    setResult(null);
    setRunError(null);
    setExpandedLineId(null);
  }

  function runScenario() {
    setRunError(null);
    startTransition(async () => {
      const outcome = await runExposureScenarioAction(
        ecId,
        drafts.map((d) => d.assumption)
      );
      if (outcome.ok) {
        setResult(outcome.result);
      } else {
        setResult(null);
        setRunError(outcome.reason);
      }
    });
  }

  function downloadSummary() {
    if (!result) return;
    const rows = result.lines.map((line) => ({
      "PO Line Part": line.partId,
      "Baseline Net Exposure": line.baseline?.netExposureValueReporting ?? "",
      "Scenario Net Exposure": line.scenario.kind === "created" ? line.scenario.netExposureValueReporting : "",
      "Scenario Status": line.scenario.kind === "created" ? line.scenario.confidenceClassification : `Gap: ${line.scenario.reason}`,
      "Delta": line.deltaAbsolute ?? "",
      Changed: line.changed ? "Yes" : "No",
    }));
    const header = [
      `Scenario summary for engineering change ${ecId}`,
      `Assumptions: ${result.assumptions.map((a) => a.label).join(" | ")}`,
      `Baseline total: ${result.baselineTotal} | Scenario total: ${result.scenarioTotal} | Delta: ${result.deltaAbsolute} (${result.deltaPercent !== null ? result.deltaPercent.toFixed(1) + "%" : "n/a"})`,
      `Generated ${result.ranAt} — hypothetical only, not persisted to any historical record.`,
      "",
    ].join("\n");
    const csv = header + buildCsv(rows, ["PO Line Part", "Baseline Net Exposure", "Scenario Net Exposure", "Scenario Status", "Delta", "Changed"]);
    downloadCsv(csv, `scenario-summary-${ecId}.csv`);
  }

  if (!canExplore) {
    return (
      <EmptyState
        title="Nothing to explore yet"
        body="Calculate exposure for this engineering change first (BOM diff, PO data, and an approved mapping are all needed) — then come back here to model alternatives against that baseline."
      />
    );
  }

  const sortedLines = result ? [...result.lines].sort((a, b) => Math.abs(b.deltaAbsolute ?? 0) - Math.abs(a.deltaAbsolute ?? 0)) : [];
  const expandedLine = sortedLines.find((l) => l.purchaseOrderLineId === expandedLineId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Interactive Exposure Explorer</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Compare the immutable baseline against a hypothetical — a different supplier, a changed quantity, alternate demand absorbing part
          of the shortfall. Nothing here is saved; every run is computed fresh and exists only in this browser tab.
        </p>
      </div>

      {showIntro && (
        <div className="rounded-md border border-accent/30 bg-accent-soft px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">What this is for</p>
              <p className="mt-1.5 max-w-2xl text-sm text-ink">
                Before committing to a decision, ask &ldquo;what if&rdquo; questions against the real numbers below — without touching
                them. Try things like:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                <li>&ldquo;What happens if we source this part from a different supplier?&rdquo;</li>
                <li>&ldquo;How much exposure disappears if alternate demand absorbs half the quantity?&rdquo;</li>
                <li>&ldquo;What if allocation changes from proportional to manual?&rdquo;</li>
              </ul>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowIntro(false)} aria-label="Dismiss guidance" className="shrink-0">
              Dismiss
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={addExampleScenario} className="mt-3">
            Try an example scenario
          </Button>
        </div>
      )}

      <InfoHero
        eyebrow="SCENARIO — BASELINE"
        value={money(currentBaselineTotal)}
        supporting={`The current, immutable historical exposure — ${baselineRecords.length} active record${baselineRecords.length === 1 ? "" : "s"}. Build a scenario below to compare a hypothetical against it.`}
      />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-ink">Build a scenario</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Add one or more assumptions below, then run the scenario to see how exposure would change.</p>
        </CardHeader>
        <CardBody className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">1. What are you changing?</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="scenario-assumption-kind" className="block text-[11px] uppercase tracking-wide text-ink-soft">
                Assumption
              </label>
              <select
                id="scenario-assumption-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof ASSUMPTION_KINDS)[number]["value"])}
                className="mt-1 rounded-sm border border-line px-2 py-1.5 text-sm"
              >
                {ASSUMPTION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="scenario-po-line" className="block text-[11px] uppercase tracking-wide text-ink-soft">
                PO Line
              </label>
              <select
                id="scenario-po-line"
                value={selectedPoLineId}
                onChange={(e) => setSelectedPoLineId(e.target.value)}
                className="mt-1 max-w-xs rounded-sm border border-line px-2 py-1.5 text-sm"
              >
                {poLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {poLineLabel(l)}
                  </option>
                ))}
              </select>
            </div>

            {kind === "supplierReassignment" ? (
              <div>
                <label htmlFor="scenario-new-supplier" className="block text-[11px] uppercase tracking-wide text-ink-soft">
                  New supplier
                </label>
                <select
                  id="scenario-new-supplier"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="mt-1 rounded-sm border border-line px-2 py-1.5 text-sm"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="scenario-number-value" className="block text-[11px] uppercase tracking-wide text-ink-soft">
                  {kind === "quantityOverride" ? "New quantity" : kind === "priceOverride" ? "New unit price" : "Quantity absorbed"}
                </label>
                <input
                  id="scenario-number-value"
                  type="number"
                  value={numberValue}
                  onChange={(e) => setNumberValue(e.target.value)}
                  className="mt-1 w-32 rounded-sm border border-line px-2 py-1.5 text-sm"
                  min={0}
                />
              </div>
            )}

            <Button size="sm" onClick={addDraft}>
              Add assumption
            </Button>
            </div>
            {numberFieldHelp[kind] && kind !== "supplierReassignment" && (
              <p className="mt-1.5 text-xs text-ink-soft">{numberFieldHelp[kind]}</p>
            )}
          </div>

          {crosswalks.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">2. Allocation override (optional)</p>
              <p className="mt-0.5 text-xs text-ink-soft">Force how a split part number allocates quantity across POs, instead of using the recorded rule.</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="scenario-crosswalk" className="block text-[11px] uppercase tracking-wide text-ink-soft">
                  Allocation for crosswalk
                </label>
                <select
                  id="scenario-crosswalk"
                  value={selectedCrosswalkId}
                  onChange={(e) => setSelectedCrosswalkId(e.target.value)}
                  className="mt-1 max-w-xs rounded-sm border border-line px-2 py-1.5 text-sm"
                >
                  {crosswalks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.plmPartId} → {c.erpPartId}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="scenario-allocation-method" className="block text-[11px] uppercase tracking-wide text-ink-soft">
                  Method
                </label>
                <select
                  id="scenario-allocation-method"
                  value={allocationMethod}
                  onChange={(e) => setAllocationMethod(e.target.value as CrosswalkAllocationMethod)}
                  className="mt-1 rounded-sm border border-line px-2 py-1.5 text-sm"
                >
                  {ALLOCATION_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {ALLOCATION_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="scenario-allocation-quantity" className="block text-[11px] uppercase tracking-wide text-ink-soft">
                  Quantity (fixed / manual methods)
                </label>
                <input
                  id="scenario-allocation-quantity"
                  type="number"
                  value={allocationQuantity}
                  onChange={(e) => setAllocationQuantity(e.target.value)}
                  className="mt-1 w-40 rounded-sm border border-line px-2 py-1.5 text-sm"
                  min={0}
                />
              </div>
              <Button variant="outline" size="sm" onClick={addAllocationDraft}>
                Add allocation override
              </Button>
              </div>
            </div>
          )}

          <div className="border-t border-line pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Assumptions in this scenario {drafts.length > 0 && `(${drafts.length})`}
            </p>
            {drafts.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                No assumptions added yet. Add one above, or{" "}
                <button onClick={addExampleScenario} className="font-medium text-accent hover:text-accent-deep">
                  try an example
                </button>
                .
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {drafts.map((d) => (
                  <span
                    key={d.key}
                    className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft py-1 pl-3 pr-2 text-xs text-ink"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    {describeScenarioAssumption(d.assumption, labelContext)}
                    <button
                      onClick={() => removeDraft(d.key)}
                      className="ml-0.5 rounded-full text-ink-soft hover:bg-white hover:text-status-critical"
                      aria-label="Remove assumption"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-line pt-4">
            <Button onClick={runScenario} disabled={drafts.length === 0 || isPending}>
              {isPending ? "Running scenario…" : "Run scenario"}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
            {result && (
              <Button variant="ghost" onClick={downloadSummary}>
                Download scenario summary (CSV)
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {runError && <FailureState title="Couldn't run this scenario" body={runError} />}

      {result && (
        <>
          <Hero
            eyebrow="SCENARIO RESULT"
            tone={result.deltaAbsolute < 0 ? "success" : result.deltaAbsolute > 0 ? "critical" : "neutral"}
            value={`${result.deltaAbsolute >= 0 ? "+" : ""}${money(result.deltaAbsolute)}`}
            supporting={
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-6">
                  <span className="text-white/60">Assumptions applied</span>
                  <span className="data-num font-medium text-white/90">{result.assumptions.length}</span>
                </div>
                <div className="flex items-baseline justify-between gap-6">
                  <span className="text-white/60">Baseline</span>
                  <span className="data-num font-medium text-white/90">{money(result.baselineTotal)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-6">
                  <span className="text-white/60">This scenario</span>
                  <span className="data-num font-medium text-white/90">{money(result.scenarioTotal)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-6 border-t border-white/10 pt-1">
                  <span className="text-white/60">Variance</span>
                  <span className="data-num font-medium text-white/90">
                    {result.deltaPercent !== null ? pct(result.deltaPercent) : "n/a"} · {result.changedLineCount} line
                    {result.changedLineCount === 1 ? "" : "s"} changed
                  </span>
                </div>
              </div>
            }
            meta="Hypothetical — nothing here is persisted to the historical record."
          />

          {result.gaps.length > 0 && (
            <div className="rounded-md border border-status-warning/30 bg-status-warningBg px-4 py-3 text-sm text-status-warning">
              <p className="font-semibold">{result.gaps.length} part(s) can&apos;t be resolved under this scenario</p>
              <ul className="mt-1 list-inside list-disc">
                {result.gaps.map((g, idx) => (
                  <li key={idx}>
                    {g.rawPartNumber}: {g.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-ink">
                Line-by-line comparison — {result.changedLineCount} of {sortedLines.length} changed
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">Sorted by the size of the change, largest first.</p>
            </CardHeader>
            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
                    <th className="pb-2 pr-3">Part</th>
                    <th className="pb-2 pr-3 text-right">Baseline</th>
                    <th className="pb-2 pr-3 text-right">Scenario</th>
                    <th className="pb-2 pr-3 text-right">Delta</th>
                    <th className="pb-2 pr-3">Confidence</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLines.map((line) => (
                    <tr key={line.purchaseOrderLineId} className={`border-b border-line ${line.changed ? "" : "text-ink-soft"}`}>
                      <td className="py-2 pr-3 font-mono text-xs">{line.partId}</td>
                      <td className="py-2 pr-3 text-right data-num">{line.baseline ? money(line.baseline.netExposureValueReporting) : "—"}</td>
                      <td className="py-2 pr-3 text-right data-num">
                        {line.scenario.kind === "created" ? money(line.scenario.netExposureValueReporting) : <span className="text-status-critical">Gap</span>}
                      </td>
                      <td className="py-2 pr-3 text-right data-num">{line.deltaAbsolute !== null ? money(line.deltaAbsolute) : "—"}</td>
                      <td className="py-2 pr-3">{line.scenario.kind === "created" && <ExposureConfidenceBadge value={line.scenario.confidenceClassification} />}</td>
                      <td className="py-2">
                        {line.scenario.kind === "created" && (
                          <button
                            onClick={() => setExpandedLineId(expandedLineId === line.purchaseOrderLineId ? null : line.purchaseOrderLineId)}
                            className="text-xs font-medium text-accent hover:text-accent-deep"
                          >
                            {expandedLineId === line.purchaseOrderLineId ? "Hide" : "Why?"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {expandedLine && expandedLine.scenario.kind === "created" && (
            <ScenarioLineDetail line={expandedLine} onClose={() => setExpandedLineId(null)} />
          )}
        </>
      )}
    </div>
  );
}

function ScenarioLineDetail({ line, onClose }: { line: ScenarioLineResult; onClose: () => void }) {
  if (line.scenario.kind !== "created") return null;
  const { explanation } = line.scenario;

  return (
    <Card className="border-accent/30">
      <CardHeader className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-accent">Hypothetical — not persisted</p>
          <h3 className="mt-0.5 font-mono text-sm font-semibold text-ink">{line.partId}</h3>
        </div>
        <button onClick={onClose} className="rounded-sm border border-line px-2 py-1 text-xs text-ink-soft hover:text-ink">
          Close
        </button>
      </CardHeader>
      <CardBody className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Facts</h4>
          <dl className="mt-2 space-y-2">
            {explanation.facts.map((f) => (
              <div key={f.label} className="border-b border-line pb-2">
                <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{f.label}</dt>
                <dd className="mt-0.5 text-sm text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {explanation.appliedRules.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Applied rules (including this scenario&apos;s assumptions)</h4>
            <dl className="mt-2 space-y-2">
              {explanation.appliedRules.map((r) => (
                <div key={r.label} className="border-b border-accent/20 pb-2">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{r.label}</dt>
                  <dd className="mt-0.5 text-sm text-ink">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Calculation</h4>
          <ol className="mt-2 space-y-1">
            {explanation.calculationSteps.map((step, idx) => (
              <li key={idx} className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">{step.label}</span>
                <span className="data-num font-semibold text-ink">{step.value}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Conclusion</h4>
          <p className="mt-1 text-sm text-ink">{explanation.conclusion.explanation}</p>
        </div>
      </CardBody>
    </Card>
  );
}

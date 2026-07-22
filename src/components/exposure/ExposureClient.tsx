"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateExposureAction, getEvidenceExplanationAction } from "@/app/actions";
import { summarizeExposureNarrative } from "@/domains/deltaledger/exposure/exposureNarrative";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState, WarningState } from "@/components/shared/States";
import { EvidenceExplorer } from "@/components/evidence/EvidenceExplorer";
import { Button } from "@/components/design-system/Button";
import { Hero, HeroBreakdown } from "@/components/design-system/Hero";
import type { EvidenceExplanation } from "@/domains/deltaledger/evidenceExplanation";
import type { WorkspaceCompletion, DecisionReadiness, NextAction } from "@/domains/deltaledger/workspaceSummary";

// Mirrors db/repositories/exposure.ts's ProvenanceState -- kept as a local literal union
// rather than importing that (server-only, DB-connected) module into client code.
type ProvenanceState = "current" | "stale" | "legacy_unknown";
import { ExposureConfidenceBadge, CancellationStatusPill } from "@/components/shared/Badges";
import { buildCsv, downloadCsv } from "@/core/export/exportCsv";
import { buildWorkbook, downloadWorkbook } from "@/core/export/exportXlsx";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

interface ExposureRecordRow {
  id: string;
  partId: string;
  purchaseOrderLineId: string;
  exposureSourceSnapshotId: string;
  grossCommittedValueReporting: number;
  alternateDemandAdjustmentReporting: number;
  netExposureValueReporting: number;
  confidenceClassification: "known" | "estimated" | "unresolved";
  cancellationStatus: string;
  cancellationConfidence: "verified" | "supplier_reported" | "unverified" | "unknown";
  formulaVersion: string;
  calculatedAt: string;
  classificationReason: string | null;
}
interface Snapshot {
  id: string;
  supplierId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  promisedReceiptDate: string | null;
  transactionCurrency: string;
  exchangeRate: number;
  crosswalkVersionId: string;
  supplierTermsVersionId: string | null;
  sourceFiles: string;
  sourceRows: string;
  alternateDemandAllocationIds: string;
}
interface PurchaseOrderRow {
  id: string;
  poNumber: string;
}
interface SupplierRow {
  id: string;
  name: string;
}
interface MitigationActionRow {
  id: string;
  exposureRecordId: string;
  ownerUserId: string;
}

export function ExposureClient({
  ecId,
  records,
  snapshots,
  purchaseOrders,
  suppliers,
  mitigationActions,
  canCalculate,
  provenance,
  completion,
  readiness,
  nextAction,
}: {
  ecId: string;
  records: ExposureRecordRow[];
  snapshots: Snapshot[];
  purchaseOrders: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  mitigationActions: MitigationActionRow[];
  canCalculate: boolean;
  provenance: Record<string, ProvenanceState>;
  completion?: WorkspaceCompletion;
  readiness?: DecisionReadiness;
  nextAction?: NextAction | null;
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [query, setQuery] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "known" | "estimated" | "unresolved">("all");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<EvidenceExplanation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [gaps, setGaps] = useState<{ rawPartNumber: string; reason: string }[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      records.filter((r) => {
        if (confidenceFilter !== "all" && r.confidenceClassification !== confidenceFilter) return false;
        if (query && !r.partId.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [records, query, confidenceFilter]
  );

  function handleCalculate() {
    startTransition(async () => {
      const result = await calculateExposureAction(ecId, currentUser);
      setGaps(result.gaps);
      router.refresh();
    });
  }

  function exportRows() {
    return records.map((r) => {
      const snapshot = snapshots.find((s) => s.id === r.exposureSourceSnapshotId);
      const supplier = suppliers.find((s) => s.id === snapshot?.supplierId);
      const po = purchaseOrders.find((p) => p.id === snapshot?.purchaseOrderId);
      const mitigation = mitigationActions.find((a) => a.exposureRecordId === r.id);
      return {
        "Part Number": r.partId,
        Supplier: supplier?.name ?? "",
        "PO Number": po?.poNumber ?? "",
        "Promised Receipt Date": snapshot?.promisedReceiptDate ?? "",
        "Gross Committed Value (USD)": r.grossCommittedValueReporting,
        "Alternate Demand Adjustment (USD)": r.alternateDemandAdjustmentReporting,
        "Net Exposure Value (USD)": r.netExposureValueReporting,
        "Exposure Confidence": r.confidenceClassification,
        "Cancellation Status": r.cancellationStatus,
        "Cancellation Confidence": r.cancellationConfidence,
        "Responsible Buyer": mitigation?.ownerUserId ?? "",
        "Calculated At": r.calculatedAt,
      };
    });
  }

  function handleExportCsv() {
    const rows = exportRows();
    const csv = buildCsv(rows, Object.keys(rows[0] ?? {}));
    downloadCsv(csv, "exposure_results.csv");
  }
  function handleExportXlsx() {
    const wb = buildWorkbook([{ name: "Exposure Records", rows: exportRows() }]);
    downloadWorkbook(wb, "exposure_results.xlsx");
  }

  async function openEvidence(record: ExposureRecordRow) {
    setSelectedPartId(record.partId);
    setExplanation(null);
    setExplanationLoading(true);
    const result = await getEvidenceExplanationAction(record.id);
    setExplanation(result);
    setExplanationLoading(false);
  }

  function closeEvidence() {
    setSelectedPartId(null);
    setExplanation(null);
  }

  const staleCount = records.filter((r) => provenance[r.id] === "stale").length;
  const legacyUnknownCount = records.filter((r) => provenance[r.id] === "legacy_unknown").length;

  // Phase 6C -- the headline conclusion, built entirely from already-fetched data via the one
  // canonical formatter (see exposureNarrative.ts). No new data, no new calculation -- this is
  // the exact same records/snapshots/suppliers the table below renders, just summarized first.
  const narrative = summarizeExposureNarrative(
    records.map((r) => {
      const snapshot = snapshots.find((s) => s.id === r.exposureSourceSnapshotId);
      const supplier = suppliers.find((s) => s.id === snapshot?.supplierId);
      return {
        partId: r.partId,
        supplierName: supplier?.name ?? "an unknown supplier",
        netExposureValueReporting: r.netExposureValueReporting,
        confidenceClassification: r.confidenceClassification,
      };
    })
  );

  const mostRecentCalculation = records.length > 0 ? records.map((r) => r.calculatedAt).sort().at(-1) : null;

  return (
    <div className="relative">
      {narrative ? (
        <Hero
          eyebrow="EXPOSURE"
          value={money(narrative.totalNet)}
          tone={readiness && readiness.status !== "ready" ? "warning" : "success"}
          supporting={
            <div className="space-y-3">
              {/*
                Phase 5 (Enterprise Craftsmanship Pass) -- the breakdown is only shown when it
                tells the reader something the headline value doesn't already say. With a
                single confidence bucket (e.g. everything "estimated"), the breakdown would
                repeat the exact same figure immediately beneath itself -- the redundancy
                named in the Commercial Product Review. Genuinely mixed confidence, or the
                presence of unresolved parts, is new information; a single bucket is not.
              */}
              {(narrative.knownTotal > 0 ? 1 : 0) + (narrative.estimatedTotal > 0 ? 1 : 0) + (narrative.unresolvedCount > 0 ? 1 : 0) > 1 && (
                <HeroBreakdown
                  knownTotal={narrative.knownTotal}
                  estimatedTotal={narrative.estimatedTotal}
                  unresolvedCount={narrative.unresolvedCount}
                  unresolvedLabel="part"
                />
              )}
              <p>{narrative.scopeLine}</p>
              {completion && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-white/70">
                  <span>{completion.mappingComplete ? "✓ Mapping complete" : `⚠ ${completion.mappingPending} mapping(s) pending`}</span>
                  {readiness?.primaryReasonCode === "mapping_changed_since_calculation" && <span>⚠ Exposure stale after crosswalk revision</span>}
                  {readiness?.primaryReasonCode === "stale_exposure" && <span>⚠ Based on superseded PO data</span>}
                </div>
              )}
            </div>
          }
          meta={mostRecentCalculation ? `Last calculated ${new Date(mostRecentCalculation).toLocaleDateString()}` : undefined}
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
      ) : (
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Exposure Results</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">Calculate exposure to see the financial impact of this engineering change.</p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <div className="flex gap-2">
          {records.length > 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={handleExportCsv}>
                Export CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExportXlsx}>
                Export XLSX
              </Button>
            </>
          )}
          <Button onClick={handleCalculate} disabled={!canCalculate || isPending} className="disabled:cursor-not-allowed">
            {isPending ? "Calculating…" : records.length > 0 ? "Recalculate exposure" : "Calculate exposure"}
          </Button>
        </div>
      </div>

      {!canCalculate && (
        <div className="mt-4">
          <WarningState title="Not ready to calculate" body="Import current + proposed BOM and the open PO export first." />
        </div>
      )}

      {staleCount > 0 && (
        <div className="mt-4">
          <WarningState
            title="Some exposure is based on superseded PO data"
            body={`${staleCount} of ${records.length} exposure record(s) were calculated against open-PO data that has since been replaced by a corrected import. Recalculate exposure to update these figures.`}
          />
        </div>
      )}
      {legacyUnknownCount > 0 && (
        <div className="mt-4">
          <WarningState
            title="Some exposure has unverifiable PO provenance"
            body={`${legacyUnknownCount} of ${records.length} exposure record(s) were calculated before per-import PO tracking existed. Whether they reflect the current PO data cannot be automatically verified. Recalculate exposure for a result with full provenance.`}
          />
        </div>
      )}

      {gaps && gaps.length > 0 && (
        <div className="mt-4 rounded-md border border-status-critical/30 bg-status-criticalBg p-3">
          <p className="text-sm font-semibold text-status-critical">
            {gaps.length} Unmapped Exposure Gap{gaps.length !== 1 ? "s" : ""} from the last calculation — no record
            created, not a $0 exposure
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-status-critical">
            {gaps.map((g, i) => (
              <li key={i}>
                {g.rawPartNumber}: {g.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by part number…"
            className="w-56 rounded-sm border border-line bg-white px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-1">
            {(["all", "known", "estimated", "unresolved"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setConfidenceFilter(c)}
                className={`rounded-sm border px-2.5 py-1 text-xs font-medium capitalize ${
                  confidenceFilter === c ? "border-accent bg-accent-soft text-accent" : "border-line bg-white text-ink-soft"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        {records.length === 0 ? (
          <EmptyState
            title="Exposure hasn't been calculated yet"
            body="This is the dollar figure at the center of the whole decision — what's actually committed, to whom, and how confidently. Calculate exposure above once BOM diff, PO data, and mapping are in place."
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" body="Try a different search term or filter." />
        ) : (
          <>
            <p className="mb-2 text-xs text-ink-soft">
              <span className="font-semibold text-ink">Exposure confidence</span> (is the dollar amount trustworthy?) and{" "}
              <span className="font-semibold text-ink">cancellation status/confidence</span> (do we know if it&apos;s cancellable?) are
              independent findings, shown in separate columns below.
            </p>
            <div className="overflow-auto rounded-md border border-line bg-white">
            <table className="w-full min-w-[1300px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Part</th>
                  <th className="px-3 py-2.5 font-medium">Supplier</th>
                  <th className="px-3 py-2.5 font-medium">PO / Line</th>
                  <th className="px-3 py-2.5 font-medium">Promised receipt</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gross committed</th>
                  <th className="px-3 py-2.5 text-right font-medium">Alt-demand adj.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Net exposure</th>
                  <th className="px-3 py-2.5 font-medium">Exposure confidence</th>
                  <th className="px-3 py-2.5 font-medium">Cancellation status / confidence</th>
                  <th className="px-3 py-2.5 font-medium">Responsible buyer</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const snapshot = snapshots.find((s) => s.id === r.exposureSourceSnapshotId);
                  const supplier = suppliers.find((s) => s.id === snapshot?.supplierId);
                  const po = purchaseOrders.find((p) => p.id === snapshot?.purchaseOrderId);
                  const mitigation = mitigationActions.find((a) => a.exposureRecordId === r.id);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => openEvidence(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEvidence(r);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View evidence for ${r.partId}`}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-accent-soft/40 focus:bg-accent-soft/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-ink">{r.partId}</td>
                      <td className="px-3 py-2.5 text-xs">{supplier?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {po?.poNumber} / {snapshot ? JSON.parse(snapshot.sourceRows).join(", ") : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{snapshot?.promisedReceiptDate ?? "—"}</td>
                      <td className="data-num px-3 py-2.5 text-right text-xs">{money(r.grossCommittedValueReporting)}</td>
                      <td className="data-num px-3 py-2.5 text-right text-xs text-ink-soft">{money(r.alternateDemandAdjustmentReporting)}</td>
                      <td className="data-num px-3 py-2.5 text-right text-xs font-semibold">{money(r.netExposureValueReporting)}</td>
                      <td className="px-3 py-2.5">
                        <ExposureConfidenceBadge value={r.confidenceClassification} />
                      </td>
                      <td className="px-3 py-2.5">
                        <CancellationStatusPill status={r.cancellationStatus as never} confidence={r.cancellationConfidence} />
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {mitigation ? mitigation.ownerUserId : <span className="text-ink-soft">Unassigned</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {selectedPartId && explanationLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-ink/30">
          <div className="mr-6 rounded-md bg-white px-4 py-3 text-sm text-ink-soft shadow-xl">Loading evidence…</div>
        </div>
      )}
      {selectedPartId && explanation && (
        <EvidenceExplorer partId={selectedPartId} ecId={ecId} explanation={explanation} onClose={closeEvidence} />
      )}
    </div>
  );
}



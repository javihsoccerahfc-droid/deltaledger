"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateExposureAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState, WarningState } from "@/components/shared/States";
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
}: {
  ecId: string;
  records: ExposureRecordRow[];
  snapshots: Snapshot[];
  purchaseOrders: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  mitigationActions: MitigationActionRow[];
  canCalculate: boolean;
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [query, setQuery] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "known" | "estimated" | "unresolved">("all");
  const [selected, setSelected] = useState<ExposureRecordRow | null>(null);
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
        part_number: r.partId,
        supplier: supplier?.name ?? "",
        po_number: po?.poNumber ?? "",
        promised_receipt_date: snapshot?.promisedReceiptDate ?? "",
        gross_committed_value_usd: r.grossCommittedValueReporting,
        alternate_demand_adjustment_usd: r.alternateDemandAdjustmentReporting,
        net_exposure_value_usd: r.netExposureValueReporting,
        exposure_confidence: r.confidenceClassification,
        cancellation_status: r.cancellationStatus,
        cancellation_confidence: r.cancellationConfidence,
        responsible_buyer: mitigation?.ownerUserId ?? "",
        calculated_at: r.calculatedAt,
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

  const totalGross = records
    .filter((r) => r.confidenceClassification !== "unresolved")
    .reduce((s, r) => s + r.grossCommittedValueReporting, 0);
  const totalNet = records
    .filter((r) => r.confidenceClassification !== "unresolved")
    .reduce((s, r) => s + r.netExposureValueReporting, 0);
  const knownNet = records.filter((r) => r.confidenceClassification === "known").reduce((s, r) => s + r.netExposureValueReporting, 0);

  return (
    <div className="relative">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Exposure Results</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            <span className="font-semibold text-ink">Exposure confidence</span> (is the dollar amount
            trustworthy?) and <span className="font-semibold text-ink">cancellation status/confidence</span>{" "}
            (do we know if it&apos;s cancellable?) are independent findings — shown in separate columns.
          </p>
        </div>
        <div className="flex gap-2">
          {records.length > 0 && (
            <>
              <button
                onClick={handleExportCsv}
                className="rounded-sm border border-line bg-white px-3 py-2 text-xs font-medium text-ink hover:border-accent hover:text-accent"
              >
                Export CSV
              </button>
              <button
                onClick={handleExportXlsx}
                className="rounded-sm border border-line bg-white px-3 py-2 text-xs font-medium text-ink hover:border-accent hover:text-accent"
              >
                Export XLSX
              </button>
            </>
          )}
          <button
            onClick={handleCalculate}
            disabled={!canCalculate || isPending}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Calculating…" : records.length > 0 ? "Recalculate exposure" : "Calculate exposure"}
          </button>
        </div>
      </div>

      {!canCalculate && (
        <div className="mt-4">
          <WarningState title="Not ready to calculate" body="Import current + proposed BOM and the open PO export first." />
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Total gross committed" value={money(totalGross)} tone="neutral" />
          <SummaryCard label="Total net exposure" value={money(totalNet)} tone="neutral" />
          <SummaryCard label="Known net exposure" value={money(knownNet)} tone="success" />
          <SummaryCard
            label="Unresolved records"
            value={String(records.filter((r) => r.confidenceClassification === "unresolved").length)}
            tone="critical"
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
          <EmptyState title="No exposure records yet" body="Run the calculation to see results here." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" body="Try a different search term or filter." />
        ) : (
          <div className="overflow-auto rounded-md border border-line bg-white">
            <table className="w-full min-w-[1300px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Part</th>
                  <th className="px-3 py-2.5 font-medium">Supplier</th>
                  <th className="px-3 py-2.5 font-medium">PO / Line</th>
                  <th className="px-3 py-2.5 font-medium">Promised receipt</th>
                  <th className="px-3 py-2.5 font-medium">Gross committed</th>
                  <th className="px-3 py-2.5 font-medium">Alt-demand adj.</th>
                  <th className="px-3 py-2.5 font-medium">Net exposure</th>
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
                      onClick={() => setSelected(r)}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-accent-soft/40"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-ink">{r.partId}</td>
                      <td className="px-3 py-2.5 text-xs">{supplier?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {po?.poNumber} / {snapshot?.purchaseOrderLineId.split(":").pop()}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{snapshot?.promisedReceiptDate ?? "—"}</td>
                      <td className="data-num px-3 py-2.5 text-xs">{money(r.grossCommittedValueReporting)}</td>
                      <td className="data-num px-3 py-2.5 text-xs text-ink-soft">{money(r.alternateDemandAdjustmentReporting)}</td>
                      <td className="data-num px-3 py-2.5 text-xs font-semibold">{money(r.netExposureValueReporting)}</td>
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
        )}
      </div>

      {selected &&
        (() => {
          const snapshot = snapshots.find((s) => s.id === selected.exposureSourceSnapshotId);
          const supplier = suppliers.find((s) => s.id === snapshot?.supplierId);
          return (
            <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={() => setSelected(null)}>
              <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-soft">Immutable calculation snapshot</p>
                    <h2 className="mt-0.5 font-mono text-lg font-semibold text-ink">{selected.partId}</h2>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-sm border border-line px-2 py-1 text-xs text-ink-soft hover:text-ink"
                  >
                    Close
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  Frozen at calculation time — recalculating never mutates this row; it supersedes it with a new
                  one.
                </p>
                <dl className="mt-5 space-y-3 text-sm">
                  <Field label="Supplier" value={supplier?.name ?? "—"} />
                  <Field label="Formula version" value={selected.formulaVersion} mono />
                  <Field label="Calculated at" value={new Date(selected.calculatedAt).toLocaleString()} />
                  <Field label="Transaction currency / rate" value={`${snapshot?.transactionCurrency} @ ${snapshot?.exchangeRate}`} mono />
                  <Field label="Source file(s)" value={snapshot ? JSON.parse(snapshot.sourceFiles).join(", ") : "—"} mono />
                  <Field label="Source row(s)" value={snapshot ? JSON.parse(snapshot.sourceRows).join(", ") : "—"} mono />
                  <Field
                    label="Alternate-demand allocations used"
                    value={
                      snapshot && JSON.parse(snapshot.alternateDemandAllocationIds).length
                        ? JSON.parse(snapshot.alternateDemandAllocationIds).join(", ")
                        : "None"
                    }
                    mono
                  />
                  {selected.classificationReason && <Field label="Why Unresolved" value={selected.classificationReason} />}
                </dl>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "success" | "critical" | "neutral" }) {
  const toneStyles: Record<string, string> = { success: "text-status-success", critical: "text-status-critical", neutral: "text-ink" };
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`data-num mt-1 text-lg font-semibold ${toneStyles[tone]}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-line pb-2">
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

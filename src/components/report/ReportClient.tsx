"use client";

import { netMitigationBenefit } from "@/domains/deltaledger/financialOutcome";
import { EmptyState } from "@/components/shared/States";
import { buildCsv, downloadCsv } from "@/core/export/exportCsv";
import { buildWorkbook, downloadWorkbook } from "@/core/export/exportXlsx";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

interface OutcomeRow {
  id: string;
  exposureRecordId: string;
  estimatedCostAvoidedFrozen: number;
  actualCostAvoided: number;
  actualRealizedLoss: number;
  closedAt: string | null;
}
interface RecordRow {
  id: string;
  partId: string;
}
interface EcoReport {
  exposure: {
    countByConfidence: { known: number; estimated: number; unresolved: number };
    totalNetReportingKnownOnly: number;
    totalNetReporting: number;
  };
  outcomes: {
    totalActualCostAvoided: number;
    totalActualRealizedLoss: number;
    totalNetMitigationBenefit: number;
  };
  unmappedGapCount: number;
}

export function ReportClient({
  ecName,
  report,
  outcomes,
  records,
}: {
  ecName: string;
  report: EcoReport;
  outcomes: OutcomeRow[];
  records: RecordRow[];
}) {
  const totalRecords =
    report.exposure.countByConfidence.known + report.exposure.countByConfidence.estimated + report.exposure.countByConfidence.unresolved;

  function exportRows() {
    return outcomes.map((o) => {
      const record = records.find((r) => r.id === o.exposureRecordId);
      return {
        part_number: record?.partId ?? "",
        estimated_cost_avoided_frozen: o.estimatedCostAvoidedFrozen,
        actual_cost_avoided: o.actualCostAvoided,
        actual_realized_loss: o.actualRealizedLoss,
        net_mitigation_benefit: netMitigationBenefit(o.actualCostAvoided, o.actualRealizedLoss),
        status: o.closedAt ? "closed" : "draft",
      };
    });
  }

  function handleExportCsv() {
    const rows = exportRows();
    downloadCsv(buildCsv(rows, Object.keys(rows[0] ?? {})), "exposure_report.csv");
  }
  function handleExportXlsx() {
    downloadWorkbook(buildWorkbook([{ name: "Financial Outcomes", rows: exportRows() }]), "exposure_report.xlsx");
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Exposure vs. Outcome Report</h1>
          <p className="mt-1 text-sm text-ink-soft">{ecName}</p>
        </div>
        {totalRecords > 0 && (
          <div className="flex gap-2 print:hidden">
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
            <button
              onClick={() => window.print()}
              className="rounded-sm border border-line bg-white px-3 py-2 text-xs font-medium text-ink hover:border-accent hover:text-accent"
            >
              Print
            </button>
          </div>
        )}
      </div>

      {totalRecords === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing to report yet" body="Calculate exposure to see a report here." />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-ink-soft">
              <span>Exposure record mix</span>
              <span>{totalRecords} total</span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line">
              {report.exposure.countByConfidence.known > 0 && (
                <div className="bg-status-success" style={{ width: `${(report.exposure.countByConfidence.known / totalRecords) * 100}%` }} />
              )}
              {report.exposure.countByConfidence.estimated > 0 && (
                <div className="bg-status-warning" style={{ width: `${(report.exposure.countByConfidence.estimated / totalRecords) * 100}%` }} />
              )}
              {report.exposure.countByConfidence.unresolved > 0 && (
                <div className="bg-status-critical" style={{ width: `${(report.exposure.countByConfidence.unresolved / totalRecords) * 100}%` }} />
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card label="Known exposure (net)" value={money(report.exposure.totalNetReportingKnownOnly)} tone="success" />
            <Card label="Known + estimated (net)" value={money(report.exposure.totalNetReporting)} tone="neutral" />
            <Card label="Unresolved records" value={String(report.exposure.countByConfidence.unresolved)} tone="critical" />
            <Card label="Unmapped gaps (last calc)" value={String(report.unmappedGapCount)} tone="critical" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card label="Actual cost avoided" value={money(report.outcomes.totalActualCostAvoided)} tone="success" />
            <Card label="Actual realized loss" value={money(report.outcomes.totalActualRealizedLoss)} tone="critical" />
            <div className="rounded-md border-2 border-accent/40 bg-accent-soft p-4">
              <p className="text-[11px] uppercase tracking-wide text-accent">Net mitigation benefit</p>
              <p className="data-num text-lg font-semibold text-accent">{money(report.outcomes.totalNetMitigationBenefit)}</p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-md border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Part</th>
                  <th className="px-4 py-2.5 font-medium">Estimated (frozen)</th>
                  <th className="px-4 py-2.5 font-medium">Actual avoided</th>
                  <th className="px-4 py-2.5 font-medium">Actual loss</th>
                  <th className="px-4 py-2.5 font-medium">Net benefit</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => {
                  const record = records.find((r) => r.id === o.exposureRecordId);
                  return (
                    <tr key={o.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{record?.partId}</td>
                      <td className="data-num px-4 py-2.5 text-xs">{money(o.estimatedCostAvoidedFrozen)}</td>
                      <td className="data-num px-4 py-2.5 text-xs text-status-success">{money(o.actualCostAvoided)}</td>
                      <td className="data-num px-4 py-2.5 text-xs text-status-critical">{money(o.actualRealizedLoss)}</td>
                      <td className="data-num px-4 py-2.5 text-xs font-semibold">
                        {money(netMitigationBenefit(o.actualCostAvoided, o.actualRealizedLoss))}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{o.closedAt ? "Closed" : "Draft"}</td>
                    </tr>
                  );
                })}
                {outcomes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">
                      No financial outcomes recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone: "success" | "critical" | "neutral" }) {
  const toneStyles: Record<string, string> = { success: "text-status-success", critical: "text-status-critical", neutral: "text-ink" };
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`data-num text-lg font-semibold ${toneStyles[tone]}`}>{value}</p>
    </div>
  );
}

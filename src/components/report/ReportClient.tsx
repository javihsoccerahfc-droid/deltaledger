"use client";

import { netMitigationBenefit } from "@/domains/deltaledger/financialOutcome";
import { summarizeReportNarrative } from "@/domains/deltaledger/reports/reportNarrative";
import { Hero } from "@/components/design-system/Hero";
import type { EcoReport } from "@/domains/deltaledger/reports/ecoReport";
import { EmptyState, WarningState } from "@/components/shared/States";
import { buildCsv, downloadCsv } from "@/core/export/exportCsv";
import { buildWorkbook, downloadWorkbook } from "@/core/export/exportXlsx";

// Mirrors db/repositories/exposure.ts's ProvenanceState -- kept local rather than importing
// that server-only, DB-connected module into client code.
type ProvenanceState = "current" | "stale" | "legacy_unknown";

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

export function ReportClient({
  ecName,
  report,
  outcomes,
  records,
  provenance,
}: {
  ecName: string;
  report: EcoReport;
  outcomes: OutcomeRow[];
  records: RecordRow[];
  provenance: Record<string, ProvenanceState>;
}) {
  const totalRecords =
    report.exposure.countByConfidence.known + report.exposure.countByConfidence.estimated + report.exposure.countByConfidence.unresolved;
  const staleCount = records.filter((r) => provenance[r.id] === "stale").length;
  const legacyUnknownCount = records.filter((r) => provenance[r.id] === "legacy_unknown").length;
  const narrative = summarizeReportNarrative(report);

  function exportRows() {
    return outcomes.map((o) => {
      const record = records.find((r) => r.id === o.exposureRecordId);
      return {
        "Part Number": record?.partId ?? "",
        "Estimated Cost Avoided (Frozen)": o.estimatedCostAvoidedFrozen,
        "Actual Cost Avoided": o.actualCostAvoided,
        "Actual Realized Loss": o.actualRealizedLoss,
        "Net Mitigation Benefit": netMitigationBenefit(o.actualCostAvoided, o.actualRealizedLoss),
        Status: o.closedAt ? "Closed" : "Draft",
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

      {narrative && (
        <Hero
          eyebrow="EXECUTIVE SUMMARY"
          tone={report.unmappedGapCount > 0 || report.exposure.countByConfidence.unresolved > 0 ? "warning" : "success"}
          value={money(report.exposure.totalNetReporting)}
          supporting={
            <div className="space-y-2">
              <p>{narrative.exposureLine}</p>
              <p>{narrative.mitigationLine}</p>
              <p className="font-medium text-white/90">{narrative.netPositionLine}</p>
            </div>
          }
          meta={narrative.gapCaveat ?? undefined}
        />
      )}

      {staleCount > 0 && (
        <div className="mt-4 print:hidden">
          <WarningState
            title="Some exposure is based on superseded PO data"
            body={`${staleCount} of ${totalRecords} exposure record(s) were calculated against open-PO data that has since been replaced by a corrected import. Recalculate exposure to update these figures.`}
          />
        </div>
      )}
      {legacyUnknownCount > 0 && (
        <div className="mt-4 print:hidden">
          <WarningState
            title="Some exposure has unverifiable PO provenance"
            body={`${legacyUnknownCount} of ${totalRecords} exposure record(s) were calculated before per-import PO tracking existed. Whether they reflect the current PO data cannot be automatically verified. Recalculate exposure for a result with full provenance.`}
          />
        </div>
      )}

      {totalRecords === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing to report yet"
            body="This report exists to show finance and leadership the full picture — exposure created, mitigated, and the net financial outcome, all in one defensible view. Calculate exposure for this engineering change first, then this report builds itself."
          />
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

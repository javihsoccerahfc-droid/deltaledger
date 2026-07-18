import { getEngineeringChangeAction, getActiveExposureRecordsAction, getFinancialOutcomesAction } from "@/app/actions";
import { buildEcoReport } from "@/domains/deltaledger/reports/ecoReport";
import { ReportClient } from "@/components/report/ReportClient";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const ec = await getEngineeringChangeAction(params.id);
  const records = await getActiveExposureRecordsAction(params.id);
  const allOutcomes = await getFinancialOutcomesAction();
  const outcomes = allOutcomes.filter((o) => records.some((r) => r.id === o.exposureRecordId));

  // Unmapped-gap count isn't a persisted entity (no row is ever created for
  // a gap, by design) -- it's only known transiently right after a
  // calculation. The report shows 0 here; the Exposure page shows the
  // real-time count from the last calculation run.
  const report = buildEcoReport(params.id, records as never, outcomes as never, 0);

  return <ReportClient ecName={ec?.name ?? ""} report={report} outcomes={outcomes} records={records} />;
}

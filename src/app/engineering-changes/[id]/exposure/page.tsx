import {
  getActiveExposureRecordsAction,
  getExposureSnapshotsAction,
  getPurchaseDataAction,
  getMitigationActionsForRecordsAction,
  getBomStateAction,
  getExposureProvenanceAction,
  getEcWorkspaceSummaryAction,
} from "@/app/actions";
import { ExposureClient } from "@/components/exposure/ExposureClient";

export default async function ExposurePage({ params }: { params: { id: string } }) {
  const [records, purchaseData, bomState, provenance, workspaceSummary] = await Promise.all([
    getActiveExposureRecordsAction(params.id),
    getPurchaseDataAction(params.id),
    getBomStateAction(params.id),
    getExposureProvenanceAction(params.id),
    getEcWorkspaceSummaryAction(params.id),
  ]);
  const snapshots = await getExposureSnapshotsAction(records.map((r) => r.exposureSourceSnapshotId));
  const mitigationActions = await getMitigationActionsForRecordsAction(records.map((r) => r.id));

  const canCalculate = bomState.diff.length > 0 && purchaseData.poLines.length > 0;

  return (
    <ExposureClient
      ecId={params.id}
      records={records}
      snapshots={snapshots}
      purchaseOrders={purchaseData.purchaseOrders}
      suppliers={purchaseData.suppliers}
      mitigationActions={mitigationActions}
      canCalculate={canCalculate}
      provenance={provenance}
      completion={workspaceSummary.completion}
      readiness={workspaceSummary.readiness}
      nextAction={workspaceSummary.nextAction}
    />
  );
}

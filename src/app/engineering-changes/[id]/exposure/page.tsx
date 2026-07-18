import {
  getActiveExposureRecordsAction,
  getExposureSnapshotsAction,
  getPurchaseDataAction,
  getMitigationActionsForRecordsAction,
  getBomStateAction,
} from "@/app/actions";
import { ExposureClient } from "@/components/exposure/ExposureClient";

export default async function ExposurePage({ params }: { params: { id: string } }) {
  const [records, purchaseData, bomState] = await Promise.all([
    getActiveExposureRecordsAction(params.id),
    getPurchaseDataAction(params.id),
    getBomStateAction(params.id),
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
    />
  );
}

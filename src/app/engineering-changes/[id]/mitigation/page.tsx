import {
  getActiveExposureRecordsAction,
  getExposureSnapshotsAction,
  getMitigationActionsForRecordsAction,
  getFinancialOutcomesAction,
  getSupplierResponsesAction,
} from "@/app/actions";
import { MitigationClient } from "@/components/mitigation/MitigationClient";

export default async function MitigationPage({ params }: { params: { id: string } }) {
  const records = await getActiveExposureRecordsAction(params.id);
  const snapshots = await getExposureSnapshotsAction(records.map((r) => r.exposureSourceSnapshotId));
  const mitigationActions = await getMitigationActionsForRecordsAction(records.map((r) => r.id));
  const responsesByAction = await Promise.all(mitigationActions.map((a) => getSupplierResponsesAction(a.id)));
  const responses = responsesByAction.flat();
  const outcomes = await getFinancialOutcomesAction();

  return (
    <MitigationClient
      ecId={params.id}
      records={records}
      snapshots={snapshots}
      mitigationActions={mitigationActions}
      responses={responses}
      outcomes={outcomes}
    />
  );
}

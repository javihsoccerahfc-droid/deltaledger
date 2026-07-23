import { getAlternateDemandAction, getAllAllocationsAction, getActiveExposureRecordsAction, getBomStateAction } from "@/app/actions";
import { AlternateDemandClient } from "@/components/alternateDemand/AlternateDemandClient";

export default async function AlternateDemandPage({ params }: { params: { id: string } }) {
  const [records, allocations, exposureRecords, bomState] = await Promise.all([
    getAlternateDemandAction(),
    getAllAllocationsAction(),
    getActiveExposureRecordsAction(params.id),
    getBomStateAction(params.id),
  ]);

  const eligibleDiffEntries = bomState.diff.filter(
    (d) => d.changeType === "removed" || d.changeType === "qty_reduced" || d.changeType === "replaced"
  );

  return (
    <AlternateDemandClient
      ecId={params.id}
      records={records}
      allocations={allocations}
      exposureRecords={exposureRecords}
      eligibleDiffEntries={eligibleDiffEntries}
    />
  );
}

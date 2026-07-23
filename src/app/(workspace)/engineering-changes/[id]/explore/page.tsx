import {
  getActiveExposureRecordsAction,
  getPurchaseDataAction,
  getBomStateAction,
  getCrosswalksAction,
} from "@/app/actions";
import { ExposureExplorerClient } from "@/components/exposure/ExposureExplorerClient";

export default async function ExposureExplorerPage({ params }: { params: { id: string } }) {
  const [records, purchaseData, bomState, crosswalks] = await Promise.all([
    getActiveExposureRecordsAction(params.id),
    getPurchaseDataAction(params.id),
    getBomStateAction(params.id),
    getCrosswalksAction(),
  ]);

  const eligiblePartIds = new Set(
    bomState.diff.filter((d) => d.changeType === "removed" || d.changeType === "qty_reduced" || d.changeType === "replaced").map((d) => d.partId)
  );
  const relevantCrosswalks = crosswalks.filter((c) => eligiblePartIds.has(c.plmPartId) && c.reviewStatus === "approved");

  const canExplore = records.length > 0 && purchaseData.poLines.length > 0;

  return (
    <ExposureExplorerClient
      ecId={params.id}
      baselineRecords={records}
      poLines={purchaseData.poLines}
      purchaseOrders={purchaseData.purchaseOrders}
      suppliers={purchaseData.suppliers}
      crosswalks={relevantCrosswalks}
      canExplore={canExplore}
    />
  );
}

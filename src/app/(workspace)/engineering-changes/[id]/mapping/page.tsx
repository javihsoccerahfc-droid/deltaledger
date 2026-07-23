import {
  getBomStateAction,
  getCrosswalksAction,
  getPurchaseDataAction,
  getAllocationRulesForCrosswalksAction,
} from "@/app/actions";
import { MappingClient } from "@/components/mapping/MappingClient";

export default async function MappingPage({ params }: { params: { id: string } }) {
  const [bomState, allCrosswalks, purchaseData] = await Promise.all([
    getBomStateAction(params.id),
    getCrosswalksAction(),
    getPurchaseDataAction(params.id),
  ]);

  const eligiblePartIds = bomState.diff
    .filter((d) => d.changeType === "removed" || d.changeType === "qty_reduced" || d.changeType === "replaced")
    .map((d) => d.partId.toUpperCase());
  const relevantCrosswalks = allCrosswalks.filter((c) => eligiblePartIds.includes(c.plmPartId.toUpperCase()));
  const allocationRules = await getAllocationRulesForCrosswalksAction(relevantCrosswalks.map((c) => c.id));

  return (
    <MappingClient
      ecId={params.id}
      crosswalks={relevantCrosswalks}
      allocationRules={allocationRules}
      eligiblePartIds={eligiblePartIds}
      poLinePartNumbers={purchaseData.poLines.map((l) => l.rawPartNumber)}
    />
  );
}

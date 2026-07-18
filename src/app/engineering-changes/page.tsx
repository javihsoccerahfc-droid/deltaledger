import { listEngineeringChangesAction, getBomStateAction, getActiveExposureRecordsAction, getCrosswalksAction } from "@/app/actions";
import { EcListClient } from "@/components/ec/EcListClient";

export const dynamic = "force-dynamic";

export default async function EngineeringChangeListPage() {
  const ecs = await listEngineeringChangesAction();
  const allCrosswalks = await getCrosswalksAction();

  const rows = await Promise.all(
    ecs.map(async (ec) => {
      const [bomState, exposureRecords] = await Promise.all([getBomStateAction(ec.id), getActiveExposureRecordsAction(ec.id)]);
      const eligiblePartIds = bomState.diff
        .filter((d) => d.changeType === "removed" || d.changeType === "qty_reduced" || d.changeType === "replaced")
        .map((d) => d.partId.toUpperCase());
      const pendingMappings = allCrosswalks.filter(
        (c) => c.reviewStatus === "unreviewed" && eligiblePartIds.includes(c.plmPartId.toUpperCase())
      ).length;
      const known = exposureRecords.filter((r) => r.confidenceClassification === "known");
      const estimated = exposureRecords.filter((r) => r.confidenceClassification === "estimated");
      return {
        ec,
        knownTotal: known.reduce((s, r) => s + r.netExposureValueReporting, 0),
        estTotal: estimated.reduce((s, r) => s + r.netExposureValueReporting, 0),
        gapCount: 0,
        pendingMappings,
      };
    })
  );

  return <EcListClient rows={rows} />;
}

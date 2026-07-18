import Link from "next/link";
import {
  getEngineeringChangeAction,
  getBomStateAction,
  getPurchaseDataAction,
  getCrosswalksAction,
  getActiveExposureRecordsAction,
  getFinancialOutcomesAction,
} from "@/app/actions";
import { EcStepper } from "@/components/layout/EcStepper";
import { EmptyState } from "@/components/shared/States";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export default async function EcLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  const ec = await getEngineeringChangeAction(params.id);

  if (!ec) {
    return (
      <div className="-mx-6 -mt-8">
        <div className="border-b border-line bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-ink">Engineering change not found</h1>
        </div>
        <div className="px-6 py-8">
          <EmptyState title="Nothing here" body="This engineering change doesn't exist in the database." />
        </div>
      </div>
    );
  }

  const [bomState, purchaseData, crosswalks, exposureRecords, outcomes] = await Promise.all([
    getBomStateAction(ec.id),
    getPurchaseDataAction(ec.id),
    getCrosswalksAction(),
    getActiveExposureRecordsAction(ec.id),
    getFinancialOutcomesAction(),
  ]);

  const eligiblePartIds = bomState.diff
    .filter((d) => d.changeType === "removed" || d.changeType === "qty_reduced" || d.changeType === "replaced")
    .map((d) => d.partId.toUpperCase());
  const relevantCrosswalks = crosswalks.filter((c) => eligiblePartIds.includes(c.plmPartId.toUpperCase()));

  const known = exposureRecords.filter((r) => r.confidenceClassification === "known");
  const estimated = exposureRecords.filter((r) => r.confidenceClassification === "estimated");
  const knownTotal = known.reduce((s, r) => s + r.netExposureValueReporting, 0);
  const estTotal = estimated.reduce((s, r) => s + r.netExposureValueReporting, 0);

  const relevantOutcomes = outcomes.filter((o) => exposureRecords.some((r) => r.id === o.exposureRecordId));

  return (
    <div className="-mx-6 -mt-8">
      <div className="border-b border-line bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href="/engineering-changes" className="text-xs font-medium text-ink-soft hover:text-accent">
              ← All engineering changes
            </Link>
            <h1 className="mt-1 truncate text-lg font-semibold text-ink">{ec.name}</h1>
            <p className="mt-0.5 max-w-2xl text-xs text-ink-soft">{ec.description}</p>
          </div>
          {(known.length > 0 || estimated.length > 0) && (
            <div className="flex shrink-0 gap-5 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-soft">Known exposure</p>
                <p className="data-num text-base font-semibold text-status-success">{money(knownTotal)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-soft">Estimated</p>
                <p className="data-num text-base font-semibold text-status-warning">{money(estTotal)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <EcStepper
        ecId={ec.id}
        completion={{
          bomComplete: bomState.diff.length > 0,
          poComplete: purchaseData.poLines.length > 0,
          mappingComplete: relevantCrosswalks.length > 0 && relevantCrosswalks.every((c) => c.reviewStatus !== "unreviewed"),
          mappingPending: relevantCrosswalks.filter((c) => c.reviewStatus === "unreviewed").length,
          exposureComplete: exposureRecords.length > 0,
          altDemandPending: 0,
          mitigationComplete:
            exposureRecords.length > 0 &&
            exposureRecords.every((r) => relevantOutcomes.some((o) => o.exposureRecordId === r.id && o.closedAt)),
          mitigationPending: exposureRecords.filter((r) => !relevantOutcomes.some((o) => o.exposureRecordId === r.id && o.closedAt))
            .length,
        }}
      />
      <div className="px-6 py-8">{children}</div>
    </div>
  );
}

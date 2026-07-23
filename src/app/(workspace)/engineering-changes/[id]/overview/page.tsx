import { getEcWorkspaceSummaryAction } from "@/app/actions";
import { DecisionReadiness } from "@/components/overview/DecisionReadiness";
import { EvidenceCoverageBar } from "@/components/design-system/EvidenceCoverageBar";
import { Card, CardBody } from "@/components/design-system/Card";

export default async function OverviewPage({ params }: { params: { id: string } }) {
  const summary = await getEcWorkspaceSummaryAction(params.id);

  return (
    <div className="space-y-6">
      <DecisionReadiness readiness={summary.readiness} nextAction={summary.nextAction} coverage={summary.coverage} />

      {summary.coverage.grandTotal > 0 && (
        <Card>
          <CardBody>
            {/*
              Deliberately the FULL variant here (bar + dollar legend + counts) -- this is the
              one place in the workspace that explains the number, not just restates it. No
              separate "Evidence Coverage" section heading above it: EvidenceCoverageBar's own
              internal label already says that, and a CardHeader repeating the identical words
              immediately above it was exactly the kind of redundancy this milestone exists to
              remove (see the Phase 6D Product Identity Review).
            */}
            <EvidenceCoverageBar coverage={summary.coverage} variant="full" />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

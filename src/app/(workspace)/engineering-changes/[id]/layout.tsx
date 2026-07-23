import Link from "next/link";
import { getEngineeringChangeAction, getEcWorkspaceSummaryAction } from "@/app/actions";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { ContextBar } from "@/components/design-system/ContextBar";
import { EmptyState } from "@/components/shared/States";

export default async function EcLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  const ec = await getEngineeringChangeAction(params.id);

  if (!ec) {
    return (
      <div className="-mx-6 -mt-8">
        <div className="border-b border-line bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-ink">Engineering change not found</h1>
        </div>
        <div className="px-6 py-8">
          <EmptyState
            title="Nothing to show here"
            body="This engineering change doesn't exist, or may have been created in a different session. Check the link, or go back to the Portfolio to find the one you're looking for."
          />
          <Link href="/engineering-changes" className="mt-4 inline-block text-sm font-medium text-accent hover:text-accent-deep">
            ← Back to the Portfolio
          </Link>
        </div>
      </div>
    );
  }

  // Single fetch + derivation point for everything the persistent shell needs -- see
  // getEcWorkspaceSummaryAction and src/domains/deltaledger/workspaceSummary.ts. Individual
  // tab pages should build on this context (via their own, narrower fetches for what's
  // specific to them), not repeat the totals already shown here.
  const summary = await getEcWorkspaceSummaryAction(ec.id);

  return (
    <div className="-mx-6 -mt-8">
      <ContextBar
        ecId={ec.id}
        name={ec.name}
        description={ec.description}
        coverage={summary.coverage}
        lastActivity={summary.lastActivity}
        nextAction={summary.nextAction}
        readinessStatus={summary.readiness.status}
        isReadOnly={ec.isReadOnly}
      />
      <WorkspaceTabs ecId={ec.id} completion={summary.completion} staleReasonCode={summary.readiness.primaryReasonCode} />
      <div className="px-6 py-8">{children}</div>
    </div>
  );
}

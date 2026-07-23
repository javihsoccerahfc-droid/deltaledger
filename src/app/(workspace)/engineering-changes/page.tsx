import { getPortfolioSummaryAction } from "@/app/actions";
import { EcListClient } from "@/components/ec/EcListClient";
import { Hero, HeroBreakdown } from "@/components/design-system/Hero";
import { AttentionList } from "@/components/portfolio/AttentionList";
import { LargestExposureList } from "@/components/portfolio/LargestExposureList";
import { SupplierConcentrationList } from "@/components/portfolio/SupplierConcentrationList";
import { RecentActivity } from "@/components/portfolio/RecentActivity";
import { formatMoney } from "@/lib/format";
import { getTimeAwareGreeting } from "@/lib/greeting";

export const dynamic = "force-dynamic";

/**
 * The Portfolio Command Center -- per explicit product direction, this is the homepage of
 * DeltaLedger, not "a dashboard." A VP opening this page should be able to decide where to
 * spend their day from this page alone. The existing sortable all-ECs table (EcListClient)
 * is retained below the fold for anyone who wants to browse everything, but it is
 * deliberately no longer the primary content of this page.
 *
 * Phase 6D -- the one thing to understand within three seconds of opening this page: how
 * much is currently at risk across the whole portfolio, its known/estimated/unresolved
 * composition, and the single highest-priority thing to do about it right now. Everything
 * else on the page (the attention list, largest exposure, supplier concentration, recent
 * activity, the full EC table) is real, useful supporting detail -- but it is not what the
 * eye should land on first, so none of it competes with the Hero for that role.
 */
export default async function EngineeringChangeListPage() {
  const summary = await getPortfolioSummaryAction();
  const greeting = getTimeAwareGreeting();
  const topPriority = summary.attentionItems[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{greeting}.</h1>
      </div>

      <Hero
        eyebrow="PORTFOLIO"
        value={formatMoney(summary.metrics.totalExposure)}
        tone={summary.metrics.needsActionCount > 0 ? "warning" : "success"}
        supporting={
          <div className="space-y-3">
            <HeroBreakdown
              knownTotal={summary.metrics.knownTotal}
              estimatedTotal={summary.metrics.estimatedTotal}
              unresolvedCount={summary.metrics.unresolvedCount}
              unresolvedLabel="record"
            />
            <p>
              {summary.metrics.totalOpenEcs} open engineering change{summary.metrics.totalOpenEcs === 1 ? "" : "s"}
              {summary.metrics.needsActionCount > 0
                ? ` — ${summary.metrics.needsActionCount} need${summary.metrics.needsActionCount === 1 ? "s" : ""} action today.`
                : " — all caught up."}
            </p>
          </div>
        }
        action={
          topPriority ? (
            <a
              href={`/engineering-changes/${topPriority.ecId}/${topPriority.ctaTab}`}
              className="whitespace-nowrap rounded-sm bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              {topPriority.ctaLabel} →
            </a>
          ) : undefined
        }
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Needs Attention Today</h2>
        <AttentionList items={summary.attentionItems} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LargestExposureList entries={summary.largestExposure} />
        <SupplierConcentrationList entries={summary.supplierConcentration} />
      </div>

      <RecentActivity entries={summary.recentActivity} />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">All Engineering Changes</h2>
        <EcListClient rows={summary.ecListRows} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { Card } from "@/components/design-system/Card";
import type { AttentionItem } from "@/domains/deltaledger/portfolioSummary";

const URGENCY_DOT: Record<AttentionItem["urgency"], string> = {
  not_ready: "bg-status-critical",
  needs_attention: "bg-status-warning",
};

/**
 * The single most important section on the homepage, per the instruction that this page
 * should be the only one a VP needs to decide where to spend their day: every row here is a
 * specific engineering change, a specific reason it needs a human, and a specific next
 * action -- never a generic "view" link. Blocking issues (urgency: not_ready) are always
 * listed before advisory ones (needs_attention), per the ordering already established in
 * getPortfolioAttentionItems.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="px-4 py-6 text-center">
        <p className="text-sm text-ink-soft">Nothing needs attention right now -- every open engineering change is ready for review.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ul>
        {items.map((item, idx) => (
          <li
            key={item.ecId}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${idx < items.length - 1 ? "border-b border-line" : ""}`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${URGENCY_DOT[item.urgency]}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{item.ecName}</p>
                <p className="text-xs text-ink-soft">{item.reasonLabel}</p>
              </div>
            </div>
            <Link
              href={`/engineering-changes/${item.ecId}/${item.ctaTab}`}
              className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent"
            >
              {item.ctaLabel}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

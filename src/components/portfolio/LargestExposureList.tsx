import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/design-system/Card";
import { formatMoney } from "@/lib/format";
import type { EcPortfolioEntry } from "@/domains/deltaledger/portfolioSummary";

export function LargestExposureList({ entries }: { entries: EcPortfolioEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-ink">Largest Financial Exposure</h2>
      </CardHeader>
      <CardBody className="px-0 py-0">
        {entries.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-soft">No exposure calculated yet across any open engineering change.</p>
        ) : (
          <ol>
            {entries.map((entry, idx) => (
              <li
                key={entry.ecId}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${idx < entries.length - 1 ? "border-b border-line" : ""}`}
              >
                <Link
                  href={`/engineering-changes/${entry.ecId}/exposure`}
                  className="min-w-0 truncate text-sm text-ink hover:text-accent hover:underline"
                >
                  {idx + 1}. {entry.ecName}
                </Link>
                <span className="data-num shrink-0 text-sm font-semibold text-ink">{formatMoney(entry.coverage.grandTotal)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

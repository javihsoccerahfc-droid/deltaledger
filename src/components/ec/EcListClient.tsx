"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/shared/States";
import { Button } from "@/components/design-system/Button";
import { seedSampleDataAction } from "@/app/sampleDataAction";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

type Row = {
  ec: { id: string; name: string; description: string; status: string; createdAt: string };
  knownTotal: number;
  estTotal: number;
  gapCount: number;
  pendingMappings: number;
};

type SortKey = "name" | "known" | "estimated" | "created";

export function EcListClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = rows.filter(
    (r) => r.ec.name.toLowerCase().includes(query.toLowerCase()) || r.ec.description.toLowerCase().includes(query.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.ec.name.localeCompare(b.ec.name);
    if (sortKey === "known") cmp = a.knownTotal - b.knownTotal;
    if (sortKey === "estimated") cmp = a.estTotal - b.estTotal;
    if (sortKey === "created") cmp = new Date(a.ec.createdAt).getTime() - new Date(b.ec.createdAt).getTime();
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const portfolioKnown = rows.reduce((s, r) => s + r.knownTotal, 0);
  const portfolioEstimated = rows.reduce((s, r) => s + r.estTotal, 0);
  const portfolioPendingMappings = rows.reduce((s, r) => s + r.pendingMappings, 0);

  function handleLoadSample() {
    startTransition(async () => {
      const ecId = await seedSampleDataAction();
      router.push(`/engineering-changes/${ecId}/overview`);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2">
        {rows.length === 0 && (
          <Button variant="outline" size="sm" onClick={handleLoadSample} disabled={isPending}>
            {isPending ? "Loading…" : "Load sample engineering change"}
          </Button>
        )}
        <Link href="/engineering-changes/new" className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-deep">
          + New engineering change
        </Link>
      </div>

      {rows.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Known exposure (net)" value={money(portfolioKnown)} tone="success" />
          <KpiCard label="Estimated exposure (net)" value={money(portfolioEstimated)} tone="warning" />
          <KpiCard
            label="Mappings needing approval"
            value={String(portfolioPendingMappings)}
            tone={portfolioPendingMappings > 0 ? "warning" : "neutral"}
          />
          <KpiCard label="Engineering changes" value={String(rows.length)} tone="neutral" />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search engineering changes…"
            className="w-full max-w-sm rounded-sm border border-line bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:w-80"
          />
        </div>
      )}

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No engineering changes yet"
            body="Load the sample scenario to see the full product in action immediately, or create your own to start importing BOMs, calculating exposure, and tracking mitigation."
          />
        ) : sorted.length === 0 ? (
          <EmptyState title="No matches" body="Try a different search term." />
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <Th label="Name" sortKeyName="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <Th label="Known exposure" sortKeyName="known" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <Th label="Estimated exposure" sortKeyName="estimated" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <th className="px-4 py-2.5 font-medium">Attention needed</th>
                  <Th label="Created" sortKeyName="created" current={sortKey} dir={sortDir} onClick={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.ec.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <Link href={`/engineering-changes/${row.ec.id}/overview`} className="font-medium text-accent hover:underline">
                        {row.ec.name}
                      </Link>
                      <p className="mt-0.5 max-w-md truncate text-xs text-ink-soft">{row.ec.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-sm border border-line bg-paper px-2 py-0.5 text-xs capitalize">
                        {row.ec.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="data-num px-4 py-3 text-right text-status-success">{money(row.knownTotal)}</td>
                    <td className="data-num px-4 py-3 text-right text-status-warning">{money(row.estTotal)}</td>
                    <td className="px-4 py-3">
                      {row.pendingMappings === 0 ? (
                        <span className="text-xs text-ink-soft">—</span>
                      ) : (
                        <span className="rounded-sm bg-status-warningBg px-1.5 py-0.5 text-[11px] font-medium text-status-warning">
                          {row.pendingMappings} mapping{row.pendingMappings !== 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft">{new Date(row.ec.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "critical" | "neutral" }) {
  const toneStyles: Record<string, string> = {
    success: "text-status-success",
    warning: "text-status-warning",
    critical: "text-status-critical",
    neutral: "text-ink",
  };
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`data-num mt-1 text-xl font-semibold ${toneStyles[tone]}`}>{value}</p>
    </div>
  );
}

function Th({
  label,
  sortKeyName,
  current,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKeyName: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKeyName;
  return (
    <th
      onClick={() => onClick(sortKeyName)}
      className={`cursor-pointer select-none px-4 py-2.5 font-medium hover:text-ink ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

import type { ExposureConfidence } from "../types";

/**
 * Phase 6C -- Decision Storytelling. The single canonical place the Exposure page's headline
 * conclusion is assembled, so the narrative is deterministic and unit-testable rather than
 * free-form text built inline in a component. Every number here is a direct sum of
 * already-persisted ExposureRecord values -- this function computes no new financial figures,
 * it only describes ones that already exist.
 *
 * Deliberately does NOT claim a trend ("up $40,000 since last calculation"). A trustworthy
 * trend claim requires a prior calculation over the exact same scope and assumptions -- and
 * DeltaLedger doesn't retain that as a structured, comparable fact today (the audit log's
 * "$X -> $Y" sentence is generated once, at calculation time, for that specific recalculation
 * event; it isn't a durable, re-derivable comparison available on every later page load, and
 * scope can legitimately change between calculations -- a newly eligible part, a resolved
 * gap -- in ways that make a bare total-to-total delta misleading). Until a genuine
 * scope-matched comparison is modeled, this only ever describes the CURRENT state.
 */

export interface ExposureNarrativeRecord {
  partId: string;
  supplierName: string;
  netExposureValueReporting: number;
  confidenceClassification: ExposureConfidence;
}

export interface ExposureNarrative {
  totalNet: number;
  knownTotal: number;
  estimatedTotal: number;
  /** Always 0 in real data -- unresolved records carry $0 net exposure by construction (see calculateExposure.ts). Kept for completeness, never displayed as a dollar figure. */
  unresolvedTotal: number;
  unresolvedCount: number;
  partCount: number;
  supplierCount: number;
  /** Up to 3 suppliers with the largest net exposure, descending. */
  topSuppliers: { name: string; total: number }[];
  /** The headline conclusion -- current state and confidence composition, never a trend claim. */
  headline: string;
  /** A secondary, supporting sentence naming the affected scope (suppliers/parts). */
  scopeLine: string;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function summarizeExposureNarrative(records: ExposureNarrativeRecord[]): ExposureNarrative | null {
  if (records.length === 0) return null;

  const totalNet = records.reduce((s, r) => s + r.netExposureValueReporting, 0);
  const knownTotal = records.filter((r) => r.confidenceClassification === "known").reduce((s, r) => s + r.netExposureValueReporting, 0);
  const estimatedTotal = records
    .filter((r) => r.confidenceClassification === "estimated")
    .reduce((s, r) => s + r.netExposureValueReporting, 0);
  const unresolvedTotal = records
    .filter((r) => r.confidenceClassification === "unresolved")
    .reduce((s, r) => s + r.netExposureValueReporting, 0);
  const unresolvedCount = records.filter((r) => r.confidenceClassification === "unresolved").length;

  const partCount = new Set(records.map((r) => r.partId)).size;
  const supplierTotals = new Map<string, number>();
  for (const r of records) supplierTotals.set(r.supplierName, (supplierTotals.get(r.supplierName) ?? 0) + r.netExposureValueReporting);
  const topSuppliers = [...supplierTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, total]) => ({ name, total }));
  const supplierCount = supplierTotals.size;

  const supplierPhrase = supplierCount === 1 ? `supplier ${topSuppliers[0].name}` : `${supplierCount} suppliers`;

  // Known/estimated are described by their real dollar totals. Unresolved is described by
  // COUNT, never a dollar figure -- a genuinely unresolved record carries $0 net exposure by
  // construction (see calculateExposure.ts), so "$0 unresolved" would be true but misleading;
  // "2 records not yet determinable" is the honest version of the same fact.
  const dollarBuckets: { label: "known" | "estimated"; total: number }[] = (
    [
      { label: "known", total: knownTotal },
      { label: "estimated", total: estimatedTotal },
    ] as { label: "known" | "estimated"; total: number }[]
  ).filter((b) => b.total > 0);

  const bucketPhrases = dollarBuckets.map((b) => `${money(b.total)} ${b.label}`);
  if (unresolvedCount > 0) {
    bucketPhrases.push(`${unresolvedCount} record${unresolvedCount === 1 ? "" : "s"} not yet determinable`);
  }

  const headline =
    dollarBuckets.length > 1 || (dollarBuckets.length === 1 && unresolvedCount > 0)
      ? `${money(totalNet)} of total exposure across ${supplierPhrase}: ${joinWithAnd(bucketPhrases)}.`
      : dollarBuckets.length === 1
        ? `${money(totalNet)} of ${dollarBuckets[0].label} exposure across ${supplierPhrase}.`
        : `${unresolvedCount} exposure record${unresolvedCount === 1 ? "" : "s"} across ${supplierPhrase}, none yet determinable.`;

  const scopeLine = `Affects ${partCount} part${partCount === 1 ? "" : "s"} across ${supplierCount} supplier${supplierCount === 1 ? "" : "s"}.`;

  return { totalNet, knownTotal, estimatedTotal, unresolvedTotal, unresolvedCount, partCount, supplierCount, topSuppliers, headline, scopeLine };
}

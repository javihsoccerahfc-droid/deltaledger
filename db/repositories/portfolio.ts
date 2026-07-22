import { db } from "../client";
import { exposureRecords, purchaseOrderLines, purchaseOrders, suppliers, auditLogEntries } from "../schema";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import { getOrCreateDefaultOrganization } from "./organizations";

/**
 * Cross-engineering-change supplier exposure concentration -- "which suppliers show up
 * across our open changes, and how much money is riding on them." This is a genuinely new
 * aggregation (flagged as a real gap in the earlier Product Readiness Audit: "no cross-EC
 * supplier risk rollup exists today"), not a restyled existing query. Deliberately computed
 * at read-time over current data rather than a materialized/cached table -- at today's data
 * volumes that's simpler and can't drift out of sync; revisit only if a real customer's data
 * volume ever makes this slow (see the V2 architecture review's stance on this same tradeoff).
 */
export async function getSupplierExposureConcentration(): Promise<
  { supplierId: string; supplierName: string; totalExposure: number; engineeringChangeCount: number }[]
> {
  const activeRecords = await db.select().from(exposureRecords).where(isNull(exposureRecords.supersededById));
  if (activeRecords.length === 0) return [];

  const lineIds = activeRecords.map((r) => r.purchaseOrderLineId);
  const lines = await db.select().from(purchaseOrderLines).where(inArray(purchaseOrderLines.id, lineIds));
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const poIds = Array.from(new Set(lines.map((l) => l.purchaseOrderId)));
  const pos = poIds.length > 0 ? await db.select().from(purchaseOrders).where(inArray(purchaseOrders.id, poIds)) : [];
  const poById = new Map(pos.map((p) => [p.id, p]));

  const supplierIds = Array.from(new Set(pos.map((p) => p.supplierId)));
  const supplierRows = supplierIds.length > 0 ? await db.select().from(suppliers).where(inArray(suppliers.id, supplierIds)) : [];
  const supplierById = new Map(supplierRows.map((s) => [s.id, s]));

  const bySupplier = new Map<string, { totalExposure: number; ecIds: Set<string> }>();
  for (const record of activeRecords) {
    const line = lineById.get(record.purchaseOrderLineId);
    const po = line ? poById.get(line.purchaseOrderId) : undefined;
    if (!po) continue; // orphaned/legacy data with no resolvable PO -- excluded, not guessed at
    const entry = bySupplier.get(po.supplierId) ?? { totalExposure: 0, ecIds: new Set<string>() };
    entry.totalExposure += record.netExposureValueReporting;
    entry.ecIds.add(record.engineeringChangeId);
    bySupplier.set(po.supplierId, entry);
  }

  return Array.from(bySupplier.entries())
    .map(([supplierId, entry]) => ({
      supplierId,
      supplierName: supplierById.get(supplierId)?.name ?? "Unknown supplier",
      totalExposure: entry.totalExposure,
      engineeringChangeCount: entry.ecIds.size,
    }))
    .sort((a, b) => b.totalExposure - a.totalExposure);
}

/** Org-wide recent activity, across every engineering change -- not scoped to one EC. */
export async function getRecentPortfolioActivity(limit: number) {
  const org = await getOrCreateDefaultOrganization();
  return db
    .select()
    .from(auditLogEntries)
    .where(and(eq(auditLogEntries.organizationId, org.id)))
    .orderBy(desc(auditLogEntries.timestamp))
    .limit(limit);
}

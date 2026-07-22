import { db } from "../client";
import {
  suppliers,
  purchaseOrders,
  purchaseOrderLines,
  purchaseOrderImports,
  supplierCommitmentTerms,
  exchangeRateSnapshots,
} from "../schema";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getOrCreateDefaultOrganization } from "./organizations";
import type { RawTable } from "@/core/ingestion/types";
import { ingestPurchaseOrderFile } from "@/appLayer/ingestPurchaseOrder";

/**
 * P0 remediation -- PO re-import supersession. A single "Open PO Import" upload creates many
 * rows across suppliers/purchaseOrders/purchaseOrderLines at once; there was previously no
 * row anywhere representing "this upload, as a whole," so a re-import could only ever ADD
 * more rows on top of whatever existed, doubling (or worse) exposure calculation inputs.
 * purchaseOrderImports now represents one upload event as a unit; a new upload supersedes the
 * ENTIRE previous batch for the EC (not a PO-number-by-PO-number merge/diff, which would be a
 * much larger and more ambiguous piece of business logic than this remediation's scope).
 *
 * Write ordering and concurrency safety mirror db/repositories/bom.ts's saveBomImport() --
 * see that function's comment for the full rationale (pre-generated id, supersede-before-
 * insert ordering, transaction-scoped advisory lock keyed to engineeringChangeId since
 * SELECT...FOR UPDATE alone cannot serialize two concurrent FIRST imports for an EC that has
 * no prior batch at all). The partial unique index on purchase_order_imports
 * (engineering_change_id) WHERE superseded_by_id IS NULL is the final database-enforced
 * invariant: at most one active batch per EC.
 *
 * Supplier resolution (dedup by name within the org) is unchanged and correct -- it is not
 * part of the batch concept, since suppliers are a genuinely org-wide, cross-EC entity.
 */
export async function savePurchaseOrderImport(ecId: string, table: RawTable, sourceFileName: string, importedBy: string) {
  const org = await getOrCreateDefaultOrganization();
  const ingested = ingestPurchaseOrderFile(table, sourceFileName, new Date().toISOString());

  return db.transaction(async (tx) => {
    // Step 0: serialize all writers for this EC's PO-import slot.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('po_import'), hashtext(${ecId}))`);

    // Step 1: generate the new batch's identity before any write.
    const newBatchId = createId();

    // Step 2: find the current active batch for this EC, if any.
    const [oldActiveBatch] = await tx
      .select({ id: purchaseOrderImports.id })
      .from(purchaseOrderImports)
      .where(and(eq(purchaseOrderImports.engineeringChangeId, ecId), isNull(purchaseOrderImports.supersededById)))
      .for("update");

    // Step 3: supersede the old batch FIRST -- before the new batch exists, so the count of
    // rows satisfying (ecId, superseded_by_id IS NULL) never exceeds one.
    if (oldActiveBatch) {
      await tx.update(purchaseOrderImports).set({ supersededById: newBatchId }).where(eq(purchaseOrderImports.id, oldActiveBatch.id));
    }

    // Step 4: insert the new batch using the pre-generated id.
    await tx.insert(purchaseOrderImports).values({
      id: newBatchId,
      engineeringChangeId: ecId,
      sourceFile: sourceFileName,
      importedBy,
      supersededById: null,
    });

    const supplierIdByName = new Map<string, string>();
    for (const s of ingested.suppliers) {
      const existing = await tx
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.organizationId, org.id), eq(suppliers.name, s.name)))
        .limit(1);
      if (existing[0]) {
        supplierIdByName.set(s.name, existing[0].id);
      } else {
        const [created] = await tx
          .insert(suppliers)
          .values({
            organizationId: org.id,
            name: s.name,
            erpSupplierId: s.erpSupplierId,
            defaultCancellationTermsNotes: s.defaultCancellationTermsNotes,
          })
          .returning();
        supplierIdByName.set(s.name, created.id);
      }
    }

    const poIdByNumber = new Map<string, string>();
    for (const po of ingested.purchaseOrders) {
      const originalSupplier = ingested.suppliers.find((s) => s.id === po.supplierId);
      const resolvedSupplierId = supplierIdByName.get(originalSupplier?.name ?? "") ?? po.supplierId;
      const [created] = await tx
        .insert(purchaseOrders)
        .values({
          organizationId: org.id,
          engineeringChangeId: ecId,
          purchaseOrderImportId: newBatchId,
          poNumber: po.poNumber,
          supplierId: resolvedSupplierId,
          sourceFile: po.sourceFile,
          importedAt: po.importedAt,
        })
        .returning();
      poIdByNumber.set(po.poNumber, created.id);
    }

    if (ingested.lines.length > 0) {
      await tx.insert(purchaseOrderLines).values(
        ingested.lines.map((l) => {
          const originalPo = ingested.purchaseOrders.find((p) => p.id === l.purchaseOrderId);
          const resolvedPoId = poIdByNumber.get(originalPo?.poNumber ?? "") ?? l.purchaseOrderId;
          return {
            id: l.id,
            purchaseOrderId: resolvedPoId,
            partId: l.partId,
            rawPartNumber: l.rawPartNumber,
            quantityOpen: l.quantityOpen,
            quantityParseStatus: l.quantityParseStatus,
            transactionCurrency: l.transactionCurrency,
            unitPriceTransactionCurrency: l.unitPriceTransactionCurrency,
            priceParseStatus: l.priceParseStatus,
            promisedReceiptDate: l.promisedReceiptDate,
            lineStatus: l.lineStatus,
            sourceRow: l.sourceRow,
            sourceRowIsReconstructed: false, // authentic -- computed directly from this upload
          };
        })
      );
    }

    return { supplierCount: supplierIdByName.size, poCount: poIdByNumber.size, lineCount: ingested.lines.length };
  });
}

/** The EC's currently active PO import batch id, or null if none exists yet. */
export async function getActivePurchaseOrderImportId(ecId: string): Promise<string | null> {
  const [active] = await db
    .select({ id: purchaseOrderImports.id })
    .from(purchaseOrderImports)
    .where(and(eq(purchaseOrderImports.engineeringChangeId, ecId), isNull(purchaseOrderImports.supersededById)))
    .orderBy(desc(purchaseOrderImports.createdAt), desc(purchaseOrderImports.id))
    .limit(1);
  return active?.id ?? null;
}

export async function getPurchaseOrderById(id: string) {
  const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  return row ?? null;
}

export async function getSupplierById(id: string) {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return row ?? null;
}

/**
 * Reads only the active batch's data -- a superseded batch's suppliers/POs/lines remain in
 * the database permanently (never deleted, consistent with this codebase's supersede-don't-
 * destroy philosophy elsewhere), but are excluded from "current state" reads like this one.
 */
export async function getPurchaseDataForEc(ecId: string) {
  const activeBatchId = await getActivePurchaseOrderImportId(ecId);
  if (!activeBatchId) return { purchaseOrders: [], poLines: [], suppliers: [] };

  const pos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.purchaseOrderImportId, activeBatchId));
  const poIds = pos.map((p) => p.id);
  const lines = poIds.length > 0 ? await db.select().from(purchaseOrderLines).where(inArray(purchaseOrderLines.purchaseOrderId, poIds)) : [];
  const supplierIds = Array.from(new Set(pos.map((p) => p.supplierId)));
  const supplierRows =
    supplierIds.length > 0 ? await db.select().from(suppliers).where(inArray(suppliers.id, supplierIds)) : [];
  return { purchaseOrders: pos, poLines: lines, suppliers: supplierRows };
}

/** Versioned: never updates a past terms row, always inserts a new one and supersedes the old. */
export async function addSupplierTerms(
  supplierId: string,
  terms: {
    partId: string | null;
    ncnr: boolean;
    standardLeadTimeDays: number | null;
    cancellationWindowDays: number | null;
    source: "verified_contract" | "supplier_provided" | "unconfirmed";
    effectiveDate: string;
    notes: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
    validUntil: string | null;
  }
) {
  const [created] = await db.insert(supplierCommitmentTerms).values({ supplierId, ...terms }).returning();

  const priorActive = await db
    .select()
    .from(supplierCommitmentTerms)
    .where(and(eq(supplierCommitmentTerms.supplierId, supplierId), isNull(supplierCommitmentTerms.supersededById)));
  for (const prior of priorActive) {
    if (prior.id !== created.id && prior.partId === terms.partId) {
      await db
        .update(supplierCommitmentTerms)
        .set({ supersededById: created.id })
        .where(eq(supplierCommitmentTerms.id, prior.id));
    }
  }
  return created;
}

export async function getActiveSupplierTerms(supplierId: string) {
  return db
    .select()
    .from(supplierCommitmentTerms)
    .where(and(eq(supplierCommitmentTerms.supplierId, supplierId), isNull(supplierCommitmentTerms.supersededById)));
}

export async function addExchangeRate(rate: {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
  source: string;
  enteredBy: string;
}) {
  const org = await getOrCreateDefaultOrganization();
  const [created] = await db
    .insert(exchangeRateSnapshots)
    .values({ organizationId: org.id, enteredAt: new Date().toISOString(), ...rate })
    .returning();
  return created;
}

export async function getExchangeRates() {
  const org = await getOrCreateDefaultOrganization();
  return db.select().from(exchangeRateSnapshots).where(eq(exchangeRateSnapshots.organizationId, org.id));
}

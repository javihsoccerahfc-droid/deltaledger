import { db } from "../client";
import { suppliers, purchaseOrders, purchaseOrderLines, supplierCommitmentTerms, exchangeRateSnapshots } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { getOrCreateDefaultOrganization } from "./organizations";
import type { RawTable } from "@/core/ingestion/types";
import { ingestPurchaseOrderFile } from "@/appLayer/ingestPurchaseOrder";

/**
 * A PO import resolves/creates suppliers, then purchase orders, then purchase order lines --
 * three dependent write phases that must succeed or fail together (see saveBomImport for the
 * same rationale). Wrapped in db.transaction so a failure partway through never leaves, e.g.,
 * newly created supplier/PO rows with no lines attached.
 */
export async function savePurchaseOrderImport(ecId: string, table: RawTable, sourceFileName: string) {
  const org = await getOrCreateDefaultOrganization();
  const ingested = ingestPurchaseOrderFile(table, sourceFileName, new Date().toISOString());

  return db.transaction(async (tx) => {
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
          };
        })
      );
    }

    return { supplierCount: supplierIdByName.size, poCount: poIdByNumber.size, lineCount: ingested.lines.length };
  });
}

export async function getPurchaseDataForEc(ecId: string) {
  const pos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.engineeringChangeId, ecId));
  const lines = [];
  for (const po of pos) {
    const poLines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, po.id));
    lines.push(...poLines);
  }
  const supplierIds = Array.from(new Set(pos.map((p) => p.supplierId)));
  const supplierRows = [];
  for (const sid of supplierIds) {
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, sid)).limit(1);
    if (s) supplierRows.push(s);
  }
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

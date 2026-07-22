import { eq, and, isNull } from "drizzle-orm";
import { db } from "../client";
import {
  bomDiffEntries,
  purchaseOrders,
  purchaseOrderLines,
  partNumberCrosswalks,
  crosswalkAllocationRules,
  supplierCommitmentTerms,
  exchangeRateSnapshots,
  exposureSourceSnapshots,
  exposureRecords,
} from "../schema";
import { runExposurePipeline, ExposurePipelineDataset } from "@/domains/deltaledger/exposure/exposurePipeline";
import type {
  BomDiffEntry,
  PurchaseOrderLine,
  PartNumberCrosswalk,
  SupplierCommitmentTerms,
  ExchangeRateSnapshot,
} from "@/domains/deltaledger/types";
import { getActiveAllocationsForExposureRecord } from "./alternateDemand";
import { getActivePurchaseOrderImportId } from "./purchaseOrders";

const FORMULA_VERSION = "v1";
const REPORTING_CURRENCY = "USD";
const EXPOSURE_ELIGIBLE_CHANGE_TYPES: BomDiffEntry["changeType"][] = ["removed", "qty_reduced", "replaced"];

function toDomainPoLine(row: typeof purchaseOrderLines.$inferSelect): PurchaseOrderLine {
  return {
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    partId: row.partId,
    rawPartNumber: row.rawPartNumber,
    quantityOpen: row.quantityOpen,
    quantityParseStatus: row.quantityParseStatus,
    transactionCurrency: row.transactionCurrency,
    unitPriceTransactionCurrency: row.unitPriceTransactionCurrency,
    priceParseStatus: row.priceParseStatus,
    promisedReceiptDate: row.promisedReceiptDate,
    lineStatus: row.lineStatus,
    sourceRow: row.sourceRow,
  };
}

function toDomainCrosswalk(row: typeof partNumberCrosswalks.$inferSelect): PartNumberCrosswalk {
  return {
    id: row.id,
    plmPartId: row.plmPartId,
    erpPartId: row.erpPartId,
    matchMethod: row.matchMethod,
    confidence: row.confidence,
    reviewStatus: row.reviewStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    effectiveDate: row.effectiveDate,
    notes: row.notes,
    mappingType: row.mappingType,
    supersededById: row.supersededById,
  };
}

function toDomainTerms(row: typeof supplierCommitmentTerms.$inferSelect): SupplierCommitmentTerms {
  return {
    id: row.id,
    supplierId: row.supplierId,
    partId: row.partId,
    ncnr: row.ncnr,
    standardLeadTimeDays: row.standardLeadTimeDays,
    cancellationWindowDays: row.cancellationWindowDays,
    source: row.source,
    effectiveDate: row.effectiveDate,
    notes: row.notes,
    verifiedAt: row.verifiedAt,
    verifiedBy: row.verifiedBy,
    validUntil: row.validUntil,
    stalenessStatus: "current",
  };
}

function toDomainRate(row: typeof exchangeRateSnapshots.$inferSelect): ExchangeRateSnapshot {
  return {
    id: row.id,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rate: row.rate,
    rateDate: row.rateDate,
    source: row.source,
    enteredBy: row.enteredBy,
    enteredAt: row.enteredAt,
  };
}

/**
 * Recalculates exposure for every eligible (BOM diff entry, PO line) pair
 * belonging to this engineering change. Never UPDATEs an exposure_records
 * or exposure_source_snapshots row -- a recalculation always INSERTs a new
 * pair and, if an active record already existed for the same pair, marks
 * the OLD row's supersededById and leaves every other column on it
 * untouched. There is intentionally no "update exposure record" function
 * anywhere in this file.
 */
export async function calculateAndPersistExposure(ecId: string, asOfDate: string, calculatedBy: string) {
  void calculatedBy;

  // P0 remediation: scope to the EC's currently ACTIVE PO import batch only -- a superseded
  // batch's data must never leak into a fresh calculation. See getActivePurchaseOrderImportId
  // / getPurchaseDataForEc in db/repositories/purchaseOrders.ts for the same scoping.
  const activePurchaseOrderImportId = await getActivePurchaseOrderImportId(ecId);
  if (!activePurchaseOrderImportId) {
    // No PO data has ever been imported for this EC -- nothing to calculate against yet.
    // This is an application-level invariant this function enforces explicitly (not a DB
    // constraint), because exposure_source_snapshots.purchase_order_import_id is
    // deliberately, permanently nullable to accommodate honest legacy data (see that
    // column's comment in db/schema.ts) -- so this check is what actually guarantees every
    // NEW snapshot gets a real value, rather than the database rejecting a null.
    return { createdRecordIds: [], gaps: [] };
  }

  const dataset = await assembleExposurePipelineDataset(ecId, activePurchaseOrderImportId, asOfDate);
  const outcomes = runExposurePipeline(dataset);

  const gaps: { bomDiffEntryId: string; purchaseOrderLineId: string; rawPartNumber: string; reason: string }[] = [];
  const createdRecordIds: string[] = [];

  for (const outcome of outcomes) {
    if (outcome.kind === "gap") {
      gaps.push({
        bomDiffEntryId: outcome.diffEntryId,
        purchaseOrderLineId: outcome.purchaseOrderLineId,
        rawPartNumber: outcome.rawPartNumber,
        reason: outcome.reason,
      });
      continue;
    }

    const { snapshot, record, crosswalk, allocation, purchaseOrderLineId } = outcome;

    const priorActive = await db
      .select()
      .from(exposureRecords)
      .where(
        and(
          eq(exposureRecords.engineeringChangeId, ecId),
          eq(exposureRecords.purchaseOrderLineId, purchaseOrderLineId),
          isNull(exposureRecords.supersededById)
        )
      );

    const [snapshotRow] = await db
      .insert(exposureSourceSnapshots)
      .values({
        engineeringChangeId: snapshot.engineeringChangeId,
        bomDiffEntryId: snapshot.bomDiffEntryId,
        purchaseOrderId: snapshot.purchaseOrderId,
        purchaseOrderLineId: snapshot.purchaseOrderLineId,
        supplierId: snapshot.supplierId,
        rawPartId: snapshot.rawPartId,
        normalizedPartId: snapshot.normalizedPartId,
        quantityOpen: snapshot.quantityOpen,
        unitPriceTransactionCurrency: snapshot.unitPriceTransactionCurrency,
        transactionCurrency: snapshot.transactionCurrency,
        reportingCurrency: snapshot.reportingCurrency,
        exchangeRate: snapshot.exchangeRate,
        exchangeRateDate: snapshot.exchangeRateDate,
        exchangeRateSnapshotId: snapshot.exchangeRateSnapshotId,
        promisedReceiptDate: snapshot.promisedReceiptDate,
        lineStatus: snapshot.lineStatus,
        supplierTermsVersionId: snapshot.supplierTermsVersionId,
        crosswalkVersionId: snapshot.crosswalkVersionId,
        purchaseOrderImportId: activePurchaseOrderImportId,
        // Milestone 3.75 -- frozen at calculation time, exactly what buildEvidenceExplanation
        // needs, so the Evidence Explorer never needs to re-derive these from live,
        // mutable crosswalk/allocation-rule state again. See this column's comment in
        // db/schema.ts for the full rationale.
        crosswalkErpPartId: crosswalk.erpPartId,
        crosswalkMatchMethod: crosswalk.matchMethod,
        crosswalkReviewStatus: crosswalk.reviewStatus,
        crosswalkReviewedBy: crosswalk.reviewedBy,
        crosswalkReviewedAt: crosswalk.reviewedAt,
        allocationMethod: allocation.resolved ? allocation.method : null,
        alternateDemandAllocationIds: JSON.stringify(snapshot.alternateDemandAllocationIds),
        sourceFiles: JSON.stringify(snapshot.sourceFiles),
        sourceRows: JSON.stringify(snapshot.sourceRows),
        calculatedAt: snapshot.calculatedAt,
      })
      .returning();

    const [recordRow] = await db
      .insert(exposureRecords)
      .values({
        engineeringChangeId: record.engineeringChangeId,
        partId: record.partId,
        purchaseOrderLineId: record.purchaseOrderLineId,
        exposureSourceSnapshotId: snapshotRow.id,
        grossCommittedValueTransaction: record.grossCommittedValueTransaction,
        grossCommittedValueReporting: record.grossCommittedValueReporting,
        alternateDemandAdjustmentTransaction: record.alternateDemandAdjustmentTransaction,
        alternateDemandAdjustmentReporting: record.alternateDemandAdjustmentReporting,
        netExposureValueTransaction: record.netExposureValueTransaction,
        netExposureValueReporting: record.netExposureValueReporting,
        confidenceClassification: record.confidenceClassification,
        cancellationStatus: record.cancellationStatus,
        cancellationConfidence: record.cancellationConfidence,
        formulaVersion: record.formulaVersion,
        calculatedAt: record.calculatedAt,
        classificationReason: record.classificationReason,
      })
      .returning();

    createdRecordIds.push(recordRow.id);

    if (priorActive[0]) {
      await db.update(exposureRecords).set({ supersededById: recordRow.id }).where(eq(exposureRecords.id, priorActive[0].id));
    }
  }

  return { createdRecordIds, gaps };
}

/**
 * Assembles an `ExposurePipelineDataset` from the EC's current live database state -- the
 * historical/real calculation path. This is the ONLY place that reads live database state for
 * exposure calculation; everything after this point (identity resolution, allocation,
 * calculation) is the pure `runExposurePipeline`, shared with the Scenario Engine (see
 * src/domains/deltaledger/exposure/scenarioAssumptions.ts), which assembles a dataset the exact
 * same way and then applies overrides on top before calling the same pipeline.
 */
export async function assembleExposurePipelineDataset(
  ecId: string,
  activePurchaseOrderImportId: string,
  asOfDate: string
): Promise<ExposurePipelineDataset> {
  const diffEntries = (await db.select().from(bomDiffEntries).where(eq(bomDiffEntries.engineeringChangeId, ecId))).filter((d) =>
    EXPOSURE_ELIGIBLE_CHANGE_TYPES.includes(d.changeType)
  );

  const ecPurchaseOrders = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.engineeringChangeId, ecId), eq(purchaseOrders.purchaseOrderImportId, activePurchaseOrderImportId)));

  const allPoLineRows: (typeof purchaseOrderLines.$inferSelect)[] = [];
  for (const po of ecPurchaseOrders) {
    const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, po.id));
    allPoLineRows.push(...lines);
  }

  const crosswalkRows = await db.select().from(partNumberCrosswalks);
  const allocationRuleRows = await db.select().from(crosswalkAllocationRules);
  const activeTermsRows = await db.select().from(supplierCommitmentTerms).where(isNull(supplierCommitmentTerms.supersededById));
  const rateRows = await db.select().from(exchangeRateSnapshots);

  const purchaseOrdersById: ExposurePipelineDataset["purchaseOrdersById"] = {};
  for (const po of ecPurchaseOrders) {
    purchaseOrdersById[po.id] = { id: po.id, supplierId: po.supplierId, sourceFile: po.sourceFile ?? "unknown-source.xlsx" };
  }

  const allocationRulesByCrosswalkId: ExposurePipelineDataset["allocationRulesByCrosswalkId"] = {};
  for (const rule of allocationRuleRows) {
    (allocationRulesByCrosswalkId[rule.crosswalkId] ??= []).push({
      id: rule.id,
      crosswalkId: rule.crosswalkId,
      method: rule.method,
      plantCode: rule.plantCode,
      supplierId: rule.supplierId,
      fixedQuantity: rule.fixedQuantity,
      percentage: rule.percentage,
      notes: rule.notes,
      effectiveDate: rule.effectiveDate,
    });
  }

  const supplierTermsBySupplierId: ExposurePipelineDataset["supplierTermsBySupplierId"] = {};
  for (const row of activeTermsRows) {
    // Only one active (non-superseded) terms row should exist per supplier; the first one
    // found wins, matching the previous inline query's `activeTermsRows[0]` behavior.
    if (!supplierTermsBySupplierId[row.supplierId]) {
      supplierTermsBySupplierId[row.supplierId] = toDomainTerms(row);
    }
  }

  // Alternate demand carries forward per PO line: whichever exposure record is currently
  // active for this (ecId, poLineId) pair -- if any -- contributes its active allocations to
  // the NEXT calculation's netting. This is inherently a live-state lookup (it depends on
  // records already persisted from a prior run), so it's assembled here, not in the pipeline.
  const alternateDemandByPoLineId: ExposurePipelineDataset["alternateDemandByPoLineId"] = {};
  for (const poLineRow of allPoLineRows) {
    const priorActive = await db
      .select()
      .from(exposureRecords)
      .where(
        and(
          eq(exposureRecords.engineeringChangeId, ecId),
          eq(exposureRecords.purchaseOrderLineId, poLineRow.id),
          isNull(exposureRecords.supersededById)
        )
      );
    if (!priorActive[0]) continue;
    const activeAllocations = await getActiveAllocationsForExposureRecord(priorActive[0].id);
    alternateDemandByPoLineId[poLineRow.id] = {
      allocatedQuantity: activeAllocations.reduce((s, a) => s + a.quantityAllocated, 0),
      allocationIds: activeAllocations.map((a) => a.id),
      explicitlyConfirmedZero: false,
    };
  }

  return {
    diffEntries: diffEntries.map((d) => ({
      id: d.id,
      engineeringChangeId: d.engineeringChangeId,
      partId: d.partId,
      changeType: d.changeType,
      fromQuantity: d.fromQuantity,
      toQuantity: d.toQuantity,
      replacementPartId: d.replacementPartId,
    })),
    poLines: allPoLineRows.map(toDomainPoLine),
    purchaseOrdersById,
    crosswalks: crosswalkRows.map(toDomainCrosswalk),
    allocationRulesByCrosswalkId,
    supplierTermsBySupplierId,
    exchangeRates: rateRows.map(toDomainRate),
    alternateDemandByPoLineId,
    reportingCurrency: REPORTING_CURRENCY,
    formulaVersion: FORMULA_VERSION,
    asOfDate,
    calculatedAt: new Date().toISOString(),
    fallbackSourceFile: "unknown-source.xlsx",
  };
}

export async function getActiveExposureRecordsForEc(ecId: string) {
  return db
    .select()
    .from(exposureRecords)
    .where(and(eq(exposureRecords.engineeringChangeId, ecId), isNull(exposureRecords.supersededById)));
}

export async function getExposureRecordById(id: string) {
  const [row] = await db.select().from(exposureRecords).where(eq(exposureRecords.id, id)).limit(1);
  return row ?? null;
}

/**
 * Phase 6B -- the mapping-side counterpart to PO-provenance staleness. If an active exposure
 * record's frozen snapshot references a crosswalk that has SINCE been revised or revoked (see
 * Phase 6A's supersession lifecycle), that figure was calculated against a mapping decision
 * that's no longer the current truth -- not wrong, not corrupted, just due for a recalculation
 * to pick up the newer mapping. This never touches the historical snapshot itself (it stays
 * frozen and fully explainable exactly as it always has); it only tells the workspace-level
 * readiness check there's a reason to recalculate.
 */
export async function countExposureRecordsWithSupersededMapping(ecId: string): Promise<number> {
  const rows = await db
    .select({ crosswalkSupersededById: partNumberCrosswalks.supersededById })
    .from(exposureRecords)
    .innerJoin(exposureSourceSnapshots, eq(exposureRecords.exposureSourceSnapshotId, exposureSourceSnapshots.id))
    .innerJoin(partNumberCrosswalks, eq(exposureSourceSnapshots.crosswalkVersionId, partNumberCrosswalks.id))
    .where(and(eq(exposureRecords.engineeringChangeId, ecId), isNull(exposureRecords.supersededById)));

  return rows.filter((r) => r.crosswalkSupersededById !== null).length;
}

/** Used by the PO-import confirmation gate (Decision C) -- see src/app/actions.ts. */
export async function hasActiveExposureRecords(ecId: string): Promise<boolean> {
  const rows = await db
    .select({ id: exposureRecords.id })
    .from(exposureRecords)
    .where(and(eq(exposureRecords.engineeringChangeId, ecId), isNull(exposureRecords.supersededById)))
    .limit(1);
  return rows.length > 0;
}

export type ProvenanceState = "current" | "stale" | "legacy_unknown";

/**
 * P0 remediation, Decision C -- three states, not a boolean. A snapshot's
 * purchase_order_import_id is null only for pre-remediation legacy rows (see that column's
 * comment in db/schema.ts); that is NOT the same as "stale" -- it means provenance was never
 * captured and genuinely cannot be determined, so it must not be presented as either current
 * or stale with false confidence.
 */
export function provenanceState(
  snapshotPurchaseOrderImportId: string | null,
  currentActivePurchaseOrderImportId: string | null
): ProvenanceState {
  if (snapshotPurchaseOrderImportId === null) return "legacy_unknown";
  if (snapshotPurchaseOrderImportId === currentActivePurchaseOrderImportId) return "current";
  return "stale";
}

/**
 * Convenience for callers (Exposure/Report pages) that need the provenance state of every
 * active exposure record for an EC in one pass, without each caller re-deriving the active
 * batch id and re-implementing the three-state comparison.
 */
export async function getExposureRecordsWithProvenance(ecId: string) {
  const [records, activeBatchId] = await Promise.all([getActiveExposureRecordsForEc(ecId), getActivePurchaseOrderImportId(ecId)]);
  const withProvenance = await Promise.all(
    records.map(async (record) => {
      const snapshot = await getExposureSnapshotById(record.exposureSourceSnapshotId);
      return {
        record,
        provenance: provenanceState(snapshot?.purchaseOrderImportId ?? null, activeBatchId),
      };
    })
  );
  return withProvenance;
}

export async function getExposureSnapshotById(id: string) {
  const [row] = await db.select().from(exposureSourceSnapshots).where(eq(exposureSourceSnapshots.id, id)).limit(1);
  return row ?? null;
}

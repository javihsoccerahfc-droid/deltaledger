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
import { calculateExposure, ExposureCalculationInput } from "@/domains/deltaledger/exposure/calculateExposure";
import { resolveCrosswalkAllocation, AllocationResolution } from "@/domains/deltaledger/crosswalkAllocation";
import { cleanString } from "@/core/normalization/parsers";
import type {
  BomDiffEntry,
  PurchaseOrderLine,
  PartNumberCrosswalk,
  SupplierCommitmentTerms,
  ExchangeRateSnapshot,
} from "@/domains/deltaledger/types";
import { getActiveAllocationsForExposureRecord } from "./alternateDemand";

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

  const diffEntries = (await db.select().from(bomDiffEntries).where(eq(bomDiffEntries.engineeringChangeId, ecId))).filter(
    (d) => EXPOSURE_ELIGIBLE_CHANGE_TYPES.includes(d.changeType)
  );

  const ecPurchaseOrders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.engineeringChangeId, ecId));
  const allPoLines: (typeof purchaseOrderLines.$inferSelect)[] = [];
  for (const po of ecPurchaseOrders) {
    const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, po.id));
    allPoLines.push(...lines);
  }

  const crosswalks = await db.select().from(partNumberCrosswalks);
  const allRates = await db.select().from(exchangeRateSnapshots);

  const gaps: { bomDiffEntryId: string; purchaseOrderLineId: string; rawPartNumber: string; reason: string }[] = [];
  const createdRecordIds: string[] = [];

  for (const diffEntry of diffEntries) {
    const matchingLines = allPoLines.filter(
      (line) => cleanString(line.rawPartNumber).toUpperCase() === cleanString(diffEntry.partId).toUpperCase()
    );

    for (const poLineRow of matchingLines) {
      const po = ecPurchaseOrders.find((p) => p.id === poLineRow.purchaseOrderId);
      const crosswalkRow = crosswalks.find(
        (c) => c.plmPartId.toUpperCase() === diffEntry.partId.toUpperCase() && c.supersededById === null
      );

      const poLine = toDomainPoLine(poLineRow);
      const crosswalk = crosswalkRow ? toDomainCrosswalk(crosswalkRow) : undefined;

      let allocation: AllocationResolution = { resolved: false, reason: "No crosswalk mapping exists for this part yet." };
      if (crosswalk) {
        const rules = await db
          .select()
          .from(crosswalkAllocationRules)
          .where(eq(crosswalkAllocationRules.crosswalkId, crosswalk.id));
        const domainRules = rules.map((r) => ({
          id: r.id,
          crosswalkId: r.crosswalkId,
          method: r.method,
          plantCode: r.plantCode,
          supplierId: r.supplierId,
          fixedQuantity: r.fixedQuantity,
          percentage: r.percentage,
          notes: r.notes,
          effectiveDate: r.effectiveDate,
        }));
        allocation = resolveCrosswalkAllocation(crosswalk, domainRules[0], domainRules, {
          quantity: poLine.quantityOpen ?? 0,
        });
      }

      const supplierId = po?.supplierId ?? "";
      const activeTermsRows = await db
        .select()
        .from(supplierCommitmentTerms)
        .where(and(eq(supplierCommitmentTerms.supplierId, supplierId), isNull(supplierCommitmentTerms.supersededById)));
      const supplierTerms = activeTermsRows[0] ? toDomainTerms(activeTermsRows[0]) : undefined;

      const priorActive = await db
        .select()
        .from(exposureRecords)
        .where(
          and(
            eq(exposureRecords.engineeringChangeId, ecId),
            eq(exposureRecords.purchaseOrderLineId, poLine.id),
            isNull(exposureRecords.supersededById)
          )
        );
      let allocatedQuantity = 0;
      let allocationIds: string[] = [];
      if (priorActive[0]) {
        const activeAllocations = await getActiveAllocationsForExposureRecord(priorActive[0].id);
        allocatedQuantity = activeAllocations.reduce((s, a) => s + a.quantityAllocated, 0);
        allocationIds = activeAllocations.map((a) => a.id);
      }

      const input: ExposureCalculationInput = {
        formulaVersion: FORMULA_VERSION,
        engineeringChangeId: ecId,
        bomDiffEntry: {
          id: diffEntry.id,
          engineeringChangeId: diffEntry.engineeringChangeId,
          partId: diffEntry.partId,
          changeType: diffEntry.changeType,
          fromQuantity: diffEntry.fromQuantity,
          toQuantity: diffEntry.toQuantity,
          replacementPartId: diffEntry.replacementPartId,
        },
        purchaseOrderId: po?.id ?? poLine.purchaseOrderId,
        purchaseOrderLine: poLine,
        supplierId,
        crosswalk,
        allocation,
        supplierTerms,
        exchangeRates: allRates.map(toDomainRate),
        reportingCurrency: REPORTING_CURRENCY,
        alternateDemand: { allocatedQuantity, allocationIds, explicitlyConfirmedZero: false },
        asOfDate,
        calculatedAt: new Date().toISOString(),
        sourceFile: po?.sourceFile ?? "unknown-source.xlsx",
        sourceRow: Number(poLine.id.split(":").pop()) || 0,
      };

      const outcome = calculateExposure(input);
      if (!outcome.created) {
        gaps.push({
          bomDiffEntryId: diffEntry.id,
          purchaseOrderLineId: poLine.id,
          rawPartNumber: poLine.rawPartNumber,
          reason: outcome.gapReason,
        });
        continue;
      }

      const [snapshotRow] = await db
        .insert(exposureSourceSnapshots)
        .values({
          engineeringChangeId: outcome.snapshot.engineeringChangeId,
          bomDiffEntryId: outcome.snapshot.bomDiffEntryId,
          purchaseOrderId: outcome.snapshot.purchaseOrderId,
          purchaseOrderLineId: outcome.snapshot.purchaseOrderLineId,
          supplierId: outcome.snapshot.supplierId,
          rawPartId: outcome.snapshot.rawPartId,
          normalizedPartId: outcome.snapshot.normalizedPartId,
          quantityOpen: outcome.snapshot.quantityOpen,
          unitPriceTransactionCurrency: outcome.snapshot.unitPriceTransactionCurrency,
          transactionCurrency: outcome.snapshot.transactionCurrency,
          reportingCurrency: outcome.snapshot.reportingCurrency,
          exchangeRate: outcome.snapshot.exchangeRate,
          exchangeRateDate: outcome.snapshot.exchangeRateDate,
          exchangeRateSnapshotId: outcome.snapshot.exchangeRateSnapshotId,
          promisedReceiptDate: outcome.snapshot.promisedReceiptDate,
          lineStatus: outcome.snapshot.lineStatus,
          supplierTermsVersionId: outcome.snapshot.supplierTermsVersionId,
          crosswalkVersionId: outcome.snapshot.crosswalkVersionId,
          alternateDemandAllocationIds: JSON.stringify(outcome.snapshot.alternateDemandAllocationIds),
          sourceFiles: JSON.stringify(outcome.snapshot.sourceFiles),
          sourceRows: JSON.stringify(outcome.snapshot.sourceRows),
          calculatedAt: outcome.snapshot.calculatedAt,
        })
        .returning();

      const [recordRow] = await db
        .insert(exposureRecords)
        .values({
          engineeringChangeId: outcome.record.engineeringChangeId,
          partId: outcome.record.partId,
          purchaseOrderLineId: outcome.record.purchaseOrderLineId,
          exposureSourceSnapshotId: snapshotRow.id,
          grossCommittedValueTransaction: outcome.record.grossCommittedValueTransaction,
          grossCommittedValueReporting: outcome.record.grossCommittedValueReporting,
          alternateDemandAdjustmentTransaction: outcome.record.alternateDemandAdjustmentTransaction,
          alternateDemandAdjustmentReporting: outcome.record.alternateDemandAdjustmentReporting,
          netExposureValueTransaction: outcome.record.netExposureValueTransaction,
          netExposureValueReporting: outcome.record.netExposureValueReporting,
          confidenceClassification: outcome.record.confidenceClassification,
          cancellationStatus: outcome.record.cancellationStatus,
          cancellationConfidence: outcome.record.cancellationConfidence,
          formulaVersion: outcome.record.formulaVersion,
          calculatedAt: outcome.record.calculatedAt,
          classificationReason: outcome.record.classificationReason,
        })
        .returning();

      createdRecordIds.push(recordRow.id);

      if (priorActive[0]) {
        await db
          .update(exposureRecords)
          .set({ supersededById: recordRow.id })
          .where(eq(exposureRecords.id, priorActive[0].id));
      }
    }
  }

  return { createdRecordIds, gaps };
}

export async function getActiveExposureRecordsForEc(ecId: string) {
  return db
    .select()
    .from(exposureRecords)
    .where(and(eq(exposureRecords.engineeringChangeId, ecId), isNull(exposureRecords.supersededById)));
}

export async function getExposureSnapshotById(id: string) {
  const [row] = await db.select().from(exposureSourceSnapshots).where(eq(exposureSourceSnapshots.id, id)).limit(1);
  return row ?? null;
}

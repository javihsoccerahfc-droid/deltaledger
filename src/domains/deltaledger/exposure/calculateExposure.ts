import { defaultIdGenerator } from "../idGenerator";
import {
  BomDiffEntry,
  ExposureConfidence,
  ExposureRecord,
  ExposureSourceSnapshot,
  PartNumberCrosswalk,
  PurchaseOrderLine,
  SupplierCommitmentTerms,
} from "../types";
import { AllocationResolution } from "../crosswalkAllocation";
import { resolveExchangeRate, ExchangeRateResolution } from "./exchangeRate";
import { determineCancellationStatus } from "./cancellationStatus";

export interface AlternateDemandNetting {
  // Sum of active AlternateDemandAllocation.quantityAllocated already tied
  // to this specific (bomDiffEntry, purchaseOrderLine) pair. Absence of any
  // allocation is NOT the same as "confirmed zero alternate demand" — see
  // `explicitlyConfirmedZero` below.
  allocatedQuantity: number;
  // The actual AlternateDemandAllocation.id values summed above, so the
  // immutable snapshot can record exactly which allocations were used
  // rather than an empty placeholder array (see ExposureSourceSnapshot
  // .alternateDemandAllocationIds below).
  allocationIds: string[];
  // True only when a reviewer has explicitly confirmed there is no
  // offsetting demand for this part in this engineering change (e.g. an
  // approved AlternateDemandRecord check with quantity 0), as opposed to
  // simply never having looked. This is what allows Known confidence
  // despite zero netting — see classification logic below.
  explicitlyConfirmedZero: boolean;
}

export interface ExposureCalculationInput {
  formulaVersion: string;
  engineeringChangeId: string;
  bomDiffEntry: BomDiffEntry;
  purchaseOrderId: string;
  purchaseOrderLine: PurchaseOrderLine;
  supplierId: string;
  crosswalk: PartNumberCrosswalk | undefined;
  allocation: AllocationResolution;
  supplierTerms: SupplierCommitmentTerms | undefined;
  exchangeRates: Parameters<typeof resolveExchangeRate>[2];
  reportingCurrency: string;
  alternateDemand: AlternateDemandNetting;
  asOfDate: string;
  calculatedAt: string;
  // Provenance: which source file/row this PO line came from. The
  // application layer's ingestion step knows this (it just imported the
  // file); threading it through here means the snapshot's sourceFiles/
  // sourceRows are populated at calculation time, not patched in afterward.
  sourceFile: string;
  sourceRow: number;
}

export type ExposureCalculationOutcome =
  | { created: true; snapshot: ExposureSourceSnapshot; record: ExposureRecord }
  | { created: false; gapReason: string }; // no record at all — an "Unmapped Exposure Gap"

function nextSnapshotId() {
  return defaultIdGenerator.next("snap");
}
function nextRecordId() {
  return defaultIdGenerator.next("exp");
}

/**
 * The full exposure calculation, per spec §4. Two distinct failure modes,
 * deliberately not conflated:
 *  - `created: false` — the hard pre-gate failed (crosswalk not approved, or
 *    PO line not open). No ExposureRecord or snapshot is produced at all;
 *    this pair surfaces as an "Unmapped Exposure Gap" on the mapping-review
 *    queue, never as a $0 exposure.
 *  - `created: true` with `confidenceClassification: "unresolved"` — a
 *    record IS created (the pair passed the pre-gate), but something else
 *    needed to compute a trustworthy number is missing (price, quantity,
 *    allocation, or exchange rate).
 */
export function calculateExposure(input: ExposureCalculationInput): ExposureCalculationOutcome {
  // --- Hard pre-gate: does a record get created at all? ---
  if (!input.crosswalk || input.crosswalk.reviewStatus !== "approved") {
    return { created: false, gapReason: "Part-number crosswalk is not approved." };
  }
  if (input.purchaseOrderLine.lineStatus !== "open") {
    return { created: false, gapReason: `PO line status is "${input.purchaseOrderLine.lineStatus}", not open.` };
  }

  const poLine = input.purchaseOrderLine;
  const unresolvedReasons: string[] = [];

  if (poLine.quantityParseStatus !== "ok" || poLine.quantityOpen === null) {
    unresolvedReasons.push("PO line quantity is missing or unparseable.");
  }
  if (poLine.priceParseStatus !== "ok" || poLine.unitPriceTransactionCurrency === null) {
    unresolvedReasons.push("PO line unit price is missing or unparseable.");
  }
  if (!input.allocation.resolved) {
    unresolvedReasons.push(`Crosswalk allocation unresolved: ${input.allocation.reason}`);
  }

  const rateResolution: ExchangeRateResolution = resolveExchangeRate(
    poLine.transactionCurrency,
    input.reportingCurrency,
    input.exchangeRates
  );
  if (!rateResolution.resolved) {
    unresolvedReasons.push(rateResolution.reason);
  }

  // If anything required for a trustworthy number is missing, the record is
  // still created (per spec — this is not the same as the pre-gate above)
  // but classified Unresolved, with zeroed monetary fields rather than a
  // guessed value.
  if (unresolvedReasons.length > 0) {
    return buildUnresolvedRecord(input, unresolvedReasons.join(" "));
  }

  const quantityOpen = poLine.quantityOpen as number;
  const unitPrice = poLine.unitPriceTransactionCurrency as number;
  const allocatedQuantity = input.allocation.resolved ? input.allocation.allocatedQuantity : quantityOpen;
  const rate = rateResolution.resolved ? rateResolution.rate : 1;

  const grossTransaction = allocatedQuantity * unitPrice;
  const grossReporting = grossTransaction * rate;

  const nettedQty = Math.max(0, allocatedQuantity - input.alternateDemand.allocatedQuantity);
  const adjustmentTransaction = (allocatedQuantity - nettedQty) * unitPrice;
  const adjustmentReporting = adjustmentTransaction * rate;

  const netTransaction = grossTransaction - adjustmentTransaction;
  const netReporting = grossReporting - adjustmentReporting;

  const cancellation = determineCancellationStatus(input.supplierTerms, poLine.promisedReceiptDate, input.asOfDate);

  // exposure_confidence answers "is this dollar amount trustworthy?" and
  // depends ONLY on: crosswalk approval (already gated above), valid
  // quantity/price/FX (already gated above via unresolvedReasons), a
  // deterministic allocation (already gated above), and whether alternate
  // demand has been explicitly reviewed. It does NOT depend on
  // cancellation_status/cancellation_confidence at all — a fully known
  // committed PO value coexisting with "we don't yet know if this is
  // cancellable" is the normal case, not a defect.
  const confidence = classifyConfidence({
    hasAlternateDemandSignal: input.alternateDemand.allocatedQuantity > 0 || input.alternateDemand.explicitlyConfirmedZero,
  });

  const snapshot: ExposureSourceSnapshot = {
    id: nextSnapshotId(),
    engineeringChangeId: input.engineeringChangeId,
    bomDiffEntryId: input.bomDiffEntry.id,
    purchaseOrderId: input.purchaseOrderId,
    purchaseOrderLineId: poLine.id,
    supplierId: input.supplierId,
    rawPartId: poLine.rawPartNumber,
    normalizedPartId: input.crosswalk.erpPartId,
    quantityOpen,
    unitPriceTransactionCurrency: unitPrice,
    transactionCurrency: poLine.transactionCurrency,
    reportingCurrency: input.reportingCurrency,
    exchangeRate: rate,
    exchangeRateDate: rateResolution.resolved ? rateResolution.rateDate : "",
    exchangeRateSnapshotId: rateResolution.resolved ? rateResolution.snapshotId : null,
    promisedReceiptDate: poLine.promisedReceiptDate,
    lineStatus: poLine.lineStatus,
    supplierTermsVersionId: input.supplierTerms?.id ?? null,
    crosswalkVersionId: input.crosswalk.id,
    alternateDemandAllocationIds: input.alternateDemand.allocationIds,
    sourceFiles: [input.sourceFile],
    sourceRows: [input.sourceRow],
    calculatedAt: input.calculatedAt,
  };

  const record: ExposureRecord = {
    id: nextRecordId(),
    engineeringChangeId: input.engineeringChangeId,
    partId: input.crosswalk.erpPartId,
    purchaseOrderLineId: poLine.id,
    exposureSourceSnapshotId: snapshot.id,
    grossCommittedValueTransaction: grossTransaction,
    grossCommittedValueReporting: grossReporting,
    alternateDemandAdjustmentTransaction: adjustmentTransaction,
    alternateDemandAdjustmentReporting: adjustmentReporting,
    netExposureValueTransaction: netTransaction,
    netExposureValueReporting: netReporting,
    confidenceClassification: confidence,
    cancellationStatus: cancellation.status,
    cancellationConfidence: cancellation.confidence,
    formulaVersion: input.formulaVersion,
    calculatedAt: input.calculatedAt,
    classificationReason: null,
  };

  return { created: true, snapshot, record };
}

function classifyConfidence(args: { hasAlternateDemandSignal: boolean }): ExposureConfidence {
  // The pre-gate (crosswalk approved) and the unresolved-reason checks
  // (quantity, price, allocation, FX) have already run by the time this is
  // called — anything that failed those already returned "unresolved"
  // earlier. What's left to decide is only: has alternate demand been
  // explicitly reviewed for this part in this engineering change?
  return args.hasAlternateDemandSignal ? "known" : "estimated";
}

function buildUnresolvedRecord(
  input: ExposureCalculationInput,
  reason: string
): { created: true; snapshot: ExposureSourceSnapshot; record: ExposureRecord } {
  const poLine = input.purchaseOrderLine;
  const cancellation = determineCancellationStatus(input.supplierTerms, poLine.promisedReceiptDate, input.asOfDate);
  const snapshot: ExposureSourceSnapshot = {
    id: nextSnapshotId(),
    engineeringChangeId: input.engineeringChangeId,
    bomDiffEntryId: input.bomDiffEntry.id,
    purchaseOrderId: input.purchaseOrderId,
    purchaseOrderLineId: poLine.id,
    supplierId: input.supplierId,
    rawPartId: poLine.rawPartNumber,
    normalizedPartId: input.crosswalk!.erpPartId,
    quantityOpen: poLine.quantityOpen,
    unitPriceTransactionCurrency: poLine.unitPriceTransactionCurrency,
    transactionCurrency: poLine.transactionCurrency,
    reportingCurrency: input.reportingCurrency,
    exchangeRate: 1,
    exchangeRateDate: "",
    exchangeRateSnapshotId: null,
    promisedReceiptDate: poLine.promisedReceiptDate,
    lineStatus: poLine.lineStatus,
    supplierTermsVersionId: input.supplierTerms?.id ?? null,
    crosswalkVersionId: input.crosswalk!.id,
    alternateDemandAllocationIds: input.alternateDemand.allocationIds,
    sourceFiles: [input.sourceFile],
    sourceRows: [input.sourceRow],
    calculatedAt: input.calculatedAt,
  };

  const record: ExposureRecord = {
    id: nextRecordId(),
    engineeringChangeId: input.engineeringChangeId,
    partId: input.crosswalk!.erpPartId,
    purchaseOrderLineId: poLine.id,
    exposureSourceSnapshotId: snapshot.id,
    // Deliberately 0, not a guessed value — an Unresolved record's monetary
    // fields are not meaningful and must never be summed into a total as if
    // they were real. The UI must gate any total on confidence, not just
    // read these fields blindly.
    grossCommittedValueTransaction: 0,
    grossCommittedValueReporting: 0,
    alternateDemandAdjustmentTransaction: 0,
    alternateDemandAdjustmentReporting: 0,
    netExposureValueTransaction: 0,
    netExposureValueReporting: 0,
    confidenceClassification: "unresolved",
    cancellationStatus: cancellation.status,
    cancellationConfidence: cancellation.confidence,
    formulaVersion: input.formulaVersion,
    calculatedAt: input.calculatedAt,
    classificationReason: reason,
  };

  return { created: true, snapshot, record };
}

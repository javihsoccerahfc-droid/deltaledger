import { AuditEntry } from "@/core/audit/auditTypes";

export type UserRole = "engineer" | "ccb" | "buyer" | "supply_chain_manager" | "finance" | "part_data_owner" | "admin";

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

// ---- BOM / Engineering Change ----

export type EngineeringChangeStatus = "draft" | "mapping_review" | "exposure_calculated" | "mitigating" | "closed";

export interface EngineeringChange {
  id: string;
  name: string;
  description: string;
  status: EngineeringChangeStatus;
  createdAt: string;
  createdBy: string;
  targetEffectiveDate: string | null;
}

export type BomIngestionMode = "current_and_proposed" | "redlined_single_file";
export type BomVersionLabel = "current" | "proposed";

export interface BomImport {
  id: string;
  engineeringChangeId: string;
  versionLabel: BomVersionLabel;
  ingestionMode: BomIngestionMode;
  sourceFile: string;
  sourceSheet: string;
  importedAt: string;
  importedBy: string;
}

export type QuantityParseStatus = "ok" | "missing" | "invalid";

export interface BomLine {
  id: string;
  bomImportId: string;
  partId: string | null;
  rawPartNumber: string;
  rawDescription: string;
  quantityPer: number | null;
  quantityParseStatus: QuantityParseStatus;
  parentBomLineId: string | null;
  sourceRow: number;
}

export type BomChangeType = "added" | "removed" | "replaced" | "qty_reduced" | "qty_increased";

export interface BomDiffEntry {
  id: string;
  engineeringChangeId: string;
  partId: string;
  changeType: BomChangeType;
  fromQuantity: number | null;
  toQuantity: number | null;
  replacementPartId: string | null;
}

export interface Part {
  id: string;
  plmPartId: string;
  description: string;
  revision: string | null;
  commodityCode: string | null;
  unitOfMeasure: string;
  createdAt: string;
}

// ---- Supplier / Terms ----

export interface Supplier {
  id: string;
  name: string;
  erpSupplierId: string | null;
  defaultCancellationTermsNotes: string | null;
  createdAt: string;
}

export type SupplierTermsSource = "verified_contract" | "supplier_provided" | "unconfirmed";
export type StalenessStatus = "current" | "review_due" | "expired" | "unverified";

export interface SupplierCommitmentTerms {
  id: string;
  supplierId: string;
  partId: string | null; // null = supplier-wide
  ncnr: boolean;
  standardLeadTimeDays: number | null;
  cancellationWindowDays: number | null;
  source: SupplierTermsSource;
  effectiveDate: string;
  notes: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  validUntil: string | null;
  stalenessStatus: StalenessStatus;
}

// ---- Purchase orders / currency ----

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  sourceFile: string;
  importedAt: string;
}

export type PurchaseOrderLineStatus = "open" | "received" | "cancelled";

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  partId: string | null;
  rawPartNumber: string;
  quantityOpen: number | null;
  quantityParseStatus: QuantityParseStatus;
  transactionCurrency: string;
  unitPriceTransactionCurrency: number | null;
  priceParseStatus: QuantityParseStatus;
  promisedReceiptDate: string | null;
  lineStatus: PurchaseOrderLineStatus;
  /**
   * The 1-based row number within the originally uploaded file this line came from.
   * Persisted explicitly (see db/schema.ts purchaseOrderLines.sourceRow) -- never derive
   * this from the line's id. Legacy rows created before this field existed have a
   * best-effort reconstructed value; see the migration notes in db/schema.ts for how to
   * distinguish reconstructed legacy values from authentic ones going forward.
   */
  sourceRow: number;
}

export interface ExchangeRateSnapshot {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
  source: string;
  enteredBy: string;
  enteredAt: string;
}

export interface ReportingCurrencyConfig {
  id: string;
  reportingCurrency: string;
  effectiveDate: string;
}

// ---- Crosswalk ----

export type CrosswalkMatchMethod = "exact" | "normalized" | "fuzzy" | "manual";
export type CrosswalkReviewStatus = "unreviewed" | "approved" | "rejected";
export type CrosswalkMappingType = "one_to_one" | "one_to_many" | "many_to_one";

export interface PartNumberCrosswalk {
  id: string;
  plmPartId: string;
  erpPartId: string;
  matchMethod: CrosswalkMatchMethod;
  confidence: number;
  reviewStatus: CrosswalkReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  effectiveDate: string;
  notes: string | null;
  mappingType: CrosswalkMappingType;
  supersededById: string | null;
}

export type CrosswalkAllocationMethod = "fixed_quantity" | "percentage" | "plant_specific" | "supplier_specific" | "manual";

export interface CrosswalkAllocationRule {
  id: string;
  crosswalkId: string;
  method: CrosswalkAllocationMethod;
  plantCode: string | null;
  supplierId: string | null;
  fixedQuantity: number | null;
  percentage: number | null;
  notes: string | null;
  effectiveDate: string;
}

// ---- Alternate demand ----

export type DemandSourceType =
  | "unaffected_assembly"
  | "existing_independent_demand"
  | "replacement_use"
  | "transferable_inventory"
  | "shared_commodity";

export type AlternateDemandReviewStatus = "unreviewed" | "approved" | "rejected";
export type AlternateDemandAllocationStatus = "unallocated" | "partially_allocated" | "fully_allocated";

export interface AlternateDemandRecord {
  id: string;
  partId: string;
  demandSourceType: DemandSourceType;
  demandSourceId: string | null;
  affectedAssemblyId: string | null;
  quantityAvailableForOffset: number;
  demandDate: string | null;
  sourceReference: string | null;
  sourceFile: string | null;
  sourceRow: number | null;
  confidence: number;
  reviewStatus: AlternateDemandReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  allocationStatus: AlternateDemandAllocationStatus; // derived, not user-set
}

export type AllocationLedgerStatus = "active" | "reversed";

export interface AlternateDemandAllocation {
  id: string;
  alternateDemandRecordId: string;
  exposureRecordId: string;
  quantityAllocated: number;
  allocatedAt: string;
  allocatedBy: string;
  status: AllocationLedgerStatus;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
}

// ---- Exposure (immutable snapshot + calculated record) ----

export interface ExposureSourceSnapshot {
  id: string;
  engineeringChangeId: string;
  bomDiffEntryId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  supplierId: string;
  rawPartId: string;
  normalizedPartId: string;
  quantityOpen: number | null;
  unitPriceTransactionCurrency: number | null;
  transactionCurrency: string;
  reportingCurrency: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSnapshotId: string | null; // null only when transaction currency === reporting currency
  promisedReceiptDate: string | null;
  lineStatus: PurchaseOrderLineStatus;
  supplierTermsVersionId: string | null;
  crosswalkVersionId: string;
  alternateDemandAllocationIds: string[];
  sourceFiles: string[];
  sourceRows: number[];
  calculatedAt: string;
}

export type ExposureConfidence = "known" | "estimated" | "unresolved";

// Separate axis from ExposureConfidence: describes trust in the
// CANCELLATION information specifically, never the financial exposure
// amount. A "known" gross/net exposure value can coexist with "unknown"
// cancellation confidence — they answer different questions.
export type CancellationConfidence = "verified" | "supplier_reported" | "unverified" | "unknown";

export type CancellationStatus =
  | "known_cancellable"
  | "known_non_cancellable"
  | "supplier_confirmation_required"
  | "cancellation_terms_missing"
  | "cancellation_requested"
  | "cancellation_accepted"
  | "cancellation_partially_accepted"
  | "cancellation_rejected"
  | "received_before_action"
  | "redirected_to_alternate_demand";

export interface ExposureRecord {
  id: string;
  engineeringChangeId: string;
  partId: string;
  purchaseOrderLineId: string;
  exposureSourceSnapshotId: string;
  grossCommittedValueTransaction: number;
  grossCommittedValueReporting: number;
  alternateDemandAdjustmentTransaction: number;
  alternateDemandAdjustmentReporting: number;
  netExposureValueTransaction: number;
  netExposureValueReporting: number;
  confidenceClassification: ExposureConfidence;
  cancellationStatus: CancellationStatus;
  // Independent of confidenceClassification. Describes how trustworthy the
  // CANCELLATION information is, not whether the dollar amount is trustworthy.
  cancellationConfidence: CancellationConfidence;
  formulaVersion: string;
  calculatedAt: string;
  // Non-blocking diagnostic: why Unresolved/Estimated, if applicable — not in
  // original spec table but necessary for the UI to explain a classification
  // rather than just asserting it.
  classificationReason: string | null;
}

// ---- Mitigation / outcome ----

export type MitigationActionType = "cancel" | "redirect" | "negotiate" | "accept_loss" | "other";
export type MitigationActionStatus = "open" | "in_progress" | "done" | "abandoned";

export interface MitigationAction {
  id: string;
  exposureRecordId: string;
  actionType: MitigationActionType;
  ownerUserId: string;
  dueDate: string | null;
  status: MitigationActionStatus;
  createdAt: string;
}

export type SupplierResponseType = "accepted" | "partially_accepted" | "rejected" | "no_response";

export interface SupplierResponse {
  id: string;
  mitigationActionId: string;
  responseType: SupplierResponseType;
  quantityCancelled: number;
  quantityRedirected: number;
  quantityReceivedBeforeAction: number;
  respondedAt: string;
  recordedBy: string;
}

export type RecoverableValueBasis = "same_as_original" | "supplier_confirmed" | "estimated_market" | "write_down";

export interface FinancialOutcome {
  id: string;
  exposureRecordId: string;
  frozenUnitPrice: number;
  quantityCancelled: number;
  quantityRedirected: number;
  quantityReceivedBeforeAction: number;
  recoverableUnitValue: number | null;
  recoverableUnitValueBasis: RecoverableValueBasis | null;
  recoverableUnitValueJustificationNote: string | null;
  recoverableUnitValueReviewedBy: string | null;
  cancellationFee: number;
  supplierCreditValue: number;
  writeOffValue: number;
  reworkCost: number | null;
  disposalCost: number | null;
  // computed, never hand-entered:
  grossCancelledCommitmentValue: number; // = quantityCancelled * frozenUnitPrice
  cancelledCommitmentAvoidance: number; // = grossCancelledCommitmentValue — the fee is NOT subtracted here;
  // it appears exactly once, inside actualRealizedLoss. See CORRECTIONS.md.
  redirectedValuePreserved: number;
  actualCostAvoided: number;
  actualRealizedLoss: number;
  estimatedCostAvoidedFrozen: number;
  outcomeExchangeRateSnapshotId: string | null;
  closedAt: string | null;
  closedBy: string | null;
}

// net_mitigation_benefit is deliberately NOT a column here — it's a
// reporting-layer derivation computed in financialOutcome.ts, never stored
// as a second source of truth that could drift from its two inputs.

export type { AuditEntry };

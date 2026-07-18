import { pgTable, text, integer, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// Postgres schema (migrated from an earlier SQLite/better-sqlite3 version,
// which cannot run on Vercel's ephemeral serverless filesystem). Column
// choices worth noting:
//   - doublePrecision(), not pg's single-precision real(), to match the
//     double-precision floats JS numbers already are (and what the
//     original SQLite REAL columns actually stored).
//   - boolean() is native here; the earlier SQLite version emulated it
//     with integer(mode:"boolean").
//   - Timestamps and JSON-encoded fields (alternateDemandAllocationIds,
//     sourceFiles, sourceRows) are kept as text columns rather than
//     upgraded to native timestamp/jsonb types, to keep this migration a
//     pure driver/dialect swap with zero repository-code behavior change.
//     Upgrading those is tracked as a future improvement, not done here.

const id = () => text("id").primaryKey().$defaultFn(() => createId());
const timestamps = {
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
};

// ---- Organizations / Users (Phase 5 groundwork, unused until real auth lands) ----

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = pgTable("users", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").$type<
    "engineer" | "ccb" | "buyer" | "supply_chain_manager" | "finance" | "part_data_owner" | "admin"
  >().notNull(),
  ...timestamps,
});

// ---- Engineering Change / BOM ----

export const engineeringChanges = pgTable("engineering_changes", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  status: text("status").$type<"draft" | "mapping_review" | "exposure_calculated" | "mitigating" | "closed">().notNull(),
  createdBy: text("created_by").notNull(),
  targetEffectiveDate: text("target_effective_date"),
  ...timestamps,
});

export const bomImports = pgTable("bom_imports", {
  id: id(),
  engineeringChangeId: text("engineering_change_id").notNull().references(() => engineeringChanges.id),
  versionLabel: text("version_label").$type<"current" | "proposed">().notNull(),
  ingestionMode: text("ingestion_mode").$type<"current_and_proposed" | "redlined_single_file">().notNull(),
  sourceFile: text("source_file").notNull(),
  sourceSheet: text("source_sheet").notNull(),
  importedBy: text("imported_by").notNull(),
  ...timestamps,
});

export const bomLines = pgTable("bom_lines", {
  id: id(),
  bomImportId: text("bom_import_id").notNull().references(() => bomImports.id),
  partId: text("part_id"),
  rawPartNumber: text("raw_part_number").notNull(),
  rawDescription: text("raw_description").notNull(),
  quantityPer: doublePrecision("quantity_per"),
  quantityParseStatus: text("quantity_parse_status").$type<"ok" | "missing" | "invalid">().notNull(),
  parentBomLineId: text("parent_bom_line_id"),
  sourceRow: integer("source_row").notNull(),
});

export const bomDiffEntries = pgTable("bom_diff_entries", {
  id: id(),
  engineeringChangeId: text("engineering_change_id").notNull().references(() => engineeringChanges.id),
  partId: text("part_id").notNull(),
  changeType: text("change_type").$type<"added" | "removed" | "replaced" | "qty_reduced" | "qty_increased">().notNull(),
  fromQuantity: doublePrecision("from_quantity"),
  toQuantity: doublePrecision("to_quantity"),
  replacementPartId: text("replacement_part_id"),
});

// ---- Suppliers / Terms / PO ----

export const suppliers = pgTable("suppliers", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  erpSupplierId: text("erp_supplier_id"),
  defaultCancellationTermsNotes: text("default_cancellation_terms_notes"),
  ...timestamps,
});

// Versioned: a new row is inserted every time terms change; never UPDATE a
// past terms row in place. supersededById links old -> new, mirroring the
// crosswalk supersession pattern.
export const supplierCommitmentTerms = pgTable("supplier_commitment_terms", {
  id: id(),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id),
  partId: text("part_id"),
  ncnr: boolean("ncnr").notNull(),
  standardLeadTimeDays: integer("standard_lead_time_days"),
  cancellationWindowDays: integer("cancellation_window_days"),
  source: text("source").$type<"verified_contract" | "supplier_provided" | "unconfirmed">().notNull(),
  effectiveDate: text("effective_date").notNull(),
  notes: text("notes"),
  verifiedAt: text("verified_at"),
  verifiedBy: text("verified_by"),
  validUntil: text("valid_until"),
  supersededById: text("superseded_by_id"),
  ...timestamps,
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  // INTERIM: a real production model shares one PO master across many
  // engineering changes (a PO becomes "relevant" to an EC via BOM-diff
  // part-number matching at exposure-calculation time, not at upload time).
  // That join isn't built yet -- this column is a pragmatic stand-in so
  // this phase's per-EC PO-import UX keeps working, flagged as a known gap
  // rather than silently treated as the final shape.
  engineeringChangeId: text("engineering_change_id").references(() => engineeringChanges.id),
  poNumber: text("po_number").notNull(),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id),
  sourceFile: text("source_file").notNull(),
  importedAt: text("imported_at").notNull(),
});

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: id(),
  purchaseOrderId: text("purchase_order_id").notNull().references(() => purchaseOrders.id),
  partId: text("part_id"),
  rawPartNumber: text("raw_part_number").notNull(),
  quantityOpen: doublePrecision("quantity_open"),
  quantityParseStatus: text("quantity_parse_status").$type<"ok" | "missing" | "invalid">().notNull(),
  transactionCurrency: text("transaction_currency").notNull(),
  unitPriceTransactionCurrency: doublePrecision("unit_price_transaction_currency"),
  priceParseStatus: text("price_parse_status").$type<"ok" | "missing" | "invalid">().notNull(),
  promisedReceiptDate: text("promised_receipt_date"),
  lineStatus: text("line_status").$type<"open" | "received" | "cancelled">().notNull(),
});

// Versioned: never mutate a past rate, insert a new one.
export const exchangeRateSnapshots = pgTable("exchange_rate_snapshots", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  baseCurrency: text("base_currency").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  rate: doublePrecision("rate").notNull(),
  rateDate: text("rate_date").notNull(),
  source: text("source").notNull(),
  enteredBy: text("entered_by").notNull(),
  enteredAt: text("entered_at").notNull(),
});

// ---- Crosswalk ----

export const partNumberCrosswalks = pgTable("part_number_crosswalks", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  plmPartId: text("plm_part_id").notNull(),
  erpPartId: text("erp_part_id").notNull(),
  matchMethod: text("match_method").$type<"exact" | "normalized" | "fuzzy" | "manual">().notNull(),
  confidence: doublePrecision("confidence").notNull(),
  matchEvidence: text("match_evidence"),
  reviewStatus: text("review_status").$type<"unreviewed" | "approved" | "rejected">().notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  effectiveDate: text("effective_date").notNull(),
  notes: text("notes"),
  mappingType: text("mapping_type").$type<"one_to_one" | "one_to_many" | "many_to_one">().notNull(),
  supersededById: text("superseded_by_id"),
});

export const crosswalkAllocationRules = pgTable("crosswalk_allocation_rules", {
  id: id(),
  crosswalkId: text("crosswalk_id").notNull().references(() => partNumberCrosswalks.id),
  method: text("method").$type<"fixed_quantity" | "percentage" | "plant_specific" | "supplier_specific" | "manual">().notNull(),
  plantCode: text("plant_code"),
  supplierId: text("supplier_id"),
  fixedQuantity: doublePrecision("fixed_quantity"),
  percentage: doublePrecision("percentage"),
  notes: text("notes"),
  effectiveDate: text("effective_date").notNull(),
});

// ---- Alternate demand ----

export const alternateDemandRecords = pgTable("alternate_demand_records", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  partId: text("part_id").notNull(),
  demandSourceType: text("demand_source_type").$type<
    "unaffected_assembly" | "existing_independent_demand" | "replacement_use" | "transferable_inventory" | "shared_commodity"
  >().notNull(),
  demandSourceId: text("demand_source_id"),
  affectedAssemblyId: text("affected_assembly_id"),
  quantityAvailableForOffset: doublePrecision("quantity_available_for_offset").notNull(),
  demandDate: text("demand_date"),
  sourceReference: text("source_reference"),
  sourceFile: text("source_file"),
  sourceRow: integer("source_row"),
  confidence: doublePrecision("confidence").notNull(),
  reviewStatus: text("review_status").$type<"unreviewed" | "approved" | "rejected">().notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
});

export const alternateDemandAllocations = pgTable("alternate_demand_allocations", {
  id: id(),
  alternateDemandRecordId: text("alternate_demand_record_id").notNull().references(() => alternateDemandRecords.id),
  exposureRecordId: text("exposure_record_id").notNull(),
  quantityAllocated: doublePrecision("quantity_allocated").notNull(),
  allocatedAt: text("allocated_at").notNull(),
  allocatedBy: text("allocated_by").notNull(),
  status: text("status").$type<"active" | "reversed">().notNull(),
  reversedAt: text("reversed_at"),
  reversedBy: text("reversed_by"),
  reversalReason: text("reversal_reason"),
});

// ---- Exposure: immutable snapshot + calculated record ----
// NEVER UPDATE these tables after insert. Recalculation always inserts a
// new snapshot + record pair. Enforced at the repository layer (no update
// function exists for either), not just by convention.

export const exposureSourceSnapshots = pgTable("exposure_source_snapshots", {
  id: id(),
  engineeringChangeId: text("engineering_change_id").notNull().references(() => engineeringChanges.id),
  bomDiffEntryId: text("bom_diff_entry_id").notNull(),
  purchaseOrderId: text("purchase_order_id").notNull(),
  purchaseOrderLineId: text("purchase_order_line_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  rawPartId: text("raw_part_id").notNull(),
  normalizedPartId: text("normalized_part_id").notNull(),
  quantityOpen: doublePrecision("quantity_open"),
  unitPriceTransactionCurrency: doublePrecision("unit_price_transaction_currency"),
  transactionCurrency: text("transaction_currency").notNull(),
  reportingCurrency: text("reporting_currency").notNull(),
  exchangeRate: doublePrecision("exchange_rate").notNull(),
  exchangeRateDate: text("exchange_rate_date").notNull(),
  exchangeRateSnapshotId: text("exchange_rate_snapshot_id"),
  promisedReceiptDate: text("promised_receipt_date"),
  lineStatus: text("line_status").notNull(),
  supplierTermsVersionId: text("supplier_terms_version_id"),
  crosswalkVersionId: text("crosswalk_version_id").notNull(),
  alternateDemandAllocationIds: text("alternate_demand_allocation_ids").notNull(),
  sourceFiles: text("source_files").notNull(),
  sourceRows: text("source_rows").notNull(),
  calculatedAt: text("calculated_at").notNull(),
});

export const exposureRecords = pgTable("exposure_records", {
  id: id(),
  engineeringChangeId: text("engineering_change_id").notNull().references(() => engineeringChanges.id),
  partId: text("part_id").notNull(),
  purchaseOrderLineId: text("purchase_order_line_id").notNull(),
  exposureSourceSnapshotId: text("exposure_source_snapshot_id").notNull().references(() => exposureSourceSnapshots.id),
  grossCommittedValueTransaction: doublePrecision("gross_committed_value_transaction").notNull(),
  grossCommittedValueReporting: doublePrecision("gross_committed_value_reporting").notNull(),
  alternateDemandAdjustmentTransaction: doublePrecision("alternate_demand_adjustment_transaction").notNull(),
  alternateDemandAdjustmentReporting: doublePrecision("alternate_demand_adjustment_reporting").notNull(),
  netExposureValueTransaction: doublePrecision("net_exposure_value_transaction").notNull(),
  netExposureValueReporting: doublePrecision("net_exposure_value_reporting").notNull(),
  confidenceClassification: text("confidence_classification").$type<"known" | "estimated" | "unresolved">().notNull(),
  cancellationStatus: text("cancellation_status").notNull(),
  cancellationConfidence: text("cancellation_confidence").$type<"verified" | "supplier_reported" | "unverified" | "unknown">().notNull(),
  formulaVersion: text("formula_version").notNull(),
  calculatedAt: text("calculated_at").notNull(),
  classificationReason: text("classification_reason"),
  supersededById: text("superseded_by_id"),
});

// ---- Mitigation / outcome ----

export const mitigationActions = pgTable("mitigation_actions", {
  id: id(),
  exposureRecordId: text("exposure_record_id").notNull().references(() => exposureRecords.id),
  actionType: text("action_type").$type<"cancel" | "redirect" | "negotiate" | "accept_loss" | "other">().notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  dueDate: text("due_date"),
  status: text("status").$type<"open" | "in_progress" | "done" | "abandoned">().notNull(),
  ...timestamps,
});

export const supplierResponses = pgTable("supplier_responses", {
  id: id(),
  mitigationActionId: text("mitigation_action_id").notNull().references(() => mitigationActions.id),
  responseType: text("response_type").$type<"accepted" | "partially_accepted" | "rejected" | "no_response">().notNull(),
  quantityCancelled: doublePrecision("quantity_cancelled").notNull(),
  quantityRedirected: doublePrecision("quantity_redirected").notNull(),
  quantityReceivedBeforeAction: doublePrecision("quantity_received_before_action").notNull(),
  respondedAt: text("responded_at").notNull(),
  recordedBy: text("recorded_by").notNull(),
});

export const financialOutcomes = pgTable("financial_outcomes", {
  id: id(),
  exposureRecordId: text("exposure_record_id").notNull().references(() => exposureRecords.id),
  frozenUnitPrice: doublePrecision("frozen_unit_price").notNull(),
  quantityCancelled: doublePrecision("quantity_cancelled").notNull(),
  quantityRedirected: doublePrecision("quantity_redirected").notNull(),
  quantityReceivedBeforeAction: doublePrecision("quantity_received_before_action").notNull(),
  recoverableUnitValue: doublePrecision("recoverable_unit_value"),
  recoverableUnitValueBasis: text("recoverable_unit_value_basis").$type<"same_as_original" | "supplier_confirmed" | "estimated_market" | "write_down">(),
  recoverableUnitValueJustificationNote: text("recoverable_unit_value_justification_note"),
  recoverableUnitValueReviewedBy: text("recoverable_unit_value_reviewed_by"),
  cancellationFee: doublePrecision("cancellation_fee").notNull(),
  supplierCreditValue: doublePrecision("supplier_credit_value").notNull(),
  writeOffValue: doublePrecision("write_off_value").notNull(),
  reworkCost: doublePrecision("rework_cost"),
  disposalCost: doublePrecision("disposal_cost"),
  grossCancelledCommitmentValue: doublePrecision("gross_cancelled_commitment_value").notNull(),
  cancelledCommitmentAvoidance: doublePrecision("cancelled_commitment_avoidance").notNull(),
  redirectedValuePreserved: doublePrecision("redirected_value_preserved").notNull(),
  actualCostAvoided: doublePrecision("actual_cost_avoided").notNull(),
  actualRealizedLoss: doublePrecision("actual_realized_loss").notNull(),
  estimatedCostAvoidedFrozen: doublePrecision("estimated_cost_avoided_frozen").notNull(),
  outcomeExchangeRateSnapshotId: text("outcome_exchange_rate_snapshot_id"),
  closedAt: text("closed_at"),
  closedBy: text("closed_by"),
});

// ---- Audit log: append-only, nothing ever deleted, only superseded ----

export const auditLogEntries = pgTable("audit_log_entries", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  engineeringChangeId: text("engineering_change_id"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  beforeSnapshot: text("before_snapshot"),
  afterSnapshot: text("after_snapshot"),
  timestamp: text("timestamp").notNull(),
});

import {
  BomDiffEntry,
  CrosswalkAllocationRule,
  ExchangeRateSnapshot,
  PartNumberCrosswalk,
  PurchaseOrderLine,
  SupplierCommitmentTerms,
} from "../types";

// This is the DeltaLedger analogue of the factoring prototype's synthetic
// workbook: hand-authored fixture data covering every scenario the spec's
// revised §7 asked for (two currencies, crosswalk allocation cases, a
// staleness case, an unmapped gap). There's no uploaded source file for
// this product, so it lives as typed fixtures rather than an .xlsx — the
// ingestion layer that would read a real workbook was already exercised
// separately in Day 1-2's tests.

export const AS_OF_DATE = "2026-07-16";
export const REPORTING_CURRENCY = "USD";
export const REPORTING_CONFIG = {
  formulaVersion: "v1",
  asOfDate: AS_OF_DATE,
  reportingCurrency: REPORTING_CURRENCY,
};

// --- Case A: PN-100, removed, USD, alternate demand approved -> Known ---
export const DIFF_PN_100: BomDiffEntry = {
  id: "diff-100",
  engineeringChangeId: "ec-1",
  partId: "PN-100",
  changeType: "removed",
  fromQuantity: 500,
  toQuantity: null,
  replacementPartId: null,
};

export const PO_LINE_PN_100: PurchaseOrderLine = {
  id: "poline-100",
  purchaseOrderId: "po-1",
  partId: null,
  rawPartNumber: "PN-100",
  quantityOpen: 500,
  quantityParseStatus: "ok",
  transactionCurrency: "USD",
  unitPriceTransactionCurrency: 20,
  priceParseStatus: "ok",
  promisedReceiptDate: "2026-09-01",
  lineStatus: "open",
  sourceRow: 1,
};

export const CROSSWALK_PN_100: PartNumberCrosswalk = {
  id: "cw-100",
  plmPartId: "PN-100",
  erpPartId: "ERP-100",
  matchMethod: "exact",
  confidence: 1,
  reviewStatus: "approved",
  reviewedBy: "part-owner-1",
  reviewedAt: "2026-07-01T00:00:00Z",
  effectiveDate: "2026-07-01",
  notes: null,
  mappingType: "one_to_one",
  supersededById: null,
};

export const TERMS_SUPPLIER_A: SupplierCommitmentTerms = {
  id: "terms-a",
  supplierId: "supplier-a",
  partId: null,
  ncnr: false,
  standardLeadTimeDays: 45,
  cancellationWindowDays: 30,
  source: "verified_contract",
  effectiveDate: "2026-01-01",
  notes: null,
  verifiedAt: "2026-06-01T00:00:00Z",
  verifiedBy: "part-owner-1",
  validUntil: "2027-01-01",
  stalenessStatus: "current",
};

// --- Case B: PN-200, qty_reduced, EUR, no alternate demand -> Estimated ---
export const DIFF_PN_200: BomDiffEntry = {
  id: "diff-200",
  engineeringChangeId: "ec-1",
  partId: "PN-200",
  changeType: "qty_reduced",
  fromQuantity: 1000,
  toQuantity: 400,
  replacementPartId: null,
};

export const PO_LINE_PN_200: PurchaseOrderLine = {
  id: "poline-200",
  purchaseOrderId: "po-2",
  partId: null,
  rawPartNumber: "PN-200",
  quantityOpen: 600,
  quantityParseStatus: "ok",
  transactionCurrency: "EUR",
  unitPriceTransactionCurrency: 15,
  priceParseStatus: "ok",
  promisedReceiptDate: "2026-08-15",
  lineStatus: "open",
  sourceRow: 1,
};

export const CROSSWALK_PN_200: PartNumberCrosswalk = {
  id: "cw-200",
  plmPartId: "PN-200",
  erpPartId: "ERP-200",
  matchMethod: "exact",
  confidence: 1,
  reviewStatus: "approved",
  reviewedBy: "part-owner-1",
  reviewedAt: "2026-07-01T00:00:00Z",
  effectiveDate: "2026-07-01",
  notes: null,
  mappingType: "one_to_one",
  supersededById: null,
};

// Verified contract, but EXPIRED — must not support a Known-grade
// cancellation status, and must NOT touch the exposure amount at all.
export const TERMS_SUPPLIER_B: SupplierCommitmentTerms = {
  id: "terms-b",
  supplierId: "supplier-b",
  partId: null,
  ncnr: false,
  standardLeadTimeDays: 60,
  cancellationWindowDays: 45,
  source: "verified_contract",
  effectiveDate: "2024-01-01",
  notes: null,
  verifiedAt: "2024-01-01T00:00:00Z",
  verifiedBy: "part-owner-1",
  validUntil: "2025-01-01",
  stalenessStatus: "expired",
};

// --- Case C: PN-300, removed, crosswalk unreviewed -> Unmapped Exposure Gap ---
export const DIFF_PN_300: BomDiffEntry = {
  id: "diff-300",
  engineeringChangeId: "ec-1",
  partId: "PN-300",
  changeType: "removed",
  fromQuantity: 50,
  toQuantity: null,
  replacementPartId: null,
};

export const PO_LINE_PN_300: PurchaseOrderLine = {
  id: "poline-300",
  purchaseOrderId: "po-3",
  partId: null,
  rawPartNumber: "PN-300",
  quantityOpen: 50,
  quantityParseStatus: "ok",
  transactionCurrency: "USD",
  unitPriceTransactionCurrency: 5,
  priceParseStatus: "ok",
  promisedReceiptDate: "2026-08-01",
  lineStatus: "open",
  sourceRow: 1,
};

export const CROSSWALK_PN_300: PartNumberCrosswalk = {
  id: "cw-300",
  plmPartId: "PN-300",
  erpPartId: "ERP-300",
  matchMethod: "fuzzy",
  confidence: 0.7,
  reviewStatus: "unreviewed", // <-- not approved
  reviewedBy: null,
  reviewedAt: null,
  effectiveDate: "2026-07-01",
  notes: null,
  mappingType: "one_to_one",
  supersededById: null,
};

// --- Case D: PN-400, removed, one_to_many crosswalk with invalid percentages -> Unresolved ---
export const DIFF_PN_400: BomDiffEntry = {
  id: "diff-400",
  engineeringChangeId: "ec-1",
  partId: "PN-400",
  changeType: "removed",
  fromQuantity: 200,
  toQuantity: null,
  replacementPartId: null,
};

export const PO_LINE_PN_400: PurchaseOrderLine = {
  id: "poline-400",
  purchaseOrderId: "po-4",
  partId: null,
  rawPartNumber: "PN-400",
  quantityOpen: 200,
  quantityParseStatus: "ok",
  transactionCurrency: "USD",
  unitPriceTransactionCurrency: 8,
  priceParseStatus: "ok",
  promisedReceiptDate: "2026-08-10",
  lineStatus: "open",
  sourceRow: 1,
};

export const CROSSWALK_PN_400: PartNumberCrosswalk = {
  id: "cw-400",
  plmPartId: "PN-400",
  erpPartId: "ERP-400",
  matchMethod: "manual",
  confidence: 1,
  reviewStatus: "approved",
  reviewedBy: "part-owner-1",
  reviewedAt: "2026-07-01T00:00:00Z",
  effectiveDate: "2026-07-01",
  notes: null,
  mappingType: "one_to_many",
  supersededById: null,
};

// Deliberately sums to 95%, not 100% — must resolve Unresolved, never guess.
export const CROSSWALK_PN_400_RULES: CrosswalkAllocationRule[] = [
  {
    id: "rule-400-a",
    crosswalkId: "cw-400",
    method: "percentage",
    plantCode: null,
    supplierId: null,
    fixedQuantity: null,
    percentage: 60,
    notes: null,
    effectiveDate: "2026-07-01",
  },
  {
    id: "rule-400-b",
    crosswalkId: "cw-400",
    method: "percentage",
    plantCode: null,
    supplierId: null,
    fixedQuantity: null,
    percentage: 35,
    notes: null,
    effectiveDate: "2026-07-01",
  },
];

export const EXCHANGE_RATES: ExchangeRateSnapshot[] = [
  {
    id: "fx-1",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    rate: 1.08,
    rateDate: "2026-07-01",
    source: "manual upload",
    enteredBy: "finance-1",
    enteredAt: "2026-07-01T00:00:00Z",
  },
];

import { RawTable } from "@/core/ingestion/types";
import { normalizeDataset } from "@/core/normalization/normalizeDataset";
import { cleanString, parseCurrency, parseDate } from "@/core/normalization/parsers";
import { buildPoColumnMappings } from "@/domains/deltaledger/ingestion/mapping";
import { PurchaseOrder, PurchaseOrderLine, QuantityParseStatus, Supplier } from "@/domains/deltaledger/types";
import { defaultIdGenerator } from "@/domains/deltaledger/idGenerator";

function parseQty(raw: string | number | null | undefined): { value: number | null; status: QuantityParseStatus } {
  if (raw === null || raw === undefined || raw === "") return { value: null, status: "missing" };
  const parsed = parseCurrency(raw);
  if (parsed === null) return { value: null, status: "invalid" };
  return { value: parsed, status: "ok" };
}

export interface IngestedPurchaseOrders {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  lines: PurchaseOrderLine[];
}

/**
 * A real open-PO export typically spans many PO numbers and suppliers in
 * one file -- po_number and supplier_name are per-row fields in the source,
 * but PurchaseOrder/Supplier are per-entity in the domain model. This
 * function does the grouping the domain-level normalizePoLines() doesn't
 * attempt (it assumes one already-known purchaseOrderId), using the exact
 * same parsing helpers (parseCurrency/parseDate/cleanString) so quantity/
 * price handling stays identical -- never coerced to zero, same as
 * normalizePoLines.
 */
export function ingestPurchaseOrderFile(
  table: RawTable,
  sourceFileName: string,
  importedAt: string
): IngestedPurchaseOrders {
  const mappings = buildPoColumnMappings(table);

  const rawRows = normalizeDataset<{
    poNumber: string;
    supplierName: string;
    rawPartNumber: string;
    quantityOpen: number | null;
    quantityParseStatus: QuantityParseStatus;
    unitPrice: number | null;
    priceParseStatus: QuantityParseStatus;
    transactionCurrency: string;
    promisedReceiptDate: string | null;
    sourceRow: number;
  }>(table, mappings, { fileName: sourceFileName, sheetName: "Open PO", isUploaded: true }, (rawByField, sourceRow) => {
    const qty = parseQty(rawByField["quantity_open"]);
    const price = parseQty(rawByField["unit_price"]);
    return {
      poNumber: cleanString(rawByField["po_number"] ?? null),
      supplierName: cleanString(rawByField["supplier_name"] ?? null),
      rawPartNumber: cleanString(rawByField["part_number"] ?? null),
      quantityOpen: qty.value,
      quantityParseStatus: qty.status,
      unitPrice: price.value,
      priceParseStatus: price.status,
      transactionCurrency: cleanString(rawByField["transaction_currency"] ?? null) || "USD",
      promisedReceiptDate: parseDate(rawByField["promised_receipt_date"] ?? null),
      sourceRow,
    };
  });

  const supplierByName = new Map<string, Supplier>();
  const poByNumber = new Map<string, PurchaseOrder>();
  const lines: PurchaseOrderLine[] = [];

  for (const row of rawRows) {
    if (!supplierByName.has(row.supplierName)) {
      supplierByName.set(row.supplierName, {
        id: defaultIdGenerator.next("supplier"),
        name: row.supplierName || "(unknown supplier)",
        erpSupplierId: null,
        defaultCancellationTermsNotes: null,
        createdAt: importedAt,
      });
    }
    const supplier = supplierByName.get(row.supplierName)!;

    if (!poByNumber.has(row.poNumber)) {
      poByNumber.set(row.poNumber, {
        id: defaultIdGenerator.next("po"),
        poNumber: row.poNumber || "(unknown PO)",
        supplierId: supplier.id,
        sourceFile: sourceFileName,
        importedAt,
      });
    }
    const po = poByNumber.get(row.poNumber)!;

    lines.push({
      id: defaultIdGenerator.next("poline"),
      purchaseOrderId: po.id,
      partId: null,
      rawPartNumber: row.rawPartNumber,
      quantityOpen: row.quantityOpen,
      quantityParseStatus: row.quantityParseStatus,
      transactionCurrency: row.transactionCurrency,
      unitPriceTransactionCurrency: row.unitPrice,
      priceParseStatus: row.priceParseStatus,
      promisedReceiptDate: row.promisedReceiptDate,
      lineStatus: "open",
      sourceRow: row.sourceRow,
    });
  }

  return {
    suppliers: Array.from(supplierByName.values()),
    purchaseOrders: Array.from(poByNumber.values()),
    lines,
  };
}

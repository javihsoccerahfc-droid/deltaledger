import { RawTable, SourceDescriptor } from "@/core/ingestion/types";
import { normalizeDataset } from "@/core/normalization/normalizeDataset";
import { cleanString, parseCurrency, parseDate } from "@/core/normalization/parsers";
import { ColumnMapping } from "@/core/schema/mappingTypes";
import { PurchaseOrderLine, QuantityParseStatus } from "../types";
import { buildPoColumnMappings } from "./mapping";

function parseQuantityField(raw: string | number | null | undefined): {
  value: number | null;
  status: QuantityParseStatus;
} {
  if (raw === null || raw === undefined || raw === "") return { value: null, status: "missing" };
  const parsed = parseCurrency(raw);
  if (parsed === null) return { value: null, status: "invalid" };
  return { value: parsed, status: "ok" };
}

/**
 * Normalizes a raw open-PO sheet into PurchaseOrderLine records.
 *
 * quantity_open and unit_price are NEVER coerced to 0 when blank or
 * unparseable — a missing PO quantity/price must never be indistinguishable
 * from a genuine $0 commitment. The exposure-calculation eligibility gate
 * (§4.1 of the spec) must check quantityParseStatus/priceParseStatus === "ok"
 * before treating a line as calculable — this is enforced in the exposure
 * engine (Day 5), not here; this function only refuses to guess.
 *
 * part_id is left null — resolved later via PartNumberCrosswalk.
 * line_status defaults to "open" since this is, by definition, an open-PO
 * export; a real feed might include already-received/cancelled lines too,
 * in which case a status column would need to be mapped — deferred until a
 * real customer export shows that need.
 */
export function normalizePoLines(
  purchaseOrderId: string,
  table: RawTable,
  source: SourceDescriptor,
  mappings?: ColumnMapping[]
): PurchaseOrderLine[] {
  const effectiveMappings = mappings ?? buildPoColumnMappings(table);

  return normalizeDataset<PurchaseOrderLine>(table, effectiveMappings, source, (rawByField, sourceRow) => {
    const rawPartNumber = cleanString(rawByField["part_number"] ?? null);
    const currency = cleanString(rawByField["transaction_currency"] ?? null) || "USD";
    const promisedReceiptDate = parseDate(rawByField["promised_receipt_date"] ?? null);

    const qty = parseQuantityField(rawByField["quantity_open"]);
    const price = parseQuantityField(rawByField["unit_price"]);

    return {
      id: `${purchaseOrderId}:${sourceRow}`,
      purchaseOrderId,
      partId: null,
      rawPartNumber,
      quantityOpen: qty.value,
      quantityParseStatus: qty.status,
      transactionCurrency: currency,
      unitPriceTransactionCurrency: price.value,
      priceParseStatus: price.status,
      promisedReceiptDate,
      lineStatus: "open",
      sourceRow,
    };
  });
}

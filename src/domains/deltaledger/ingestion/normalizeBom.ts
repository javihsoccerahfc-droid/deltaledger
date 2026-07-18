import { RawTable, SourceDescriptor } from "@/core/ingestion/types";
import { normalizeDataset } from "@/core/normalization/normalizeDataset";
import { cleanString, parseCurrency } from "@/core/normalization/parsers";
import { ColumnMapping } from "@/core/schema/mappingTypes";
import { BomLine, QuantityParseStatus } from "../types";
import { buildBomColumnMappings } from "./mapping";

/**
 * Normalizes a raw BOM sheet into BomLine records. part_id is left null here
 * — it's resolved later through PartNumberCrosswalk, never guessed at
 * ingestion time. quantity_per uses parseCurrency (not a currency, but the
 * same tolerant numeric-string parser: handles "2", "2.0", "2,000" etc.
 * identically) rather than a bespoke quantity parser, since the parsing
 * problem — "turn a possibly-messy numeric string into a number or null" —
 * is identical.
 *
 * A blank or unparseable quantity is NEVER coerced to 0 — that would make a
 * missing quantity indistinguishable from a genuine zero-quantity line
 * (the same class of bug corrected in the factoring prototype's balance
 * handling). quantityPer stays null with quantityParseStatus recording why.
 */
export function normalizeBomLines(
  bomImportId: string,
  table: RawTable,
  source: SourceDescriptor,
  mappings?: ColumnMapping[]
): BomLine[] {
  const effectiveMappings = mappings ?? buildBomColumnMappings(table);

  return normalizeDataset<BomLine>(table, effectiveMappings, source, (rawByField, sourceRow) => {
    const rawPartNumber = cleanString(rawByField["part_number"] ?? null);
    const rawDescription = cleanString(rawByField["description"] ?? null);

    const rawQty = rawByField["quantity_per"];
    let quantityPer: number | null;
    let quantityParseStatus: QuantityParseStatus;
    if (rawQty === null || rawQty === undefined || rawQty === "") {
      quantityPer = null;
      quantityParseStatus = "missing";
    } else {
      const parsed = parseCurrency(rawQty);
      if (parsed === null) {
        quantityPer = null;
        quantityParseStatus = "invalid";
      } else {
        quantityPer = parsed;
        quantityParseStatus = "ok";
      }
    }

    return {
      id: `${bomImportId}:${sourceRow}`,
      bomImportId,
      partId: null, // resolved via PartNumberCrosswalk, not here
      rawPartNumber,
      rawDescription,
      quantityPer,
      quantityParseStatus,
      parentBomLineId: null,
      sourceRow,
    };
  });
}

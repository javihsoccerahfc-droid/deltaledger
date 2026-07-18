import { RawTable, SourceDescriptor } from "../ingestion/types";
import { ColumnMapping } from "../schema/mappingTypes";

/**
 * Iterates a RawTable's rows and, for each one, hands the domain a
 * dictionary of raw values keyed by target field (for every mapped column)
 * plus the 1-based source row number and source descriptor. The domain
 * supplies `build`, which does all domain-specific parsing/derivation and
 * returns the fully-formed record. This keeps row iteration and column
 * lookup generic while all domain vocabulary stays in the caller.
 */
export function normalizeDataset<T>(
  table: RawTable,
  mappings: ColumnMapping[],
  source: SourceDescriptor,
  build: (rawByField: Record<string, string | number | null>, sourceRow: number) => T
): T[] {
  const fieldToColIndex = new Map<string, number>();
  mappings.forEach((m, idx) => {
    if (m.targetField !== "unmapped") fieldToColIndex.set(m.targetField, idx);
  });

  return table.rows.map((row, idx) => {
    const rawByField: Record<string, string | number | null> = {};
    for (const [field, colIdx] of fieldToColIndex) {
      rawByField[field] = row[colIdx] ?? null;
    }
    return build(rawByField, idx + 1);
  });
}

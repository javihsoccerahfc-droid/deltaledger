import * as XLSX from "xlsx";
import { RawTable } from "./types";
import { normalizeCellValue } from "./parseXlsx";

/**
 * Parses a CSV file's raw text into a RawTable using SheetJS (which reads
 * CSV text directly into a single-sheet workbook). The header row is
 * assumed to be the first non-empty row. cellDates:true lets SheetJS's own
 * date detection handle the mixed formats seen in real submissions; dates
 * are then normalized to ISO strings at the ingestion boundary.
 */
export async function parseCsvFile(file: File): Promise<RawTable> {
  const text = await file.text();
  const workbook = XLSX.read(text, { type: "string", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const [headerRow, ...dataRows] = rawRows;
  const headers = ((headerRow as unknown[]) ?? []).map((h) => (h === null ? "" : String(h)));
  const rows = dataRows.map((row) => row.map(normalizeCellValue));
  return { headers, rows };
}

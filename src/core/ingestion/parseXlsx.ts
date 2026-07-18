import * as XLSX from "xlsx";
import { RawTable, SheetInfo } from "./types";

export interface ParsedWorkbook {
  sheetNames: string[];
  getSheetInfo(sheetName: string): SheetInfo;
  getSheetTable(sheetName: string): RawTable;
}

/**
 * Parses an XLSX (or legacy XLS) file's raw bytes into a workbook handle.
 * The header row is assumed to be the first non-empty row of the sheet —
 * this prototype does not attempt to locate a header row buried further
 * down a messy sheet.
 */
export async function parseXlsxFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  return {
    sheetNames: workbook.SheetNames,
    getSheetInfo(sheetName: string): SheetInfo {
      const sheet = workbook.Sheets[sheetName];
      const ref = sheet["!ref"];
      const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      return {
        name: sheetName,
        rowCount: range.e.r - range.s.r + 1,
        columnCount: range.e.c - range.s.c + 1,
      };
    },
    getSheetTable(sheetName: string): RawTable {
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
    },
  };
}

/**
 * SheetJS (with cellDates:true) turns date-like cells into JS Date objects.
 * Everything downstream of ingestion expects the string | number | null
 * shape documented on RawTable, so dates are converted to an ISO
 * "YYYY-MM-DD" string right here at the ingestion boundary.
 */
export function normalizeCellValue(v: unknown): string | number | null {
  if (v instanceof Date) {
    const yyyy = v.getUTCFullYear();
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(v.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (v === undefined) return null;
  return v as string | number | null;
}

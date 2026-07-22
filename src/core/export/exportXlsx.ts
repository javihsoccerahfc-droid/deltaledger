import * as XLSX from "xlsx";

export interface WorkbookSheet {
  name: string;
  rows: Record<string, unknown>[];
  columns?: string[];
}

export function buildWorkbook(sheets: WorkbookSheet[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows, sheet.columns ? { header: sheet.columns } : undefined);
    XLSX.utils.book_append_sheet(wb, worksheet, sheet.name);
  }
  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

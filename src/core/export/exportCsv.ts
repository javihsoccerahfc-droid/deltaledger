import * as XLSX from "xlsx";

export function buildCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  return XLSX.utils.sheet_to_csv(worksheet);
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

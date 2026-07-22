import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseXlsxFile } from "@/core/ingestion/parseXlsx";
import { parseCsvFile } from "@/core/ingestion/parseCsv";

// This test exists specifically to be run BEFORE and AFTER any xlsx package
// version change (e.g. the deferred SheetJS CDN remediation documented in
// XLSX_REMEDIATION.md). If this test still passes unchanged after swapping
// the dependency, the ingestion-facing API surface this codebase actually
// uses (XLSX.read/write, sheet_to_json, aoa_to_sheet, cellDates) is behaving
// identically and the swap is safe to merge.

function buildXlsxFile(sheets: Record<string, (string | number | Date)[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buffer], "regression.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("xlsx package regression check (run across any xlsx version change)", () => {
  it("preserves multiple sheets, headers, dates, and numeric cells through a full write -> read round trip", async () => {
    const file = buildXlsxFile({
      "Open PO": [
        ["PO Number", "Part Number", "Quantity Open", "Unit Price", "Promised Receipt Date"],
        ["PO-1001", "PN-500", 250, 12.75, new Date(Date.UTC(2026, 8, 1))], // Sept 1, 2026
        ["PO-1002", "PN-501", 40, 199.99, new Date(Date.UTC(2026, 9, 15))], // Oct 15, 2026
      ],
      Suppliers: [
        ["Supplier Name", "NCNR"],
        ["Acme Fabrication", "TRUE"],
      ],
    });

    const workbook = await parseXlsxFile(file);

    // Multiple sheets preserved, in order, by name.
    expect(workbook.sheetNames).toEqual(["Open PO", "Suppliers"]);

    const poTable = workbook.getSheetTable("Open PO");
    expect(poTable.headers).toEqual(["PO Number", "Part Number", "Quantity Open", "Unit Price", "Promised Receipt Date"]);

    // Numeric cells preserved exactly.
    expect(poTable.rows[0][2]).toBe(250);
    expect(poTable.rows[0][3]).toBe(12.75);
    expect(poTable.rows[1][2]).toBe(40);
    expect(poTable.rows[1][3]).toBe(199.99);

    // Date cells normalized to ISO YYYY-MM-DD strings at the ingestion boundary.
    expect(poTable.rows[0][4]).toBe("2026-09-01");
    expect(poTable.rows[1][4]).toBe("2026-10-15");

    const supplierTable = workbook.getSheetTable("Suppliers");
    expect(supplierTable.headers).toEqual(["Supplier Name", "NCNR"]);
    expect(supplierTable.rows[0]).toEqual(["Acme Fabrication", "TRUE"]);
  });

  it("preserves the same round trip through CSV text parsing", async () => {
    const csv =
      "PO Number,Part Number,Quantity Open,Unit Price,Promised Receipt Date\n" +
      "PO-2001,PN-900,100,45.5,2026-11-01";
    const file = new File([csv], "regression.csv", { type: "text/csv" });
    const table = await parseCsvFile(file);

    expect(table.headers).toEqual(["PO Number", "Part Number", "Quantity Open", "Unit Price", "Promised Receipt Date"]);
    expect(table.rows[0]).toEqual(["PO-2001", "PN-900", 100, 45.5, "2026-11-01"]);
  });
});

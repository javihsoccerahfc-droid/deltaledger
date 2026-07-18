import { describe, it, expect } from "vitest";
import { normalizeBomLines } from "@/domains/deltaledger/ingestion/normalizeBom";
import { normalizePoLines } from "@/domains/deltaledger/ingestion/normalizePo";

const source = { fileName: "test.xlsx", sheetName: "Sheet1", isUploaded: false };

describe("normalizeBomLines — never coerces a missing/invalid quantity to zero", () => {
  it("parses a valid quantity", () => {
    const table = { headers: ["Part Number", "Description", "Quantity Per"], rows: [["PN-001", "Widget", 4]] };
    const [line] = normalizeBomLines("bom-1", table, source);
    expect(line.quantityPer).toBe(4);
    expect(line.quantityParseStatus).toBe("ok");
  });

  it("keeps quantity null and status 'missing' for a blank cell", () => {
    const table = { headers: ["Part Number", "Description", "Quantity Per"], rows: [["PN-001", "Widget", null]] };
    const [line] = normalizeBomLines("bom-1", table, source);
    expect(line.quantityPer).toBeNull();
    expect(line.quantityParseStatus).toBe("missing");
  });

  it("keeps quantity null and status 'invalid' for unparseable text", () => {
    const table = { headers: ["Part Number", "Description", "Quantity Per"], rows: [["PN-001", "Widget", "n/a"]] };
    const [line] = normalizeBomLines("bom-1", table, source);
    expect(line.quantityPer).toBeNull();
    expect(line.quantityParseStatus).toBe("invalid");
  });

  it("records a genuine zero quantity as 0, distinct from missing", () => {
    const table = { headers: ["Part Number", "Description", "Quantity Per"], rows: [["PN-001", "Widget", 0]] };
    const [line] = normalizeBomLines("bom-1", table, source);
    expect(line.quantityPer).toBe(0);
    expect(line.quantityParseStatus).toBe("ok");
  });
});

describe("normalizePoLines — never coerces missing/invalid quantity or price to zero", () => {
  const headers = ["PO Number", "Supplier", "Part Number", "Quantity Open", "Unit Price", "Currency", "Promised Receipt Date"];

  it("parses valid quantity and price", () => {
    const table = { headers, rows: [["PO-1", "Acme Supply", "PN-001", 100, 12.5, "USD", "2026-08-01"]] };
    const [line] = normalizePoLines("po-1", table, source);
    expect(line.quantityOpen).toBe(100);
    expect(line.quantityParseStatus).toBe("ok");
    expect(line.unitPriceTransactionCurrency).toBe(12.5);
    expect(line.priceParseStatus).toBe("ok");
    expect(line.transactionCurrency).toBe("USD");
  });

  it("keeps price null and status 'missing' for a blank cell, never 0", () => {
    const table = { headers, rows: [["PO-1", "Acme Supply", "PN-001", 100, null, "USD", "2026-08-01"]] };
    const [line] = normalizePoLines("po-1", table, source);
    expect(line.unitPriceTransactionCurrency).toBeNull();
    expect(line.priceParseStatus).toBe("missing");
  });

  it("keeps quantity null and status 'invalid' for unparseable text", () => {
    const table = { headers, rows: [["PO-1", "Acme Supply", "PN-001", "TBD", 12.5, "USD", "2026-08-01"]] };
    const [line] = normalizePoLines("po-1", table, source);
    expect(line.quantityOpen).toBeNull();
    expect(line.quantityParseStatus).toBe("invalid");
  });

  it("defaults to USD only when currency is genuinely blank, not as a silent override", () => {
    const table = { headers, rows: [["PO-1", "Acme Supply", "PN-001", 100, 12.5, null, "2026-08-01"]] };
    const [line] = normalizePoLines("po-1", table, source);
    expect(line.transactionCurrency).toBe("USD");
  });

  it("preserves a non-USD currency exactly", () => {
    const table = { headers, rows: [["PO-1", "Acme Supply", "PN-001", 100, 12.5, "EUR", "2026-08-01"]] };
    const [line] = normalizePoLines("po-1", table, source);
    expect(line.transactionCurrency).toBe("EUR");
  });
});

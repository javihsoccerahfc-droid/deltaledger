import { describe, it, expect, beforeAll, vi } from "vitest";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { resetTestDatabase } from "./testDb";
import { db } from "../client";
import { bomImports, bomLines, purchaseOrders, purchaseOrderLines, suppliers } from "../schema";
import * as ecRepo from "../repositories/engineeringChanges";
import { importBomAction, importPurchaseOrderAction } from "@/app/actions";
import { User } from "@/domains/deltaledger/types";

// actions.ts calls revalidatePath() after a successful import (pre-existing behavior, not
// introduced by this change). revalidatePath requires a live Next.js request-scoped store,
// which only exists when a Server Action runs through an actual Next.js server -- calling the
// action function directly, as these tests do, throws "Invariant: static generation store
// missing" without this mock. This is purely a test-environment concern; the real app always
// invokes these actions from within an actual Next.js request.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actor: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

function buildXlsxFile(rows: (string | number)[][], name = "import.xlsx"): File {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildCsvFile(csv: string, name = "import.csv"): File {
  return new File([csv], name, { type: "text/csv" });
}

function bomFormData(ecId: string, versionLabel: "current" | "proposed", file: File): FormData {
  const fd = new FormData();
  fd.set("ecId", ecId);
  fd.set("versionLabel", versionLabel);
  fd.set("file", file);
  fd.set("actor", JSON.stringify(actor));
  return fd;
}

function poFormData(ecId: string, file: File): FormData {
  const fd = new FormData();
  fd.set("ecId", ecId);
  fd.set("file", file);
  fd.set("actor", JSON.stringify(actor));
  return fd;
}

describe("importBomAction", () => {
  it("imports a valid CSV BOM and persists lines", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: BOM CSV", "desc", actor.id);
    const csv = "Part Number,Description,Quantity Per\nPN-100,Bracket,2\nPN-101,Bolt,4";
    const file = buildCsvFile(csv);

    const result = await importBomAction(bomFormData(ec.id, "current", file));

    expect(result.success).toBe(true);
    if (result.success) expect(result.lineCount).toBe(2);
  });

  it("imports a valid XLSX BOM and persists lines", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: BOM XLSX", "desc", actor.id);
    const file = buildXlsxFile([
      ["Part Number", "Description", "Quantity Per"],
      ["PN-200", "Housing", 1],
      ["PN-201", "Gasket", 3],
    ]);

    const result = await importBomAction(bomFormData(ec.id, "current", file));

    expect(result.success).toBe(true);
    if (result.success) expect(result.lineCount).toBe(2);
  });

  it("accepts unrecognized headers without throwing, but leaves the affected fields flagged missing rather than guessed", async () => {
    // Current ingestion design (src/domains/deltaledger/ingestion/mapping.ts + normalizeBom.ts)
    // never rejects a file outright for unmapped columns -- an unrecognized header simply
    // fails to map, and every value in that column becomes null/"missing" for every row
    // (never coerced to a guessed value or zero). This test documents that ACTUAL behavior.
    // NOTE (regression-testing finding, not fixed in this pass): this differs from the
    // production QA brief's expectation of "the UI should exit loading state and display a
    // specific actionable error" for invalid files -- today a file with no recognizable
    // columns "succeeds" with every line flagged missing, rather than being rejected up
    // front. That's a legitimate UX gap worth a follow-up (validate that at least the
    // required-field columns mapped with reasonable confidence before accepting the import),
    // tracked here rather than silently reinterpreted.
    const ec = await ecRepo.createEngineeringChange("ECO regression: BOM unmapped headers", "desc", actor.id);
    const csv = "Widget Code,Notes,Amount\nX1,note,5";
    const file = buildCsvFile(csv);

    const result = await importBomAction(bomFormData(ec.id, "current", file));
    expect(result.success).toBe(true);

    const imports = await db.select().from(bomImports).where(eq(bomImports.engineeringChangeId, ec.id));
    const thisImport = imports.find((i) => i.sourceFile === "import.csv");
    expect(thisImport).toBeTruthy();
    const lines = await db.select().from(bomLines).where(eq(bomLines.bomImportId, thisImport!.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].rawPartNumber).toBe(""); // never guessed, never coerced -- see normalizeBom.ts
    expect(lines[0].quantityParseStatus).toBe("missing");
    expect(lines[0].quantityPer).toBeNull(); // never coerced to 0
  });

  it("records an invalid (non-numeric) quantity as 'invalid', never coerced to zero", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: BOM invalid qty", "desc", actor.id);
    const csv = "Part Number,Description,Quantity Per\nPN-300,Widget,not-a-number";
    const file = buildCsvFile(csv);

    const result = await importBomAction(bomFormData(ec.id, "current", file));
    expect(result.success).toBe(true);

    const imports = await db.select().from(bomImports).where(eq(bomImports.engineeringChangeId, ec.id));
    const lines = await db.select().from(bomLines).where(eq(bomLines.bomImportId, imports[0].id));
    expect(lines[0].quantityParseStatus).toBe("invalid");
    expect(lines[0].quantityPer).toBeNull();
  });

  it("returns a typed failure (never throws) when the file cannot be parsed at all", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: BOM parser failure", "desc", actor.id);
    // SheetJS is deliberately lenient with arbitrary garbage bytes (it will happily interpret
    // them as a single text cell rather than throwing), so a truncated REAL xlsx file is used
    // instead -- a realistic stand-in for an upload that got cut off/corrupted in transit. This
    // reliably throws "Unsupported ZIP file" inside XLSX.read.
    const valid = buildXlsxFile([["Part Number"], ["PN-1"]], "truncated-source.xlsx");
    const fullBytes = new Uint8Array(await valid.arrayBuffer());
    const truncated = fullBytes.slice(0, Math.floor(fullBytes.length / 3));
    const corrupt = new File([truncated], "corrupt.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await importBomAction(bomFormData(ec.id, "current", corrupt));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toBeTruthy();
  });

  it("returns a typed failure and leaves no partial rows when persistence fails (invalid engineering change id)", async () => {
    const bogusEcId = "does-not-exist";
    const file = buildCsvFile("Part Number,Description,Quantity Per\nPN-400,Widget,1");

    const before = await db.select().from(bomImports).where(eq(bomImports.engineeringChangeId, bogusEcId));
    expect(before).toHaveLength(0);

    const result = await importBomAction(bomFormData(bogusEcId, "current", file));
    expect(result.success).toBe(false);

    // The foreign-key violation on the very first insert inside the transaction means nothing
    // was ever written -- proves the FK constraint bomImports.engineeringChangeId is enforced
    // and importBomAction surfaces the failure as a typed result rather than throwing.
    const after = await db.select().from(bomImports).where(eq(bomImports.engineeringChangeId, bogusEcId));
    expect(after).toHaveLength(0);
  });

  it("rejects a FormData payload missing required fields with a clear typed failure", async () => {
    const fd = new FormData();
    fd.set("ecId", "whatever");
    // no versionLabel, no file, no actor
    const result = await importBomAction(fd);
    expect(result.success).toBe(false);
  });
});

describe("importPurchaseOrderAction", () => {
  it("imports a valid CSV open-PO export", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: PO CSV", "desc", actor.id);
    const csv =
      "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\n" +
      "PO-9001,Acme Corp,PN-500,10,25.5,USD,2026-09-01";
    const file = buildCsvFile(csv, "po.csv");

    const result = await importPurchaseOrderAction(poFormData(ec.id, file));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lineCount).toBe(1);
      expect(result.poCount).toBe(1);
      expect(result.supplierCount).toBe(1);
    }
  });

  it("imports a valid XLSX open-PO export", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: PO XLSX", "desc", actor.id);
    const file = buildXlsxFile(
      [
        ["PO Number", "Supplier", "Part Number", "Quantity Open", "Unit Price", "Currency", "Promised Receipt Date"],
        ["PO-9100", "Beta Supply", "PN-600", 5, 12.0, "USD", "2026-10-01"],
      ],
      "po.xlsx"
    );

    const result = await importPurchaseOrderAction(poFormData(ec.id, file));

    expect(result.success).toBe(true);
    if (result.success) expect(result.lineCount).toBe(1);
  });

  it("records missing/invalid quantity and price as such, never coerced to zero", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: PO invalid values", "desc", actor.id);
    const csv =
      "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\n" +
      "PO-9200,Gamma Inc,PN-700,not-a-number,,USD,";
    const file = buildCsvFile(csv, "po-invalid.csv");

    const result = await importPurchaseOrderAction(poFormData(ec.id, file));
    expect(result.success).toBe(true);

    const pos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.engineeringChangeId, ec.id));
    const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, pos[0].id));
    expect(lines[0].quantityParseStatus).toBe("invalid");
    expect(lines[0].quantityOpen).toBeNull();
    expect(lines[0].priceParseStatus).toBe("missing");
    expect(lines[0].unitPriceTransactionCurrency).toBeNull();
  });

  it("returns a typed failure (never throws) when the file cannot be parsed at all", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO regression: PO parser failure", "desc", actor.id);
    const valid = buildXlsxFile([["PO Number"], ["PO-1"]], "truncated-source.xlsx");
    const fullBytes = new Uint8Array(await valid.arrayBuffer());
    const truncated = fullBytes.slice(0, Math.floor(fullBytes.length / 3));
    const corrupt = new File([truncated], "corrupt.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await importPurchaseOrderAction(poFormData(ec.id, corrupt));
    expect(result.success).toBe(false);
  });

  it("returns a typed failure and leaves no partial rows when persistence fails (invalid engineering change id)", async () => {
    const bogusEcId = "does-not-exist-po";
    const file = buildCsvFile(
      "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\n" +
        "PO-9300,Delta LLC Regression,PN-800,1,1,USD,2026-01-01",
      "po-bogus.csv"
    );

    const result = await importPurchaseOrderAction(poFormData(bogusEcId, file));
    expect(result.success).toBe(false);

    const afterPos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.engineeringChangeId, bogusEcId));
    expect(afterPos).toHaveLength(0);

    // Stronger atomicity check: the supplier row is created in an EARLIER statement within the
    // same transaction, before the purchaseOrders insert that actually violates the FK. If the
    // transaction were not atomic, this supplier would have been committed anyway even though
    // the overall import failed.
    const orphanedSupplier = await db.select().from(suppliers).where(eq(suppliers.name, "Delta LLC Regression"));
    expect(orphanedSupplier).toHaveLength(0);
  });
});

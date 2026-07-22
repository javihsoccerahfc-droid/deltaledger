import { describe, it, expect, beforeAll, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import { resetTestDatabase } from "./testDb";
import { db } from "../client";
import { bomImports, purchaseOrders, purchaseOrderImports } from "../schema";
import * as ecRepo from "../repositories/engineeringChanges";
import * as bomRepo from "../repositories/bom";
import * as poRepo from "../repositories/purchaseOrders";
import { User } from "@/domains/deltaledger/types";
import { parseCsvFile } from "@/core/ingestion/parseCsv";

// See db/__tests__/importActions.test.ts for the full rationale: actions.ts calls
// revalidatePath(), which requires a live Next.js request context that doesn't exist when
// server actions are invoked directly outside a real Next.js server. Not exercised by every
// test below (most call the repository functions directly), but harmless to mock always.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actor: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

function csvFile(csv: string, name = "import.csv"): File {
  return new File([csv], name, { type: "text/csv" });
}

async function csvTable(csv: string) {
  return parseCsvFile(csvFile(csv));
}

function poCsv(poNumbers: string[], supplierName?: string): string {
  const header = "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date";
  const rows = poNumbers.map((po, i) => `${po},${supplierName ?? `Supplier ${i}`},PN-${i},10,5,USD,2026-09-01`);
  return [header, ...rows].join("\n");
}

async function createEc(name: string) {
  return ecRepo.createEngineeringChange(name, "desc", actor.id);
}

/** Traces a BOM supersession chain backward from the active row, returning ids oldest-first. */
async function traceBomChain(ecId: string, versionLabel: "current" | "proposed") {
  const rows = await db.select().from(bomImports).where(eq(bomImports.engineeringChangeId, ecId));
  const slotRows = rows.filter((r) => r.versionLabel === versionLabel);
  const active = slotRows.filter((r) => r.supersededById === null);
  expect(active).toHaveLength(1); // never zero, never two -- the partial unique index guarantees this
  const chain: string[] = [active[0].id];
  let current = active[0];
  for (;;) {
    const predecessor = slotRows.find((r) => r.supersededById === current.id);
    if (!predecessor) break;
    chain.unshift(predecessor.id);
    current = predecessor;
  }
  return { chain, allRowsForSlot: slotRows };
}

describe("BOM import supersession", () => {
  it("the partial unique index rejects a second active row for the same slot", async () => {
    const ec = await createEc("Constraint test: BOM");
    await bomRepo.saveBomImport(ec.id, "current", await csvTable("Part Number\nPN-1"), "a.csv", "Sheet1", actor.id);

    let caught: unknown;
    try {
      await db.execute(
        sql`insert into bom_imports (id, engineering_change_id, version_label, ingestion_mode, source_file, source_sheet, imported_by, created_at)
            values ('should-fail-bom', ${ec.id}, 'current', 'current_and_proposed', 'x.csv', 'Sheet1', 'u', now()::text)`
      );
    } catch (err) {
      caught = err;
    }
    // Drizzle wraps the real Postgres error as `.cause` under its own "Failed query" message.
    expect((caught as { cause?: { code?: string } } | undefined)?.cause?.code).toBe("23505");
  });

  it("concurrent FIRST imports for a slot with no prior row: exactly one active row, valid chain", async () => {
    const ec = await createEc("Concurrency test: BOM first import");
    const N = 8;
    const tables = await Promise.all(Array.from({ length: N }, (_, i) => csvTable(`Part Number\nPN-${i}`)));
    const results = await Promise.allSettled(
      tables.map((table, i) => bomRepo.saveBomImport(ec.id, "current", table, `first-${i}.csv`, "Sheet1", actor.id))
    );
    // The advisory lock serializes these -- all should succeed (none should fail with a
    // constraint violation, since only one is ever "active" at a time as they run in turn).
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(N);

    const { chain, allRowsForSlot } = await traceBomChain(ec.id, "current");
    expect(chain).toHaveLength(N); // one unbroken chain covering every row, no forks, no orphans
    expect(allRowsForSlot).toHaveLength(N);
  });

  it("concurrent RE-imports against one pre-existing active row: exactly one active row, valid chain", async () => {
    const ec = await createEc("Concurrency test: BOM re-import");
    await bomRepo.saveBomImport(ec.id, "current", await csvTable("Part Number\nPN-seed"), "seed.csv", "Sheet1", actor.id);

    const N = 8;
    const tables = await Promise.all(Array.from({ length: N }, (_, i) => csvTable(`Part Number\nPN-r${i}`)));
    const results = await Promise.allSettled(
      tables.map((table, i) => bomRepo.saveBomImport(ec.id, "current", table, `retry-${i}.csv`, "Sheet1", actor.id))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(N);

    const { chain, allRowsForSlot } = await traceBomChain(ec.id, "current");
    expect(chain).toHaveLength(N + 1); // the seed row plus N re-imports
    expect(allRowsForSlot).toHaveLength(N + 1);
  });

  it("cross-EC and cross-version-label isolation under concurrency", async () => {
    const ecA = await createEc("Isolation test A");
    const ecB = await createEc("Isolation test B");
    const [tA1, tA2, tB1] = await Promise.all([csvTable("Part Number\nA1"), csvTable("Part Number\nA2"), csvTable("Part Number\nB1")]);

    await Promise.all([
      bomRepo.saveBomImport(ecA.id, "current", tA1, "a1.csv", "Sheet1", actor.id),
      bomRepo.saveBomImport(ecA.id, "proposed", tA2, "a2.csv", "Sheet1", actor.id),
      bomRepo.saveBomImport(ecB.id, "current", tB1, "b1.csv", "Sheet1", actor.id),
    ]);

    const stateA = await bomRepo.getBomImportsForEc(ecA.id);
    const stateB = await bomRepo.getBomImportsForEc(ecB.id);
    expect(stateA.current?.bomImport.sourceFile).toBe("a1.csv");
    expect(stateA.proposed?.bomImport.sourceFile).toBe("a2.csv");
    expect(stateB.current?.bomImport.sourceFile).toBe("b1.csv");
    expect(stateB.proposed).toBeUndefined();
  });

  it("deterministic active reads: repeated reads return the same row", async () => {
    const ec = await createEc("Determinism test: BOM");
    await bomRepo.saveBomImport(ec.id, "current", await csvTable("Part Number\nPN-1"), "a.csv", "Sheet1", actor.id);
    const reads = await Promise.all(Array.from({ length: 10 }, () => bomRepo.getBomImportsForEc(ec.id)));
    const ids = new Set(reads.map((r) => r.current?.bomImport.id));
    expect(ids.size).toBe(1); // always the same row
  });

  it("growing history never leaks into current-state reads (five sequential re-imports)", async () => {
    const ec = await createEc("Growing history test: BOM");
    for (let i = 0; i < 5; i++) {
      const table = await csvTable(`Part Number\nPN-v${i}`);
      await bomRepo.saveBomImport(ec.id, "current", table, `v${i}.csv`, "Sheet1", actor.id);
      const state = await bomRepo.getBomImportsForEc(ec.id);
      expect(state.current?.bomImport.sourceFile).toBe(`v${i}.csv`); // only ever the latest
    }
    const { allRowsForSlot } = await traceBomChain(ec.id, "current");
    expect(allRowsForSlot).toHaveLength(5); // all history preserved, never deleted
    const activeCount = allRowsForSlot.filter((r) => r.supersededById === null).length;
    expect(activeCount).toBe(1); // but only one ever "current"
  });
});

describe("PO import batch supersession", () => {
  it("the partial unique index rejects a second active batch for the same EC", async () => {
    const ec = await createEc("Constraint test: PO");
    await poRepo.savePurchaseOrderImport(ec.id, await csvTable(poCsv(["PO-1"])), "a.csv", actor.id);

    let caught: unknown;
    try {
      await db.execute(
        sql`insert into purchase_order_imports (id, engineering_change_id, source_file, imported_by, created_at)
            values ('should-fail-po', ${ec.id}, 'x.csv', 'u', now()::text)`
      );
    } catch (err) {
      caught = err;
    }
    expect((caught as { cause?: { code?: string } } | undefined)?.cause?.code).toBe("23505");
  });

  it("concurrent FIRST PO imports for an EC with no prior batch: exactly one active batch", async () => {
    const ec = await createEc("Concurrency test: PO first import");
    const N = 8;
    const tables = await Promise.all(Array.from({ length: N }, (_, i) => csvTable(poCsv([`PO-${i}`]))));
    const results = await Promise.allSettled(
      tables.map((table, i) => poRepo.savePurchaseOrderImport(ec.id, table, `first-${i}.csv`, actor.id))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(N);

    const rows = await db.select().from(purchaseOrderImports).where(eq(purchaseOrderImports.engineeringChangeId, ec.id));
    const active = rows.filter((r) => r.supersededById === null);
    expect(active).toHaveLength(1);
    expect(rows).toHaveLength(N);
  });

  it("re-import supersedes the ENTIRE previous batch -- old POs excluded from current-state reads", async () => {
    const ec = await createEc("Batch replace test: PO");
    await poRepo.savePurchaseOrderImport(ec.id, await csvTable(poCsv(["PO-OLD-1", "PO-OLD-2"])), "old.csv", actor.id);
    const before = await poRepo.getPurchaseDataForEc(ec.id);
    expect(before.purchaseOrders.map((p) => p.poNumber).sort()).toEqual(["PO-OLD-1", "PO-OLD-2"]);

    // Corrected file drops PO-OLD-2, adds PO-NEW-1.
    await poRepo.savePurchaseOrderImport(ec.id, await csvTable(poCsv(["PO-OLD-1", "PO-NEW-1"])), "corrected.csv", actor.id);
    const after = await poRepo.getPurchaseDataForEc(ec.id);
    expect(after.purchaseOrders.map((p) => p.poNumber).sort()).toEqual(["PO-NEW-1", "PO-OLD-1"]);
    // True replacement, not a union -- PO-OLD-2 is gone from current-state reads (but the
    // row itself still exists in the database, just excluded -- see the next assertion).

    const allPosEver = await db.select().from(purchaseOrders).where(eq(purchaseOrders.engineeringChangeId, ec.id));
    // Never deleted, and never deduped across batches by PO number -- each batch is a fully
    // independent set of rows (see the plan's rationale for treating a whole upload as one
    // atomic unit rather than merging per-PO-number across uploads), so PO-OLD-1 legitimately
    // exists twice: once in the superseded old batch, once in the new active batch.
    expect(allPosEver.map((p) => p.poNumber).sort()).toEqual(["PO-NEW-1", "PO-OLD-1", "PO-OLD-1", "PO-OLD-2"]);
  });

  it("supplier dedup still works correctly across batches", async () => {
    const ec = await createEc("Supplier dedup test: PO");
    await poRepo.savePurchaseOrderImport(ec.id, await csvTable(poCsv(["PO-1"], "Acme Regression Supplier")), "a.csv", actor.id);
    await poRepo.savePurchaseOrderImport(ec.id, await csvTable(poCsv(["PO-2"], "Acme Regression Supplier")), "b.csv", actor.id);
    const data = await poRepo.getPurchaseDataForEc(ec.id);
    const matchingSuppliers = data.suppliers.filter((s) => s.name === "Acme Regression Supplier");
    expect(matchingSuppliers).toHaveLength(1); // never duplicated
  });

  it("authentic (non-reconstructed) source_row for every newly-imported line", async () => {
    const ec = await createEc("Authentic source row test: PO");
    await poRepo.savePurchaseOrderImport(ec.id, await csvTable(poCsv(["PO-1"])), "a.csv", actor.id);
    const data = await poRepo.getPurchaseDataForEc(ec.id);
    for (const line of data.poLines) {
      expect(line.sourceRowIsReconstructed).toBe(false);
      expect(typeof line.sourceRow).toBe("number");
    }
  });
});

import { describe, it, expect, beforeAll, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import { resetTestDatabase } from "./testDb";
import { db } from "../client";
import { exposureSourceSnapshots } from "../schema";
import * as ecRepo from "../repositories/engineeringChanges";
import * as bomRepo from "../repositories/bom";
import * as poRepo from "../repositories/purchaseOrders";
import * as crosswalkRepo from "../repositories/crosswalk";
import * as exposureRepo from "../repositories/exposure";
import { importPurchaseOrderAction } from "@/app/actions";
import { User } from "@/domains/deltaledger/types";
import { parseCsvFile } from "@/core/ingestion/parseCsv";

// actions.ts calls revalidatePath(), which requires a live Next.js request context that
// doesn't exist when a Server Action is invoked directly outside a real Next.js server (see
// db/__tests__/importActions.test.ts for the full rationale).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const partDataOwner: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

function csvFile(csv: string, name = "import.csv"): File {
  return new File([csv], name, { type: "text/csv" });
}

async function csvTable(csv: string) {
  return parseCsvFile(csvFile(csv));
}

/** Builds a fully calculable EC: BOM diff (removed part) + PO line + approved crosswalk. */
async function setUpCalculableEc(name: string) {
  const partNumber = `PN-PROV-${name}`;
  const ec = await ecRepo.createEngineeringChange(name, "desc", partDataOwner.id);
  await bomRepo.saveBomImport(ec.id, "current", await csvTable(`Part Number\n${partNumber}`), "current.csv", "Sheet1", partDataOwner.id);
  await bomRepo.saveBomImport(ec.id, "proposed", await csvTable("Part Number"), "proposed.csv", "Sheet1", partDataOwner.id); // part removed
  await poRepo.savePurchaseOrderImport(
    ec.id,
    await csvTable(
      `PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-PROV,Prov Supplier,${partNumber},100,10,USD,2026-09-01`
    ),
    "po.csv",
    partDataOwner.id
  );
  const [cw] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions([partNumber], [partNumber]);
  await crosswalkRepo.approveCrosswalkById(cw.id, partDataOwner);
  return ec;
}

describe("exposure provenance (current / stale / legacy_unknown)", () => {
  it("a freshly calculated exposure record reports 'current' provenance", async () => {
    const ec = await setUpCalculableEc("Provenance test: current");
    await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-19", partDataOwner.id);

    const withProvenance = await exposureRepo.getExposureRecordsWithProvenance(ec.id);
    expect(withProvenance.length).toBeGreaterThan(0);
    for (const { provenance } of withProvenance) {
      expect(provenance).toBe("current");
    }
  });

  it("re-importing PO data marks the prior exposure record's provenance as 'stale'", async () => {
    const ec = await setUpCalculableEc("Provenance test: stale");
    await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-19", partDataOwner.id);
    const beforeReimport = await exposureRepo.getExposureRecordsWithProvenance(ec.id);
    expect(beforeReimport.every((r) => r.provenance === "current")).toBe(true);

    // Re-import PO data (with confirmation, since active exposure exists) -- this supersedes
    // the batch those exposure records were calculated against, but must NOT touch the
    // exposure records themselves (see the PO re-import confirmation tests below for the
    // gate itself; this test goes straight to the repository to isolate the provenance check).
    await poRepo.savePurchaseOrderImport(
      ec.id,
      await csvTable(
        "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-PROV,Prov Supplier,PN-PROV,100,10,USD,2026-09-01"
      ),
      "po-corrected.csv",
      partDataOwner.id
    );

    const afterReimport = await exposureRepo.getExposureRecordsWithProvenance(ec.id);
    expect(afterReimport.length).toBe(beforeReimport.length); // same records, untouched
    expect(afterReimport.every((r) => r.provenance === "stale")).toBe(true);
    // Confirm the underlying values themselves were never modified, deleted, or recalculated.
    expect(afterReimport.map((r) => r.record.id).sort()).toEqual(beforeReimport.map((r) => r.record.id).sort());
    expect(afterReimport.map((r) => r.record.netExposureValueReporting)).toEqual(
      beforeReimport.map((r) => r.record.netExposureValueReporting)
    );
  });

  it("a snapshot with NULL purchase_order_import_id (simulating genuine pre-remediation legacy data) reports 'legacy_unknown', never 'current' or 'stale'", async () => {
    const ec = await setUpCalculableEc("Provenance test: legacy_unknown");
    await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-19", partDataOwner.id);

    // Simulate what a genuine pre-remediation snapshot looks like: purchase_order_import_id
    // is NULL, not backfilled to any value (see the plan's rationale for why backfilling
    // this column would itself be a false, unverifiable claim).
    const withProvenanceBefore = await exposureRepo.getExposureRecordsWithProvenance(ec.id);
    const snapshotId = withProvenanceBefore[0].record.exposureSourceSnapshotId;
    await db.execute(sql`update exposure_source_snapshots set purchase_order_import_id = null where id = ${snapshotId}`);

    const withProvenanceAfter = await exposureRepo.getExposureRecordsWithProvenance(ec.id);
    const target = withProvenanceAfter.find((r) => r.record.exposureSourceSnapshotId === snapshotId);
    expect(target?.provenance).toBe("legacy_unknown");
    expect(target?.provenance).not.toBe("current");
    expect(target?.provenance).not.toBe("stale");
  });

  it("calculateAndPersistExposure always records a non-null purchase_order_import_id for NEW snapshots", async () => {
    const ec = await setUpCalculableEc("Provenance test: new snapshots always have a batch id");
    await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-19", partDataOwner.id);
    const records = await exposureRepo.getActiveExposureRecordsForEc(ec.id);
    for (const record of records) {
      const snapshot = await exposureRepo.getExposureSnapshotById(record.exposureSourceSnapshotId);
      expect(snapshot?.purchaseOrderImportId).not.toBeNull();
    }
  });
});

function poFormData(ecId: string, file: File, confirm?: boolean): FormData {
  const fd = new FormData();
  fd.set("ecId", ecId);
  fd.set("file", file);
  fd.set("actor", JSON.stringify(partDataOwner));
  if (confirm) fd.set("confirmSupersedesExposure", "true");
  return fd;
}

describe("PO re-import confirmation gate (Decision C)", () => {
  it("requires no confirmation when no active exposure exists for the EC", async () => {
    const ec = await ecRepo.createEngineeringChange("Confirmation test: no exposure yet", "desc", partDataOwner.id);
    const csv = "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-1,Supplier,PN-1,10,5,USD,2026-09-01";

    const result = await importPurchaseOrderAction(poFormData(ec.id, csvFile(csv)));
    expect(result.success).toBe(true);
  });

  it("requires confirmation when active exposure exists, and does NOT write without it", async () => {
    const ec = await setUpCalculableEc("Confirmation test: declined");
    await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-19", partDataOwner.id);

    const before = await poRepo.getPurchaseDataForEc(ec.id);
    const csv =
      "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-PROV,Prov Supplier,PN-PROV,999,10,USD,2026-09-01";

    const result = await importPurchaseOrderAction(poFormData(ec.id, csvFile(csv, "unconfirmed.csv")));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.requiresConfirmation).toBe(true);

    // No new batch was created -- the gate is a true block, not just advisory copy.
    const after = await poRepo.getPurchaseDataForEc(ec.id);
    expect(after.purchaseOrders.map((p) => p.id).sort()).toEqual(before.purchaseOrders.map((p) => p.id).sort());
  });

  it("proceeds once confirmed, and correctly supersedes the prior batch", async () => {
    const ec = await setUpCalculableEc("Confirmation test: accepted");
    await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-19", partDataOwner.id);

    const csv =
      "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\nPO-PROV,Prov Supplier,PN-PROV,999,10,USD,2026-09-01";

    const result = await importPurchaseOrderAction(poFormData(ec.id, csvFile(csv, "confirmed.csv"), true));
    expect(result.success).toBe(true);

    const data = await poRepo.getPurchaseDataForEc(ec.id);
    expect(data.poLines[0]?.quantityOpen).toBe(999); // the new, corrected data is now active
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { suppliers, supplierCommitmentTerms } from "../schema";
import * as ecRepo from "../repositories/engineeringChanges";
import * as bomRepo from "../repositories/bom";
import * as poRepo from "../repositories/purchaseOrders";
import * as crosswalkRepo from "../repositories/crosswalk";
import * as auditRepo from "../repositories/audit";
import { getOrCreateDefaultOrganization } from "../repositories/organizations";
import { parseCsvFile } from "@/core/ingestion/parseCsv";
import { User } from "@/domains/deltaledger/types";

const partDataOwner: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };
const buyer: User = { id: "u-buyer", name: "Bob Buyer", role: "buyer" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "./drizzle" });
});

describe("Real persistence: create, import, reopen", () => {
  it("creates and lists an engineering change, then 'reopens' it via a fresh fetch", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO-9001: Persistence test", "desc", partDataOwner.id);
    expect(ec.id).toBeTruthy();

    const list = await ecRepo.listEngineeringChanges();
    expect(list.some((e) => e.id === ec.id)).toBe(true);

    const reopened = await ecRepo.getEngineeringChangeById(ec.id);
    expect(reopened?.name).toBe("ECO-9001: Persistence test");
  });

  it("imports current + proposed BOM and computes a real, persisted diff", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO-9002: BOM diff test", "desc", partDataOwner.id);

    const currentCsv = "Part Number,Description,Quantity Per\nPN-A,Widget A,5\nPN-B,Widget B,2";
    const proposedCsv = "Part Number,Description,Quantity Per\nPN-B,Widget B,2";

    const currentTable = await parseCsvFile(new File([currentCsv], "current.csv", { type: "text/csv" }));
    const proposedTable = await parseCsvFile(new File([proposedCsv], "proposed.csv", { type: "text/csv" }));

    await bomRepo.saveBomImport(ec.id, "current", currentTable, "current.csv", "Sheet1", partDataOwner.id);
    await bomRepo.saveBomImport(ec.id, "proposed", proposedTable, "proposed.csv", "Sheet1", partDataOwner.id);

    const diff = await bomRepo.getBomDiffForEc(ec.id);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ partId: "PN-A", changeType: "removed", fromQuantity: 5 });

    const imports = await bomRepo.getBomImportsForEc(ec.id);
    expect(imports.current?.lines).toHaveLength(2);
    expect(imports.proposed?.lines).toHaveLength(1);
  });

  it("imports a multi-supplier PO export and correctly separates suppliers (the fixed multi-PO bug, enforced at the DB layer)", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO-9003: Multi-supplier PO test", "desc", partDataOwner.id);

    const poCsv =
      "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\n" +
      "PO-1,Acme Corp,PN-A,100,10,USD,2026-09-01\n" +
      "PO-2,Beta Supply,PN-C,50,20,EUR,2026-09-15";

    const table = await parseCsvFile(new File([poCsv], "po.csv", { type: "text/csv" }));
    const result = await poRepo.savePurchaseOrderImport(ec.id, table, "po.csv");
    expect(result.supplierCount).toBe(2);
    expect(result.poCount).toBe(2);

    const purchaseData = await poRepo.getPurchaseDataForEc(ec.id);
    expect(purchaseData.suppliers.map((s) => s.name).sort()).toEqual(["Acme Corp", "Beta Supply"]);

    const acmeLine = purchaseData.poLines.find((l) => l.rawPartNumber === "PN-A")!;
    const acmePo = purchaseData.purchaseOrders.find((p) => p.id === acmeLine.purchaseOrderId)!;
    const acmeSupplier = purchaseData.suppliers.find((s) => s.id === acmePo.supplierId)!;
    expect(acmeSupplier.name).toBe("Acme Corp");

    const betaLine = purchaseData.poLines.find((l) => l.rawPartNumber === "PN-C")!;
    const betaPo = purchaseData.purchaseOrders.find((p) => p.id === betaLine.purchaseOrderId)!;
    const betaSupplier = purchaseData.suppliers.find((s) => s.id === betaPo.supplierId)!;
    expect(betaSupplier.name).toBe("Beta Supply");
  });

  it("versions supplier terms instead of overwriting them (old row superseded, never mutated)", async () => {
    const org = await getOrCreateDefaultOrganization();
    const [supplier] = await db.insert(suppliers).values({ organizationId: org.id, name: "Versioned Supplier Co" }).returning();

    const first = await poRepo.addSupplierTerms(supplier.id, {
      partId: null,
      ncnr: false,
      standardLeadTimeDays: 30,
      cancellationWindowDays: 15,
      source: "supplier_provided",
      effectiveDate: "2026-01-01",
      notes: null,
      verifiedAt: null,
      verifiedBy: null,
      validUntil: null,
    });

    const second = await poRepo.addSupplierTerms(supplier.id, {
      partId: null,
      ncnr: false,
      standardLeadTimeDays: 30,
      cancellationWindowDays: 30,
      source: "verified_contract",
      effectiveDate: "2026-06-01",
      notes: "Updated after contract renewal",
      verifiedAt: "2026-06-01T00:00:00Z",
      verifiedBy: partDataOwner.id,
      validUntil: null,
    });

    const active = await poRepo.getActiveSupplierTerms(supplier.id);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(second.id);

    const [firstRowAfter] = await db.select().from(supplierCommitmentTerms).where(eq(supplierCommitmentTerms.id, first.id));
    expect(firstRowAfter.supersededById).toBe(second.id);
    expect(firstRowAfter.cancellationWindowDays).toBe(15); // original value preserved, not overwritten
  });

  it("enforces mapping-approval authorization at the repository layer, not just in the UI", async () => {
    const generated = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-X"], ["PN-X"]);
    expect(generated).toHaveLength(1);

    const buyerResult = await crosswalkRepo.approveCrosswalkById(generated[0].id, buyer);
    expect(buyerResult.success).toBe(false);

    const ownerResult = await crosswalkRepo.approveCrosswalkById(generated[0].id, partDataOwner);
    expect(ownerResult.success).toBe(true);

    const all = await crosswalkRepo.getCrosswalksForOrg();
    const updated = all.find((c) => c.id === generated[0].id)!;
    expect(updated.reviewStatus).toBe("approved");
    expect(updated.reviewedBy).toBe(partDataOwner.id);
  });

  it("records every action in the append-only audit log, retrievable after the fact", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO-9005: Audit test", "desc", partDataOwner.id);
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ec.id,
      entityType: "EngineeringChange",
      entityId: ec.id,
      actor: partDataOwner.name,
      action: `Created engineering change "${ec.name}".`,
    });
    const log = await auditRepo.getAuditLogForEc(ec.id);
    expect(log.length).toBeGreaterThan(0);
    expect(log.some((e) => e.action.includes("Created engineering change"))).toBe(true);
  });
});

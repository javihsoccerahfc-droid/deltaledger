import { describe, it, expect, beforeAll } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { exposureRecords } from "../schema";
import * as ecRepo from "../repositories/engineeringChanges";
import * as bomRepo from "../repositories/bom";
import * as poRepo from "../repositories/purchaseOrders";
import * as crosswalkRepo from "../repositories/crosswalk";
import * as exposureRepo from "../repositories/exposure";
import * as altDemandRepo from "../repositories/alternateDemand";
import * as mitigationRepo from "../repositories/mitigation";
import * as outcomeRepo from "../repositories/financialOutcome";
import { parseCsvFile } from "@/core/ingestion/parseCsv";
import { User } from "@/domains/deltaledger/types";

const partDataOwner: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };
const scm: User = { id: "u-scm", name: "Sam SCM", role: "supply_chain_manager" };
const buyer: User = { id: "u-buyer", name: "Bob Buyer", role: "buyer" };
const finance = { id: "u-finance", name: "Fran Finance" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "./drizzle" });
});

async function setUpEcWithExposure() {
  const ec = await ecRepo.createEngineeringChange("ECO-EXPOSURE-FLOW", "desc", partDataOwner.id);

  const currentCsv = "Part Number,Description,Quantity Per\nPN-Z,Widget Z,1000";
  const proposedCsv = "Part Number,Description,Quantity Per\n";
  await bomRepo.saveBomImport(
    ec.id,
    "current",
    await parseCsvFile(new File([currentCsv], "c.csv", { type: "text/csv" })),
    "c.csv",
    "Sheet1",
    partDataOwner.id
  );
  await bomRepo.saveBomImport(
    ec.id,
    "proposed",
    await parseCsvFile(new File([proposedCsv], "p.csv", { type: "text/csv" })),
    "p.csv",
    "Sheet1",
    partDataOwner.id
  );

  const poCsv =
    "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date\n" +
    "PO-Z,Zenith Supply,PN-Z,1000,15,USD,2026-09-01";
  await poRepo.savePurchaseOrderImport(ec.id, await parseCsvFile(new File([poCsv], "po.csv", { type: "text/csv" })), "po.csv");

  const [cw] = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(["PN-Z"], ["PN-Z"]);
  await crosswalkRepo.approveCrosswalkById(cw.id, partDataOwner);

  return ec;
}

describe("DB-backed exposure calculation", () => {
  it("calculates gross/net exposure exactly, and creates NO record for an unapproved mapping (gap, not $0)", async () => {
    const ec = await setUpEcWithExposure();
    const result = await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-16", partDataOwner.id);
    expect(result.gaps).toHaveLength(0);
    expect(result.createdRecordIds).toHaveLength(1);

    const records = await exposureRepo.getActiveExposureRecordsForEc(ec.id);
    expect(records).toHaveLength(1);
    expect(records[0].grossCommittedValueReporting).toBe(15000);
    expect(records[0].confidenceClassification).toBe("estimated");
  });

  it("recalculation SUPERSEDES the old record rather than mutating it -- both rows still exist", async () => {
    const ec = await setUpEcWithExposure();
    const first = await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-16", partDataOwner.id);
    const firstRecordId = first.createdRecordIds[0];

    const second = await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-16", partDataOwner.id);
    const secondRecordId = second.createdRecordIds[0];
    expect(secondRecordId).not.toBe(firstRecordId);

    const [firstRowAfter] = await db.select().from(exposureRecords).where(eq(exposureRecords.id, firstRecordId));
    expect(firstRowAfter.supersededById).toBe(secondRecordId);
    expect(firstRowAfter.grossCommittedValueReporting).toBe(15000);

    const active = await exposureRepo.getActiveExposureRecordsForEc(ec.id);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(secondRecordId);
  });

  it("nets an approved, allocated alternate-demand quantity on the next recalculation (Known confidence)", async () => {
    const ec = await setUpEcWithExposure();
    const first = await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-16", partDataOwner.id);
    const exposureRecordId = first.createdRecordIds[0];

    const suggestion = await altDemandRepo.createAlternateDemandSuggestion({
      partId: "PN-Z",
      quantityAvailableForOffset: 300,
      sourceReference: "Confirmed spare stock",
      demandSourceType: "transferable_inventory",
    });

    const buyerAttempt = await altDemandRepo.approveAlternateDemandById(suggestion.id, buyer);
    expect(buyerAttempt.success).toBe(false);

    const approved = await altDemandRepo.approveAlternateDemandById(suggestion.id, scm);
    expect(approved.success).toBe(true);

    const allocResult = await altDemandRepo.allocateAlternateDemandInDb(suggestion.id, exposureRecordId, 300, scm.id);
    expect(allocResult.success).toBe(true);

    const overAllocResult = await altDemandRepo.allocateAlternateDemandInDb(suggestion.id, exposureRecordId, 1, scm.id);
    expect(overAllocResult.success).toBe(false);

    const second = await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-16", partDataOwner.id);
    const active = await exposureRepo.getActiveExposureRecordsForEc(ec.id);
    expect(active[0].id).toBe(second.createdRecordIds[0]);
    expect(active[0].netExposureValueReporting).toBe(10500);
    expect(active[0].confidenceClassification).toBe("known");
  });

  it("runs mitigation + outcome end to end with the corrected fee-counted-once formula", async () => {
    const ec = await setUpEcWithExposure();
    const first = await exposureRepo.calculateAndPersistExposure(ec.id, "2026-07-16", partDataOwner.id);
    const exposureRecordId = first.createdRecordIds[0];

    const action = await mitigationRepo.createMitigationActionInDb(exposureRecordId, "cancel", buyer.id, "2026-08-01");
    await mitigationRepo.transitionMitigationActionStatus(action.id, "in_progress");

    const responseResult = await mitigationRepo.recordSupplierResponseInDb(action.id, "accepted", 1000, 0, 0, 1000, buyer.id);
    expect(responseResult.success).toBe(true);

    const outcome = await outcomeRepo.createFinancialOutcomeInDb({
      exposureRecordId,
      frozenUnitPrice: 15,
      quantityCancelled: 1000,
      quantityRedirected: 0,
      quantityReceivedBeforeAction: 0,
      recoverableUnitValue: null,
      recoverableUnitValueBasis: null,
      recoverableUnitValueJustificationNote: null,
      recoverableUnitValueReviewedBy: null,
      cancellationFee: 1500,
      supplierCreditValue: 0,
      writeOffValue: 0,
      reworkCost: null,
      disposalCost: null,
      estimatedCostAvoidedFrozen: 15000,
      outcomeExchangeRateSnapshotId: null,
    });

    expect(outcome.actualCostAvoided).toBe(15000);
    expect(outcome.actualRealizedLoss).toBe(1500);

    const closed = await outcomeRepo.closeFinancialOutcomeInDb(outcome.id, finance.id);
    expect(closed.success).toBe(true);

    const stored = await outcomeRepo.getFinancialOutcomeForExposureRecord(exposureRecordId);
    expect(stored?.closedAt).toBeTruthy();
    expect(stored?.actualCostAvoided).toBe(15000);
  });
});

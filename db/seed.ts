import { parseCsvFile } from "@/core/ingestion/parseCsv";
import * as ecRepo from "./repositories/engineeringChanges";
import * as bomRepo from "./repositories/bom";
import * as poRepo from "./repositories/purchaseOrders";
import * as crosswalkRepo from "./repositories/crosswalk";
import * as exposureRepo from "./repositories/exposure";
import * as altDemandRepo from "./repositories/alternateDemand";
import * as mitigationRepo from "./repositories/mitigation";
import * as outcomeRepo from "./repositories/financialOutcome";
import * as auditRepo from "./repositories/audit";
import { suppliers } from "./schema";
import { db } from "./client";
import { eq, and } from "drizzle-orm";
import { getOrCreateDefaultOrganization } from "./repositories/organizations";
import type { User } from "@/domains/deltaledger/types";

const partDataOwner: User = { id: "sample-pdo", name: "Priya Nair", role: "part_data_owner" };
const scm: User = { id: "sample-scm", name: "Marcus Webb", role: "supply_chain_manager" };
const buyer: User = { id: "sample-buyer", name: "Dana Torres", role: "buyer" };
const finance = { id: "sample-finance", name: "Chris Alden" };

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
};
const dateOnly = (offsetDays: number) => iso(offsetDays).slice(0, 10);

/**
 * Seeds a complete, realistic engineering-change scenario THROUGH THE REAL
 * REPOSITORY LAYER -- the exact same functions the UI's Server Actions
 * call. This is dogfooding the real persistence pipeline, not a hand-faked
 * in-memory fixture (that was the old sampleData.ts, now removed).
 */
const SAMPLE_EC_NAME = "ECO-4127: Migrate Thermal Control Module to Digital Sensor";

/**
 * Seeds a complete, realistic engineering-change scenario THROUGH THE REAL
 * REPOSITORY LAYER -- the exact same functions the UI's Server Actions
 * call. This is dogfooding the real persistence pipeline, not a hand-faked
 * in-memory fixture.
 *
 * Idempotent: safe to run against an already-seeded database (e.g. an
 * accidental double-click of "Load sample data", or re-running this script
 * against a hosted database that already has the sample scenario) -- it
 * checks for the sample EC by name first and returns its existing id
 * instead of creating a duplicate.
 */
export async function seedSampleEngineeringChange(): Promise<string> {
  const existing = await ecRepo.listEngineeringChanges();
  const alreadySeeded = existing.find((e) => e.name === SAMPLE_EC_NAME);
  if (alreadySeeded) {
    return alreadySeeded.id;
  }

  const ec = await ecRepo.createEngineeringChange(
    SAMPLE_EC_NAME,
    "Replace the analog NTC temperature sensor with a digital I2C sensor across the Thermal Control Module (Rev C), and remove the EMI shield can made redundant by the new enclosure design.",
    partDataOwner.id
  );

  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "EngineeringChange",
    entityId: ec.id,
    actor: partDataOwner.name,
    action: `Created engineering change "${ec.name}".`,
  });

  const currentCsv = [
    "Part Number,Description,Quantity Per",
    "TS-3301-A,Analog Temperature Sensor 10K NTC +/-1%,2",
    "SH-2201,EMI Shield Can Board-Mount,1",
    "CN-OLD-7,Legacy Connector Variant (phased out),1",
    "CN-8842,4-Pin Wire-to-Board Connector,1",
    "RES-100K-0402,100k-ohm Resistor 0402 +/-1%,4",
    "CAP-10UF-0805,10uF Ceramic Capacitor 0805,2",
    "MCU-ATSAM-D21,32-bit ARM Cortex-M0+ MCU,1",
  ].join("\n");
  const proposedCsv = [
    "Part Number,Description,Quantity Per",
    "TS-4410-D,Digital Temperature Sensor I2C +/-0.5%,2",
    "CN-8842,4-Pin Wire-to-Board Connector,1",
    "RES-100K-0402,100k-ohm Resistor 0402 +/-1%,4",
    "CAP-10UF-0805,10uF Ceramic Capacitor 0805,2",
    "MCU-ATSAM-D21,32-bit ARM Cortex-M0+ MCU,1",
  ].join("\n");

  const currentTable = await parseCsvFile(
    new File([currentCsv], "thermal_control_module_rev_c_current.csv", { type: "text/csv" })
  );
  const proposedTable = await parseCsvFile(
    new File([proposedCsv], "thermal_control_module_rev_c_proposed.csv", { type: "text/csv" })
  );

  await bomRepo.saveBomImport(ec.id, "current", currentTable, "thermal_control_module_rev_c_current.csv", "BOM", partDataOwner.id);
  await bomRepo.saveBomImport(ec.id, "proposed", proposedTable, "thermal_control_module_rev_c_proposed.csv", "BOM", partDataOwner.id);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "BomImport",
    actor: partDataOwner.name,
    action: "Imported current and proposed BOM (7 lines / 5 lines).",
  });

  const poCsv = [
    "PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date",
    `PO-88213,Nexus Sensor Technologies,TS-3301-A,3200,4.85,USD,${dateOnly(60)}`,
    `PO-77410,Continental Circuit Components GmbH,SH-2201,5000,1.35,EUR,${dateOnly(38)}`,
    `PO-88214,Nexus Sensor Technologies,CN-OLD-7,800,2.10,USD,${dateOnly(45)}`,
  ].join("\n");
  const poTable = await parseCsvFile(new File([poCsv], "open_po_export_2026_07.csv", { type: "text/csv" }));
  const poResult = await poRepo.savePurchaseOrderImport(ec.id, poTable, "open_po_export_2026_07.csv");
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "PurchaseOrder",
    actor: partDataOwner.name,
    action: `Imported open PO export (${poResult.lineCount} lines, ${poResult.supplierCount} supplier(s)).`,
  });

  const org = await getOrCreateDefaultOrganization();
  const [nexus] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.organizationId, org.id), eq(suppliers.name, "Nexus Sensor Technologies")));
  const [continental] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.organizationId, org.id), eq(suppliers.name, "Continental Circuit Components GmbH")));

  await poRepo.addSupplierTerms(nexus.id, {
    partId: null,
    ncnr: false,
    standardLeadTimeDays: 70,
    cancellationWindowDays: 30,
    source: "verified_contract",
    effectiveDate: dateOnly(-180),
    notes: "Cancellation rights confirmed in MSA Section 8.2.",
    verifiedAt: iso(-20),
    verifiedBy: partDataOwner.id,
    validUntil: dateOnly(180),
  });
  await poRepo.addSupplierTerms(continental.id, {
    partId: null,
    ncnr: false,
    standardLeadTimeDays: 55,
    cancellationWindowDays: 21,
    source: "verified_contract",
    effectiveDate: dateOnly(-400),
    notes: "Terms last reviewed under prior annual contract cycle.",
    verifiedAt: iso(-400),
    verifiedBy: partDataOwner.id,
    validUntil: dateOnly(-10),
  });
  await poRepo.addExchangeRate({
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    rate: 1.08,
    rateDate: dateOnly(-1),
    source: "Treasury desk daily rate",
    enteredBy: finance.id,
  });
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "SupplierCommitmentTerms",
    actor: partDataOwner.name,
    action: "Recorded supplier cancellation terms for both suppliers and the EUR->USD exchange rate.",
  });

  const generated = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(
    ["TS-3301-A", "SH-2201", "CN-OLD-7"],
    ["TS-3301-A", "SH-2201", "CN-OLD-7R"]
  );
  for (const cw of generated) {
    if (cw.plmPartId === "CN-OLD-7") continue;
    await crosswalkRepo.approveCrosswalkById(cw.id, partDataOwner);
  }
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "PartNumberCrosswalk",
    actor: partDataOwner.name,
    action: "Generated and approved 2 of 3 part-number mappings (1 left pending review).",
  });

  const asOfDate = dateOnly(0);
  await exposureRepo.calculateAndPersistExposure(ec.id, asOfDate, partDataOwner.id);

  const activeRecords = await exposureRepo.getActiveExposureRecordsForEc(ec.id);
  const sensorRecord = activeRecords.find((r) => r.partId.toUpperCase() === "TS-3301-A");

  const suggestion = await altDemandRepo.createAlternateDemandSuggestion({
    partId: "TS-3301-A",
    quantityAvailableForOffset: 200,
    sourceReference: "Confirmed against Handheld Reader Rev B inventory buffer",
    demandSourceType: "unaffected_assembly",
  });
  await altDemandRepo.approveAlternateDemandById(suggestion.id, scm);
  if (sensorRecord) {
    await altDemandRepo.allocateAlternateDemandInDb(suggestion.id, sensorRecord.id, 200, scm.id);
  }
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "AlternateDemandRecord",
    actor: scm.name,
    action: "Approved and allocated 200 units of alternate demand for TS-3301-A.",
  });

  await exposureRepo.calculateAndPersistExposure(ec.id, asOfDate, partDataOwner.id);

  const finalRecords = await exposureRepo.getActiveExposureRecordsForEc(ec.id);
  const finalSensorRecord = finalRecords.find((r) => r.partId.toUpperCase() === "TS-3301-A");

  if (finalSensorRecord) {
    const action = await mitigationRepo.createMitigationActionInDb(finalSensorRecord.id, "cancel", buyer.id, dateOnly(5));
    const responseResult = await mitigationRepo.recordSupplierResponseInDb(
      action.id,
      "partially_accepted",
      2900,
      0,
      100,
      3000,
      buyer.id
    );
    if (responseResult.success) {
      const outcome = await outcomeRepo.createFinancialOutcomeInDb({
        exposureRecordId: finalSensorRecord.id,
        frozenUnitPrice: 4.85,
        quantityCancelled: 2900,
        quantityRedirected: 0,
        quantityReceivedBeforeAction: 100,
        recoverableUnitValue: null,
        recoverableUnitValueBasis: null,
        recoverableUnitValueJustificationNote: null,
        recoverableUnitValueReviewedBy: null,
        cancellationFee: 350,
        supplierCreditValue: 0,
        writeOffValue: 100 * 4.85,
        reworkCost: null,
        disposalCost: null,
        estimatedCostAvoidedFrozen: finalSensorRecord.netExposureValueReporting,
        outcomeExchangeRateSnapshotId: null,
      });
      await outcomeRepo.closeFinancialOutcomeInDb(outcome.id, finance.id);
      await auditRepo.recordAuditEvent({
        engineeringChangeId: ec.id,
        entityType: "FinancialOutcome",
        actor: finance.name,
        action: "Closed financial outcome for TS-3301-A (partial cancellation, $350 fee).",
      });
    }
  }

  return ec.id;
}

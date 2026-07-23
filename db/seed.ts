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
import { suppliers, bomDiffEntries } from "./schema";
import { db } from "./client";
import { eq, and } from "drizzle-orm";
import { getOrCreateDefaultOrganization } from "./repositories/organizations";
import type { User } from "@/domains/deltaledger/types";
import { NOVA_ROBOTICS_DATASET } from "@/domains/deltaledger/cutover/dispositionModel";
import { markAsReplacement } from "@/domains/deltaledger/bomDiff";

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
  const poResult = await poRepo.savePurchaseOrderImport(ec.id, poTable, "open_po_export_2026_07.csv", buyer.id);
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

// ---------------------------------------------------------------------------------------------
// DeltaLedger V3 -- Nova Robotics / ECO-1042 demonstration scenario.
// ---------------------------------------------------------------------------------------------

const nrPartDataOwner: User = { id: "nr-pdo", name: "Elena Suárez", role: "part_data_owner" };
const nrScm: User = { id: "nr-scm", name: "James Whitfield", role: "supply_chain_manager" };
const nrBuyer: User = { id: "nr-buyer", name: "Tasha Reyes", role: "buyer" };

const NOVA_EC_NAME = "ECO-1042: Main Compute PCBA Rev B → Rev C";

const PCBA_OLD_PART = "APX-8801B"; // Main Compute PCBA, Rev B
const PCBA_NEW_PART = "APX-8801C"; // Main Compute PCBA, Rev C
const HARNESS_OLD_PART = "APX-4415-1"; // Compute-to-Drive Wiring Harness, Rev 1
const HARNESS_NEW_PART = "APX-4415-2"; // Compute-to-Drive Wiring Harness, Rev 2
// Unaffected parts, seeded purely so the BOM diff isn't a two-line toy -- never opened in the
// guided demo path.
const UNAFFECTED_PARTS = [
  { partNumber: "APX-8815", description: "Sensor Fusion PCBA" },
  { partNumber: "APX-2201", description: "E-Stop Controller" },
];

/**
 * Seeds the Nova Robotics / ECO-1042 demonstration scenario (DeltaLedger V3 Master
 * Specification, Sections 3-4) through the real repository layer, exactly the same way
 * seedSampleEngineeringChange() above does -- this is dogfooding the real BOM/PO/crosswalk/
 * exposure pipeline, not a hand-faked fixture.
 *
 * Every dollar figure, quantity, and due date below is read directly from
 * NOVA_ROBOTICS_DATASET (src/domains/deltaledger/cutoverDemo/dispositionModel.ts) -- the exact
 * same constant the Cutover Simulator's disposition calculation uses. There is deliberately no
 * second, independently-maintained copy of these numbers: this function and the simulator can
 * never silently drift apart, because they both read the one canonical dataset.
 *
 * Idempotent: checks for the EC by name first and returns its existing id rather than
 * duplicating it.
 */
export async function seedNovaRoboticsScenario(): Promise<string> {
  const existing = await ecRepo.listEngineeringChanges();
  const alreadySeeded = existing.find((e) => e.name === NOVA_EC_NAME);
  if (alreadySeeded) {
    return alreadySeeded.id;
  }

  const d = NOVA_ROBOTICS_DATASET;

  const ec = await ecRepo.createEngineeringChange(
    NOVA_EC_NAME,
    "Transition the Main Compute PCBA from Rev B to Rev C to resolve thermal throttling caused by an obsolescence-driven voltage-regulator substitution. The new pinout requires the Compute-to-Drive Wiring Harness to move from Rev 1 to Rev 2 as well.",
    nrPartDataOwner.id,
    { isReadOnly: true }
  );

  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "EngineeringChange",
    entityId: ec.id,
    actor: nrPartDataOwner.name,
    action: `Created engineering change "${ec.name}" for Nova Robotics, Inc. (fictional demonstration company).`,
  });

  // --- BOM: current (Rev B / Rev 1) vs. proposed (Rev C / Rev 2), plus two unaffected parts. ---
  // Quote the description field -- several descriptions below ("Main Compute PCBA, Rev B")
  // contain a comma, which would otherwise misalign the columns of this hand-built CSV.
  const bomRow = (partNumber: string, description: string) => `${partNumber},"${description}",1`;
  const currentCsv = [
    "Part Number,Description,Quantity Per",
    bomRow(PCBA_OLD_PART, "Main Compute PCBA, Rev B"),
    bomRow(HARNESS_OLD_PART, "Compute-to-Drive Wiring Harness, Rev 1"),
    ...UNAFFECTED_PARTS.map((p) => bomRow(p.partNumber, p.description)),
  ].join("\n");
  const proposedCsv = [
    "Part Number,Description,Quantity Per",
    bomRow(PCBA_NEW_PART, "Main Compute PCBA, Rev C"),
    bomRow(HARNESS_NEW_PART, "Compute-to-Drive Wiring Harness, Rev 2"),
    ...UNAFFECTED_PARTS.map((p) => bomRow(p.partNumber, p.description)),
  ].join("\n");

  const currentTable = await parseCsvFile(new File([currentCsv], "apex2000_current_bom.csv", { type: "text/csv" }));
  const proposedTable = await parseCsvFile(new File([proposedCsv], "apex2000_proposed_bom.csv", { type: "text/csv" }));

  await bomRepo.saveBomImport(ec.id, "current", currentTable, "apex2000_current_bom.csv", "BOM", nrPartDataOwner.id);
  await bomRepo.saveBomImport(ec.id, "proposed", proposedTable, "apex2000_proposed_bom.csv", "BOM", nrPartDataOwner.id);

  // "Replaced" is never auto-inferred (see bomDiff.ts's markAsReplacement) -- pair the PCBA and
  // harness removed/added entries explicitly, exactly as a real engineer would in the UI, then
  // persist the paired result the same way recomputeBomDiff() itself would.
  const rawDiff = await bomRepo.getBomDiffForEc(ec.id);
  const pcbaRemoved = rawDiff.find((e) => e.partId === PCBA_OLD_PART && e.changeType === "removed");
  const pcbaAdded = rawDiff.find((e) => e.partId === PCBA_NEW_PART && e.changeType === "added");
  const harnessRemoved = rawDiff.find((e) => e.partId === HARNESS_OLD_PART && e.changeType === "removed");
  const harnessAdded = rawDiff.find((e) => e.partId === HARNESS_NEW_PART && e.changeType === "added");

  let pairedDiff = rawDiff;
  if (pcbaRemoved && pcbaAdded) {
    pairedDiff = markAsReplacement(pairedDiff, pcbaRemoved.id, pcbaAdded.id);
  }
  if (harnessRemoved && harnessAdded) {
    pairedDiff = markAsReplacement(pairedDiff, harnessRemoved.id, harnessAdded.id);
  }
  await db.delete(bomDiffEntries).where(eq(bomDiffEntries.engineeringChangeId, ec.id));
  if (pairedDiff.length > 0) {
    await db.insert(bomDiffEntries).values(
      pairedDiff.map((entry) => ({
        engineeringChangeId: ec.id,
        partId: entry.partId,
        changeType: entry.changeType,
        fromQuantity: entry.fromQuantity,
        toQuantity: entry.toQuantity,
        replacementPartId: entry.replacementPartId,
      }))
    );
  }

  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "BomImport",
    actor: nrPartDataOwner.name,
    action: "Imported current and proposed BOM; explicitly paired the PCBA and harness replacements.",
  });

  // --- Open POs: PO-3301 (Sunrise Electronics, PCBA, 3 batches) and PO-3302 (Harness Works). ---
  const poRows: string[] = ["PO Number,Supplier,Part Number,Quantity Open,Unit Price,Currency,Promised Receipt Date"];
  for (const batch of d.pcbaBatches) {
    poRows.push(
      `PO-3301,${d.pcbaSupplierName},${PCBA_OLD_PART},${batch.quantity},${d.onHandPcbaUnitCost},USD,${dateOnly(batch.dueWeek * 7)}`
    );
  }
  poRows.push(
    `PO-3302,${d.harnessSupplierName},${HARNESS_OLD_PART},${d.harnessPoQuantity},${d.onHandHarnessUnitCost},USD,${dateOnly(d.harnessPoDueWeek * 7)}`
  );
  const poTable = await parseCsvFile(new File([poRows.join("\n")], "nova_open_po_export.csv", { type: "text/csv" }));
  const poResult = await poRepo.savePurchaseOrderImport(ec.id, poTable, "nova_open_po_export.csv", nrBuyer.id);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "PurchaseOrder",
    actor: nrBuyer.name,
    action: `Imported open PO export (${poResult.lineCount} lines, ${poResult.supplierCount} supplier(s)): PO-3301 (Sunrise Electronics, PCBA, 3 batches) and PO-3302 (Harness Works, harness).`,
  });

  // --- Supplier commitment terms (the real, binary cancellable/non-cancellable + lead-time
  //     terms this table already supports -- distinct from the tiered notice-based cancellation
  //     percentages used by the Cutover Simulator's own disposition model, which are richer
  //     than this table's shape and live as data inside NOVA_ROBOTICS_DATASET instead). ---
  const org = await getOrCreateDefaultOrganization();
  const [sunrise] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.organizationId, org.id), eq(suppliers.name, d.pcbaSupplierName)));
  const [harnessWorks] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.organizationId, org.id), eq(suppliers.name, d.harnessSupplierName)));

  await poRepo.addSupplierTerms(sunrise.id, {
    partId: null,
    ncnr: false,
    standardLeadTimeDays: d.newPcbaLeadTimeWeeks * 7,
    cancellationWindowDays: 45,
    source: "verified_contract",
    effectiveDate: dateOnly(-180),
    notes: "Tiered cancellation fee schedule confirmed in MSA: 10% at ≥45 days' notice, 30% at 15-44 days, non-cancellable under 15 days.",
    verifiedAt: iso(-20),
    verifiedBy: nrPartDataOwner.id,
    validUntil: dateOnly(180),
  });
  await poRepo.addSupplierTerms(harnessWorks.id, {
    partId: null,
    ncnr: false,
    standardLeadTimeDays: 21,
    cancellationWindowDays: 7,
    source: "verified_contract",
    effectiveDate: dateOnly(-180),
    notes: "Standing accommodation: open harness POs may be converted to a new revision for a flat re-spec fee plus the per-unit cost delta, in lieu of a cancellation penalty.",
    verifiedAt: iso(-20),
    verifiedBy: nrPartDataOwner.id,
    validUntil: dateOnly(180),
  });
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "SupplierCommitmentTerms",
    actor: nrPartDataOwner.name,
    action: "Recorded supplier commitment terms for Sunrise Electronics and Harness Works.",
  });

  // --- Crosswalk: exact-match, both parts approved. ---
  const generated = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(
    [PCBA_OLD_PART, HARNESS_OLD_PART],
    [PCBA_OLD_PART, HARNESS_OLD_PART]
  );
  for (const cw of generated) {
    await crosswalkRepo.approveCrosswalkById(cw.id, nrPartDataOwner);
  }
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "PartNumberCrosswalk",
    actor: nrPartDataOwner.name,
    action: "Generated and approved part-number mappings for the PCBA and harness.",
  });

  // --- Real, persisted Week-0 baseline exposure -- the $125,720 Gross Affected Commitment the
  //     Executive Risk Overview leads with is a genuine, queryable figure, not a display
  //     constant (Master Specification Section 9). ---
  const asOfDate = dateOnly(0);
  await exposureRepo.calculateAndPersistExposure(ec.id, asOfDate, nrPartDataOwner.id);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "ExposureRecord",
    actor: nrPartDataOwner.name,
    action: "Calculated Week-0 baseline exposure against the imported open POs.",
  });

  return ec.id;
}

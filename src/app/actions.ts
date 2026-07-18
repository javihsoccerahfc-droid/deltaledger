"use server";

import { revalidatePath } from "next/cache";
import * as ecRepo from "../../db/repositories/engineeringChanges";
import * as bomRepo from "../../db/repositories/bom";
import * as poRepo from "../../db/repositories/purchaseOrders";
import * as crosswalkRepo from "../../db/repositories/crosswalk";
import * as auditRepo from "../../db/repositories/audit";
import * as exposureRepo from "../../db/repositories/exposure";
import * as altDemandRepo from "../../db/repositories/alternateDemand";
import * as mitigationRepo from "../../db/repositories/mitigation";
import * as outcomeRepo from "../../db/repositories/financialOutcome";
import { parseXlsxFile } from "@/core/ingestion/parseXlsx";
import { parseCsvFile } from "@/core/ingestion/parseCsv";
import { RawTable } from "@/core/ingestion/types";
import {
  User,
  MitigationActionStatus,
  MitigationActionType,
  SupplierResponseType,
  DemandSourceType,
} from "@/domains/deltaledger/types";
import { OutcomeInputs } from "@/domains/deltaledger/mitigation/outcome";

async function parseFileToTable(file: File): Promise<RawTable> {
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsvFile(file);
  const workbook = await parseXlsxFile(file);
  return workbook.getSheetTable(workbook.sheetNames[0]);
}

function requireStringField(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field "${field}" in upload.`);
  }
  return value;
}

function requireFileField(formData: FormData, field: string): File {
  const value = formData.get(field);
  if (!(value instanceof File) || value.size === 0) {
    throw new Error("No file was received. Please choose a file and try again.");
  }
  return value;
}

function parseActorField(formData: FormData): User {
  const raw = requireStringField(formData, "actor");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.name !== "string" || typeof parsed.role !== "string") {
      throw new Error("malformed actor payload");
    }
    return parsed as User;
  } catch {
    throw new Error("Could not identify the acting user for this import.");
  }
}

export async function createEngineeringChangeAction(name: string, description: string, actor: User) {
  const ec = await ecRepo.createEngineeringChange(name, description, actor.id);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ec.id,
    entityType: "EngineeringChange",
    entityId: ec.id,
    actor: actor.name,
    action: `Created engineering change "${ec.name}".`,
  });
  revalidatePath("/engineering-changes");
  return ec;
}

export async function listEngineeringChangesAction() {
  return ecRepo.listEngineeringChanges();
}

export async function getEngineeringChangeAction(id: string) {
  return ecRepo.getEngineeringChangeById(id);
}

/**
 * Accepts a FormData payload (fields: "ecId", "versionLabel", "file", "actor" [JSON]) rather
 * than individual positional arguments including a raw File. This is the canonical, most
 * broadly cross-browser-tested pattern for file uploads through Next.js Server Actions -- the
 * same encoding a real <form action={...}> submission produces. Passing a bare File as a
 * positional argument to a Server Action instead relies on a less battle-tested RSC argument
 * encoder and is the prime suspect behind imports hanging indefinitely with zero network
 * request in Safari (see CHANGELOG.md).
 */
export async function importBomAction(
  formData: FormData
): Promise<{ success: true; lineCount: number } | { success: false; message: string }> {
  try {
    const ecId = requireStringField(formData, "ecId");
    const versionLabel = requireStringField(formData, "versionLabel") as "current" | "proposed";
    const file = requireFileField(formData, "file");
    const actor = parseActorField(formData);

    const table = await parseFileToTable(file);
    const bomImport = await bomRepo.saveBomImport(ecId, versionLabel, table, file.name, "Sheet1", actor.id);
    const imports = await bomRepo.getBomImportsForEc(ecId);
    const lineCount = imports[versionLabel]?.lines.length ?? 0;
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "BomImport",
      entityId: bomImport.id,
      actor: actor.name,
      action: `Imported ${versionLabel} BOM from "${file.name}" (${lineCount} lines).`,
    });
    revalidatePath(`/engineering-changes/${ecId}/boms`);
    return { success: true, lineCount };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Could not parse this file." };
  }
}

export async function getBomStateAction(ecId: string) {
  const [imports, diff] = await Promise.all([bomRepo.getBomImportsForEc(ecId), bomRepo.getBomDiffForEc(ecId)]);
  return { imports, diff };
}

/**
 * Accepts a FormData payload (fields: "ecId", "file", "actor" [JSON]) -- see importBomAction
 * for why this replaces individual positional arguments including a raw File.
 */
export async function importPurchaseOrderAction(
  formData: FormData
): Promise<
  { success: true; supplierCount: number; poCount: number; lineCount: number } | { success: false; message: string }
> {
  try {
    const ecId = requireStringField(formData, "ecId");
    const file = requireFileField(formData, "file");
    const actor = parseActorField(formData);

    const table = await parseFileToTable(file);
    const result = await poRepo.savePurchaseOrderImport(ecId, table, file.name);
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PurchaseOrder",
      actor: actor.name,
      action: `Imported open PO export from "${file.name}" (${result.lineCount} lines, ${result.supplierCount} supplier(s)).`,
    });
    revalidatePath(`/engineering-changes/${ecId}/po`);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Could not parse this file." };
  }
}

export async function getPurchaseDataAction(ecId: string) {
  return poRepo.getPurchaseDataForEc(ecId);
}

export async function addSupplierTermsAction(
  supplierId: string,
  terms: Parameters<typeof poRepo.addSupplierTerms>[1],
  actor: User
) {
  const created = await poRepo.addSupplierTerms(supplierId, terms);
  await auditRepo.recordAuditEvent({
    entityType: "SupplierCommitmentTerms",
    entityId: created.id,
    actor: actor.name,
    action: `Recorded supplier cancellation terms (supersedes any prior active terms for the same scope).`,
  });
  return created;
}

export async function addExchangeRateAction(rate: Parameters<typeof poRepo.addExchangeRate>[0], actor: User) {
  const created = await poRepo.addExchangeRate(rate);
  await auditRepo.recordAuditEvent({
    entityType: "ExchangeRateSnapshot",
    entityId: created.id,
    actor: actor.name,
    action: `Recorded exchange rate ${rate.baseCurrency}->${rate.quoteCurrency}: ${rate.rate}.`,
  });
  return created;
}

export async function generateMappingSuggestionsAction(ecId: string, actor: User) {
  const diff = await bomRepo.getBomDiffForEc(ecId);
  const purchaseData = await poRepo.getPurchaseDataForEc(ecId);
  const eligible = diff
    .filter((d) => d.changeType === "removed" || d.changeType === "qty_reduced" || d.changeType === "replaced")
    .map((d) => d.partId);
  const candidates = purchaseData.poLines.map((l) => l.rawPartNumber);
  const created = await crosswalkRepo.generateAndSaveCrosswalkSuggestions(eligible, candidates);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ecId,
    entityType: "PartNumberCrosswalk",
    actor: actor.name,
    action: `Generated ${created.length} part-number mapping suggestion(s).`,
  });
  revalidatePath(`/engineering-changes/${ecId}/mapping`);
  return created;
}

export async function getCrosswalksAction() {
  return crosswalkRepo.getCrosswalksForOrg();
}

export async function approveMappingAction(ecId: string, crosswalkId: string, actor: User) {
  const result = await crosswalkRepo.approveCrosswalkById(crosswalkId, actor);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PartNumberCrosswalk",
      entityId: crosswalkId,
      actor: actor.name,
      action: `Approved mapping ${crosswalkId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/mapping`);
  }
  return result;
}

export async function rejectMappingAction(ecId: string, crosswalkId: string, actor: User) {
  const result = await crosswalkRepo.rejectCrosswalkById(crosswalkId, actor);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PartNumberCrosswalk",
      entityId: crosswalkId,
      actor: actor.name,
      action: `Rejected mapping ${crosswalkId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/mapping`);
  }
  return result;
}

export async function setMappingErpIdAction(ecId: string, crosswalkId: string, erpPartId: string) {
  await crosswalkRepo.setCrosswalkErpId(crosswalkId, erpPartId);
  revalidatePath(`/engineering-changes/${ecId}/mapping`);
}

export async function setMappingTypeAction(
  ecId: string,
  crosswalkId: string,
  mappingType: "one_to_one" | "one_to_many" | "many_to_one"
) {
  await crosswalkRepo.setCrosswalkMappingType(crosswalkId, mappingType);
  revalidatePath(`/engineering-changes/${ecId}/mapping`);
}

export async function setAllocationRuleAction(
  ecId: string,
  crosswalkId: string,
  rule: Parameters<typeof crosswalkRepo.upsertAllocationRule>[1]
) {
  await crosswalkRepo.upsertAllocationRule(crosswalkId, rule);
  revalidatePath(`/engineering-changes/${ecId}/mapping`);
}

export async function getAuditLogAction(ecId: string) {
  return auditRepo.getAuditLogForEc(ecId);
}

export async function getAllocationRulesForCrosswalksAction(crosswalkIds: string[]) {
  const results = await Promise.all(crosswalkIds.map((id) => crosswalkRepo.getAllocationRulesForCrosswalk(id)));
  return results.flat();
}

// ---- Exposure ----

export async function calculateExposureAction(ecId: string, actor: User) {
  const asOfDate = new Date().toISOString().slice(0, 10);
  const result = await exposureRepo.calculateAndPersistExposure(ecId, asOfDate, actor.id);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ecId,
    entityType: "ExposureRecord",
    actor: actor.name,
    action: `Ran exposure calculation (${result.createdRecordIds.length} record(s), ${result.gaps.length} unmapped gap(s)).`,
  });
  revalidatePath(`/engineering-changes/${ecId}/exposure`);
  return result;
}

export async function getActiveExposureRecordsAction(ecId: string) {
  return exposureRepo.getActiveExposureRecordsForEc(ecId);
}

export async function getExposureSnapshotAction(snapshotId: string) {
  return exposureRepo.getExposureSnapshotById(snapshotId);
}

// ---- Alternate demand ----

export async function createAlternateDemandSuggestionAction(
  ecId: string,
  input: { partId: string; quantityAvailableForOffset: number; sourceReference: string; demandSourceType: DemandSourceType },
  actor: User
) {
  const created = await altDemandRepo.createAlternateDemandSuggestion(input);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ecId,
    entityType: "AlternateDemandRecord",
    entityId: created.id,
    actor: actor.name,
    action: `Suggested alternate demand for ${input.partId} (${input.quantityAvailableForOffset} units).`,
  });
  revalidatePath(`/engineering-changes/${ecId}/alternate-demand`);
  return created;
}

export async function getAlternateDemandAction() {
  return altDemandRepo.getAlternateDemandForOrg();
}

export async function getAllAllocationsAction() {
  return altDemandRepo.getAllAllocations();
}

export async function approveAlternateDemandAction(ecId: string, recordId: string, actor: User) {
  const result = await altDemandRepo.approveAlternateDemandById(recordId, actor);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "AlternateDemandRecord",
      entityId: recordId,
      actor: actor.name,
      action: `Approved alternate demand ${recordId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/alternate-demand`);
  }
  return result;
}

export async function rejectAlternateDemandAction(ecId: string, recordId: string, actor: User) {
  const result = await altDemandRepo.rejectAlternateDemandById(recordId, actor);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "AlternateDemandRecord",
      entityId: recordId,
      actor: actor.name,
      action: `Rejected alternate demand ${recordId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/alternate-demand`);
  }
  return result;
}

export async function allocateAlternateDemandAction(
  ecId: string,
  recordId: string,
  exposureRecordId: string,
  quantity: number,
  actor: User
) {
  const result = await altDemandRepo.allocateAlternateDemandInDb(recordId, exposureRecordId, quantity, actor.id);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "AlternateDemandAllocation",
      actor: actor.name,
      action: `Allocated ${quantity} units of alternate demand ${recordId} to exposure ${exposureRecordId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/alternate-demand`);
  }
  return result;
}

// ---- Mitigation ----

export async function createMitigationAction(
  ecId: string,
  exposureRecordId: string,
  actionType: MitigationActionType,
  ownerUserId: string,
  dueDate: string | null,
  actor: User
) {
  const created = await mitigationRepo.createMitigationActionInDb(exposureRecordId, actionType, ownerUserId, dueDate);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ecId,
    entityType: "MitigationAction",
    entityId: created.id,
    actor: actor.name,
    action: `Created mitigation action (${actionType}) for exposure ${exposureRecordId}.`,
  });
  revalidatePath(`/engineering-changes/${ecId}/mitigation`);
  return created;
}

export async function transitionMitigationAction(ecId: string, mitigationActionId: string, status: MitigationActionStatus) {
  await mitigationRepo.transitionMitigationActionStatus(mitigationActionId, status);
  revalidatePath(`/engineering-changes/${ecId}/mitigation`);
}

export async function getMitigationActionsAction(exposureRecordId: string) {
  return mitigationRepo.getMitigationActionsForExposureRecord(exposureRecordId);
}

export async function getMitigationActionsForRecordsAction(exposureRecordIds: string[]) {
  return mitigationRepo.getMitigationActionsForExposureRecords(exposureRecordIds);
}

export async function getExposureSnapshotsAction(snapshotIds: string[]) {
  const results = await Promise.all(snapshotIds.map((id) => exposureRepo.getExposureSnapshotById(id)));
  return results.filter((s): s is NonNullable<typeof s> => s !== null);
}

export async function recordSupplierResponseAction(
  ecId: string,
  mitigationActionId: string,
  responseType: SupplierResponseType,
  quantityCancelled: number,
  quantityRedirected: number,
  quantityReceivedBeforeAction: number,
  totalCommittedQuantity: number,
  actor: User
) {
  const result = await mitigationRepo.recordSupplierResponseInDb(
    mitigationActionId,
    responseType,
    quantityCancelled,
    quantityRedirected,
    quantityReceivedBeforeAction,
    totalCommittedQuantity,
    actor.id
  );
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "SupplierResponse",
      entityId: result.responseId,
      actor: actor.name,
      action: `Recorded supplier response (${responseType}).`,
    });
    revalidatePath(`/engineering-changes/${ecId}/mitigation`);
  }
  return result;
}

export async function getSupplierResponsesAction(mitigationActionId: string) {
  return mitigationRepo.getSupplierResponsesForMitigationAction(mitigationActionId);
}

// ---- Financial outcome ----

export async function createOutcomeAction(ecId: string, inputs: OutcomeInputs, actor: User) {
  const created = await outcomeRepo.createFinancialOutcomeInDb(inputs);
  await auditRepo.recordAuditEvent({
    engineeringChangeId: ecId,
    entityType: "FinancialOutcome",
    entityId: created.id,
    actor: actor.name,
    action: "Recorded financial outcome (draft, not yet closed).",
  });
  revalidatePath(`/engineering-changes/${ecId}/mitigation`);
  revalidatePath(`/engineering-changes/${ecId}/report`);
  return created;
}

export async function closeOutcomeAction(ecId: string, outcomeId: string, actor: User) {
  const result = await outcomeRepo.closeFinancialOutcomeInDb(outcomeId, actor.id);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "FinancialOutcome",
      entityId: outcomeId,
      actor: actor.name,
      action: "Closed financial outcome.",
    });
    revalidatePath(`/engineering-changes/${ecId}/mitigation`);
    revalidatePath(`/engineering-changes/${ecId}/report`);
  }
  return result;
}

export async function getExchangeRatesAction() {
  return poRepo.getExchangeRates();
}

export async function getActiveSupplierTermsAction(supplierId: string) {
  return poRepo.getActiveSupplierTerms(supplierId);
}

export async function getFinancialOutcomesAction() {
  return outcomeRepo.getFinancialOutcomesForEc();
}

export async function getFinancialOutcomeForRecordAction(exposureRecordId: string) {
  return outcomeRepo.getFinancialOutcomeForExposureRecord(exposureRecordId);
}

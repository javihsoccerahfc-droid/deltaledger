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
import * as portfolioRepo from "../../db/repositories/portfolio";
import { getWorkspaceCompletion, getEvidenceCoverage, getDecisionReadiness, getNextAction } from "@/domains/deltaledger/workspaceSummary";
import {
  getPortfolioAttentionItems,
  getPortfolioMetrics,
  getLargestExposureEntries,
  EcPortfolioEntry,
} from "@/domains/deltaledger/portfolioSummary";
import { buildEvidenceExplanation, EvidenceExplanation } from "@/domains/deltaledger/evidenceExplanation";
import { runExposurePipeline } from "@/domains/deltaledger/exposure/exposurePipeline";
import {
  applyScenarioAssumptions,
  describeScenarioAssumption,
  ScenarioAssumption,
  ScenarioAssumptionContext,
} from "@/domains/deltaledger/exposure/scenarioAssumptions";
import { compareScenarioToBaseline, BaselineExposureLine } from "@/domains/deltaledger/exposure/scenarioComparison";
import { parseXlsxFile } from "@/core/ingestion/parseXlsx";
import { parseCsvFile } from "@/core/ingestion/parseCsv";
import { RawTable } from "@/core/ingestion/types";
import {
  User,
  MitigationActionStatus,
  MitigationActionType,
  SupplierResponseType,
  DemandSourceType,
  ExposureConfidence,
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
 * Accepts a FormData payload (fields: "ecId", "file", "actor" [JSON], and the optional
 * "confirmSupersedesExposure" gate described below) -- see importBomAction for why this
 * replaces individual positional arguments including a raw File.
 *
 * P0 remediation, Decision C (approved): if active exposure records already exist for this
 * EC, a PO re-import is allowed to proceed, but only after an explicit confirmation --
 * re-importing does NOT automatically delete or recalculate that exposure (see
 * db/repositories/exposure.ts's provenanceState()), so silently allowing it without warning
 * risked a user not realizing their existing exposure figures had become unverified relative
 * to the new PO data. If confirmation is required and not yet given, this returns a typed
 * `requiresConfirmation` result instead of proceeding -- no rows are written in that case.
 */
export async function importPurchaseOrderAction(
  formData: FormData
): Promise<
  | { success: true; supplierCount: number; poCount: number; lineCount: number }
  | { success: false; requiresConfirmation: true; message: string }
  | { success: false; requiresConfirmation?: false; message: string }
> {
  try {
    const ecId = requireStringField(formData, "ecId");
    const file = requireFileField(formData, "file");
    const actor = parseActorField(formData);
    const confirmed = formData.get("confirmSupersedesExposure") === "true";

    if (!confirmed && (await exposureRepo.hasActiveExposureRecords(ecId))) {
      return {
        success: false,
        requiresConfirmation: true,
        message:
          "This engineering change already has calculated exposure. Re-importing PO data will " +
          "not automatically update it -- existing figures will be marked as based on " +
          "superseded PO data until exposure is recalculated. Continue with the re-import?",
      };
    }

    const table = await parseFileToTable(file);
    const result = await poRepo.savePurchaseOrderImport(ecId, table, file.name, actor.id);
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PurchaseOrder",
      actor: actor.name,
      action: `Imported open PO export from "${file.name}" (${result.lineCount} lines, ${result.supplierCount} supplier(s)).`,
    });
    revalidatePath(`/engineering-changes/${ecId}/po`);
    revalidatePath(`/engineering-changes/${ecId}/exposure`);
    revalidatePath(`/engineering-changes/${ecId}/report`);
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
  const all = await crosswalkRepo.getCrosswalksForOrg();
  // Phase 6A -- every consumer of this action (the Mapping review queue, the Explorer's
  // allocation-override picker) wants the current, active truth, not a row a revision has
  // since replaced. The audit log (see audit/page.tsx) is the record of who approved,
  // revoked, or replaced a mapping and when -- this action's job is just "what's active now."
  return all.filter((c) => c.supersededById === null);
}

export async function approveMappingAction(ecId: string, crosswalkId: string, actor: User) {
  const result = await crosswalkRepo.approveCrosswalkById(crosswalkId, actor);
  if (result.success) {
    const crosswalk = await crosswalkRepo.getCrosswalkById(crosswalkId);
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PartNumberCrosswalk",
      entityId: crosswalkId,
      actor: actor.name,
      // Real part numbers, not an internal id -- and a forward-looking claim rather than a
      // false immediate-effect one: approving a mapping never retroactively changes any
      // existing, frozen exposure record (see the immutable-snapshot model) -- it only takes
      // effect the next time exposure is calculated.
      action: crosswalk
        ? `${crosswalk.plmPartId} is now linked to ERP part ${crosswalk.erpPartId} -- this mapping will be used in the next exposure calculation.`
        : `Approved mapping ${crosswalkId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/mapping`);
  }
  return result;
}

export async function rejectMappingAction(ecId: string, crosswalkId: string, actor: User) {
  const result = await crosswalkRepo.rejectCrosswalkById(crosswalkId, actor);
  if (result.success) {
    const crosswalk = await crosswalkRepo.getCrosswalkById(crosswalkId);
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PartNumberCrosswalk",
      entityId: crosswalkId,
      actor: actor.name,
      action: crosswalk
        ? `Rejected the suggested mapping from ${crosswalk.plmPartId} to ERP part ${crosswalk.erpPartId} -- a corrected mapping is needed before exposure can be calculated for this part.`
        : `Rejected mapping ${crosswalkId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/mapping`);
  }
  return result;
}

/**
 * Phase 6A -- the corresponding action for reviseCrosswalk. Records an audit event naming
 * BOTH the prior mapping and its replacement explicitly -- "who approved, revoked, or
 * replaced the mapping and when" needs the old and new identities both visible in one entry,
 * not just "something changed."
 */
export async function reviseMappingAction(
  ecId: string,
  crosswalkId: string,
  revision: { erpPartId: string; mappingType: "one_to_one" | "one_to_many" | "many_to_one" },
  reason: string,
  actor: User
) {
  const priorCrosswalk = await crosswalkRepo.getCrosswalkById(crosswalkId);
  const result = await crosswalkRepo.reviseCrosswalk(crosswalkId, revision, actor, reason);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PartNumberCrosswalk",
      entityId: result.created.id,
      actor: actor.name,
      action: priorCrosswalk
        ? `Revised the mapping for ${priorCrosswalk.plmPartId}: was linked to ${priorCrosswalk.erpPartId} (${priorCrosswalk.reviewStatus}), now linked to ${result.created.erpPartId} (approved). Reason: ${reason}`
        : `Revised mapping ${crosswalkId} -- now linked to ${result.created.erpPartId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/mapping`);
  }
  return result;
}

export async function setMappingErpIdAction(ecId: string, crosswalkId: string, erpPartId: string) {
  await crosswalkRepo.setCrosswalkErpId(crosswalkId, erpPartId);
  revalidatePath(`/engineering-changes/${ecId}/mapping`);
}

/**
 * Phase 6A -- revokes an approved mapping when there is no confirmed replacement yet.
 * Historical calculations made under the old approval are entirely unaffected (see
 * exposure_source_snapshots' frozen crosswalk columns); the NEXT calculation correctly
 * reports a gap for this part, per resolvePartIdentity's existing approved-only filter,
 * rather than silently continuing to use the now-revoked figure.
 */
export async function revokeMappingAction(ecId: string, crosswalkId: string, reason: string, actor: User) {
  const priorCrosswalk = await crosswalkRepo.getCrosswalkById(crosswalkId);
  const result = await crosswalkRepo.revokeCrosswalk(crosswalkId, actor, reason);
  if (result.success) {
    await auditRepo.recordAuditEvent({
      engineeringChangeId: ecId,
      entityType: "PartNumberCrosswalk",
      entityId: result.created.id,
      actor: actor.name,
      action: priorCrosswalk
        ? `Revoked the approved mapping from ${priorCrosswalk.plmPartId} to ${priorCrosswalk.erpPartId} -- no confirmed replacement yet, so this part will report as unmapped starting with the next exposure calculation. Prior calculations remain valid. Reason: ${reason}`
        : `Revoked mapping ${crosswalkId}.`,
    });
    revalidatePath(`/engineering-changes/${ecId}/mapping`);
  }
  return result;
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

/** Feeds the Decision Timeline -- same underlying data as getAuditLogAction, shaped for it. */
export async function getTimelineEntriesAction(ecId: string) {
  const log = await auditRepo.getAuditLogForEc(ecId);
  return log.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actor: entry.actor,
    timestamp: entry.timestamp,
    entityType: entry.entityType,
  }));
}

export async function getAllocationRulesForCrosswalksAction(crosswalkIds: string[]) {
  const results = await Promise.all(crosswalkIds.map((id) => crosswalkRepo.getAllocationRulesForCrosswalk(id)));
  return results.flat();
}

// ---- Exposure ----

export async function calculateExposureAction(ecId: string, actor: User) {
  const asOfDate = new Date().toISOString().slice(0, 10);
  // Captured BEFORE recalculating -- this is what makes an honest before/after delta possible:
  // the previously-active records are about to be superseded, so this is the last moment
  // they're queryable as "active."
  const priorRecords = await exposureRepo.getActiveExposureRecordsForEc(ecId);
  const priorTotal = priorRecords.reduce((sum, r) => sum + r.netExposureValueReporting, 0);

  const result = await exposureRepo.calculateAndPersistExposure(ecId, asOfDate, actor.id);

  const newRecords = await exposureRepo.getActiveExposureRecordsForEc(ecId);
  const newTotal = newRecords.reduce((sum, r) => sum + r.netExposureValueReporting, 0);
  const delta = newTotal - priorTotal;

  // Deliberately does NOT claim a specific upstream cause (e.g. "because of the PO import") --
  // this calculation could reflect a changed BOM, PO, mapping, or alternate demand allocation
  // since the last run, and attributing it to just one of those would be a claim this
  // function has no way to actually verify. "Recalculated: $X -> $Y" is the honest, accurate
  // version of explaining what changed.
  const deltaText =
    priorRecords.length === 0
      ? `${newRecords.length} record(s) totaling ${newTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}.`
      : `${priorTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })} -> ${newTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })} (${delta >= 0 ? "+" : ""}${delta.toLocaleString(undefined, { style: "currency", currency: "USD" })}).`;

  await auditRepo.recordAuditEvent({
    engineeringChangeId: ecId,
    entityType: "ExposureRecord",
    actor: actor.name,
    action: `Exposure recalculated: ${deltaText}${result.gaps.length > 0 ? ` ${result.gaps.length} part(s) still unmapped.` : ""}`,
  });
  revalidatePath(`/engineering-changes/${ecId}/exposure`);
  return result;
}

export async function getActiveExposureRecordsAction(ecId: string) {
  return exposureRepo.getActiveExposureRecordsForEc(ecId);
}

/**
 * P0 remediation, Decision C: returns a simple recordId -> provenance map ("current" |
 * "stale" | "legacy_unknown") so the Exposure/Report pages can visibly flag records whose
 * underlying PO batch has since been superseded, or whose provenance predates per-import
 * tracking entirely, rather than silently presenting every record as equally current.
 */
export async function getExposureProvenanceAction(ecId: string): Promise<Record<string, exposureRepo.ProvenanceState>> {
  const withProvenance = await exposureRepo.getExposureRecordsWithProvenance(ecId);
  const map: Record<string, exposureRepo.ProvenanceState> = {};
  for (const { record, provenance } of withProvenance) {
    map[record.id] = provenance;
  }
  return map;
}

/**
 * The single data-fetching entry point for everything the workspace shell (Context Bar,
 * WorkspaceTabs) and the Overview page need. Fetches raw data via the existing, unmodified
 * repository actions, then hands it to the pure functions in
 * src/domains/deltaledger/workspaceSummary.ts for every derived fact (completion, evidence
 * coverage, decision readiness). No business logic lives in this function -- it is
 * deliberately "fetch, then delegate," so the derivation itself has exactly one home and
 * can't drift between call sites the way it could when it was inlined separately in
 * engineering-changes/[id]/layout.tsx.
 */
export async function getEcWorkspaceSummaryAction(ecId: string) {
  const [bomState, purchaseData, crosswalks, exposureRecords, outcomes, provenanceByRecordId, auditLog, supersededMappingCount] =
    await Promise.all([
      getBomStateAction(ecId),
      getPurchaseDataAction(ecId),
      getCrosswalksAction(),
      getActiveExposureRecordsAction(ecId),
      getFinancialOutcomesAction(),
      getExposureProvenanceAction(ecId),
      getAuditLogAction(ecId),
      exposureRepo.countExposureRecordsWithSupersededMapping(ecId),
    ]);

  const relevantOutcomes = outcomes.filter((o) => exposureRecords.some((r) => r.id === o.exposureRecordId));

  const completion = getWorkspaceCompletion({
    bomDiff: bomState.diff,
    poLineCount: purchaseData.poLines.length,
    crosswalks,
    exposureRecords,
    provenanceByRecordId,
    mitigationOutcomes: relevantOutcomes,
  });
  const coverage = getEvidenceCoverage(exposureRecords);
  const readiness = getDecisionReadiness(completion, provenanceByRecordId, supersededMappingCount);
  const nextAction = getNextAction(ecId, readiness);

  const lastEntry = auditLog[0];
  const lastActivity = lastEntry ? `${lastEntry.action} — ${new Date(lastEntry.timestamp).toLocaleString()}` : null;

  return { completion, coverage, readiness, nextAction, lastActivity, bomState, purchaseData, exposureRecords };
}

export async function getExposureSnapshotAction(snapshotId: string) {
  return exposureRepo.getExposureSnapshotById(snapshotId);
}

/**
 * The Evidence Explorer's single data-fetching entry point. Gathers raw evidence via existing
 * repository functions, then hands everything to buildEvidenceExplanation -- this function
 * does no explaining itself.
 *
 * Milestone 3.75: crosswalk approval and allocation-method evidence now come from the FROZEN
 * fields on the snapshot itself (crosswalkErpPartId, crosswalkReviewStatus, etc. -- populated
 * at calculation time by calculateAndPersistExposure), never from a live join to the current
 * crosswalk/allocation-rule tables. Those tables mutate/replace in place; a historical
 * snapshot's frozen fields do not. `snapshot.crosswalkErpPartId === null` means this snapshot
 * predates evidence freezing -- surfaced honestly as "legacy_unavailable," never guessed at
 * via a live lookup (which would silently reintroduce the exact inconsistency this milestone
 * exists to eliminate).
 */
export async function getEvidenceExplanationAction(exposureRecordId: string) {
  const record = await exposureRepo.getExposureRecordById(exposureRecordId);
  if (!record) return null;

  const snapshot = await exposureRepo.getExposureSnapshotById(record.exposureSourceSnapshotId);
  if (!snapshot) return null;

  const [po, supplier, mitigationActions, allocations, provenanceMap] = await Promise.all([
    poRepo.getPurchaseOrderById(snapshot.purchaseOrderId),
    poRepo.getSupplierById(snapshot.supplierId),
    mitigationRepo.getMitigationActionsForExposureRecord(exposureRecordId),
    altDemandRepo.getActiveAllocationsForExposureRecord(exposureRecordId),
    getExposureProvenanceAction(record.engineeringChangeId),
  ]);

  const crosswalkEvidence: Parameters<typeof buildEvidenceExplanation>[0]["crosswalkEvidence"] =
    snapshot.crosswalkErpPartId !== null
      ? {
          status: "recorded",
          erpPartId: snapshot.crosswalkErpPartId,
          matchMethod: snapshot.crosswalkMatchMethod ?? "unknown",
          reviewStatus: snapshot.crosswalkReviewStatus ?? "unknown",
          reviewedBy: snapshot.crosswalkReviewedBy,
          reviewedAt: snapshot.crosswalkReviewedAt,
        }
      : { status: "legacy_unavailable" };

  return buildEvidenceExplanation({
    record: {
      partId: record.partId,
      grossCommittedValueReporting: record.grossCommittedValueReporting,
      alternateDemandAdjustmentReporting: record.alternateDemandAdjustmentReporting,
      netExposureValueReporting: record.netExposureValueReporting,
      confidenceClassification: record.confidenceClassification,
      classificationReason: record.classificationReason,
    },
    snapshot: {
      quantityOpen: snapshot.quantityOpen,
      unitPriceTransactionCurrency: snapshot.unitPriceTransactionCurrency,
      transactionCurrency: snapshot.transactionCurrency,
      reportingCurrency: snapshot.reportingCurrency,
      exchangeRate: snapshot.exchangeRate,
      promisedReceiptDate: snapshot.promisedReceiptDate,
    },
    supplierName: supplier?.name ?? "Unknown supplier",
    poNumber: po?.poNumber ?? "Unknown PO",
    crosswalkEvidence,
    allocationMethod: snapshot.allocationMethod,
    provenance: provenanceMap[exposureRecordId] ?? "legacy_unknown",
    hasOpenMitigationAction: mitigationActions.length > 0,
    hasAlternateDemandAllocation: allocations.length > 0,
  });
}

/**
 * The Portfolio Command Center's single data-fetching entry point -- mirrors
 * getEcWorkspaceSummaryAction's "fetch, then delegate to pure domain functions" shape. Reuses
 * getEcWorkspaceSummaryAction per EC (not a second copy of that derivation) for readiness and
 * coverage, then hands the results to src/domains/deltaledger/portfolioSummary.ts for every
 * cross-EC aggregation (attention items, metrics, largest-exposure ranking).
 *
 * Known scaling note (not a concern at today's data volumes, flagged for when it matters):
 * this fetches a full per-EC summary -- itself several parallel queries -- for every open EC,
 * sequentially awaited here. Fine for a handful of engineering changes; if a real customer's
 * portfolio grows into the hundreds, this is the first place to revisit (see the V2
 * architecture review's explicit stance on deferring that optimization until real data
 * volumes justify it).
 */
export async function getPortfolioSummaryAction() {
  const ecs = await ecRepo.listEngineeringChanges();

  const entries: EcPortfolioEntry[] = [];
  const ecListRows: {
    ec: (typeof ecs)[number];
    knownTotal: number;
    estTotal: number;
    gapCount: number;
    pendingMappings: number;
  }[] = [];

  await Promise.all(
    ecs.map(async (ec) => {
      const summary = await getEcWorkspaceSummaryAction(ec.id);
      entries.push({ ecId: ec.id, ecName: ec.name, readiness: summary.readiness, coverage: summary.coverage });
      ecListRows.push({
        ec,
        knownTotal: summary.coverage.knownTotal,
        estTotal: summary.coverage.estimatedTotal,
        gapCount: 0,
        pendingMappings: summary.completion.mappingPending,
      });
    })
  );

  const [supplierConcentration, recentActivity] = await Promise.all([
    portfolioRepo.getSupplierExposureConcentration(),
    portfolioRepo.getRecentPortfolioActivity(8),
  ]);

  return {
    metrics: getPortfolioMetrics(entries),
    attentionItems: getPortfolioAttentionItems(entries),
    largestExposure: getLargestExposureEntries(entries, 5),
    supplierConcentration: supplierConcentration.slice(0, 5),
    recentActivity: recentActivity.map((a) => ({
      description: `${a.action} — ${new Date(a.timestamp).toLocaleString()}`,
      ecId: a.engineeringChangeId,
    })),
    ecListRows,
  };
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

/**
 * Phase 6A -- companion to getActiveSupplierTermsAction. "Add Terms" previously had no
 * durable, on-page way to confirm what was actually saved (see Phase 6A triage) -- the form
 * gave feedback about the single most recent submission, but nothing showed the current state
 * of truth. This lets the PO page render a real list of what's active right now, independent
 * of whatever the form last did.
 */
export async function getActiveSupplierTermsForSuppliersAction(supplierIds: string[]) {
  const results = await Promise.all(
    supplierIds.map(async (supplierId) => ({ supplierId, terms: await poRepo.getActiveSupplierTerms(supplierId) }))
  );
  return results.filter((r) => r.terms.length > 0);
}

export async function getFinancialOutcomesAction() {
  return outcomeRepo.getFinancialOutcomesForEc();
}

export async function getFinancialOutcomeForRecordAction(exposureRecordId: string) {
  return outcomeRepo.getFinancialOutcomeForExposureRecord(exposureRecordId);
}

/**
 * Milestone 4 -- Interactive Exposure Explorer.
 *
 * One scenario line's baseline vs hypothetical figure, with a full evidence-style explanation
 * for the hypothetical figure when one was actually produced by the pipeline. `explanation`
 * intentionally omits any use of EvidenceExplanation.nextStep -- that field's action labels
 * ("Review Crosswalk", "Open Mitigation", etc.) are calibrated for real, persisted records
 * with real workflow tabs behind them; a hypothetical figure has none of that, so the
 * Interactive Exposure Explorer UI shows its own scenario-appropriate next actions instead
 * (reset, compare, note down) rather than reusing or stretching that type.
 */
export interface ScenarioLineResult {
  purchaseOrderLineId: string;
  partId: string;
  baseline: { netExposureValueReporting: number; confidenceClassification: ExposureConfidence } | null;
  scenario:
    | { kind: "created"; netExposureValueReporting: number; confidenceClassification: ExposureConfidence; explanation: EvidenceExplanation }
    | { kind: "gap"; reason: string };
  deltaAbsolute: number | null;
  changed: boolean;
}

export interface ScenarioRunResult {
  assumptions: { assumption: ScenarioAssumption; label: string }[];
  baselineTotal: number;
  scenarioTotal: number;
  deltaAbsolute: number;
  deltaPercent: number | null;
  changedLineCount: number;
  lines: ScenarioLineResult[];
  gaps: { purchaseOrderLineId: string; rawPartNumber: string; reason: string }[];
  ranAt: string;
  /** Always false. Present on the type itself so nothing downstream can mistake this for a persisted calculation result. */
  persisted: false;
}

/**
 * Runs Identity Resolution -> Allocation -> Calculation against the EC's CURRENT live data
 * with `assumptions` applied on top -- the exact same pipeline `calculateExposureAction` uses
 * for real, persisted calculations (see exposurePipeline.ts). This function performs NO writes
 * of any kind: no insert into exposure_source_snapshots or exposure_records, no audit event,
 * no revalidatePath. A scenario is computed fresh on every call and discarded the moment the
 * response is sent -- the client is the only place a scenario result lives, for exactly as
 * long as the user keeps looking at it. See db/__tests__/exposureScenario.test.ts for the
 * regression test that verifies this against a real database.
 */
export async function runExposureScenarioAction(
  ecId: string,
  assumptions: ScenarioAssumption[]
): Promise<{ ok: true; result: ScenarioRunResult } | { ok: false; reason: string }> {
  const activePurchaseOrderImportId = await poRepo.getActivePurchaseOrderImportId(ecId);
  if (!activePurchaseOrderImportId) {
    return { ok: false, reason: "No purchase order data has been imported for this engineering change yet -- nothing to explore." };
  }

  const asOfDate = new Date().toISOString().slice(0, 10);

  const [baselineRecords, dataset, purchaseData] = await Promise.all([
    exposureRepo.getActiveExposureRecordsForEc(ecId),
    exposureRepo.assembleExposurePipelineDataset(ecId, activePurchaseOrderImportId, asOfDate),
    poRepo.getPurchaseDataForEc(ecId),
  ]);

  const baselineLines: BaselineExposureLine[] = baselineRecords.map((r) => ({
    purchaseOrderLineId: r.purchaseOrderLineId,
    partId: r.partId,
    netExposureValueReporting: r.netExposureValueReporting,
    confidenceClassification: r.confidenceClassification,
  }));

  const scenarioDataset = applyScenarioAssumptions(dataset, assumptions);
  const outcomes = runExposurePipeline(scenarioDataset);
  const comparison = compareScenarioToBaseline(baselineLines, outcomes);

  const supplierNameById = new Map(purchaseData.suppliers.map((s) => [s.id, s.name]));
  const poNumberById = new Map(purchaseData.purchaseOrders.map((p) => [p.id, p.poNumber]));
  const poLineById = new Map(dataset.poLines.map((l) => [l.id, l]));
  const purchaseOrderById = new Map(purchaseData.purchaseOrders.map((p) => [p.id, p]));
  const crosswalkById = new Map(dataset.crosswalks.map((c) => [c.id, c]));
  const outcomeByPoLineId = new Map(outcomes.filter((o) => o.purchaseOrderLineId).map((o) => [o.purchaseOrderLineId, o]));

  // Every assumption label shown to the person -- in the builder's chips, in the results
  // summary, in the exported CSV -- resolves through here, never through a raw database id.
  // A finance or supply-chain reader should see "Widget Assembly — PO-4471 (Bosch)", never
  // "PO line poline-1".
  const labelContext: ScenarioAssumptionContext = {
    poLineLabel: (id) => {
      const line = poLineById.get(id);
      if (!line) return `an unrecognized purchase order line (${id})`;
      const po = purchaseOrderById.get(line.purchaseOrderId);
      const supplierName = po ? (supplierNameById.get(po.supplierId) ?? "an unspecified supplier") : "an unspecified supplier";
      const poNumber = po ? poNumberById.get(po.id) : undefined;
      return `${line.rawPartNumber}${poNumber ? ` — ${poNumber}` : ""} (${supplierName})`;
    },
    crosswalkLabel: (id) => {
      const crosswalk = crosswalkById.get(id);
      return crosswalk ? `${crosswalk.plmPartId} → ${crosswalk.erpPartId}` : `an unrecognized mapping (${id})`;
    },
  };

  const lines: ScenarioLineResult[] = comparison.lines.map((line) => {
    if (line.scenario.kind === "gap") {
      return {
        purchaseOrderLineId: line.purchaseOrderLineId,
        partId: line.partId,
        baseline: line.baseline,
        scenario: line.scenario,
        deltaAbsolute: line.deltaAbsolute,
        changed: line.changed,
      };
    }

    const outcome = outcomeByPoLineId.get(line.purchaseOrderLineId);

    // A line untouched by any applied assumption has no fresh pipeline outcome to explain --
    // compareScenarioToBaseline already carried its baseline figure forward unchanged.
    if (!outcome || outcome.kind !== "created") {
      return {
        ...line,
        scenario: {
          kind: "created",
          netExposureValueReporting: line.scenario.netExposureValueReporting,
          confidenceClassification: line.scenario.confidenceClassification,
          explanation: {
            facts: [{ label: "Status", value: "Unaffected by the assumptions applied in this scenario." }],
            appliedRules: [],
            calculationSteps: [],
            conclusion: {
              netExposure: line.scenario.netExposureValueReporting,
              confidence: line.scenario.confidenceClassification,
              explanation: "This figure is carried forward unchanged from the current active baseline.",
            },
            nextStep: { label: "No further action needed", tab: null, reason: "Unaffected by this scenario." },
            provenanceNote: null,
          },
        },
      };
    }

    const { snapshot, record, crosswalk, allocation } = outcome;
    const supplierName = supplierNameById.get(snapshot.supplierId) ?? "Reassigned supplier (scenario)";
    const poNumber = poNumberById.get(snapshot.purchaseOrderId) ?? "Scenario override (reassigned PO)";

    const explanation = buildEvidenceExplanation({
      record: {
        partId: record.partId,
        grossCommittedValueReporting: record.grossCommittedValueReporting,
        alternateDemandAdjustmentReporting: record.alternateDemandAdjustmentReporting,
        netExposureValueReporting: record.netExposureValueReporting,
        confidenceClassification: record.confidenceClassification,
        classificationReason: record.classificationReason,
      },
      snapshot: {
        quantityOpen: snapshot.quantityOpen,
        unitPriceTransactionCurrency: snapshot.unitPriceTransactionCurrency,
        transactionCurrency: snapshot.transactionCurrency,
        reportingCurrency: snapshot.reportingCurrency,
        exchangeRate: snapshot.exchangeRate,
        promisedReceiptDate: snapshot.promisedReceiptDate,
      },
      supplierName,
      poNumber,
      crosswalkEvidence: {
        status: "recorded",
        erpPartId: crosswalk.erpPartId,
        matchMethod: crosswalk.matchMethod,
        reviewStatus: crosswalk.reviewStatus,
        reviewedBy: crosswalk.reviewedBy,
        reviewedAt: crosswalk.reviewedAt,
      },
      allocationMethod: allocation.resolved ? allocation.method : null,
      provenance: "current",
      hasOpenMitigationAction: false,
      hasAlternateDemandAllocation: record.alternateDemandAdjustmentReporting !== 0,
    });

    return {
      purchaseOrderLineId: line.purchaseOrderLineId,
      partId: line.partId,
      baseline: line.baseline,
      scenario: {
        kind: "created",
        netExposureValueReporting: record.netExposureValueReporting,
        confidenceClassification: record.confidenceClassification,
        explanation,
      },
      deltaAbsolute: line.deltaAbsolute,
      changed: line.changed,
    };
  });

  const result: ScenarioRunResult = {
    assumptions: assumptions.map((a) => ({ assumption: a, label: describeScenarioAssumption(a, labelContext) })),
    baselineTotal: comparison.baselineTotal,
    scenarioTotal: comparison.scenarioTotal,
    deltaAbsolute: comparison.deltaAbsolute,
    deltaPercent: comparison.deltaPercent,
    changedLineCount: comparison.changedLineCount,
    lines,
    gaps: comparison.gaps,
    ranAt: new Date().toISOString(),
    persisted: false,
  };

  return { ok: true, result };
}

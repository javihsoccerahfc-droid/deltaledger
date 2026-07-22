import { eq } from "drizzle-orm";
import { db } from "../client";
import { mitigationActions, supplierResponses } from "../schema";
import {
  createMitigationAction as buildMitigationAction,
  transitionMitigationStatus,
} from "@/domains/deltaledger/mitigation/mitigationAction";
import { recordSupplierResponse as buildSupplierResponse } from "@/domains/deltaledger/mitigation/supplierResponse";
import type { MitigationActionStatus, MitigationActionType, SupplierResponseType } from "@/domains/deltaledger/types";

export async function createMitigationActionInDb(
  exposureRecordId: string,
  actionType: MitigationActionType,
  ownerUserId: string,
  dueDate: string | null
) {
  const built = buildMitigationAction(exposureRecordId, actionType, ownerUserId, dueDate, new Date().toISOString());
  const [row] = await db
    .insert(mitigationActions)
    .values({
      exposureRecordId: built.exposureRecordId,
      actionType: built.actionType,
      ownerUserId: built.ownerUserId,
      dueDate: built.dueDate,
      status: built.status,
      createdAt: built.createdAt,
    })
    .returning();
  return row;
}

export async function transitionMitigationActionStatus(mitigationActionId: string, status: MitigationActionStatus) {
  const [existing] = await db.select().from(mitigationActions).where(eq(mitigationActions.id, mitigationActionId)).limit(1);
  if (!existing) throw new Error("Mitigation action not found.");
  transitionMitigationStatus(
    {
      id: existing.id,
      exposureRecordId: existing.exposureRecordId,
      actionType: existing.actionType,
      ownerUserId: existing.ownerUserId,
      dueDate: existing.dueDate,
      status: existing.status,
      createdAt: existing.createdAt,
    },
    status
  );
  await db.update(mitigationActions).set({ status }).where(eq(mitigationActions.id, mitigationActionId));
}

export async function getMitigationActionsForExposureRecord(exposureRecordId: string) {
  return db.select().from(mitigationActions).where(eq(mitigationActions.exposureRecordId, exposureRecordId));
}

export async function getMitigationActionsForExposureRecords(exposureRecordIds: string[]) {
  if (exposureRecordIds.length === 0) return [];
  const results = await Promise.all(exposureRecordIds.map((id) => getMitigationActionsForExposureRecord(id)));
  return results.flat();
}

export type RecordResponseResult = { success: true; responseId: string } | { success: false; message: string };

export async function recordSupplierResponseInDb(
  mitigationActionId: string,
  responseType: SupplierResponseType,
  quantityCancelled: number,
  quantityRedirected: number,
  quantityReceivedBeforeAction: number,
  totalCommittedQuantity: number,
  recordedBy: string
): Promise<RecordResponseResult> {
  const result = buildSupplierResponse(
    mitigationActionId,
    responseType,
    quantityCancelled,
    quantityRedirected,
    quantityReceivedBeforeAction,
    totalCommittedQuantity,
    new Date().toISOString(),
    recordedBy
  );
  if (!result.success) return { success: false, message: result.reason };

  const [row] = await db
    .insert(supplierResponses)
    .values({
      mitigationActionId: result.response.mitigationActionId,
      responseType: result.response.responseType,
      quantityCancelled: result.response.quantityCancelled,
      quantityRedirected: result.response.quantityRedirected,
      quantityReceivedBeforeAction: result.response.quantityReceivedBeforeAction,
      respondedAt: result.response.respondedAt,
      recordedBy: result.response.recordedBy,
    })
    .returning();
  return { success: true, responseId: row.id };
}

export async function getSupplierResponsesForMitigationAction(mitigationActionId: string) {
  return db.select().from(supplierResponses).where(eq(supplierResponses.mitigationActionId, mitigationActionId));
}

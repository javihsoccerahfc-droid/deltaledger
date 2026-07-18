import { eq, and } from "drizzle-orm";
import { db } from "../client";
import { alternateDemandRecords, alternateDemandAllocations } from "../schema";
import { getOrCreateDefaultOrganization } from "./organizations";
import { canReviewAlternateDemand } from "@/domains/deltaledger/alternateDemand/review";
import type { User, DemandSourceType } from "@/domains/deltaledger/types";

export type ReviewResult = { success: true } | { success: false; message: string };
export type AllocateResult = { success: true } | { success: false; message: string };

export async function createAlternateDemandSuggestion(input: {
  partId: string;
  quantityAvailableForOffset: number;
  sourceReference: string;
  demandSourceType: DemandSourceType;
}) {
  const org = await getOrCreateDefaultOrganization();
  const [created] = await db
    .insert(alternateDemandRecords)
    .values({
      organizationId: org.id,
      partId: input.partId,
      demandSourceType: input.demandSourceType,
      demandSourceId: null,
      affectedAssemblyId: null,
      quantityAvailableForOffset: input.quantityAvailableForOffset,
      demandDate: new Date().toISOString().slice(0, 10),
      sourceReference: input.sourceReference,
      sourceFile: null,
      sourceRow: null,
      confidence: 0.6,
      reviewStatus: "unreviewed",
    })
    .returning();
  return created;
}

export async function getAlternateDemandForOrg() {
  const org = await getOrCreateDefaultOrganization();
  return db.select().from(alternateDemandRecords).where(eq(alternateDemandRecords.organizationId, org.id));
}

export async function approveAlternateDemandById(recordId: string, user: User): Promise<ReviewResult> {
  if (!canReviewAlternateDemand(user)) {
    return {
      success: false,
      message: `User ${user.id} (${user.role}) does not have supply-chain-manager authority to approve alternate demand.`,
    };
  }
  await db
    .update(alternateDemandRecords)
    .set({ reviewStatus: "approved", reviewedBy: user.id, reviewedAt: new Date().toISOString() })
    .where(eq(alternateDemandRecords.id, recordId));
  return { success: true };
}

export async function rejectAlternateDemandById(recordId: string, user: User): Promise<ReviewResult> {
  if (!canReviewAlternateDemand(user)) {
    return {
      success: false,
      message: `User ${user.id} (${user.role}) does not have supply-chain-manager authority to reject alternate demand.`,
    };
  }
  await db
    .update(alternateDemandRecords)
    .set({ reviewStatus: "rejected", reviewedBy: user.id, reviewedAt: new Date().toISOString() })
    .where(eq(alternateDemandRecords.id, recordId));
  return { success: true };
}

/**
 * The over-allocation guard is enforced here, at the database layer,
 * against the ACTIVE allocations actually persisted for this record --
 * not against whatever a client happened to have in memory.
 */
export async function allocateAlternateDemandInDb(
  recordId: string,
  exposureRecordId: string,
  quantity: number,
  allocatedBy: string
): Promise<AllocateResult> {
  const [record] = await db.select().from(alternateDemandRecords).where(eq(alternateDemandRecords.id, recordId)).limit(1);
  if (!record) return { success: false, message: "Alternate-demand record not found." };
  if (record.reviewStatus !== "approved") {
    return {
      success: false,
      message: "Alternate-demand record is not approved -- system suggestions cannot reduce exposure until reviewed.",
    };
  }
  if (quantity <= 0) return { success: false, message: "Allocation quantity must be positive." };

  const activeAllocations = await db
    .select()
    .from(alternateDemandAllocations)
    .where(
      and(eq(alternateDemandAllocations.alternateDemandRecordId, recordId), eq(alternateDemandAllocations.status, "active"))
    );
  const alreadyAllocated = activeAllocations.reduce((sum, a) => sum + a.quantityAllocated, 0);
  const remaining = record.quantityAvailableForOffset - alreadyAllocated;

  if (quantity > remaining) {
    return {
      success: false,
      message: `Requested allocation of ${quantity} exceeds the ${remaining} still available on this alternate-demand record (of ${record.quantityAvailableForOffset} total).`,
    };
  }

  await db.insert(alternateDemandAllocations).values({
    alternateDemandRecordId: recordId,
    exposureRecordId,
    quantityAllocated: quantity,
    allocatedAt: new Date().toISOString(),
    allocatedBy,
    status: "active",
  });
  return { success: true };
}

export async function getActiveAllocationsForExposureRecord(exposureRecordId: string) {
  return db
    .select()
    .from(alternateDemandAllocations)
    .where(and(eq(alternateDemandAllocations.exposureRecordId, exposureRecordId), eq(alternateDemandAllocations.status, "active")));
}

export async function getAllAllocations() {
  return db.select().from(alternateDemandAllocations);
}

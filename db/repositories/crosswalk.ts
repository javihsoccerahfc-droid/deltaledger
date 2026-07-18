import { db } from "../client";
import { partNumberCrosswalks, crosswalkAllocationRules } from "../schema";
import { eq } from "drizzle-orm";
import { getOrCreateDefaultOrganization } from "./organizations";
import { generateCrosswalkSuggestions } from "@/appLayer/workflow";
import { canApproveCrosswalk } from "@/domains/deltaledger/crosswalk";
import type { User } from "@/domains/deltaledger/types";

export async function generateAndSaveCrosswalkSuggestions(plmPartNumbers: string[], candidateErpPartNumbers: string[]) {
  const org = await getOrCreateDefaultOrganization();
  const suggestions = generateCrosswalkSuggestions(plmPartNumbers, candidateErpPartNumbers);
  if (suggestions.length === 0) return [];
  const rows = await db
    .insert(partNumberCrosswalks)
    .values(
      suggestions.map((s) => ({
        organizationId: org.id,
        plmPartId: s.plmPartId,
        erpPartId: s.erpPartId,
        matchMethod: s.matchMethod,
        confidence: s.confidence,
        matchEvidence:
          s.matchMethod === "exact"
            ? `Exact string match against "${s.erpPartId}" in the open PO import.`
            : `Fuzzy match: "${s.plmPartId}" is ${(s.confidence * 100).toFixed(0)}% similar to "${s.erpPartId}" seen in the open PO import.`,
        reviewStatus: "unreviewed" as const,
        effectiveDate: s.effectiveDate,
        mappingType: "one_to_one" as const,
      }))
    )
    .returning();
  return rows;
}

export async function getCrosswalksForOrg() {
  const org = await getOrCreateDefaultOrganization();
  return db.select().from(partNumberCrosswalks).where(eq(partNumberCrosswalks.organizationId, org.id));
}

export type ApprovalResult = { success: true } | { success: false; message: string };

export async function approveCrosswalkById(crosswalkId: string, user: User): Promise<ApprovalResult> {
  if (!canApproveCrosswalk(user)) {
    return {
      success: false,
      message: `User ${user.id} (${user.role}) does not have part-data-owner authority to approve a crosswalk.`,
    };
  }
  await db
    .update(partNumberCrosswalks)
    .set({ reviewStatus: "approved", reviewedBy: user.id, reviewedAt: new Date().toISOString() })
    .where(eq(partNumberCrosswalks.id, crosswalkId));
  return { success: true };
}

export async function rejectCrosswalkById(crosswalkId: string, user: User): Promise<ApprovalResult> {
  if (!canApproveCrosswalk(user)) {
    return {
      success: false,
      message: `User ${user.id} (${user.role}) does not have part-data-owner authority to reject a crosswalk.`,
    };
  }
  await db
    .update(partNumberCrosswalks)
    .set({ reviewStatus: "rejected", reviewedBy: user.id, reviewedAt: new Date().toISOString() })
    .where(eq(partNumberCrosswalks.id, crosswalkId));
  return { success: true };
}

export async function setCrosswalkErpId(crosswalkId: string, erpPartId: string) {
  await db
    .update(partNumberCrosswalks)
    .set({ erpPartId, matchMethod: "manual" })
    .where(eq(partNumberCrosswalks.id, crosswalkId));
}

export async function setCrosswalkMappingType(
  crosswalkId: string,
  mappingType: "one_to_one" | "one_to_many" | "many_to_one"
) {
  await db.update(partNumberCrosswalks).set({ mappingType }).where(eq(partNumberCrosswalks.id, crosswalkId));
}

export async function upsertAllocationRule(
  crosswalkId: string,
  rule: {
    method: "fixed_quantity" | "percentage" | "plant_specific" | "supplier_specific" | "manual";
    plantCode: string | null;
    supplierId: string | null;
    fixedQuantity: number | null;
    percentage: number | null;
    notes: string | null;
    effectiveDate: string;
  }
) {
  await db.delete(crosswalkAllocationRules).where(eq(crosswalkAllocationRules.crosswalkId, crosswalkId));
  const [created] = await db.insert(crosswalkAllocationRules).values({ crosswalkId, ...rule }).returning();
  return created;
}

export async function getAllocationRulesForCrosswalk(crosswalkId: string) {
  return db.select().from(crosswalkAllocationRules).where(eq(crosswalkAllocationRules.crosswalkId, crosswalkId));
}

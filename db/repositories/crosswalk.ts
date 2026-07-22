import { db } from "../client";
import { partNumberCrosswalks, crosswalkAllocationRules } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getOrCreateDefaultOrganization } from "./organizations";
import { generateCrosswalkSuggestions } from "@/appLayer/workflow";
import { canApproveCrosswalk } from "@/domains/deltaledger/crosswalk";
import type { User } from "@/domains/deltaledger/types";

/**
 * Phase 6A -- idempotency fix. Re-running "Generate mapping suggestions" must not multiply
 * active rows for a pair the system has already suggested. This checks the CURRENT active
 * (non-superseded) crosswalks first and skips any suggestion whose exact (plmPartId, erpPartId)
 * pair is already covered -- whether that existing row is unreviewed, approved, or rejected;
 * a prior decision on an exact pair should never be silently duplicated by the generator. A
 * genuinely new decision (a different erpPartId, or a deliberate supersession of an approved
 * mapping) is unaffected, since those are different pairs or, for supersession, produce a row
 * that is no longer active. The database-level partial unique index on
 * (organizationId, plmPartId, erpPartId) WHERE superseded_by_id IS NULL (see db/schema.ts) is
 * the backstop against a race between two concurrent generate calls -- this filtering is what
 * keeps a normal, non-racing re-run from ever reaching that constraint in the first place.
 */
export async function generateAndSaveCrosswalkSuggestions(plmPartNumbers: string[], candidateErpPartNumbers: string[]) {
  const org = await getOrCreateDefaultOrganization();
  const suggestions = generateCrosswalkSuggestions(plmPartNumbers, candidateErpPartNumbers);
  if (suggestions.length === 0) return [];

  const activeExisting = await db
    .select({ plmPartId: partNumberCrosswalks.plmPartId, erpPartId: partNumberCrosswalks.erpPartId })
    .from(partNumberCrosswalks)
    .where(and(eq(partNumberCrosswalks.organizationId, org.id), isNull(partNumberCrosswalks.supersededById)));

  const existingPairs = new Set(
    activeExisting.map((row) => `${row.plmPartId.toUpperCase()}::${row.erpPartId.toUpperCase()}`)
  );

  const newSuggestions = suggestions.filter(
    (s) => !existingPairs.has(`${s.plmPartId.toUpperCase()}::${s.erpPartId.toUpperCase()}`)
  );
  if (newSuggestions.length === 0) return [];

  const rows = await db
    .insert(partNumberCrosswalks)
    .values(
      newSuggestions.map((s) => ({
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

export async function getCrosswalkById(crosswalkId: string) {
  const [row] = await db.select().from(partNumberCrosswalks).where(eq(partNumberCrosswalks.id, crosswalkId)).limit(1);
  return row ?? null;
}

export type ApprovalResult = { success: true } | { success: false; message: string };

export async function approveCrosswalkById(crosswalkId: string, user: User): Promise<ApprovalResult> {
  if (!canApproveCrosswalk(user)) {
    return {
      success: false,
      message: `User ${user.id} (${user.role}) does not have part-data-owner authority to approve a crosswalk.`,
    };
  }
  const existing = await getCrosswalkById(crosswalkId);
  if (!existing) return { success: false, message: `No such crosswalk: ${crosswalkId}.` };
  // Phase 6A -- previously this guard did not exist at all: the repository would happily flip
  // reviewStatus on an already-approved (or already-superseded) row with no protection, and
  // the ONLY thing preventing that in practice was the UI hiding the Approve/Reject buttons
  // once reviewStatus !== "unreviewed". A disabled button is not a trust boundary. Correcting
  // an already-decided mapping must go through reviseCrosswalk, which creates a new row and
  // supersedes this one, rather than mutating an approved (or rejected) row's history in place.
  if (existing.reviewStatus !== "unreviewed" || existing.supersededById !== null) {
    return {
      success: false,
      message: "This mapping has already been decided. Use a revision to correct or replace it instead of re-approving it in place.",
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
  const existing = await getCrosswalkById(crosswalkId);
  if (!existing) return { success: false, message: `No such crosswalk: ${crosswalkId}.` };
  if (existing.reviewStatus !== "unreviewed" || existing.supersededById !== null) {
    return {
      success: false,
      message: "This mapping has already been decided. Use a revision to correct or replace it instead of rejecting it in place.",
    };
  }
  await db
    .update(partNumberCrosswalks)
    .set({ reviewStatus: "rejected", reviewedBy: user.id, reviewedAt: new Date().toISOString() })
    .where(eq(partNumberCrosswalks.id, crosswalkId));
  return { success: true };
}

export async function setCrosswalkErpId(crosswalkId: string, erpPartId: string) {
  // Phase 6A -- scoped to unreviewed rows only. Editing a pending suggestion before anyone has
  // decided on it is fine; editing an approved or rejected row in place is exactly the
  // in-place-mutation problem reviseCrosswalk exists to eliminate.
  await db
    .update(partNumberCrosswalks)
    .set({ erpPartId, matchMethod: "manual" })
    .where(and(eq(partNumberCrosswalks.id, crosswalkId), eq(partNumberCrosswalks.reviewStatus, "unreviewed")));
}

export async function setCrosswalkMappingType(
  crosswalkId: string,
  mappingType: "one_to_one" | "one_to_many" | "many_to_one"
) {
  await db
    .update(partNumberCrosswalks)
    .set({ mappingType })
    .where(and(eq(partNumberCrosswalks.id, crosswalkId), eq(partNumberCrosswalks.reviewStatus, "unreviewed")));
}

export type RevisionResult = { success: true; created: typeof partNumberCrosswalks.$inferSelect } | { success: false; message: string };

/**
 * Phase 6A -- the crosswalk supersession lifecycle. Corrects or replaces an APPROVED or
 * REJECTED mapping without mutating it: creates a new row carrying the correction, marks the
 * prior row superseded by the new row's id, and does both atomically in one transaction so
 * there is never a moment with zero or two simultaneously-active rows for the same pair (the
 * partial unique index from Item 2 would reject the insert if the old row weren't superseded
 * first, which is why both happen inside one transaction rather than as two separate calls).
 * The prior row's reviewStatus, reviewedBy, reviewedAt, erpPartId, and mappingType are never
 * touched -- exactly what identityResolution.ts and every frozen ExposureSourceSnapshot that
 * referenced this crosswalk at calculation time depend on remaining true forever. Only the
 * NEXT calculation, via resolvePartIdentity's existing `supersededById === null` filter, will
 * ever see the new row instead of the old one.
 */
export async function reviseCrosswalk(
  crosswalkId: string,
  revision: { erpPartId: string; mappingType: "one_to_one" | "one_to_many" | "many_to_one" },
  user: User,
  reason: string
): Promise<RevisionResult> {
  if (!canApproveCrosswalk(user)) {
    return {
      success: false,
      message: `User ${user.id} (${user.role}) does not have part-data-owner authority to revise a crosswalk.`,
    };
  }
  const existing = await getCrosswalkById(crosswalkId);
  if (!existing) return { success: false, message: `No such crosswalk: ${crosswalkId}.` };
  if (existing.supersededById !== null) {
    return { success: false, message: "This mapping has already been superseded by a later revision." };
  }
  if (existing.reviewStatus === "unreviewed") {
    return {
      success: false,
      message: "This mapping hasn't been decided yet -- edit it directly, or approve/reject it, rather than revising it.",
    };
  }

  try {
    const created = await db.transaction(async (tx) => {
      // Pre-generate the new row's id so the OLD row can be marked superseded BEFORE the new
      // row is inserted. This ordering matters: a revision can keep the same erpPartId (e.g.
      // correcting only the mapping type), and the partial unique index (Item 2) would reject
      // inserting the new row first while the old row still looks active for that exact pair.
      const newId = createId();
      await tx.update(partNumberCrosswalks).set({ supersededById: newId }).where(eq(partNumberCrosswalks.id, crosswalkId));
      const [newRow] = await tx
        .insert(partNumberCrosswalks)
        .values({
          id: newId,
          organizationId: existing.organizationId,
          plmPartId: existing.plmPartId,
          erpPartId: revision.erpPartId,
          matchMethod: "manual",
          confidence: 1,
          matchEvidence: `Manual revision of a prior ${existing.reviewStatus} mapping: ${reason}`,
          reviewStatus: "approved",
          reviewedBy: user.id,
          reviewedAt: new Date().toISOString(),
          effectiveDate: new Date().toISOString().slice(0, 10),
          mappingType: revision.mappingType,
        })
        .returning();
      return newRow;
    });
    return { success: true, created };
  } catch (err) {
    // The partial unique index (Item 2) is the backstop this hits if something else raced to
    // create an active row for this exact (plmPartId, erpPartId) pair between the check above
    // and this transaction -- an honest failure rather than a silent duplicate.
    return {
      success: false,
      message: err instanceof Error ? err.message : "Could not save this revision -- another active mapping may already cover this pair.",
    };
  }
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

/**
 * Phase 6A -- the other half of the supersession lifecycle: reviseCrosswalk always produces a
 * new APPROVED replacement, because a revision implies you know the correction. Sometimes you
 * don't -- you've only discovered the current approval is wrong, with no confirmed
 * replacement yet. Revoking still goes through the exact same atomic
 * supersede-old-insert-new pattern (never mutates the approved row in place), but the new row
 * is created already REJECTED rather than approved, so resolvePartIdentity's existing
 * `reviewStatus === "approved"` filter correctly reports this part as unresolved (a gap, not
 * a silent stale reuse of the old figure) starting with the next calculation -- while every
 * calculation already made under the old approval remains exactly as historically valid as it
 * always was.
 */
export async function revokeCrosswalk(crosswalkId: string, user: User, reason: string): Promise<RevisionResult> {
  if (!canApproveCrosswalk(user)) {
    return {
      success: false,
      message: `User ${user.id} (${user.role}) does not have part-data-owner authority to revoke a crosswalk.`,
    };
  }
  const existing = await getCrosswalkById(crosswalkId);
  if (!existing) return { success: false, message: `No such crosswalk: ${crosswalkId}.` };
  if (existing.supersededById !== null) {
    return { success: false, message: "This mapping has already been superseded by a later revision." };
  }
  if (existing.reviewStatus !== "approved") {
    return { success: false, message: "Only an approved mapping can be revoked." };
  }

  try {
    const created = await db.transaction(async (tx) => {
      const newId = createId();
      await tx.update(partNumberCrosswalks).set({ supersededById: newId }).where(eq(partNumberCrosswalks.id, crosswalkId));
      const [newRow] = await tx
        .insert(partNumberCrosswalks)
        .values({
          id: newId,
          organizationId: existing.organizationId,
          plmPartId: existing.plmPartId,
          erpPartId: existing.erpPartId,
          matchMethod: "manual",
          confidence: existing.confidence,
          matchEvidence: `Revocation of a prior approved mapping: ${reason}`,
          reviewStatus: "rejected",
          reviewedBy: user.id,
          reviewedAt: new Date().toISOString(),
          effectiveDate: new Date().toISOString().slice(0, 10),
          mappingType: existing.mappingType,
        })
        .returning();
      return newRow;
    });
    return { success: true, created };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Could not revoke this mapping.",
    };
  }
}

export async function getAllocationRulesForCrosswalk(crosswalkId: string) {
  return db.select().from(crosswalkAllocationRules).where(eq(crosswalkAllocationRules.crosswalkId, crosswalkId));
}

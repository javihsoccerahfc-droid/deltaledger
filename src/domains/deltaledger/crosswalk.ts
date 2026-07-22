import { bestMatch } from "@/core/schema/headerDetection";
import { PartNumberCrosswalk, User } from "./types";

// MOCKED "AI-ASSISTED" LAYER — same pattern as the factoring prototype's
// debtor-name matching: a deterministic string-similarity stand-in for a
// future model call. A suggestion here NEVER becomes an approved crosswalk
// entry on its own — see canApproveCrosswalk/approveCrosswalk below, which
// is a hard authorization gate, not just a UI convention.

function foldPartNumber(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, "").trim();
}

export interface CrosswalkSuggestion {
  rawPartNumber: string;
  suggestedErpPartId: string;
  confidence: number;
  isExactMatch: boolean;
}

export function suggestCrosswalkMatch(rawPartNumber: string, knownErpPartIds: string[]): CrosswalkSuggestion {
  const { candidate, score } = bestMatch(rawPartNumber, knownErpPartIds, foldPartNumber);
  return {
    rawPartNumber,
    suggestedErpPartId: candidate,
    confidence: Math.round(score * 100) / 100,
    isExactMatch: score === 1,
  };
}

/**
 * Only a part_data_owner (or admin) may approve a PLM-to-ERP mapping. A CCB
 * user or buyer creating/reviewing an engineering change does NOT
 * automatically inherit mapping-approval authority — this is a distinct
 * responsibility per the spec (§6), enforced here rather than left to the
 * UI to (possibly incorrectly) restrict.
 */
export function canApproveCrosswalk(user: User): boolean {
  return user.role === "part_data_owner" || user.role === "admin";
}

export class CrosswalkAuthorizationError extends Error {
  constructor(userId: string) {
    super(`User ${userId} does not have part-data-owner authority to approve a part-number crosswalk.`);
    this.name = "CrosswalkAuthorizationError";
  }
}

export function approveCrosswalk(
  crosswalk: PartNumberCrosswalk,
  user: User,
  reviewedAt: string
): PartNumberCrosswalk {
  if (!canApproveCrosswalk(user)) {
    throw new CrosswalkAuthorizationError(user.id);
  }
  return { ...crosswalk, reviewStatus: "approved", reviewedBy: user.id, reviewedAt };
}

export function rejectCrosswalk(
  crosswalk: PartNumberCrosswalk,
  user: User,
  reviewedAt: string
): PartNumberCrosswalk {
  if (!canApproveCrosswalk(user)) {
    throw new CrosswalkAuthorizationError(user.id);
  }
  return { ...crosswalk, reviewStatus: "rejected", reviewedBy: user.id, reviewedAt };
}

/**
 * Supersedes an existing crosswalk entry with a new one, preserving the old
 * row unchanged (immutable history) rather than editing it in place. Any
 * ExposureRecord computed under the old mapping remains explainable against
 * its frozen ExposureSourceSnapshot, which references crosswalkVersionId —
 * exactly what makes "never silently change a historical calculation"
 * possible when a mapping is later corrected.
 */
export function supersedeCrosswalk(
  oldCrosswalk: PartNumberCrosswalk,
  newCrosswalk: Omit<PartNumberCrosswalk, "id" | "supersededById">,
  newId: string
): { superseded: PartNumberCrosswalk; replacement: PartNumberCrosswalk } {
  const replacement: PartNumberCrosswalk = { ...newCrosswalk, id: newId, supersededById: null };
  const superseded: PartNumberCrosswalk = { ...oldCrosswalk, supersededById: newId };
  return { superseded, replacement };
}

import { AlternateDemandRecord, User } from "../types";

// MOCKED "AI-ASSISTED" LAYER note: unlike crosswalk/debtor suggestions, this
// file doesn't itself generate suggestions (that's a caller concern — e.g.
// "this part also appears in BOM import X"). What matters here is the same
// principle applied consistently: a system-generated AlternateDemandRecord
// is inert data until a human explicitly approves it. See
// allocateAlternateDemand() in ledger.ts, which refuses to allocate against
// anything that isn't reviewStatus === "approved".

/**
 * Reviewing an alternate-demand candidate is a supply/demand and
 * inventory-realism judgment call ("is this quantity, sitting in another
 * assembly, genuinely available to offset this exposure?") — not a
 * part-identity-mapping judgment call. That's a materially different
 * responsibility from crosswalk approval, whose defined scope (spec section 6)
 * is specifically PLM-to-ERP part mapping correctness. Reusing
 * part_data_owner here in the original draft conflated the two.
 *
 * supply_chain_manager is the better fit among existing V1 roles: it's the
 * role with actual supply/demand and inventory context, and keeping this
 * gate separate from part_data_owner's data-governance scope also avoids
 * blurring the two functions once a real permissions UI exists.
 *
 * A buyer is deliberately excluded even though they're operationally close:
 * a buyer who wants to net down their own open exposure has a conflicting
 * incentive to approve the offset that reduces it — a basic
 * segregation-of-duties concern, not just a role-taxonomy preference.
 */
export function canReviewAlternateDemand(user: User): boolean {
  return user.role === "supply_chain_manager" || user.role === "admin";
}

export class AlternateDemandAuthorizationError extends Error {
  constructor(userId: string) {
    super(`User ${userId} does not have authority to review an alternate-demand record.`);
    this.name = "AlternateDemandAuthorizationError";
  }
}

export function approveAlternateDemand(
  record: AlternateDemandRecord,
  user: User,
  reviewedAt: string
): AlternateDemandRecord {
  if (!canReviewAlternateDemand(user)) throw new AlternateDemandAuthorizationError(user.id);
  return { ...record, reviewStatus: "approved", reviewedBy: user.id, reviewedAt };
}

export function rejectAlternateDemand(
  record: AlternateDemandRecord,
  user: User,
  reviewedAt: string
): AlternateDemandRecord {
  if (!canReviewAlternateDemand(user)) throw new AlternateDemandAuthorizationError(user.id);
  return { ...record, reviewStatus: "rejected", reviewedBy: user.id, reviewedAt };
}

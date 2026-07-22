import { daysBetween } from "@/core/normalization/parsers";
import { StalenessStatus, SupplierCommitmentTerms } from "../types";

export interface StalenessConfig {
  /** Used only when the terms record has no explicit validUntil date. */
  defaultReviewIntervalDays: number;
  /** How many days before expiry (explicit or default-interval-derived) to flag review_due. */
  reviewWarningDays: number;
}

function toDateOnly(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(dateOnly + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministically computes staleness from verifiedAt/validUntil. Terms
 * that were never verified at all are "unverified" regardless of any other
 * field — an unverified value can't decay into something else, it was never
 * trustworthy to begin with.
 *
 * When validUntil is explicitly set, that date governs expiry exactly.
 * When it's absent, a configurable default review interval from verifiedAt
 * stands in for it — this is a review cadence, not a claim about a real
 * contractual expiry, and is intentionally configurable rather than
 * hardcoded so different commodities/suppliers can use different cadences
 * later without a code change.
 */
export function computeStalenessStatus(
  terms: Pick<SupplierCommitmentTerms, "verifiedAt" | "validUntil">,
  asOfDate: string,
  config: StalenessConfig
): StalenessStatus {
  if (!terms.verifiedAt) return "unverified";

  const effectiveExpiry = terms.validUntil ?? addDays(toDateOnly(terms.verifiedAt), config.defaultReviewIntervalDays);

  const daysUntilExpiry = daysBetween(asOfDate, effectiveExpiry);
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= config.reviewWarningDays) return "review_due";
  return "current";
}

/** Returns a copy of the terms record with stalenessStatus recomputed as of `asOfDate`. */
export function refreshStaleness(
  terms: SupplierCommitmentTerms,
  asOfDate: string,
  config: StalenessConfig
): SupplierCommitmentTerms {
  return { ...terms, stalenessStatus: computeStalenessStatus(terms, asOfDate, config) };
}

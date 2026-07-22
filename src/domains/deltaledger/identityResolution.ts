import type { PartNumberCrosswalk } from "./types";
import { cleanString } from "@/core/normalization/parsers";

/**
 * Milestone 3.5 -- Identity Resolution.
 *
 * Root cause this exists to fix: the exposure engine previously matched Purchase Order lines
 * to BOM diff entries by comparing raw part-number strings directly, and only consulted the
 * Crosswalk afterward, to decide *how much* quantity to allocate. That means the exact
 * scenario the Crosswalk exists to solve -- a PLM identifier that genuinely differs from its
 * ERP identifier -- silently produced no exposure record and no reported gap. Not a
 * calculation error; the part simply never entered the calculation at all.
 *
 * This function makes identity resolution an explicit, separate, first stage: given a PLM
 * part identifier and the full set of known crosswalks, it resolves the canonical ERP
 * identifier(s) to actually match Purchase Order lines against -- before any financial
 * calculation happens. The Crosswalk is one mechanism this function consults; the contract it
 * returns ("resolved to these canonical identities" or "unresolved, here's why") does not
 * assume the Crosswalk is the only identity source that will ever exist.
 *
 * Genuinely supports one-PLM-part-to-many-ERP-identifiers: nothing in the schema prevents
 * multiple approved crosswalk rows from sharing one plmPartId (there is no uniqueness
 * constraint), each with its own erpPartId and its own allocation rule. Previously only the
 * first such row (in whatever order the database happened to return) was ever used -- a
 * second, related nondeterminism bug of the same shape the P0 remediation fixed for BOM
 * imports. This function resolves ALL approved, active rows for a part, in a fixed,
 * deterministic order (by id), so which rows are used never depends on incidental query
 * ordering.
 */

export interface ResolvedIdentity {
  erpPartId: string;
  crosswalk: PartNumberCrosswalk;
}

export type IdentityResolution =
  | { status: "resolved"; identities: ResolvedIdentity[] }
  | { status: "unresolved"; reason: string };

export function resolvePartIdentity(plmPartId: string, crosswalks: PartNumberCrosswalk[]): IdentityResolution {
  const normalizedPlmPartId = cleanString(plmPartId).toUpperCase();

  const approved = crosswalks.filter(
    (c) => cleanString(c.plmPartId).toUpperCase() === normalizedPlmPartId && c.reviewStatus === "approved" && c.supersededById === null
  );

  if (approved.length === 0) {
    return { status: "unresolved", reason: `No approved crosswalk exists for ${plmPartId}.` };
  }

  // Fixed, deterministic order -- never dependent on incidental database return order (see
  // the file-level comment above for why this matters specifically for the multi-row case).
  const ordered = [...approved].sort((a, b) => a.id.localeCompare(b.id));

  // Deduplicate by the RESULTING erpPartId, not by row count. Multiple approved crosswalk
  // rows sharing a plmPartId are only a genuine one-to-many identity split if they resolve to
  // DIFFERENT ERP identifiers. If they resolve to the same one (e.g. two approved rows that
  // both happen to map to the same ERP part -- duplicate data, not a real multiplicity), that
  // must collapse to a single resolved identity; otherwise the same Purchase Order line would
  // be matched and processed once per duplicate row, silently multiplying the calculation.
  // Deterministic tiebreak: the first row (by the fixed id order above) for each distinct
  // erpPartId wins.
  const seenErpPartIds = new Set<string>();
  const deduplicated = ordered.filter((c) => {
    const key = cleanString(c.erpPartId).toUpperCase();
    if (seenErpPartIds.has(key)) return false;
    seenErpPartIds.add(key);
    return true;
  });

  return {
    status: "resolved",
    identities: deduplicated.map((crosswalk) => ({ erpPartId: crosswalk.erpPartId, crosswalk })),
  };
}

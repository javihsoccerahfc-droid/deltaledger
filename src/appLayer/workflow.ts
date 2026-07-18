import { suggestCrosswalkMatch } from "@/domains/deltaledger/crosswalk";
import { defaultIdGenerator } from "@/domains/deltaledger/idGenerator";
import { PartNumberCrosswalk } from "@/domains/deltaledger/types";

/**
 * Generates unreviewed crosswalk suggestions for every distinct raw PLM
 * part number appearing in an exposure-eligible BOM diff entry, fuzzy-
 * matched against the distinct part numbers actually seen in the PO import
 * (standing in for a separate ERP part master, which this product doesn't
 * ingest separately). These are suggestions only -- see crosswalk.ts's
 * canApproveCrosswalk/approveCrosswalk, which is the only path that ever
 * moves one to reviewStatus "approved". Used by
 * db/repositories/crosswalk.ts -- this is the one function from the
 * original in-memory application layer that's still load-bearing; the
 * others (createEngineeringChange, ingestBom, computeBomDiff) were removed
 * because the real database repositories now own that logic directly.
 */
export function generateCrosswalkSuggestions(
  plmPartNumbers: string[],
  candidateErpPartNumbers: string[]
): PartNumberCrosswalk[] {
  const uniquePlmParts = Array.from(new Set(plmPartNumbers.filter(Boolean)));
  const uniqueCandidates = Array.from(new Set(candidateErpPartNumbers.filter(Boolean)));

  return uniquePlmParts.map((plmPartId) => {
    const suggestion = suggestCrosswalkMatch(plmPartId, uniqueCandidates.length > 0 ? uniqueCandidates : [plmPartId]);
    return {
      id: defaultIdGenerator.next("cw"),
      plmPartId,
      erpPartId: suggestion.suggestedErpPartId,
      matchMethod: suggestion.isExactMatch ? "exact" : "fuzzy",
      confidence: suggestion.confidence,
      reviewStatus: "unreviewed",
      reviewedBy: null,
      reviewedAt: null,
      effectiveDate: new Date().toISOString().slice(0, 10),
      notes: null,
      mappingType: "one_to_one",
      supersededById: null,
    };
  });
}

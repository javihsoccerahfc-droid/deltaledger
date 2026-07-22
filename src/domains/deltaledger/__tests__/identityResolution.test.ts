import { describe, it, expect } from "vitest";
import { resolvePartIdentity } from "../identityResolution";
import type { PartNumberCrosswalk } from "../types";

function crosswalk(overrides: Partial<PartNumberCrosswalk> & { id: string; plmPartId: string; erpPartId: string }): PartNumberCrosswalk {
  return {
    matchMethod: "exact",
    confidence: 1,
    reviewStatus: "approved",
    reviewedBy: "u-pdo",
    reviewedAt: "2026-06-01T00:00:00.000Z",
    effectiveDate: "2026-06-01",
    notes: null,
    mappingType: "one_to_one",
    supersededById: null,
    ...overrides,
  };
}

describe("resolvePartIdentity", () => {
  it("Case 1 -- PLM identifier equal to ERP identifier resolves via an approved crosswalk exactly like any other mapping", () => {
    const cw = crosswalk({ id: "cw-1", plmPartId: "PN-4471", erpPartId: "PN-4471" });
    const result = resolvePartIdentity("PN-4471", [cw]);
    expect(result).toEqual({ status: "resolved", identities: [{ erpPartId: "PN-4471", crosswalk: cw }] });
  });

  it("Case 2 -- PLM identifier differs from ERP identifier, resolves correctly when an approved crosswalk exists", () => {
    const cw = crosswalk({ id: "cw-1", plmPartId: "PN-4471", erpPartId: "771-4471" });
    const result = resolvePartIdentity("PN-4471", [cw]);
    expect(result.status).toBe("resolved");
    expect(result.status === "resolved" && result.identities[0].erpPartId).toBe("771-4471");
  });

  it("Case 3 -- no approved crosswalk produces an explicit unresolved result, never silence", () => {
    const unreviewed = crosswalk({ id: "cw-1", plmPartId: "PN-4471", erpPartId: "771-4471", reviewStatus: "unreviewed" });
    const result = resolvePartIdentity("PN-4471", [unreviewed]);
    expect(result).toEqual({ status: "unresolved", reason: "No approved crosswalk exists for PN-4471." });
  });

  it("Case 3b -- a rejected crosswalk is also treated as unresolved, not silently matched", () => {
    const rejected = crosswalk({ id: "cw-1", plmPartId: "PN-4471", erpPartId: "771-4471", reviewStatus: "rejected" });
    expect(resolvePartIdentity("PN-4471", [rejected]).status).toBe("unresolved");
  });

  it("Case 3c -- no crosswalk at all (empty list) is unresolved", () => {
    expect(resolvePartIdentity("PN-4471", [])).toEqual({ status: "unresolved", reason: "No approved crosswalk exists for PN-4471." });
  });

  it("Case 4 -- one PLM identifier resolves to multiple ERP identifiers when multiple approved crosswalk rows exist", () => {
    const cwA = crosswalk({ id: "cw-b", plmPartId: "PN-4471", erpPartId: "771-A", mappingType: "one_to_many" });
    const cwB = crosswalk({ id: "cw-a", plmPartId: "PN-4471", erpPartId: "771-B", mappingType: "one_to_many" });
    const result = resolvePartIdentity("PN-4471", [cwA, cwB]);
    expect(result.status).toBe("resolved");
    const identities = result.status === "resolved" ? result.identities : [];
    expect(identities.map((i) => i.erpPartId)).toEqual(["771-B", "771-A"]); // deterministic order by crosswalk id, not insertion order
  });

  it("Case 5 -- many PLM identifiers resolving to one ERP identifier each resolve independently and correctly", () => {
    const crosswalks = [
      crosswalk({ id: "cw-1", plmPartId: "PN-OLD-1", erpPartId: "771-UNIFIED", mappingType: "many_to_one" }),
      crosswalk({ id: "cw-2", plmPartId: "PN-OLD-2", erpPartId: "771-UNIFIED", mappingType: "many_to_one" }),
    ];
    const resultA = resolvePartIdentity("PN-OLD-1", crosswalks);
    const resultB = resolvePartIdentity("PN-OLD-2", crosswalks);
    expect(resultA.status === "resolved" && resultA.identities[0].erpPartId).toBe("771-UNIFIED");
    expect(resultB.status === "resolved" && resultB.identities[0].erpPartId).toBe("771-UNIFIED");
    expect(resultA.status === "resolved" && resultA.identities[0].crosswalk.id).toBe("cw-1");
    expect(resultB.status === "resolved" && resultB.identities[0].crosswalk.id).toBe("cw-2");
  });

  it("collapses multiple approved crosswalk rows for the same PLM part that resolve to the IDENTICAL ERP identifier into a single resolved identity -- duplicate mappings, not genuine one-to-many, must never cause the same PO line to be matched and processed more than once", () => {
    const duplicateA = crosswalk({ id: "cw-a", plmPartId: "PN-Z", erpPartId: "PN-Z" });
    const duplicateB = crosswalk({ id: "cw-b", plmPartId: "PN-Z", erpPartId: "PN-Z" });
    const result = resolvePartIdentity("PN-Z", [duplicateA, duplicateB]);
    expect(result.status).toBe("resolved");
    expect(result.status === "resolved" && result.identities).toHaveLength(1);
    expect(result.status === "resolved" && result.identities[0].crosswalk.id).toBe("cw-a"); // deterministic tiebreak by id order
  });

  it("ignores a superseded crosswalk row even if it was once approved", () => {
    const superseded = crosswalk({ id: "cw-1", plmPartId: "PN-4471", erpPartId: "OLD-ERP", supersededById: "cw-2" });
    const current = crosswalk({ id: "cw-2", plmPartId: "PN-4471", erpPartId: "NEW-ERP" });
    const result = resolvePartIdentity("PN-4471", [superseded, current]);
    expect(result.status === "resolved" && result.identities).toEqual([{ erpPartId: "NEW-ERP", crosswalk: current }]);
  });

  it("normalizes case and whitespace when matching the PLM identifier", () => {
    const cw = crosswalk({ id: "cw-1", plmPartId: "pn-4471", erpPartId: "771-4471" });
    const result = resolvePartIdentity("  PN-4471  ", [cw]);
    expect(result.status).toBe("resolved");
  });
});

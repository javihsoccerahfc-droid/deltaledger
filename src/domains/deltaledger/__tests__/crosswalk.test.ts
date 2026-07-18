import { describe, it, expect } from "vitest";
import {
  suggestCrosswalkMatch,
  canApproveCrosswalk,
  approveCrosswalk,
  rejectCrosswalk,
  supersedeCrosswalk,
  CrosswalkAuthorizationError,
} from "@/domains/deltaledger/crosswalk";
import { PartNumberCrosswalk, User } from "@/domains/deltaledger/types";

const partDataOwner: User = { id: "u1", name: "Pat Owner", role: "part_data_owner" };
const admin: User = { id: "u2", name: "Ada Min", role: "admin" };
const ccbUser: User = { id: "u3", name: "Cathy CCB", role: "ccb" };
const buyer: User = { id: "u4", name: "Bob Buyer", role: "buyer" };

function makeCrosswalk(overrides: Partial<PartNumberCrosswalk> = {}): PartNumberCrosswalk {
  return {
    id: "cw-1",
    plmPartId: "PN-001",
    erpPartId: "ERP-001",
    matchMethod: "fuzzy",
    confidence: 0.8,
    reviewStatus: "unreviewed",
    reviewedBy: null,
    reviewedAt: null,
    effectiveDate: "2026-07-16",
    notes: null,
    mappingType: "one_to_one",
    supersededById: null,
    ...overrides,
  };
}

describe("suggestCrosswalkMatch", () => {
  it("treats a pure formatting variant (spaces/dashes) as an exact match after folding", () => {
    const suggestion = suggestCrosswalkMatch("PN 001", ["PN-001", "PN-002", "PN-003"]);
    expect(suggestion.suggestedErpPartId).toBe("PN-001");
    expect(suggestion.isExactMatch).toBe(true);
  });

  it("suggests the closest ERP part number for a genuine near-miss, not an exact fold match", () => {
    const suggestion = suggestCrosswalkMatch("PN-0O1", ["PN-001", "PN-002", "PN-003"]);
    expect(suggestion.suggestedErpPartId).toBe("PN-001");
    expect(suggestion.isExactMatch).toBe(false);
  });

  it("recognizes an exact match", () => {
    const suggestion = suggestCrosswalkMatch("PN-001", ["PN-001", "PN-002"]);
    expect(suggestion.isExactMatch).toBe(true);
    expect(suggestion.confidence).toBe(1);
  });
});

describe("canApproveCrosswalk / approveCrosswalk — authorization gate", () => {
  it("allows a part_data_owner to approve", () => {
    expect(canApproveCrosswalk(partDataOwner)).toBe(true);
    const approved = approveCrosswalk(makeCrosswalk(), partDataOwner, "2026-07-16T10:00:00Z");
    expect(approved.reviewStatus).toBe("approved");
    expect(approved.reviewedBy).toBe("u1");
  });

  it("allows an admin to approve", () => {
    expect(canApproveCrosswalk(admin)).toBe(true);
  });

  it("does NOT allow a CCB user to approve", () => {
    expect(canApproveCrosswalk(ccbUser)).toBe(false);
    expect(() => approveCrosswalk(makeCrosswalk(), ccbUser, "2026-07-16T10:00:00Z")).toThrow(
      CrosswalkAuthorizationError
    );
  });

  it("does NOT allow a buyer to approve", () => {
    expect(canApproveCrosswalk(buyer)).toBe(false);
    expect(() => approveCrosswalk(makeCrosswalk(), buyer, "2026-07-16T10:00:00Z")).toThrow();
  });

  it("does not mutate the input crosswalk (pure function)", () => {
    const original = makeCrosswalk();
    const approved = approveCrosswalk(original, partDataOwner, "2026-07-16T10:00:00Z");
    expect(original.reviewStatus).toBe("unreviewed");
    expect(approved.reviewStatus).toBe("approved");
  });

  it("rejectCrosswalk also requires part-data-owner authority", () => {
    expect(() => rejectCrosswalk(makeCrosswalk(), buyer, "2026-07-16T10:00:00Z")).toThrow(CrosswalkAuthorizationError);
    const rejected = rejectCrosswalk(makeCrosswalk(), admin, "2026-07-16T10:00:00Z");
    expect(rejected.reviewStatus).toBe("rejected");
  });
});

describe("supersedeCrosswalk — immutable change history", () => {
  it("preserves the old entry and links it to the new one via supersededById", () => {
    const old = approveCrosswalk(makeCrosswalk(), partDataOwner, "2026-07-01T00:00:00Z");
    const { superseded, replacement } = supersedeCrosswalk(
      old,
      { ...old, erpPartId: "ERP-002", reviewStatus: "unreviewed", reviewedBy: null, reviewedAt: null },
      "cw-2"
    );
    expect(superseded.id).toBe("cw-1");
    expect(superseded.supersededById).toBe("cw-2");
    expect(superseded.erpPartId).toBe("ERP-001"); // old value untouched
    expect(replacement.id).toBe("cw-2");
    expect(replacement.erpPartId).toBe("ERP-002");
    expect(replacement.supersededById).toBeNull();
  });
});

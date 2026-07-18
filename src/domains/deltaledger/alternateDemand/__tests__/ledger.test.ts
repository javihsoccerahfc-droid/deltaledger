import { describe, it, expect } from "vitest";
import {
  canReviewAlternateDemand,
  approveAlternateDemand,
  rejectAlternateDemand,
  AlternateDemandAuthorizationError,
} from "@/domains/deltaledger/alternateDemand/review";
import {
  activeAllocatedQuantity,
  availableQuantity,
  deriveAllocationStatus,
  allocateAlternateDemand,
  reverseAllocation,
} from "@/domains/deltaledger/alternateDemand/ledger";
import { AlternateDemandAllocation, AlternateDemandRecord, User } from "@/domains/deltaledger/types";

const supplyChainManager: User = { id: "u1", name: "Sam SCM", role: "supply_chain_manager" };
const partDataOwner: User = { id: "u3", name: "Pat Owner", role: "part_data_owner" };
const buyer: User = { id: "u2", name: "Bob Buyer", role: "buyer" };

function makeRecord(overrides: Partial<AlternateDemandRecord> = {}): AlternateDemandRecord {
  return {
    id: "adr-1",
    partId: "PN-001",
    demandSourceType: "unaffected_assembly",
    demandSourceId: "bom-import-9",
    affectedAssemblyId: "assy-42",
    quantityAvailableForOffset: 100,
    demandDate: "2026-07-01",
    sourceReference: "Assembly X BOM",
    sourceFile: "assembly_x.xlsx",
    sourceRow: 12,
    confidence: 0.9,
    reviewStatus: "unreviewed",
    reviewedBy: null,
    reviewedAt: null,
    allocationStatus: "unallocated",
    ...overrides,
  };
}

describe("alternate-demand review authorization", () => {
  it("allows a supply_chain_manager to approve", () => {
    expect(canReviewAlternateDemand(supplyChainManager)).toBe(true);
    const approved = approveAlternateDemand(makeRecord(), supplyChainManager, "2026-07-16T00:00:00Z");
    expect(approved.reviewStatus).toBe("approved");
  });

  it("does NOT allow a part_data_owner to approve alternate demand (distinct from crosswalk approval)", () => {
    expect(canReviewAlternateDemand(partDataOwner)).toBe(false);
    expect(() => approveAlternateDemand(makeRecord(), partDataOwner, "2026-07-16T00:00:00Z")).toThrow(
      AlternateDemandAuthorizationError
    );
  });

  it("does not allow a buyer to approve or reject", () => {
    expect(canReviewAlternateDemand(buyer)).toBe(false);
    expect(() => approveAlternateDemand(makeRecord(), buyer, "2026-07-16T00:00:00Z")).toThrow(
      AlternateDemandAuthorizationError
    );
    expect(() => rejectAlternateDemand(makeRecord(), buyer, "2026-07-16T00:00:00Z")).toThrow();
  });
});

describe("allocateAlternateDemand — system suggestions cannot reduce exposure until approved", () => {
  it("refuses to allocate against an unreviewed record", () => {
    const record = makeRecord({ reviewStatus: "unreviewed" });
    const result = allocateAlternateDemand(record, "exp-1", 20, "u1", "2026-07-16T00:00:00Z", []);
    expect(result.success).toBe(false);
  });

  it("refuses to allocate against a rejected record", () => {
    const record = makeRecord({ reviewStatus: "rejected" });
    const result = allocateAlternateDemand(record, "exp-1", 20, "u1", "2026-07-16T00:00:00Z", []);
    expect(result.success).toBe(false);
  });

  it("allocates successfully against an approved record within its available quantity", () => {
    const record = makeRecord({ reviewStatus: "approved" });
    const result = allocateAlternateDemand(record, "exp-1", 40, "u1", "2026-07-16T00:00:00Z", []);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.allocation.quantityAllocated).toBe(40);
      expect(result.allocation.status).toBe("active");
    }
  });
});

describe("over-allocation prevention across PO lines / engineering changes / exposure records", () => {
  it("prevents a second exposure record from over-claiming the same pool", () => {
    const record = makeRecord({ reviewStatus: "approved", quantityAvailableForOffset: 100 });

    const first = allocateAlternateDemand(record, "exp-1", 70, "u1", "2026-07-16T00:00:00Z", []);
    expect(first.success).toBe(true);
    const existingAfterFirst: AlternateDemandAllocation[] = first.success ? [first.allocation] : [];

    // A second, entirely different exposure record (which could belong to a
    // different engineering change and a different PO line) tries to claim
    // 50 more — only 30 remains.
    const second = allocateAlternateDemand(record, "exp-2", 50, "u1", "2026-07-16T00:05:00Z", existingAfterFirst);
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.reason).toContain("30");
    }
  });

  it("allows a second allocation that fits within the remaining quantity", () => {
    const record = makeRecord({ reviewStatus: "approved", quantityAvailableForOffset: 100 });
    const first = allocateAlternateDemand(record, "exp-1", 70, "u1", "2026-07-16T00:00:00Z", []);
    const existingAfterFirst: AlternateDemandAllocation[] = first.success ? [first.allocation] : [];

    const second = allocateAlternateDemand(record, "exp-2", 30, "u1", "2026-07-16T00:05:00Z", existingAfterFirst);
    expect(second.success).toBe(true);
  });

  it("rejects an allocation request that alone exceeds the total available quantity", () => {
    const record = makeRecord({ reviewStatus: "approved", quantityAvailableForOffset: 50 });
    const result = allocateAlternateDemand(record, "exp-1", 51, "u1", "2026-07-16T00:00:00Z", []);
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative allocation quantity", () => {
    const record = makeRecord({ reviewStatus: "approved" });
    expect(allocateAlternateDemand(record, "exp-1", 0, "u1", "t", []).success).toBe(false);
    expect(allocateAlternateDemand(record, "exp-1", -5, "u1", "t", []).success).toBe(false);
  });
});

describe("reverseAllocation — frees quantity back to the pool", () => {
  it("makes the reversed quantity available for a new allocation", () => {
    const record = makeRecord({ reviewStatus: "approved", quantityAvailableForOffset: 100 });
    const first = allocateAlternateDemand(record, "exp-1", 100, "u1", "2026-07-16T00:00:00Z", []);
    expect(first.success).toBe(true);
    if (!first.success) throw new Error("expected success");

    // Fully allocated — a second claim should fail.
    const blocked = allocateAlternateDemand(record, "exp-2", 10, "u1", "t", [first.allocation]);
    expect(blocked.success).toBe(false);

    const reversed = reverseAllocation(first.allocation, "u1", "2026-07-17T00:00:00Z", "Exposure record cancelled");
    expect(reversed.status).toBe("reversed");

    // With the active ledger now empty (reversed allocation excluded), a
    // new allocation should succeed.
    const afterReversal = allocateAlternateDemand(record, "exp-2", 10, "u1", "t", [reversed]);
    expect(afterReversal.success).toBe(true);
  });
});

describe("activeAllocatedQuantity / availableQuantity / deriveAllocationStatus", () => {
  it("excludes reversed allocations from the active sum", () => {
    const record = makeRecord({ quantityAvailableForOffset: 100 });
    const active: AlternateDemandAllocation = {
      id: "a1",
      alternateDemandRecordId: "adr-1",
      exposureRecordId: "exp-1",
      quantityAllocated: 40,
      allocatedAt: "t",
      allocatedBy: "u1",
      status: "active",
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    };
    const reversed: AlternateDemandAllocation = { ...active, id: "a2", quantityAllocated: 30, status: "reversed" };

    expect(activeAllocatedQuantity("adr-1", [active, reversed])).toBe(40);
    expect(availableQuantity(record, [active, reversed])).toBe(60);
  });

  it("reports unallocated, partially_allocated, and fully_allocated correctly", () => {
    const record = makeRecord({ quantityAvailableForOffset: 100 });
    expect(deriveAllocationStatus(record, [])).toBe("unallocated");

    const partial: AlternateDemandAllocation = {
      id: "a1",
      alternateDemandRecordId: "adr-1",
      exposureRecordId: "exp-1",
      quantityAllocated: 40,
      allocatedAt: "t",
      allocatedBy: "u1",
      status: "active",
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    };
    expect(deriveAllocationStatus(record, [partial])).toBe("partially_allocated");

    const full: AlternateDemandAllocation = { ...partial, id: "a2", quantityAllocated: 60 };
    expect(deriveAllocationStatus(record, [partial, full])).toBe("fully_allocated");
  });
});

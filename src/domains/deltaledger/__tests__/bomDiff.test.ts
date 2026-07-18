import { describe, it, expect } from "vitest";
import { buildBomDiff, markAsReplacement } from "@/domains/deltaledger/bomDiff";
import { BomLine } from "@/domains/deltaledger/types";

function line(overrides: Partial<BomLine>): BomLine {
  return {
    id: "x",
    bomImportId: "bom-1",
    partId: null,
    rawPartNumber: "PN-001",
    rawDescription: "Widget",
    quantityPer: 1,
    quantityParseStatus: "ok",
    parentBomLineId: null,
    sourceRow: 1,
    ...overrides,
  };
}

describe("buildBomDiff", () => {
  it("detects an added part", () => {
    const current: BomLine[] = [];
    const proposed = [line({ rawPartNumber: "PN-NEW", quantityPer: 2 })];
    const diff = buildBomDiff("ec-1", current, proposed);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ changeType: "added", toQuantity: 2, fromQuantity: null });
  });

  it("detects a removed part", () => {
    const current = [line({ rawPartNumber: "PN-OLD", quantityPer: 3 })];
    const proposed: BomLine[] = [];
    const diff = buildBomDiff("ec-1", current, proposed);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ changeType: "removed", fromQuantity: 3, toQuantity: null });
  });

  it("detects a quantity reduction", () => {
    const current = [line({ rawPartNumber: "PN-001", quantityPer: 10 })];
    const proposed = [line({ rawPartNumber: "PN-001", quantityPer: 4 })];
    const diff = buildBomDiff("ec-1", current, proposed);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ changeType: "qty_reduced", fromQuantity: 10, toQuantity: 4 });
  });

  it("detects a quantity increase", () => {
    const current = [line({ rawPartNumber: "PN-001", quantityPer: 4 })];
    const proposed = [line({ rawPartNumber: "PN-001", quantityPer: 10 })];
    const diff = buildBomDiff("ec-1", current, proposed);
    expect(diff[0]).toMatchObject({ changeType: "qty_increased", fromQuantity: 4, toQuantity: 10 });
  });

  it("produces no entry for a genuinely unchanged quantity", () => {
    const current = [line({ rawPartNumber: "PN-001", quantityPer: 5 })];
    const proposed = [line({ rawPartNumber: "PN-001", quantityPer: 5 })];
    expect(buildBomDiff("ec-1", current, proposed)).toHaveLength(0);
  });

  it("does not assert a quantity change when either side's quantity is unparseable", () => {
    const current = [line({ rawPartNumber: "PN-001", quantityPer: null, quantityParseStatus: "invalid" })];
    const proposed = [line({ rawPartNumber: "PN-001", quantityPer: 5, quantityParseStatus: "ok" })];
    // Part exists on both sides, so not added/removed; quantity comparison
    // is skipped rather than guessed — no diff entry at all in this case.
    expect(buildBomDiff("ec-1", current, proposed)).toHaveLength(0);
  });

  it("never auto-infers a 'replaced' change type", () => {
    const current = [line({ rawPartNumber: "PN-OLD" })];
    const proposed = [line({ rawPartNumber: "PN-NEW" })];
    const diff = buildBomDiff("ec-1", current, proposed);
    expect(diff.map((d) => d.changeType).sort()).toEqual(["added", "removed"]);
  });
});

describe("markAsReplacement", () => {
  it("merges an explicit removed+added pair into one replaced entry", () => {
    const current = [line({ rawPartNumber: "PN-OLD", quantityPer: 2 })];
    const proposed = [line({ rawPartNumber: "PN-NEW", quantityPer: 2 })];
    const diff = buildBomDiff("ec-1", current, proposed);
    const removed = diff.find((d) => d.changeType === "removed")!;
    const added = diff.find((d) => d.changeType === "added")!;

    const merged = markAsReplacement(diff, removed.id, added.id);
    expect(merged).toHaveLength(1);
    expect(merged[0].changeType).toBe("replaced");
    expect(merged[0].replacementPartId).toBe("PN-NEW");
  });
});

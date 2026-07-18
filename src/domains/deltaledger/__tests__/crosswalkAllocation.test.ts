import { describe, it, expect } from "vitest";
import { resolveCrosswalkAllocation, percentageRulesAreValid } from "@/domains/deltaledger/crosswalkAllocation";
import { CrosswalkAllocationRule, PartNumberCrosswalk } from "@/domains/deltaledger/types";

function makeCrosswalk(mappingType: PartNumberCrosswalk["mappingType"]): PartNumberCrosswalk {
  return {
    id: "cw-1",
    plmPartId: "PN-001",
    erpPartId: "ERP-001",
    matchMethod: "manual",
    confidence: 1,
    reviewStatus: "approved",
    reviewedBy: "u1",
    reviewedAt: "2026-07-16T00:00:00Z",
    effectiveDate: "2026-07-16",
    notes: null,
    mappingType,
    supersededById: null,
  };
}

function rule(overrides: Partial<CrosswalkAllocationRule>): CrosswalkAllocationRule {
  return {
    id: "rule-1",
    crosswalkId: "cw-1",
    method: "fixed_quantity",
    plantCode: null,
    supplierId: null,
    fixedQuantity: null,
    percentage: null,
    notes: null,
    effectiveDate: "2026-07-16",
    ...overrides,
  };
}

describe("resolveCrosswalkAllocation", () => {
  it("one_to_one mapping needs no rule — full quantity applies", () => {
    const result = resolveCrosswalkAllocation(makeCrosswalk("one_to_one"), undefined, [], { quantity: 100 });
    expect(result).toMatchObject({ resolved: true, allocatedQuantity: 100 });
  });

  it("fixed_quantity method allocates exactly the fixed amount, capped at available quantity", () => {
    const r = rule({ method: "fixed_quantity", fixedQuantity: 30 });
    const result = resolveCrosswalkAllocation(makeCrosswalk("one_to_many"), r, [r], { quantity: 100 });
    expect(result).toMatchObject({ resolved: true, allocatedQuantity: 30 });
  });

  it("fixed_quantity is capped when it exceeds the available quantity", () => {
    const r = rule({ method: "fixed_quantity", fixedQuantity: 500 });
    const result = resolveCrosswalkAllocation(makeCrosswalk("one_to_many"), r, [r], { quantity: 100 });
    expect(result).toMatchObject({ resolved: true, allocatedQuantity: 100 });
  });

  it("percentage method allocates the exact share when all rules sum to 100%", () => {
    const rules = [
      rule({ id: "r1", method: "percentage", percentage: 60 }),
      rule({ id: "r2", method: "percentage", percentage: 40 }),
    ];
    const result = resolveCrosswalkAllocation(makeCrosswalk("one_to_many"), rules[0], rules, { quantity: 200 });
    expect(result).toMatchObject({ resolved: true, allocatedQuantity: 120 }); // 200 * 0.6
  });

  it("percentage method is Unresolved when rules don't sum to 100%", () => {
    const rules = [
      rule({ id: "r1", method: "percentage", percentage: 60 }),
      rule({ id: "r2", method: "percentage", percentage: 35 }), // sums to 95%
    ];
    const result = resolveCrosswalkAllocation(makeCrosswalk("one_to_many"), rules[0], rules, { quantity: 200 });
    expect(result.resolved).toBe(false);
    expect(percentageRulesAreValid(rules)).toBe(false);
  });

  it("plant_specific method allocates only when the plant matches", () => {
    const r = rule({ method: "plant_specific", plantCode: "PLANT-A" });
    const matched = resolveCrosswalkAllocation(makeCrosswalk("many_to_one"), r, [r], { quantity: 50, plantCode: "PLANT-A" });
    expect(matched).toMatchObject({ resolved: true, allocatedQuantity: 50 });

    const unmatched = resolveCrosswalkAllocation(makeCrosswalk("many_to_one"), r, [r], { quantity: 50, plantCode: "PLANT-B" });
    expect(unmatched.resolved).toBe(false);
  });

  it("supplier_specific method allocates only when the supplier matches", () => {
    const r = rule({ method: "supplier_specific", supplierId: "sup-1" });
    const matched = resolveCrosswalkAllocation(makeCrosswalk("many_to_one"), r, [r], { quantity: 50, supplierId: "sup-1" });
    expect(matched).toMatchObject({ resolved: true, allocatedQuantity: 50 });

    const unmatched = resolveCrosswalkAllocation(makeCrosswalk("many_to_one"), r, [r], { quantity: 50, supplierId: "sup-2" });
    expect(unmatched.resolved).toBe(false);
  });

  it("manual method requires an explicit manualAllocationQuantity", () => {
    const r = rule({ method: "manual" });
    const missing = resolveCrosswalkAllocation(makeCrosswalk("one_to_many"), r, [r], { quantity: 50 });
    expect(missing.resolved).toBe(false);

    const provided = resolveCrosswalkAllocation(makeCrosswalk("one_to_many"), r, [r], {
      quantity: 50,
      manualAllocationQuantity: 22,
    });
    expect(provided).toMatchObject({ resolved: true, allocatedQuantity: 22 });
  });

  it("is Unresolved (never guesses an even split) when no rule exists for a one_to_many crosswalk", () => {
    const result = resolveCrosswalkAllocation(makeCrosswalk("one_to_many"), undefined, [], { quantity: 100 });
    expect(result.resolved).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { getDecisionPhase } from "../timelinePhase";

describe("getDecisionPhase", () => {
  it("maps known entity types to their correct phase", () => {
    expect(getDecisionPhase("EngineeringChange")).toBe("Problem Identified");
    expect(getDecisionPhase("BomImport")).toBe("Data Collected");
    expect(getDecisionPhase("ExposureRecord")).toBe("Exposure Understood");
    expect(getDecisionPhase("AlternateDemandAllocation")).toBe("Decision Made");
    expect(getDecisionPhase("MitigationAction")).toBe("Mitigation Executed");
  });

  it("falls back to 'Other' for an unrecognized or null entity type, never throwing", () => {
    expect(getDecisionPhase("SomethingNew")).toBe("Other");
    expect(getDecisionPhase(null)).toBe("Other");
  });
});

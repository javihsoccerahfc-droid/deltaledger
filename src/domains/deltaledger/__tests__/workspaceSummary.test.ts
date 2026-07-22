import { describe, it, expect } from "vitest";
import {
  getWorkspaceCompletion,
  getEvidenceCoverage,
  getDecisionReadiness,
  getNextAction,
  WorkspaceSummaryInput,
  DecisionReadinessReasonCode,
} from "../workspaceSummary";

function baseInput(overrides: Partial<WorkspaceSummaryInput> = {}): WorkspaceSummaryInput {
  return {
    bomDiff: [],
    poLineCount: 0,
    crosswalks: [],
    exposureRecords: [],
    provenanceByRecordId: {},
    mitigationOutcomes: [],
    ...overrides,
  };
}

describe("getWorkspaceCompletion", () => {
  it("reports nothing complete for a brand-new EC", () => {
    const completion = getWorkspaceCompletion(baseInput());
    expect(completion).toEqual({
      bomComplete: false,
      poComplete: false,
      mappingComplete: false,
      mappingPending: 0,
      exposureComplete: false,
      mitigationComplete: false,
      mitigationPending: 0,
    });
  });

  it("only counts crosswalks for parts actually eligible from the BOM diff", () => {
    const completion = getWorkspaceCompletion(
      baseInput({
        bomDiff: [{ partId: "PN-1", changeType: "removed" }],
        crosswalks: [
          { plmPartId: "PN-1", reviewStatus: "unreviewed" },
          { plmPartId: "PN-UNRELATED", reviewStatus: "unreviewed" }, // not eligible -- must not count
        ],
      })
    );
    expect(completion.mappingPending).toBe(1);
  });

  it("mappingComplete requires every eligible crosswalk reviewed, not just one", () => {
    const input = baseInput({
      bomDiff: [
        { partId: "PN-1", changeType: "removed" },
        { partId: "PN-2", changeType: "removed" },
      ],
      crosswalks: [
        { plmPartId: "PN-1", reviewStatus: "approved" },
        { plmPartId: "PN-2", reviewStatus: "unreviewed" },
      ],
    });
    expect(getWorkspaceCompletion(input).mappingComplete).toBe(false);
  });

  it("mitigationComplete is false if any exposure record lacks a closed outcome", () => {
    const input = baseInput({
      exposureRecords: [{ id: "exp-1", confidenceClassification: "known", netExposureValueReporting: 100 }],
      mitigationOutcomes: [{ exposureRecordId: "exp-1", closedAt: null }],
    });
    expect(getWorkspaceCompletion(input).mitigationComplete).toBe(false);
    expect(getWorkspaceCompletion(input).mitigationPending).toBe(1);
  });
});

describe("getEvidenceCoverage", () => {
  it("returns zero coverage with no exposure records", () => {
    expect(getEvidenceCoverage([]).coverageFraction).toBe(0);
  });

  it("computes coverage as known / total, not known / (known + estimated)", () => {
    const coverage = getEvidenceCoverage([
      { id: "1", confidenceClassification: "known", netExposureValueReporting: 700 },
      { id: "2", confidenceClassification: "estimated", netExposureValueReporting: 200 },
      { id: "3", confidenceClassification: "unresolved", netExposureValueReporting: 100 },
    ]);
    expect(coverage.knownTotal).toBe(700);
    expect(coverage.grandTotal).toBe(1000);
    expect(coverage.coverageFraction).toBeCloseTo(0.7);
  });
});

describe("getDecisionReadiness", () => {
  const emptyCompletion = getWorkspaceCompletion(baseInput());

  it("is not_ready with specific reasons for a brand-new EC, and codes the first blocking reason", () => {
    const readiness = getDecisionReadiness(emptyCompletion, {});
    expect(readiness.status).toBe("not_ready");
    expect(readiness.blockingReasons.length).toBeGreaterThan(0);
    expect(readiness.blockingReasons.some((r) => r.includes("BOM"))).toBe(true);
    expect(readiness.primaryReasonCode).toBe("no_bom"); // first check in priority order
  });

  it("codes mapping_pending when that's the only thing blocking", () => {
    const completion = getWorkspaceCompletion(
      baseInput({
        bomDiff: [{ partId: "PN-1", changeType: "removed" }],
        poLineCount: 1,
        crosswalks: [{ plmPartId: "PN-1", reviewStatus: "unreviewed" }],
      })
    );
    const readiness = getDecisionReadiness(completion, {});
    expect(readiness.primaryReasonCode).toBe("mapping_pending");
  });

  it("is needs_attention (not ready, not blocked) when exposure exists but provenance is stale, coded stale_exposure", () => {
    const completion = getWorkspaceCompletion(
      baseInput({
        bomDiff: [{ partId: "PN-1", changeType: "removed" }],
        poLineCount: 1,
        crosswalks: [{ plmPartId: "PN-1", reviewStatus: "approved" }],
        exposureRecords: [{ id: "exp-1", confidenceClassification: "known", netExposureValueReporting: 100 }],
      })
    );
    const readiness = getDecisionReadiness(completion, { "exp-1": "stale" });
    expect(readiness.status).toBe("needs_attention");
    expect(readiness.primaryReasonCode).toBe("stale_exposure");
  });

  it("is ready only when every check passes and all provenance is current, with no reason code", () => {
    const completion = getWorkspaceCompletion(
      baseInput({
        bomDiff: [{ partId: "PN-1", changeType: "removed" }],
        poLineCount: 1,
        crosswalks: [{ plmPartId: "PN-1", reviewStatus: "approved" }],
        exposureRecords: [{ id: "exp-1", confidenceClassification: "known", netExposureValueReporting: 100 }],
      })
    );
    const readiness = getDecisionReadiness(completion, { "exp-1": "current" });
    expect(readiness).toEqual({ status: "ready", blockingReasons: [], primaryReasonCode: null });
  });

  it("Phase 6B -- codes mapping_changed_since_calculation when a mapping was revised/revoked after calculation, checked before PO provenance", () => {
    const completion = getWorkspaceCompletion(
      baseInput({
        bomDiff: [{ partId: "PN-1", changeType: "removed" }],
        poLineCount: 1,
        crosswalks: [{ plmPartId: "PN-1", reviewStatus: "approved" }],
        exposureRecords: [{ id: "exp-1", confidenceClassification: "known", netExposureValueReporting: 100 }],
      })
    );
    const readiness = getDecisionReadiness(completion, { "exp-1": "current" }, 1);
    expect(readiness.status).toBe("needs_attention");
    expect(readiness.primaryReasonCode).toBe("mapping_changed_since_calculation");
    expect(readiness.blockingReasons[0]).toContain("revised or revoked");
  });

  it("Phase 6B -- a healthy EC (zero superseded mappings) is unaffected by the new parameter", () => {
    const completion = getWorkspaceCompletion(
      baseInput({
        bomDiff: [{ partId: "PN-1", changeType: "removed" }],
        poLineCount: 1,
        crosswalks: [{ plmPartId: "PN-1", reviewStatus: "approved" }],
        exposureRecords: [{ id: "exp-1", confidenceClassification: "known", netExposureValueReporting: 100 }],
      })
    );
    const readiness = getDecisionReadiness(completion, { "exp-1": "current" }, 0);
    expect(readiness.status).toBe("ready");
  });
});

describe("getNextAction", () => {
  it("returns null when nothing needs attention", () => {
    expect(getNextAction("ec-1", { status: "ready", blockingReasons: [], primaryReasonCode: null })).toBeNull();
  });

  it("maps every non-null reason code to a concrete label and route", () => {
    const codes: Exclude<DecisionReadinessReasonCode, null>[] = [
      "no_bom",
      "no_po",
      "mapping_pending",
      "no_exposure",
      "mapping_changed_since_calculation",
      "stale_exposure",
    ];
    for (const code of codes) {
      const action = getNextAction("ec-1", { status: "not_ready", blockingReasons: ["x"], primaryReasonCode: code });
      expect(action).not.toBeNull();
      expect(action?.href).toContain("/engineering-changes/ec-1/");
      expect(action?.label.length).toBeGreaterThan(0);
    }
  });

  it("routes mapping_changed_since_calculation to the Exposure tab, not Mapping -- the fix is recalculating, not re-reviewing", () => {
    const action = getNextAction("ec-1", {
      status: "needs_attention",
      blockingReasons: ["x"],
      primaryReasonCode: "mapping_changed_since_calculation",
    });
    expect(action?.href).toBe("/engineering-changes/ec-1/exposure");
  });
});

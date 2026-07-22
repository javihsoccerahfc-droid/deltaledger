import { describe, it, expect } from "vitest";
import { getPortfolioAttentionItems, getPortfolioMetrics, getLargestExposureEntries, EcPortfolioEntry } from "../portfolioSummary";
import { getEvidenceCoverage } from "../workspaceSummary";

function entry(overrides: Partial<EcPortfolioEntry> & { ecId: string }): EcPortfolioEntry {
  return {
    ecId: overrides.ecId,
    ecName: overrides.ecName ?? overrides.ecId,
    readiness: overrides.readiness ?? { status: "ready", blockingReasons: [], primaryReasonCode: null },
    coverage: overrides.coverage ?? getEvidenceCoverage([]),
  };
}

describe("getPortfolioAttentionItems", () => {
  it("excludes ECs that are fully ready", () => {
    const items = getPortfolioAttentionItems([entry({ ecId: "ec-1" })]);
    expect(items).toHaveLength(0);
  });

  it("maps each reason code to a specific, correct call-to-action", () => {
    const items = getPortfolioAttentionItems([
      entry({ ecId: "ec-1", readiness: { status: "not_ready", blockingReasons: ["x"], primaryReasonCode: "no_bom" } }),
      entry({ ecId: "ec-2", readiness: { status: "not_ready", blockingReasons: ["x"], primaryReasonCode: "mapping_pending" } }),
      entry({ ecId: "ec-3", readiness: { status: "needs_attention", blockingReasons: ["x"], primaryReasonCode: "stale_exposure" } }),
    ]);
    expect(items.find((i) => i.ecId === "ec-1")?.ctaTab).toBe("boms");
    expect(items.find((i) => i.ecId === "ec-2")?.ctaTab).toBe("mapping");
    expect(items.find((i) => i.ecId === "ec-3")?.ctaTab).toBe("exposure");
    expect(items.find((i) => i.ecId === "ec-3")?.ctaLabel).toBe("Recalculate Exposure");
  });

  it("orders not_ready items before needs_attention items", () => {
    const items = getPortfolioAttentionItems([
      entry({ ecId: "attention-first", readiness: { status: "needs_attention", blockingReasons: ["x"], primaryReasonCode: "stale_exposure" } }),
      entry({ ecId: "blocked-second", readiness: { status: "not_ready", blockingReasons: ["x"], primaryReasonCode: "no_bom" } }),
    ]);
    expect(items[0].ecId).toBe("blocked-second"); // not_ready surfaces first regardless of input order
    expect(items[1].ecId).toBe("attention-first");
  });
});

describe("getPortfolioMetrics", () => {
  it("computes totals across the whole portfolio", () => {
    const metrics = getPortfolioMetrics([
      entry({ ecId: "ec-1", coverage: getEvidenceCoverage([{ id: "1", confidenceClassification: "known", netExposureValueReporting: 100 }]) }),
      entry({
        ecId: "ec-2",
        readiness: { status: "not_ready", blockingReasons: ["x"], primaryReasonCode: "no_bom" },
        coverage: getEvidenceCoverage([]),
      }),
      entry({
        ecId: "ec-3",
        readiness: { status: "needs_attention", blockingReasons: ["x"], primaryReasonCode: "stale_exposure" },
        coverage: getEvidenceCoverage([{ id: "1", confidenceClassification: "estimated", netExposureValueReporting: 50 }]),
      }),
    ]);
    expect(metrics.totalOpenEcs).toBe(3);
    expect(metrics.totalExposure).toBe(150);
    expect(metrics.knownTotal).toBe(100);
    expect(metrics.estimatedTotal).toBe(50);
    expect(metrics.unresolvedCount).toBe(0);
    expect(metrics.needsActionCount).toBe(2);
    expect(metrics.staleOrUnverifiedCount).toBe(1);
  });

  it("counts unresolved records across the portfolio, never as a dollar amount", () => {
    const metrics = getPortfolioMetrics([
      entry({
        ecId: "ec-1",
        coverage: getEvidenceCoverage([
          { id: "1", confidenceClassification: "known", netExposureValueReporting: 100 },
          { id: "2", confidenceClassification: "unresolved", netExposureValueReporting: 0 },
          { id: "3", confidenceClassification: "unresolved", netExposureValueReporting: 0 },
        ]),
      }),
    ]);
    expect(metrics.unresolvedCount).toBe(2);
  });
});

describe("getLargestExposureEntries", () => {
  it("excludes ECs with no exposure calculated, and sorts largest first", () => {
    const entries = [
      entry({ ecId: "small", coverage: getEvidenceCoverage([{ id: "1", confidenceClassification: "known", netExposureValueReporting: 100 }]) }),
      entry({ ecId: "none", coverage: getEvidenceCoverage([]) }),
      entry({ ecId: "large", coverage: getEvidenceCoverage([{ id: "1", confidenceClassification: "known", netExposureValueReporting: 900 }]) }),
    ];
    const result = getLargestExposureEntries(entries, 5);
    expect(result.map((e) => e.ecId)).toEqual(["large", "small"]);
  });

  it("respects the limit", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ ecId: `ec-${i}`, coverage: getEvidenceCoverage([{ id: "1", confidenceClassification: "known", netExposureValueReporting: i + 1 }]) })
    );
    expect(getLargestExposureEntries(entries, 3)).toHaveLength(3);
  });
});

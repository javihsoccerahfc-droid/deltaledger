import { describe, it, expect } from "vitest";
import { summarizeReportNarrative } from "../reportNarrative";
import type { EcoReport } from "../ecoReport";

function report(overrides: Partial<EcoReport> = {}): EcoReport {
  return {
    engineeringChangeId: "ec-1",
    exposure: {
      countByConfidence: { known: 0, estimated: 0, unresolved: 0 },
      countByCancellationStatus: {},
      totalGrossReporting: 0,
      totalNetReporting: 0,
      totalGrossReportingKnownOnly: 0,
      totalNetReportingKnownOnly: 0,
    },
    outcomes: {
      countClosed: 0,
      countOpen: 0,
      totalEstimatedCostAvoidedFrozen: 0,
      totalActualCostAvoided: 0,
      totalActualRealizedLoss: 0,
      totalNetMitigationBenefit: 0,
    },
    unmappedGapCount: 0,
    ...overrides,
  };
}

describe("summarizeReportNarrative", () => {
  it("returns null when there is nothing to report -- no invented narrative for an empty report", () => {
    expect(summarizeReportNarrative(report())).toBeNull();
  });

  it("makes the confidence composition explicit when exposure is mixed", () => {
    const r = report({
      exposure: {
        countByConfidence: { known: 2, estimated: 1, unresolved: 0 },
        countByCancellationStatus: {},
        totalGrossReporting: 310000,
        totalNetReporting: 310000,
        totalGrossReportingKnownOnly: 220000,
        totalNetReportingKnownOnly: 220000,
      },
    });
    const narrative = summarizeReportNarrative(r);
    expect(narrative!.exposureLine).toBe("$310,000.00 of total net exposure across 3 records: $220,000.00 known and $90,000.00 estimated.");
  });

  it("describes unresolved records by count, never a $0 dollar claim", () => {
    const r = report({
      exposure: {
        countByConfidence: { known: 1, estimated: 0, unresolved: 2 },
        countByCancellationStatus: {},
        totalGrossReporting: 220000,
        totalNetReporting: 220000,
        totalGrossReportingKnownOnly: 220000,
        totalNetReportingKnownOnly: 220000,
      },
    });
    const narrative = summarizeReportNarrative(r);
    expect(narrative!.exposureLine).toContain("2 records not yet determinable");
    expect(narrative!.exposureLine).not.toContain("$0");
  });

  it("handles the all-unresolved case with no dollar total to lead with", () => {
    const r = report({
      exposure: {
        countByConfidence: { known: 0, estimated: 0, unresolved: 3 },
        countByCancellationStatus: {},
        totalGrossReporting: 0,
        totalNetReporting: 0,
        totalGrossReportingKnownOnly: 0,
        totalNetReportingKnownOnly: 0,
      },
    });
    const narrative = summarizeReportNarrative(r);
    expect(narrative!.exposureLine).toBe("3 exposure records, none yet determinable.");
  });

  it("never uses trend language anywhere in the narrative", () => {
    const r = report({
      exposure: {
        countByConfidence: { known: 3, estimated: 1, unresolved: 1 },
        countByCancellationStatus: {},
        totalGrossReporting: 400000,
        totalNetReporting: 400000,
        totalGrossReportingKnownOnly: 300000,
        totalNetReportingKnownOnly: 300000,
      },
      outcomes: {
        countClosed: 2,
        countOpen: 1,
        totalEstimatedCostAvoidedFrozen: 50000,
        totalActualCostAvoided: 40000,
        totalActualRealizedLoss: 5000,
        totalNetMitigationBenefit: 35000,
      },
    });
    const narrative = summarizeReportNarrative(r);
    const fullText = `${narrative!.exposureLine} ${narrative!.mitigationLine} ${narrative!.netPositionLine}`.toLowerCase();
    for (const word of ["up ", "down ", "since", "increase", "decrease", "trend", "improving", "worsening"]) {
      expect(fullText).not.toContain(word);
    }
  });

  it("mitigation line reports outcomes to date and how many remain open", () => {
    const r = report({
      exposure: { countByConfidence: { known: 1, estimated: 0, unresolved: 0 }, countByCancellationStatus: {}, totalGrossReporting: 1, totalNetReporting: 1, totalGrossReportingKnownOnly: 1, totalNetReportingKnownOnly: 1 },
      outcomes: {
        countClosed: 2,
        countOpen: 1,
        totalEstimatedCostAvoidedFrozen: 0,
        totalActualCostAvoided: 40000,
        totalActualRealizedLoss: 5000,
        totalNetMitigationBenefit: 35000,
      },
    });
    const narrative = summarizeReportNarrative(r);
    expect(narrative!.mitigationLine).toBe("Of 3 recorded mitigation outcomes, $40,000.00 has been avoided and $5,000.00 realized as loss to date (1 still open).");
    expect(narrative!.netPositionLine).toBe("Net mitigation benefit to date: $35,000.00.");
  });

  it("reports honestly when no mitigation outcomes exist yet", () => {
    const r = report({
      exposure: { countByConfidence: { known: 1, estimated: 0, unresolved: 0 }, countByCancellationStatus: {}, totalGrossReporting: 1, totalNetReporting: 1, totalGrossReportingKnownOnly: 1, totalNetReportingKnownOnly: 1 },
    });
    const narrative = summarizeReportNarrative(r);
    expect(narrative!.mitigationLine).toBe("No mitigation outcomes have been recorded yet.");
    expect(narrative!.netPositionLine).toBe("No net mitigation benefit to report yet.");
  });

  it("surfaces the unmapped-gap caveat as an explicit part of the narrative, not a silent omission", () => {
    const r = report({
      exposure: { countByConfidence: { known: 1, estimated: 0, unresolved: 0 }, countByCancellationStatus: {}, totalGrossReporting: 1, totalNetReporting: 1, totalGrossReportingKnownOnly: 1, totalNetReportingKnownOnly: 1 },
      unmappedGapCount: 2,
    });
    const narrative = summarizeReportNarrative(r);
    expect(narrative!.gapCaveat).toBe("2 parts could not be mapped as of the last calculation and are excluded from every total above, not counted as zero exposure.");
  });

  it("gapCaveat is null when there are no unmapped gaps", () => {
    const r = report({
      exposure: { countByConfidence: { known: 1, estimated: 0, unresolved: 0 }, countByCancellationStatus: {}, totalGrossReporting: 1, totalNetReporting: 1, totalGrossReportingKnownOnly: 1, totalNetReportingKnownOnly: 1 },
    });
    expect(summarizeReportNarrative(r)!.gapCaveat).toBeNull();
  });
});

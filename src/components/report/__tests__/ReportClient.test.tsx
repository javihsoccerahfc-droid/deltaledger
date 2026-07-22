import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportClient } from "../ReportClient";
import type { EcoReport } from "@/domains/deltaledger/reports/ecoReport";

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

function renderReport(r: EcoReport) {
  return render(<ReportClient ecName="ECO-4471" report={r} outcomes={[]} records={[]} provenance={{}} />);
}

describe("ReportClient", () => {
  it("Phase 6C -- shows an honest empty state instead of a narrative when there's nothing to report", () => {
    renderReport(report());
    expect(screen.getByText("Nothing to report yet")).toBeInTheDocument();
  });

  it("Phase 6C -- leads with the executive narrative, naming exposure, mitigation, and net position", () => {
    renderReport(
      report({
        exposure: {
          countByConfidence: { known: 2, estimated: 0, unresolved: 0 },
          countByCancellationStatus: {},
          totalGrossReporting: 220000,
          totalNetReporting: 220000,
          totalGrossReportingKnownOnly: 220000,
          totalNetReportingKnownOnly: 220000,
        },
        outcomes: {
          countClosed: 1,
          countOpen: 1,
          totalEstimatedCostAvoidedFrozen: 0,
          totalActualCostAvoided: 40000,
          totalActualRealizedLoss: 0,
          totalNetMitigationBenefit: 40000,
        },
      })
    );
    expect(screen.getByText("$220,000.00 of net exposure across 2 records.")).toBeInTheDocument();
    expect(screen.getByText(/Of 2 recorded mitigation outcomes/)).toBeInTheDocument();
    expect(screen.getByText("Net mitigation benefit to date: $40,000.00.")).toBeInTheDocument();
  });

  it("Phase 6C -- surfaces the unmapped-gap caveat visibly when gaps exist", () => {
    renderReport(
      report({
        exposure: {
          countByConfidence: { known: 1, estimated: 0, unresolved: 0 },
          countByCancellationStatus: {},
          totalGrossReporting: 1000,
          totalNetReporting: 1000,
          totalGrossReportingKnownOnly: 1000,
          totalNetReportingKnownOnly: 1000,
        },
        unmappedGapCount: 3,
      })
    );
    expect(screen.getByText(/3 parts could not be mapped/)).toBeInTheDocument();
  });

  it("Phase 6D -- the Hero leads with EXECUTIVE SUMMARY, and the old redundant card grid is gone", () => {
    renderReport(
      report({
        exposure: {
          countByConfidence: { known: 2, estimated: 0, unresolved: 0 },
          countByCancellationStatus: {},
          totalGrossReporting: 220000,
          totalNetReporting: 220000,
          totalGrossReportingKnownOnly: 220000,
          totalNetReportingKnownOnly: 220000,
        },
      })
    );
    expect(screen.getByText("EXECUTIVE SUMMARY")).toBeInTheDocument();
    // The old per-card labels this Hero replaced should no longer exist as standalone cards.
    expect(screen.queryByText("Known exposure (net)")).not.toBeInTheDocument();
    expect(screen.queryByText("Known + estimated (net)")).not.toBeInTheDocument();
  });

  it("never renders trend language anywhere on the page", () => {
    renderReport(
      report({
        exposure: {
          countByConfidence: { known: 2, estimated: 1, unresolved: 1 },
          countByCancellationStatus: {},
          totalGrossReporting: 400000,
          totalNetReporting: 400000,
          totalGrossReportingKnownOnly: 300000,
          totalNetReportingKnownOnly: 300000,
        },
        outcomes: {
          countClosed: 1,
          countOpen: 0,
          totalEstimatedCostAvoidedFrozen: 0,
          totalActualCostAvoided: 10000,
          totalActualRealizedLoss: 2000,
          totalNetMitigationBenefit: 8000,
        },
      })
    );
    const bodyText = document.body.textContent?.toLowerCase() ?? "";
    for (const word of ["increase", "decrease", "trend", "improving", "worsening", "since last"]) {
      expect(bodyText).not.toContain(word);
    }
  });
});

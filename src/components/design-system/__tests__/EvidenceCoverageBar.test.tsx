import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceCoverageBar } from "../EvidenceCoverageBar";
import { getEvidenceCoverage } from "@/domains/deltaledger/workspaceSummary";

describe("EvidenceCoverageBar", () => {
  it("shows an em-dash, not a misleading 0%, when there's no exposure data yet", () => {
    render(<EvidenceCoverageBar coverage={getEvidenceCoverage([])} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("renders the correct coverage percentage from known/estimated/unresolved totals", () => {
    const coverage = getEvidenceCoverage([
      { id: "1", confidenceClassification: "known", netExposureValueReporting: 700 },
      { id: "2", confidenceClassification: "estimated", netExposureValueReporting: 200 },
      { id: "3", confidenceClassification: "unresolved", netExposureValueReporting: 100 },
    ]);
    render(<EvidenceCoverageBar coverage={coverage} />);
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("the full variant shows the dollar legend and per-tier counts; the compact variant does not", () => {
    const coverage = getEvidenceCoverage([{ id: "1", confidenceClassification: "known", netExposureValueReporting: 500 }]);

    const { rerender } = render(<EvidenceCoverageBar coverage={coverage} variant="full" />);
    expect(screen.getByText("1 record(s)")).toBeInTheDocument();

    rerender(<EvidenceCoverageBar coverage={coverage} variant="compact" />);
    expect(screen.queryByText("1 record(s)")).not.toBeInTheDocument();
  });

  it("exposes an accessible label describing the coverage for screen readers", () => {
    const coverage = getEvidenceCoverage([{ id: "1", confidenceClassification: "known", netExposureValueReporting: 500 }]);
    render(<EvidenceCoverageBar coverage={coverage} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/Evidence coverage/i);
  });
});

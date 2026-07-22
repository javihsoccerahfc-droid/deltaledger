import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LargestExposureList } from "../LargestExposureList";
import { getEvidenceCoverage } from "@/domains/deltaledger/workspaceSummary";

describe("LargestExposureList", () => {
  it("shows a specific empty message when nothing has been calculated", () => {
    render(<LargestExposureList entries={[]} />);
    expect(screen.getByText(/No exposure calculated yet/)).toBeInTheDocument();
  });

  it("renders each EC's name and total exposure, linking to its Exposure tab", () => {
    const entries = [
      {
        ecId: "ec-1",
        ecName: "ECU Supplier Change",
        readiness: { status: "ready" as const, blockingReasons: [], primaryReasonCode: null },
        coverage: getEvidenceCoverage([{ id: "1", confidenceClassification: "known" as const, netExposureValueReporting: 482000 }]),
      },
    ];
    render(<LargestExposureList entries={entries} />);
    const link = screen.getByRole("link", { name: /ECU Supplier Change/ });
    expect(link).toHaveAttribute("href", "/engineering-changes/ec-1/exposure");
    expect(screen.getByText("$482,000.00")).toBeInTheDocument();
  });
});

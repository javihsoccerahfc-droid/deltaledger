import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceTabs } from "../WorkspaceTabs";
import type { WorkspaceCompletion } from "@/domains/deltaledger/workspaceSummary";

vi.mock("next/navigation", () => ({
  usePathname: () => "/engineering-changes/ec-1/exposure",
}));

const baseCompletion: WorkspaceCompletion = {
  bomComplete: false,
  poComplete: false,
  mappingComplete: false,
  mappingPending: 0,
  exposureComplete: false,
  mitigationComplete: false,
  mitigationPending: 0,
};

describe("WorkspaceTabs", () => {
  it("renders Overview as the first tab, always present", () => {
    render(<WorkspaceTabs ecId="ec-1" completion={baseCompletion} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent("Overview");
  });

  it("marks the tab matching the current path as selected", () => {
    render(<WorkspaceTabs ecId="ec-1" completion={baseCompletion} />);
    const exposureTab = screen.getByRole("tab", { name: /Exposure/ });
    expect(exposureTab).toHaveAttribute("aria-selected", "true");
    const bomTab = screen.getByRole("tab", { name: /BOM Diff/ });
    expect(bomTab).toHaveAttribute("aria-selected", "false");
  });

  it("shows a checkmark for complete tabs and a pending badge for tabs awaiting review", () => {
    const completion: WorkspaceCompletion = { ...baseCompletion, bomComplete: true, mappingPending: 3 };
    render(<WorkspaceTabs ecId="ec-1" completion={completion} />);
    const bomTab = screen.getByRole("tab", { name: /BOM Diff/ });
    expect(bomTab).toHaveTextContent("✓");
    const mappingTab = screen.getByRole("tab", { name: /Mapping/ });
    expect(mappingTab).toHaveTextContent("3");
  });

  it("Overview never shows a completion checkmark or pending badge -- it's a destination, not a step", () => {
    render(<WorkspaceTabs ecId="ec-1" completion={baseCompletion} />);
    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    expect(overviewTab).not.toHaveTextContent("✓");
  });

  it("links point at /engineering-changes/{ecId}/{tab}", () => {
    render(<WorkspaceTabs ecId="ec-42" completion={baseCompletion} />);
    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    expect(overviewTab).toHaveAttribute("href", "/engineering-changes/ec-42/overview");
  });

  it("Phase 6B -- shows a stale dot on Exposure when the reason code is stale_exposure", () => {
    const completion: WorkspaceCompletion = { ...baseCompletion, exposureComplete: true };
    render(<WorkspaceTabs ecId="ec-1" completion={completion} staleReasonCode="stale_exposure" />);
    const exposureTab = screen.getByRole("tab", { name: /Exposure/ });
    expect(exposureTab.querySelector('[aria-label*="out of date"]')).toBeInTheDocument();
  });

  it("Phase 6B -- shows the same stale dot for mapping_changed_since_calculation", () => {
    const completion: WorkspaceCompletion = { ...baseCompletion, exposureComplete: true };
    render(<WorkspaceTabs ecId="ec-1" completion={completion} staleReasonCode="mapping_changed_since_calculation" />);
    const exposureTab = screen.getByRole("tab", { name: /Exposure/ });
    expect(exposureTab.querySelector('[aria-label*="out of date"]')).toBeInTheDocument();
  });

  it("Phase 6B -- shows a checkmark instead of a stale dot when exposure is complete and current", () => {
    const completion: WorkspaceCompletion = { ...baseCompletion, exposureComplete: true };
    render(<WorkspaceTabs ecId="ec-1" completion={completion} staleReasonCode={null} />);
    const exposureTab = screen.getByRole("tab", { name: /Exposure/ });
    expect(exposureTab).toHaveTextContent("✓");
    expect(exposureTab.querySelector('[aria-label*="out of date"]')).not.toBeInTheDocument();
  });

  it("Phase 6B -- an unrelated reason code (e.g. mapping_pending) never puts a stale dot on Exposure", () => {
    const completion: WorkspaceCompletion = { ...baseCompletion, exposureComplete: false, mappingPending: 2 };
    render(<WorkspaceTabs ecId="ec-1" completion={completion} staleReasonCode="mapping_pending" />);
    const exposureTab = screen.getByRole("tab", { name: /Exposure/ });
    expect(exposureTab.querySelector('[aria-label*="out of date"]')).not.toBeInTheDocument();
  });

  it("Phase 6B -- Explore and Alt. Demand are labeled optional and never show a completion checkmark", () => {
    render(<WorkspaceTabs ecId="ec-1" completion={baseCompletion} />);
    const exploreTab = screen.getByRole("tab", { name: /Explore/ });
    expect(exploreTab).toHaveTextContent("optional");
    expect(exploreTab).not.toHaveTextContent("✓");
    const altDemandTab = screen.getByRole("tab", { name: /Alt\. Demand/ });
    expect(altDemandTab).toHaveTextContent("optional");
  });
});

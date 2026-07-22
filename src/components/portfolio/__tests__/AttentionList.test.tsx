import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttentionList } from "../AttentionList";
import type { AttentionItem } from "@/domains/deltaledger/portfolioSummary";

const item = (overrides: Partial<AttentionItem> = {}): AttentionItem => ({
  ecId: "ec-1",
  ecName: "ECU Supplier Change",
  reasonLabel: "1 crosswalk mapping still needs review.",
  ctaLabel: "Review mapping",
  ctaTab: "mapping",
  urgency: "not_ready",
  ...overrides,
});

describe("AttentionList", () => {
  it("shows a calm, specific message when nothing needs attention -- not a generic empty state", () => {
    render(<AttentionList items={[]} />);
    expect(screen.getByText(/Nothing needs attention right now/)).toBeInTheDocument();
  });

  it("renders each item's EC name, reason, and a specific action -- not a generic 'view' link", () => {
    render(<AttentionList items={[item()]} />);
    expect(screen.getByText("ECU Supplier Change")).toBeInTheDocument();
    expect(screen.getByText("1 crosswalk mapping still needs review.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Review mapping" });
    expect(link).toHaveAttribute("href", "/engineering-changes/ec-1/mapping");
  });

  it("routes the action to the correct workspace tab for each reason type", () => {
    render(<AttentionList items={[item({ ecId: "ec-2", ctaLabel: "Recalculate", ctaTab: "exposure" })]} />);
    expect(screen.getByRole("link", { name: "Recalculate" })).toHaveAttribute("href", "/engineering-changes/ec-2/exposure");
  });
});

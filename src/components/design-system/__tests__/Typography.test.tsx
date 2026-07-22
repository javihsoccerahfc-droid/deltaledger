import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTitle, NarrativeConclusion, SectionHeader, MetricValue, Caption } from "../Typography";

describe("Typography scale", () => {
  it("PageTitle renders as an h1 with the fixed page-title treatment", () => {
    render(<PageTitle>Exposure Results</PageTitle>);
    const el = screen.getByRole("heading", { level: 1, name: "Exposure Results" });
    expect(el.className).toContain("text-2xl");
  });

  it("NarrativeConclusion is visually distinct from (larger/bolder than) plain body text", () => {
    render(<NarrativeConclusion>$340,000.00 of known exposure across supplier Bosch.</NarrativeConclusion>);
    const el = screen.getByText(/\$340,000\.00 of known exposure/);
    expect(el.className).toContain("text-xl");
    expect(el.className).toContain("font-semibold");
  });

  it("SectionHeader defaults to an h2 but can render as a different element", () => {
    render(<SectionHeader>Facts</SectionHeader>);
    expect(screen.getByRole("heading", { level: 2, name: "Facts" })).toBeInTheDocument();

    render(<SectionHeader as="h3">Applied Rules</SectionHeader>);
    expect(screen.getByRole("heading", { level: 3, name: "Applied Rules" })).toBeInTheDocument();
  });

  it("MetricValue uses the mono/tabular number treatment", () => {
    render(<MetricValue>$220,000.00</MetricValue>);
    const el = screen.getByText("$220,000.00");
    expect(el.className).toContain("data-num");
    expect(el.className).toContain("text-2xl");
  });

  it("Caption is the smallest, most muted tier", () => {
    render(<Caption>Calculated Jul 21, 2026</Caption>);
    const el = screen.getByText("Calculated Jul 21, 2026");
    expect(el.className).toContain("text-ink-soft");
  });
});

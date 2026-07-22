import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricTile } from "../MetricTile";

describe("MetricTile", () => {
  it("renders the label and value", () => {
    render(<MetricTile label="Known exposure" value="$482,000" />);
    expect(screen.getByText("Known exposure")).toBeInTheDocument();
    expect(screen.getByText("$482,000")).toBeInTheDocument();
  });

  it("applies the tone color class to the value, not the label", () => {
    render(<MetricTile label="Known exposure" value="$482,000" tone="success" />);
    const value = screen.getByText("$482,000");
    const label = screen.getByText("Known exposure");
    expect(value.className).toContain("text-status-success");
    expect(label.className).not.toContain("text-status-success");
  });

  it("defaults to neutral tone when none is specified", () => {
    render(<MetricTile label="Total" value="$0" />);
    expect(screen.getByText("$0").className).toContain("text-ink");
  });
});

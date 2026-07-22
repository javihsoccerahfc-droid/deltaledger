import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfoHero } from "../InfoHero";

describe("InfoHero", () => {
  it("renders the value with a light surface, not the dark Decision Hero treatment", () => {
    render(<InfoHero value="12 changes detected" />);
    const value = screen.getByText("12 changes detected");
    const surface = value.closest("div.bg-white");
    expect(surface).not.toBeNull();
    expect(surface?.className).not.toContain("bg-ink");
  });

  it("renders an eyebrow and supporting text when provided", () => {
    render(<InfoHero eyebrow="BOM DIFF" value="12 changes" supporting="Since the last comparison." />);
    expect(screen.getByText("BOM DIFF")).toBeInTheDocument();
    expect(screen.getByText("Since the last comparison.")).toBeInTheDocument();
  });

  it("omits the eyebrow and supporting rows entirely when not provided", () => {
    const { container } = render(<InfoHero value="12 changes" />);
    expect(container.querySelectorAll("p").length).toBe(0); // only the value div renders
  });
});

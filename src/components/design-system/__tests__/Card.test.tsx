import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardBody } from "../Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>content</Card>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("merges a custom className with the base styling rather than replacing it", () => {
    render(<Card className="custom-class">content</Card>);
    const el = screen.getByText("content");
    expect(el.className).toContain("custom-class");
    expect(el.className).toContain("border-line"); // base styling still present
  });

  it("Phase 6D -- carries a subtle depth cue (shadow), not just a flat border", () => {
    render(<Card>content</Card>);
    expect(screen.getByText("content").className).toContain("shadow-sm");
  });

  it("CardHeader and CardBody render their content within a Card", () => {
    render(
      <Card>
        <CardHeader>header text</CardHeader>
        <CardBody>body text</CardBody>
      </Card>
    );
    expect(screen.getByText("header text")).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
  });
});

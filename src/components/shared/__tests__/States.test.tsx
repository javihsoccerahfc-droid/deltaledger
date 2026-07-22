import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineFeedback } from "../States";

describe("InlineFeedback", () => {
  it("renders a success message in success styling", () => {
    render(<InlineFeedback type="success" message="Terms saved for Bosch." />);
    const el = screen.getByText("Terms saved for Bosch.");
    expect(el.className).toContain("text-status-success");
  });

  it("renders an error message in error styling", () => {
    render(<InlineFeedback type="error" message="Could not save terms." />);
    const el = screen.getByText("Could not save terms.");
    expect(el.className).toContain("text-status-critical");
  });
});

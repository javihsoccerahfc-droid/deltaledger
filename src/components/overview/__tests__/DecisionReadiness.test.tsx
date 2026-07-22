import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionReadiness } from "../DecisionReadiness";

describe("DecisionReadiness", () => {
  it("shows the not_ready verdict along with every specific blocking reason", () => {
    render(
      <DecisionReadiness
        readiness={{ status: "not_ready", blockingReasons: ["No BOM diff yet -- import the current and proposed BOM."], primaryReasonCode: "no_bom" }}
      />
    );
    expect(screen.getByText("Not ready for financial review")).toBeInTheDocument();
    expect(screen.getByText(/No BOM diff yet/)).toBeInTheDocument();
  });

  it("shows the needs_attention verdict distinctly from not_ready", () => {
    render(
      <DecisionReadiness
        readiness={{ status: "needs_attention", blockingReasons: ["1 exposure record is based on superseded PO data."], primaryReasonCode: "stale_exposure" }}
      />
    );
    expect(screen.getByText("Needs attention before you rely on this number")).toBeInTheDocument();
  });

  it("shows the ready verdict with no blocking reasons listed", () => {
    render(<DecisionReadiness readiness={{ status: "ready", blockingReasons: [], primaryReasonCode: null }} />);
    expect(screen.getByText("Ready for financial review")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("Phase 6D -- renders as the page's Decision Hero (dark surface), with the next action as a real link", () => {
    const { container } = render(
      <DecisionReadiness
        readiness={{ status: "not_ready", blockingReasons: ["No BOM diff yet."], primaryReasonCode: "no_bom" }}
        nextAction={{ label: "Import BOM Diff", href: "/engineering-changes/ec-1/boms" }}
      />
    );
    expect(container.querySelector(".bg-ink")).not.toBeNull();
    const link = screen.getByRole("link", { name: /Import BOM Diff/ });
    expect(link).toHaveAttribute("href", "/engineering-changes/ec-1/boms");
  });
});

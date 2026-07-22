import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextBar } from "../ContextBar";
import { getEvidenceCoverage } from "@/domains/deltaledger/workspaceSummary";

const emptyCoverage = getEvidenceCoverage([]);
const realCoverage = getEvidenceCoverage([{ id: "1", confidenceClassification: "known", netExposureValueReporting: 500 }]);

describe("ContextBar", () => {
  it("renders the EC name and description", () => {
    render(<ContextBar ecId="ec-1" name="ECU Supplier Change" description="Bosch to Continental" coverage={emptyCoverage} lastActivity={null} />);
    expect(screen.getByText("ECU Supplier Change")).toBeInTheDocument();
    expect(screen.getByText("Bosch to Continental")).toBeInTheDocument();
  });

  it("Phase 6B -- shows the next action as a real link when readiness isn't ready", () => {
    render(
      <ContextBar
        ecId="ec-1"
        name="ECU Supplier Change"
        description=""
        coverage={emptyCoverage}
        lastActivity={null}
        nextAction={{ label: "Review Mapping", href: "/engineering-changes/ec-1/mapping" }}
        readinessStatus="not_ready"
      />
    );
    const link = screen.getByRole("link", { name: /Review Mapping/ });
    expect(link).toHaveAttribute("href", "/engineering-changes/ec-1/mapping");
  });

  it("Phase 6B -- renders nothing extra when readiness is ready, even if nextAction were somehow passed", () => {
    render(
      <ContextBar
        ecId="ec-1"
        name="ECU Supplier Change"
        description=""
        coverage={emptyCoverage}
        lastActivity={null}
        nextAction={null}
        readinessStatus="ready"
      />
    );
    expect(screen.queryByRole("link", { name: /→/ })).not.toBeInTheDocument();
  });

  it("Phase 6B -- uses a calmer tone for needs_attention than for not_ready", () => {
    const { unmount } = render(
      <ContextBar
        ecId="ec-1"
        name="x"
        description=""
        coverage={emptyCoverage}
        lastActivity={null}
        nextAction={{ label: "Recalculate Exposure", href: "/engineering-changes/ec-1/exposure" }}
        readinessStatus="needs_attention"
      />
    );
    expect(screen.getByRole("link", { name: /Recalculate Exposure/ }).className).toContain("status-warning");
    unmount();

    render(
      <ContextBar
        ecId="ec-1"
        name="x"
        description=""
        coverage={emptyCoverage}
        lastActivity={null}
        nextAction={{ label: "Import BOM Diff", href: "/engineering-changes/ec-1/boms" }}
        readinessStatus="not_ready"
      />
    );
    expect(screen.getByRole("link", { name: /Import BOM Diff/ }).className).toContain("status-critical");
  });

  it("truncates a long name visually but keeps the full name available via a title attribute", () => {
    const longName = "A".repeat(200);
    render(<ContextBar ecId="ec-1" name={longName} description="" coverage={emptyCoverage} lastActivity={null} />);
    const heading = screen.getByText(longName);
    expect(heading).toHaveAttribute("title", longName);
    expect(heading.className).toContain("truncate");
  });

  it("Phase 6D -- the financial position anchor is always present, even with no exposure calculated yet (an honest 'not calculated' state, never a disappearing anchor)", () => {
    render(<ContextBar ecId="ec-1" name="EC" description="" coverage={emptyCoverage} lastActivity={null} />);
    expect(screen.getByTestId("context-bar-coverage-ec-1")).toBeInTheDocument();
    expect(screen.getByText("Current financial position")).toBeInTheDocument();
    expect(screen.getByText("Not calculated yet")).toBeInTheDocument();
  });

  it("renders the actual financial figure prominently, not just a compact bar, once real exposure data exists", () => {
    render(<ContextBar ecId="ec-1" name="EC" description="" coverage={realCoverage} lastActivity={null} />);
    expect(screen.getByTestId("context-bar-coverage-ec-1")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("Phase 6D -- carries no border of its own, so it merges seamlessly with WorkspaceTabs into one persistent shell rather than reading as two stacked boxes", () => {
    render(<ContextBar ecId="ec-1" name="EC" description="" coverage={realCoverage} lastActivity={null} />);
    const root = screen.getByText("EC").closest("div.bg-white");
    expect(root?.className).not.toContain("border-b");
  });

  it("renders last activity when provided, and omits the line entirely when there is none", () => {
    const { rerender } = render(
      <ContextBar ecId="ec-1" name="EC" description="" coverage={emptyCoverage} lastActivity="PO imported — just now" />
    );
    expect(screen.getByText("PO imported — just now")).toBeInTheDocument();

    rerender(<ContextBar ecId="ec-1" name="EC" description="" coverage={emptyCoverage} lastActivity={null} />);
    expect(screen.queryByText(/imported/)).not.toBeInTheDocument();
  });

  it("stacks context below the title at narrow widths instead of squeezing it beside the name (responsive class present)", () => {
    render(<ContextBar ecId="ec-1" name="EC" description="" coverage={realCoverage} lastActivity={null} />);
    const row = screen.getByText("EC").closest("div")?.parentElement;
    // flex-col by default, lg:flex-row only from the lg breakpoint up -- this is what
    // prevents the coverage bar from being squeezed into an unreadable sliver on a narrow
    // laptop, per the approved plan's explicit responsive requirement.
    expect(row?.className).toContain("flex-col");
    expect(row?.className).toContain("lg:flex-row");
  });
});

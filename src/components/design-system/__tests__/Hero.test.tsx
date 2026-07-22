import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero, HeroBreakdown } from "../Hero";

describe("Hero", () => {
  it("renders the value prominently on a dark surface", () => {
    render(<Hero value="$340,000.00" />);
    const value = screen.getByText("$340,000.00");
    expect(value).toBeInTheDocument();
    // The surface itself (not the value node) carries the dark background -- walk up to it.
    const surface = value.closest("div.bg-ink");
    expect(surface).not.toBeNull();
  });

  it("renders an eyebrow label with a tone-colored indicator dot, not a colored numeral", () => {
    render(<Hero eyebrow="EXPOSURE" value="$340,000.00" tone="critical" />);
    expect(screen.getByText("EXPOSURE")).toBeInTheDocument();
    // The value itself stays white/neutral regardless of tone -- only the dot carries color.
    expect(screen.getByText("$340,000.00").className).toContain("text-white");
    expect(screen.getByText("$340,000.00").className).not.toContain("text-status-critical");
  });

  it("renders supporting text and meta when provided", () => {
    render(<Hero value="$340,000.00" supporting="Across 3 suppliers." meta="Calculated Jul 21, 2026" />);
    expect(screen.getByText("Across 3 suppliers.")).toBeInTheDocument();
    expect(screen.getByText("Calculated Jul 21, 2026")).toBeInTheDocument();
  });

  it("renders an action slot when provided", () => {
    render(<Hero value="$340,000.00" action={<button>Recalculate</button>} />);
    expect(screen.getByRole("button", { name: "Recalculate" })).toBeInTheDocument();
  });

  it("omits the eyebrow row entirely when no eyebrow is given, rather than an empty gap", () => {
    const { container } = render(<Hero value="$340,000.00" />);
    expect(container.querySelector(".rounded-full")).toBeNull(); // no tone dot without an eyebrow
  });
});

describe("HeroBreakdown", () => {
  it("shows dollar rows for known/estimated and a count for unresolved -- never a $0 dollar claim", () => {
    render(<HeroBreakdown knownTotal={248000} estimatedTotal={74000} unresolvedCount={3} unresolvedLabel="supplier" />);
    expect(screen.getByText("$248,000.00")).toBeInTheDocument();
    expect(screen.getByText("$74,000.00")).toBeInTheDocument();
    expect(screen.getByText("3 suppliers")).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument();
  });

  it("omits a row entirely when its total/count is zero, rather than showing $0", () => {
    render(<HeroBreakdown knownTotal={100} estimatedTotal={0} unresolvedCount={0} />);
    expect(screen.getByText("Known")).toBeInTheDocument();
    expect(screen.queryByText("Estimated")).not.toBeInTheDocument();
    expect(screen.queryByText("Unresolved")).not.toBeInTheDocument();
  });

  it("renders nothing at all when every value is zero", () => {
    const { container } = render(<HeroBreakdown knownTotal={0} estimatedTotal={0} unresolvedCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("pluralizes the unresolved label correctly for a count of one", () => {
    render(<HeroBreakdown knownTotal={0} estimatedTotal={0} unresolvedCount={1} unresolvedLabel="supplier" />);
    expect(screen.getByText("1 supplier")).toBeInTheDocument();
  });
});

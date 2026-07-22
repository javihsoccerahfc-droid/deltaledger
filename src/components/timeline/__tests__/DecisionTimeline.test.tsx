import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionTimeline, TimelineEntry } from "../DecisionTimeline";

function entry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: "audit-1",
    action: "Created engineering change.",
    actor: "Javi",
    timestamp: "2026-07-01T00:00:00.000Z",
    entityType: "EngineeringChange",
    ...overrides,
  };
}

describe("DecisionTimeline", () => {
  it("shows a specific empty message when nothing has happened yet", () => {
    render(<DecisionTimeline entries={[]} />);
    expect(screen.getByText(/This engineering change's story starts/)).toBeInTheDocument();
  });

  it("renders entries oldest-first, like a story, not most-recent-first like a log", () => {
    render(
      <DecisionTimeline
        entries={[
          entry({ id: "2", action: "Second event", timestamp: "2026-07-02T00:00:00.000Z" }),
          entry({ id: "1", action: "First event", timestamp: "2026-07-01T00:00:00.000Z" }),
        ]}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("First event");
    expect(items[1]).toHaveTextContent("Second event");
  });

  it("shows the deterministic phase label alongside each entry", () => {
    render(<DecisionTimeline entries={[entry({ entityType: "ExposureRecord", action: "Exposure recalculated." })]} />);
    expect(screen.getByText("Exposure Understood")).toBeInTheDocument();
  });

  it("renders the actual action text, not a generic event name", () => {
    render(
      <DecisionTimeline
        entries={[entry({ action: "PN-4471 is now linked to ERP part 771-4471 -- this mapping will be used in the next exposure calculation." })]}
      />
    );
    expect(screen.getByText(/is now linked to ERP part/)).toBeInTheDocument();
  });
});

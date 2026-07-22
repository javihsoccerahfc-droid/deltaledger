import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentActivity } from "../RecentActivity";

describe("RecentActivity", () => {
  it("shows a specific empty message with no activity yet", () => {
    render(<RecentActivity entries={[]} />);
    expect(screen.getByText(/Nothing has happened yet/)).toBeInTheDocument();
  });

  it("renders each activity description", () => {
    render(<RecentActivity entries={[{ description: "PO re-imported — just now", ecId: "ec-1" }]} />);
    expect(screen.getByText("PO re-imported — just now")).toBeInTheDocument();
  });
});

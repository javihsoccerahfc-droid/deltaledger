import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlternateDemandClient } from "../AlternateDemandClient";

const createAlternateDemandSuggestionAction = vi.fn();
vi.mock("@/app/actions", () => ({
  createAlternateDemandSuggestionAction: (...args: unknown[]) => createAlternateDemandSuggestionAction(...args),
  approveAlternateDemandAction: vi.fn(),
  rejectAlternateDemandAction: vi.fn(),
  allocateAlternateDemandAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: { id: "u-1", name: "Pat", role: "part_data_owner" } }),
}));

beforeEach(() => {
  createAlternateDemandSuggestionAction.mockReset();
});

describe("AlternateDemandClient", () => {
  it("shows success feedback with a specific summary after suggesting alternate demand", async () => {
    createAlternateDemandSuggestionAction.mockResolvedValueOnce({ id: "ad-1" });
    render(<AlternateDemandClient ecId="ec-1" records={[]} exposureRecords={[]} allocations={[]} eligibleDiffEntries={[]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ERP part number/i), "771-4471");
    await user.type(screen.getByLabelText(/Qty available/i), "50");
    await user.click(screen.getByRole("button", { name: /^suggest$/i }));

    await waitFor(() => expect(screen.getByText("Suggested 50 unit(s) of 771-4471 as alternate demand.")).toBeInTheDocument());
  });

  it("shows an error instead of silence when the action fails", async () => {
    createAlternateDemandSuggestionAction.mockRejectedValueOnce(new Error("Part not eligible for this engineering change."));
    render(<AlternateDemandClient ecId="ec-1" records={[]} exposureRecords={[]} allocations={[]} eligibleDiffEntries={[]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ERP part number/i), "771-4471");
    await user.type(screen.getByLabelText(/Qty available/i), "50");
    await user.click(screen.getByRole("button", { name: /^suggest$/i }));

    await waitFor(() => expect(screen.getByText("Part not eligible for this engineering change.")).toBeInTheDocument());
  });

  it("a rapid double-click fires the action only once, not twice", async () => {
    createAlternateDemandSuggestionAction.mockResolvedValue({ id: "ad-1" });
    render(<AlternateDemandClient ecId="ec-1" records={[]} exposureRecords={[]} allocations={[]} eligibleDiffEntries={[]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ERP part number/i), "771-4471");
    await user.type(screen.getByLabelText(/Qty available/i), "50");

    const button = screen.getByRole("button", { name: /^suggest$/i });
    // Two clicks fired back-to-back, synchronously, before React necessarily has a chance to
    // commit the disabled state -- the scenario a real impatient double-click produces.
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(createAlternateDemandSuggestionAction).toHaveBeenCalled());
    expect(createAlternateDemandSuggestionAction).toHaveBeenCalledTimes(1);
  });

  it("Phase 6D -- the InfoHero shows an honest 'no alternate demand confirmed yet' state with zero allocations", () => {
    render(<AlternateDemandClient ecId="ec-1" records={[]} exposureRecords={[]} allocations={[]} eligibleDiffEntries={[]} />);
    expect(screen.getByText("No alternate demand confirmed yet")).toBeInTheDocument();
  });

  it("Phase 6D -- the InfoHero shows the confirmed offset quantity once allocations exist", () => {
    render(
      <AlternateDemandClient
        ecId="ec-1"
        records={[]}
        exposureRecords={[]}
        allocations={[{ id: "a-1", alternateDemandRecordId: "ad-1", exposureRecordId: "exp-1", quantityAllocated: 400, status: "active" }]}
        eligibleDiffEntries={[]}
      />
    );
    expect(screen.getByText("400 units offsetting exposure")).toBeInTheDocument();
  });
});

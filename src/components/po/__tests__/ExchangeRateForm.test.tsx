import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExchangeRateForm } from "../ExchangeRateForm";

const addExchangeRateAction = vi.fn();
vi.mock("@/app/actions", () => ({
  addExchangeRateAction: (...args: unknown[]) => addExchangeRateAction(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  addExchangeRateAction.mockReset();
});
vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: { id: "u-1", name: "Pat", role: "part_data_owner" } }),
}));

describe("ExchangeRateForm", () => {
  it("shows success feedback after saving a rate", async () => {
    addExchangeRateAction.mockResolvedValueOnce({ id: "rate-1" });
    render(<ExchangeRateForm currencies={["EUR"]} existingRates={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add rate/i }));
    await waitFor(() => expect(screen.getByText(/Rate saved: EUR → USD/)).toBeInTheDocument());
  });

  it("shows an error instead of silence when the action fails", async () => {
    addExchangeRateAction.mockRejectedValueOnce(new Error("Rate already recorded for this date."));
    render(<ExchangeRateForm currencies={["EUR"]} existingRates={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add rate/i }));
    await waitFor(() => expect(screen.getByText("Rate already recorded for this date.")).toBeInTheDocument());
  });
});

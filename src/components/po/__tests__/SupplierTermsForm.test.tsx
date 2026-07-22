import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupplierTermsForm } from "../SupplierTermsForm";

const addSupplierTermsAction = vi.fn();
vi.mock("@/app/actions", () => ({
  addSupplierTermsAction: (...args: unknown[]) => addSupplierTermsAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: { id: "u-1", name: "Pat", role: "part_data_owner" } }),
}));

const suppliers = [{ id: "sup-1", name: "Bosch" }];

beforeEach(() => {
  addSupplierTermsAction.mockReset();
});

describe("SupplierTermsForm", () => {
  it("shows clear success feedback after saving terms (Phase 6A: previously gave no feedback at all)", async () => {
    addSupplierTermsAction.mockResolvedValueOnce({ id: "terms-1" });
    render(<SupplierTermsForm suppliers={suppliers} activeTerms={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add terms/i }));

    await waitFor(() => expect(screen.getByText(/Terms saved for Bosch/)).toBeInTheDocument());
  });

  it("shows a clear error message instead of silence when saving fails", async () => {
    addSupplierTermsAction.mockRejectedValueOnce(new Error("Supplier not found."));
    render(<SupplierTermsForm suppliers={suppliers} activeTerms={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add terms/i }));

    await waitFor(() => expect(screen.getByText("Supplier not found.")).toBeInTheDocument());
  });

  it("renders a durable list of currently-active terms, independent of the form's last result", () => {
    render(
      <SupplierTermsForm
        suppliers={suppliers}
        activeTerms={[
          {
            supplierId: "sup-1",
            terms: [{ id: "t-1", ncnr: true, cancellationWindowDays: null, source: "verified_contract", validUntil: null }],
          },
        ]}
      />
    );
    expect(screen.getByText("Bosch: NCNR · verified contract")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MappingClient } from "../MappingClient";

const reviseMappingAction = vi.fn();
const revokeMappingAction = vi.fn();

vi.mock("@/app/actions", () => ({
  generateMappingSuggestionsAction: vi.fn(),
  setMappingErpIdAction: vi.fn(),
  setMappingTypeAction: vi.fn(),
  setAllocationRuleAction: vi.fn(),
  approveMappingAction: vi.fn(),
  rejectMappingAction: vi.fn(),
  reviseMappingAction: (...args: unknown[]) => reviseMappingAction(...args),
  revokeMappingAction: (...args: unknown[]) => revokeMappingAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

let mockCurrentUser = { id: "u-1", name: "Pat", role: "part_data_owner" as string };
vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: mockCurrentUser }),
}));

beforeEach(() => {
  reviseMappingAction.mockReset();
  revokeMappingAction.mockReset();
  mockCurrentUser = { id: "u-1", name: "Pat", role: "part_data_owner" };
});

function baseCrosswalk(overrides: Partial<Parameters<typeof MappingClient>[0]["crosswalks"][number]> = {}) {
  return {
    id: "cw-1",
    plmPartId: "PN-4471",
    erpPartId: "771-4471",
    matchMethod: "exact",
    confidence: 1,
    matchEvidence: null,
    reviewStatus: "unreviewed" as const,
    mappingType: "one_to_one" as const,
    ...overrides,
  };
}

describe("MappingClient", () => {
  it("warns when the ERP part number doesn't match anything in the imported PO data", () => {
    render(
      <MappingClient
        ecId="ec-1"
        crosswalks={[baseCrosswalk({ erpPartId: "NOT-IN-PO-DATA" })]}
        allocationRules={[]}
        eligiblePartIds={["PN-4471"]}
        poLinePartNumbers={["771-4471", "771-9999"]}
      />
    );
    expect(screen.getByText(/doesn't match any part number in the imported PO data/)).toBeInTheDocument();
  });

  it("shows no warning when the ERP part number matches real PO data", () => {
    render(
      <MappingClient
        ecId="ec-1"
        crosswalks={[baseCrosswalk({ erpPartId: "771-4471" })]}
        allocationRules={[]}
        eligiblePartIds={["PN-4471"]}
        poLinePartNumbers={["771-4471", "771-9999"]}
      />
    );
    expect(screen.queryByText(/doesn't match any part number/)).not.toBeInTheDocument();
  });

  it("the ERP part number match check is case-insensitive", () => {
    render(
      <MappingClient
        ecId="ec-1"
        crosswalks={[baseCrosswalk({ erpPartId: "771-4471" })]}
        allocationRules={[]}
        eligiblePartIds={["PN-4471"]}
        poLinePartNumbers={["771-4471".toLowerCase()]}
      />
    );
    expect(screen.queryByText(/doesn't match any part number/)).not.toBeInTheDocument();
  });

  it("the bulk-approve button is visibly disabled, not just non-functional, while an action is pending", () => {
    const manyHighConfidence = Array.from({ length: 3 }, (_, i) =>
      baseCrosswalk({ id: `cw-${i}`, plmPartId: `PN-${i}`, erpPartId: `ERP-${i}`, confidence: 0.99 })
    );
    render(
      <MappingClient
        ecId="ec-1"
        crosswalks={manyHighConfidence}
        allocationRules={[]}
        eligiblePartIds={manyHighConfidence.map((c) => c.plmPartId)}
        poLinePartNumbers={manyHighConfidence.map((c) => c.erpPartId)}
      />
    );
    const bulkButton = screen.getByRole("button", { name: /Approve all 3 high-confidence matches/ });
    // Not pending yet -- button should be enabled and carry the shared Button's disabled-opacity class
    // (present but inactive via the :disabled pseudo-class until isPending flips true).
    expect(bulkButton).not.toBeDisabled();
    expect(bulkButton.className).toContain("disabled:opacity-40");
  });

  it("renders an accessible label for the ERP part number field", () => {
    render(
      <MappingClient
        ecId="ec-1"
        crosswalks={[baseCrosswalk()]}
        allocationRules={[]}
        eligiblePartIds={["PN-4471"]}
        poLinePartNumbers={["771-4471"]}
      />
    );
    expect(screen.getByLabelText("ERP part number")).toBeInTheDocument();
  });

  it("Phase 6D -- the Decision Hero shows the review-queue bottleneck as the page's headline", () => {
    render(
      <MappingClient
        ecId="ec-1"
        crosswalks={[baseCrosswalk({ reviewStatus: "unreviewed" })]}
        allocationRules={[]}
        eligiblePartIds={["PN-4471"]}
        poLinePartNumbers={["771-4471"]}
      />
    );
    expect(screen.getByText("1 mapping needs review")).toBeInTheDocument();
  });

  it("Phase 6D -- shows an all-clear headline once every mapping is approved", () => {
    render(
      <MappingClient
        ecId="ec-1"
        crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
        allocationRules={[]}
        eligiblePartIds={["PN-4471"]}
        poLinePartNumbers={["771-4471"]}
      />
    );
    expect(screen.getByText("All mappings approved and current")).toBeInTheDocument();
  });

  describe("RevisionControls", () => {
    it("an approved mapping shows Revise and Revoke, not Approve/Reject", () => {
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      expect(screen.getByRole("button", { name: "Revise" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });

    it("a rejected mapping shows Reconsider instead of Revise/Revoke", () => {
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "rejected" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      expect(screen.getByRole("button", { name: "Reconsider" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    });

    it("clicking Revise opens an inline form pre-filled with the current ERP part number and mapping type", async () => {
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved", erpPartId: "771-4471", mappingType: "one_to_many" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revise" }));
      expect(screen.getByText("Revise this mapping")).toBeInTheDocument();
      const erpInput = screen.getByLabelText("ERP part number") as HTMLInputElement;
      expect(erpInput.value).toBe("771-4471");
    });

    it("Save revision requires a reason -- rejects an empty submission without calling the action", async () => {
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revise" }));
      await user.click(screen.getByRole("button", { name: "Save revision" }));
      expect(screen.getByText(/A reason is required/)).toBeInTheDocument();
      expect(reviseMappingAction).not.toHaveBeenCalled();
    });

    it("Save revision with a reason calls reviseMappingAction with the edited fields", async () => {
      reviseMappingAction.mockResolvedValueOnce({ success: true, created: { id: "cw-2" } });
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ id: "cw-1", reviewStatus: "approved", erpPartId: "771-OLD" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-OLD"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revise" }));
      const erpInput = screen.getByLabelText("ERP part number");
      await user.clear(erpInput);
      await user.type(erpInput, "771-NEW");
      await user.type(screen.getByLabelText("Reason (required)"), "Corrected part number");
      await user.click(screen.getByRole("button", { name: "Save revision" }));

      await waitFor(() =>
        expect(reviseMappingAction).toHaveBeenCalledWith(
          "ec-1",
          "cw-1",
          { erpPartId: "771-NEW", mappingType: "one_to_one" },
          "Corrected part number",
          { id: "u-1", name: "Pat", role: "part_data_owner" }
        )
      );
    });

    it("shows the server's error message instead of silence when a revision fails", async () => {
      reviseMappingAction.mockResolvedValueOnce({ success: false, message: "Another active mapping already covers this pair." });
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revise" }));
      await user.type(screen.getByLabelText("Reason (required)"), "test reason");
      await user.click(screen.getByRole("button", { name: "Save revision" }));
      await waitFor(() => expect(screen.getByText("Another active mapping already covers this pair.")).toBeInTheDocument());
    });

    it("Cancel returns to the idle Revise/Revoke buttons without calling the action", async () => {
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revise" }));
      expect(screen.getByText("Revise this mapping")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Revise this mapping")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Revise" })).toBeInTheDocument();
      expect(reviseMappingAction).not.toHaveBeenCalled();
    });

    it("clicking Revoke opens the revoke-specific form, distinct from Revise", async () => {
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revoke" }));
      expect(screen.getByText("Revoke this mapping")).toBeInTheDocument();
      expect(screen.queryByLabelText("ERP part number")).not.toBeInTheDocument(); // revoke keeps the same pair, no ERP field needed
    });

    it("Confirm revoke requires a reason", async () => {
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revoke" }));
      await user.click(screen.getByRole("button", { name: "Confirm revoke" }));
      expect(screen.getByText(/A reason is required/)).toBeInTheDocument();
      expect(revokeMappingAction).not.toHaveBeenCalled();
    });

    it("Confirm revoke with a reason calls revokeMappingAction", async () => {
      revokeMappingAction.mockResolvedValueOnce({ success: true, created: { id: "cw-2" } });
      const user = userEvent.setup();
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ id: "cw-1", reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      await user.click(screen.getByRole("button", { name: "Revoke" }));
      await user.type(screen.getByLabelText("Reason (required)"), "No longer trust this mapping");
      await user.click(screen.getByRole("button", { name: "Confirm revoke" }));

      await waitFor(() =>
        expect(revokeMappingAction).toHaveBeenCalledWith("ec-1", "cw-1", "No longer trust this mapping", {
          id: "u-1",
          name: "Pat",
          role: "part_data_owner",
        })
      );
    });

    it("a user without approval authority (e.g. a buyer) sees no Revise/Revoke/Reconsider controls", () => {
      mockCurrentUser = { id: "u-buyer", name: "Bob Buyer", role: "buyer" };
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ reviewStatus: "approved" })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      expect(screen.queryByRole("button", { name: "Revise" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    });
  });

  describe("lineage badge", () => {
    it("shows a 'Revised' badge for a mapping whose evidence indicates it replaced an earlier revision", () => {
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[
            baseCrosswalk({
              reviewStatus: "approved",
              matchEvidence: "Manual revision of a prior approved mapping: Corrected after supplier confirmation.",
            }),
          ]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      expect(screen.getByText(/↺ Revised/)).toBeInTheDocument();
    });

    it("shows a distinct 'Revoked & replaced' badge for a mapping that resulted from a revocation", () => {
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[
            baseCrosswalk({
              reviewStatus: "rejected",
              matchEvidence: "Revocation of a prior approved mapping: Discovered this mapping was incorrect.",
            }),
          ]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      expect(screen.getByText(/↺ Revoked & replaced/)).toBeInTheDocument();
    });

    it("shows no lineage badge for an original, freshly-generated suggestion", () => {
      render(
        <MappingClient
          ecId="ec-1"
          crosswalks={[baseCrosswalk({ matchEvidence: 'Exact string match against "771-4471" in the open PO import.' })]}
          allocationRules={[]}
          eligiblePartIds={["PN-4471"]}
          poLinePartNumbers={["771-4471"]}
        />
      );
      expect(screen.queryByText(/↺/)).not.toBeInTheDocument();
    });
  });
});

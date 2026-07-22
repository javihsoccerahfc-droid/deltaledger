import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MitigationClient } from "../MitigationClient";

vi.mock("@/app/actions", () => ({
  createMitigationActionCall: vi.fn(),
  recordSupplierResponseAction: vi.fn(),
  createOutcomeAction: vi.fn(),
  closeOutcomeAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: { id: "u-1", name: "Pat", role: "part_data_owner" } }),
}));

const record = { id: "exp-1", partId: "PN-1", exposureSourceSnapshotId: "snap-1", netExposureValueReporting: 10000 };
const snapshot = { id: "snap-1", quantityOpen: 100, unitPriceTransactionCurrency: 100 };

function renderClient(overrides: Partial<Parameters<typeof MitigationClient>[0]> = {}) {
  return render(
    <MitigationClient
      ecId="ec-1"
      records={[record]}
      snapshots={[snapshot]}
      mitigationActions={[]}
      responses={[]}
      outcomes={[]}
      {...overrides}
    />
  );
}

describe("MitigationClient", () => {
  it("Phase 6D -- shows an honest 'no outcomes yet' Hero when nothing has been recorded", () => {
    renderClient();
    expect(screen.getByText("No outcomes recorded yet")).toBeInTheDocument();
    expect(screen.getByText(/1 exposure record not yet started/)).toBeInTheDocument();
  });

  it("Phase 6D -- shows the amount recovered to date once outcomes are closed", () => {
    renderClient({
      mitigationActions: [{ id: "act-1", exposureRecordId: "exp-1", actionType: "cancel" }],
      outcomes: [{ id: "out-1", exposureRecordId: "exp-1", actualCostAvoided: 4000, actualRealizedLoss: 0, closedAt: "2026-07-01T00:00:00.000Z" }],
    });
    expect(screen.getAllByText("$4,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Recovered to date, across 1 closed outcome/)).toBeInTheDocument();
    expect(screen.getByText("Every mitigation case is closed.")).toBeInTheDocument();
  });

  it("Phase 6D -- flags an open outcome distinctly from a fully-closed one", () => {
    renderClient({
      mitigationActions: [{ id: "act-1", exposureRecordId: "exp-1", actionType: "cancel" }],
      outcomes: [{ id: "out-1", exposureRecordId: "exp-1", actualCostAvoided: 0, actualRealizedLoss: 0, closedAt: null }],
    });
    expect(screen.getByText(/1 outcome still open/)).toBeInTheDocument();
  });

  it("still shows the empty state (unaffected by the Hero addition) when there's nothing to mitigate at all", () => {
    renderClient({ records: [] });
    expect(screen.getByText("Nothing to mitigate yet")).toBeInTheDocument();
  });
});

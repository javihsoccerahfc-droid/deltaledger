import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExposureClient } from "../ExposureClient";

vi.mock("@/app/actions", () => ({
  calculateExposureAction: vi.fn(),
  getEvidenceExplanationAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: { id: "u-1", name: "Pat", role: "part_data_owner" } }),
}));

function record(overrides: Partial<Parameters<typeof ExposureClient>[0]["records"][number]> = {}) {
  return {
    id: "exp-1",
    partId: "PN-1",
    purchaseOrderLineId: "poline-1",
    exposureSourceSnapshotId: "snap-1",
    grossCommittedValueReporting: 220000,
    alternateDemandAdjustmentReporting: 0,
    netExposureValueReporting: 220000,
    confidenceClassification: "known" as const,
    cancellationStatus: "unknown",
    cancellationConfidence: "unverified" as const,
    formulaVersion: "v1",
    calculatedAt: "2026-07-01T00:00:00.000Z",
    classificationReason: null,
    ...overrides,
  };
}

const snapshot = {
  id: "snap-1",
  supplierId: "sup-1",
  purchaseOrderId: "po-1",
  purchaseOrderLineId: "poline-1",
  promisedReceiptDate: "2026-09-01",
  transactionCurrency: "USD",
  exchangeRate: 1,
  crosswalkVersionId: "cw-1",
  supplierTermsVersionId: null,
  sourceFiles: "[]",
  sourceRows: "[]",
  alternateDemandAllocationIds: "[]",
};

const supplier = { id: "sup-1", name: "Bosch" };
const purchaseOrder = { id: "po-1", poNumber: "PO-4471" };

function renderClient(records = [record()]) {
  return render(
    <ExposureClient
      ecId="ec-1"
      records={records}
      snapshots={[snapshot]}
      purchaseOrders={[purchaseOrder]}
      suppliers={[supplier]}
      mitigationActions={[]}
      canCalculate={true}
      provenance={{}}
    />
  );
}

describe("ExposureClient", () => {
  it("Phase 6D -- shows the total as the Hero's headline value, with the confidence breakdown as supporting detail", () => {
    renderClient();
    expect(screen.getAllByText("$220,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Affects 1 part across 1 supplier.")).toBeInTheDocument();
  });

  it("Phase 5 -- hides the breakdown rows when there's only one confidence bucket, since it would just repeat the headline value", () => {
    const { container } = renderClient(); // single record, all "known"
    expect(screen.getAllByText("$220,000.00").length).toBeGreaterThan(0);
    const hero = container.querySelector(".bg-ink");
    expect(hero?.textContent).not.toContain("Known");
  });

  it("Phase 6D -- makes the confidence composition explicit via the HeroBreakdown rows when exposure is mixed", () => {
    renderClient([
      record({ id: "exp-1", partId: "PN-1", netExposureValueReporting: 220000, confidenceClassification: "known" }),
      record({ id: "exp-2", partId: "PN-2", netExposureValueReporting: 90000, confidenceClassification: "estimated" }),
    ]);
    expect(screen.getByText("$310,000.00")).toBeInTheDocument(); // the Hero's total
    expect(screen.getAllByText("Known").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$220,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estimated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$90,000.00").length).toBeGreaterThan(0);
  });

  it("shows an honest empty-state message instead of a Hero when no exposure has been calculated yet", () => {
    renderClient([]);
    expect(screen.getByText("Calculate exposure to see the financial impact of this engineering change.")).toBeInTheDocument();
    expect(screen.getByText("Exposure hasn't been calculated yet")).toBeInTheDocument();
  });

  it("Phase 6C -- the confidence-vs-cancellation clarification is relocated next to the table, not the Hero", () => {
    renderClient();
    const clarification = screen.getByText(/independent findings, shown in separate columns below/);
    expect(clarification).toBeInTheDocument();
  });

  it("Phase 6D -- shows workflow status and a next action inside the Hero when provided", () => {
    render(
      <ExposureClient
        ecId="ec-1"
        records={[record()]}
        snapshots={[snapshot]}
        purchaseOrders={[purchaseOrder]}
        suppliers={[supplier]}
        mitigationActions={[]}
        canCalculate={true}
        provenance={{}}
        completion={{
          bomComplete: true,
          poComplete: true,
          mappingComplete: true,
          mappingPending: 0,
          exposureComplete: true,
          mitigationComplete: true,
          mitigationPending: 0,
        }}
        readiness={{ status: "needs_attention", blockingReasons: ["x"], primaryReasonCode: "mapping_changed_since_calculation" }}
        nextAction={{ label: "Recalculate Exposure", href: "/engineering-changes/ec-1/exposure" }}
      />
    );
    expect(screen.getByText("✓ Mapping complete")).toBeInTheDocument();
    expect(screen.getByText("⚠ Exposure stale after crosswalk revision")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Recalculate Exposure/ })).toBeInTheDocument();
  });
});

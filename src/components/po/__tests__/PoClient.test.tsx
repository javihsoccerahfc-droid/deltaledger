import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoClient } from "../PoClient";

vi.mock("@/app/actions", () => ({
  importPurchaseOrderAction: vi.fn(),
  addSupplierTermsAction: vi.fn(),
  addExchangeRateAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: { id: "u-1", name: "Pat", role: "part_data_owner" } }),
}));

describe("PoClient", () => {
  it("Phase 6D -- the InfoHero shows an honest 'no PO data imported yet' state", () => {
    render(<PoClient ecId="ec-1" purchaseOrders={[]} poLines={[]} suppliers={[]} exchangeRates={[]} activeSupplierTerms={[]} />);
    expect(screen.getByText("No PO data imported yet")).toBeInTheDocument();
  });

  it("Phase 6D -- the InfoHero shows lines/suppliers once PO data exists", () => {
    render(
      <PoClient
        ecId="ec-1"
        purchaseOrders={[{ id: "po-1", poNumber: "PO-1", supplierId: "sup-1" }]}
        poLines={[
          {
            id: "line-1",
            purchaseOrderId: "po-1",
            rawPartNumber: "771-1",
            quantityOpen: 100,
            unitPriceTransactionCurrency: 10,
            transactionCurrency: "USD",
            promisedReceiptDate: "2026-09-01",
          },
        ]}
        suppliers={[{ id: "sup-1", name: "Bosch" }]}
        exchangeRates={[]}
        activeSupplierTerms={[]}
      />
    );
    expect(screen.getByText("1 line across 1 supplier")).toBeInTheDocument();
  });
});

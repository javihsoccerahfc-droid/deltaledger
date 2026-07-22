import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupplierConcentrationList } from "../SupplierConcentrationList";

describe("SupplierConcentrationList", () => {
  it("shows a specific empty message when there's no supplier exposure yet", () => {
    render(<SupplierConcentrationList entries={[]} />);
    expect(screen.getByText(/No supplier exposure calculated yet/)).toBeInTheDocument();
  });

  it("renders supplier name, total exposure, and the number of engineering changes it touches", () => {
    render(
      <SupplierConcentrationList
        entries={[{ supplierId: "s-1", supplierName: "Bosch", totalExposure: 340000, engineeringChangeCount: 3 }]}
      />
    );
    expect(screen.getByText("Bosch")).toBeInTheDocument();
    expect(screen.getByText("$340,000.00")).toBeInTheDocument();
    expect(screen.getByText("3 engineering changes")).toBeInTheDocument();
  });

  it("uses singular phrasing for a count of one, and never the internal 'EC' abbreviation", () => {
    render(
      <SupplierConcentrationList
        entries={[{ supplierId: "s-1", supplierName: "Acme", totalExposure: 1000, engineeringChangeCount: 1 }]}
      />
    );
    expect(screen.getByText("1 engineering change")).toBeInTheDocument();
    expect(screen.queryByText(/\bEC\b/)).not.toBeInTheDocument();
  });
});

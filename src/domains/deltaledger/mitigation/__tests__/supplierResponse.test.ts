import { describe, it, expect } from "vitest";
import { recordSupplierResponse } from "@/domains/deltaledger/mitigation/supplierResponse";

describe("recordSupplierResponse", () => {
  it("records a valid full-cancellation response", () => {
    const result = recordSupplierResponse("mit-1", "accepted", 1000, 0, 0, 1000, "2026-07-20T00:00:00Z", "buyer-1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.response.quantityCancelled).toBe(1000);
    }
  });

  it("records a valid partial response (some cancelled, some received before action)", () => {
    const result = recordSupplierResponse("mit-1", "partially_accepted", 700, 0, 300, 1000, "t", "buyer-1");
    expect(result.success).toBe(true);
  });

  it("rejects quantities that together exceed the committed total", () => {
    const result = recordSupplierResponse("mit-1", "accepted", 800, 300, 0, 1000, "t", "buyer-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("1100");
    }
  });

  it("rejects negative quantities", () => {
    const result = recordSupplierResponse("mit-1", "accepted", -10, 0, 0, 1000, "t", "buyer-1");
    expect(result.success).toBe(false);
  });
});

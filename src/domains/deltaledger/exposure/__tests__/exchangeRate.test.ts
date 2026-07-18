import { describe, it, expect } from "vitest";
import { resolveExchangeRate } from "@/domains/deltaledger/exposure/exchangeRate";
import { ExchangeRateSnapshot } from "@/domains/deltaledger/types";

function rate(overrides: Partial<ExchangeRateSnapshot>): ExchangeRateSnapshot {
  return {
    id: "rate-1",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    rate: 1.1,
    rateDate: "2026-07-16",
    source: "manual upload",
    enteredBy: "u1",
    enteredAt: "2026-07-16T00:00:00Z",
    ...overrides,
  };
}

describe("resolveExchangeRate", () => {
  it("resolves same-currency trivially, with no snapshot required", () => {
    const result = resolveExchangeRate("USD", "USD", []);
    expect(result).toMatchObject({ resolved: true, rate: 1, snapshotId: null });
  });

  it("resolves a direct base->quote rate", () => {
    const r = rate({ baseCurrency: "EUR", quoteCurrency: "USD", rate: 1.08 });
    const result = resolveExchangeRate("EUR", "USD", [r]);
    expect(result).toMatchObject({ resolved: true, rate: 1.08, snapshotId: "rate-1" });
  });

  it("resolves by inverting an explicitly-entered reverse-pair rate", () => {
    const r = rate({ baseCurrency: "USD", quoteCurrency: "EUR", rate: 0.9 });
    const result = resolveExchangeRate("EUR", "USD", [r]);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.rate).toBeCloseTo(1 / 0.9, 10);
    }
  });

  it("is unresolved when no rate exists for the pair in either direction", () => {
    const result = resolveExchangeRate("GBP", "USD", [rate({ baseCurrency: "EUR", quoteCurrency: "USD" })]);
    expect(result.resolved).toBe(false);
  });
});

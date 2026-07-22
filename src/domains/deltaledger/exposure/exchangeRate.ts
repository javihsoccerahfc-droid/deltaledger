import { ExchangeRateSnapshot } from "../types";

export type ExchangeRateResolution =
  | { resolved: true; rate: number; rateDate: string; snapshotId: string | null }
  | { resolved: false; reason: string };

/**
 * Looks up the exchange rate to convert `transactionCurrency` into
 * `reportingCurrency`. If they're the same currency, the rate is trivially
 * 1 and no ExchangeRateSnapshot is required (snapshotId: null). Otherwise
 * requires an uploaded/manually-entered ExchangeRateSnapshot for that exact
 * currency pair — no live market-data API in V1, and no fallback to a
 * "close enough" rate from a different date or an inverted pair unless one
 * is explicitly provided.
 */
export function resolveExchangeRate(
  transactionCurrency: string,
  reportingCurrency: string,
  rates: ExchangeRateSnapshot[]
): ExchangeRateResolution {
  if (transactionCurrency === reportingCurrency) {
    return { resolved: true, rate: 1, rateDate: "", snapshotId: null };
  }

  const direct = rates.find(
    (r) => r.baseCurrency === transactionCurrency && r.quoteCurrency === reportingCurrency
  );
  if (direct) {
    return { resolved: true, rate: direct.rate, rateDate: direct.rateDate, snapshotId: direct.id };
  }

  const inverse = rates.find(
    (r) => r.baseCurrency === reportingCurrency && r.quoteCurrency === transactionCurrency
  );
  if (inverse && inverse.rate !== 0) {
    // An explicitly-entered inverse pair is still an explicitly-entered
    // rate, not a guess — inverting it is arithmetic, not an assumption
    // about a rate that was never provided.
    return { resolved: true, rate: 1 / inverse.rate, rateDate: inverse.rateDate, snapshotId: inverse.id };
  }

  return {
    resolved: false,
    reason: `No exchange rate available for ${transactionCurrency} -> ${reportingCurrency}.`,
  };
}

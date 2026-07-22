/**
 * Single source of truth for currency formatting across the app. Previously an inline
 * `const money = (n) => ...` helper was duplicated in a few places (starting with
 * engineering-changes/[id]/layout.tsx); consolidated here so every dollar figure in the
 * product formats identically, and so a future change (e.g. supporting a currency other than
 * USD reporting) only needs to happen in one place.
 */
export function formatMoney(amountUsd: number): string {
  return amountUsd.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** Whole-number percentage, e.g. 0.783 -> "78%". Used by evidence coverage and similar. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

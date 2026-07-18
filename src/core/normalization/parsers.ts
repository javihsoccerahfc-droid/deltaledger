// Deterministic parsing helpers, domain-agnostic. No AI involvement — every
// value here is derived by explicit code paths so results are reproducible.

export function parseDate(raw: string | number | null): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = normalizeYear(Number(m[3]));
    return toIso(year, Number(m[1]), Number(m[2]));
  }

  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return toIso(Number(m[3]), Number(m[1]), Number(m[2]));

  return null;
}

function normalizeYear(y: number): number {
  if (y >= 100) return y;
  return y < 50 ? 2000 + y : 1900 + y;
}

function toIso(year: number, month: number, day: number): string | null {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function parseCurrency(raw: string | number | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function cleanString(raw: string | number | null): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().replace(/\s+/g, " ");
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIsoDate + "T00:00:00Z").getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

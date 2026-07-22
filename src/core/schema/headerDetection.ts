import { RawTable } from "../ingestion/types";
import { ColumnMapping, TargetSchema } from "./mappingTypes";

// MOCKED "AI-ASSISTED" LAYER. Stands in for a future model call that would
// interpret unusual column headers. This deterministic alias + similarity
// matcher produces the same output shape (source column -> target field +
// confidence) so the mapping UI and review workflow can be built and
// exercised now, without wiring up a live LLM call in this prototype.

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

export function buildColumnMappings(table: RawTable, schema: TargetSchema): ColumnMapping[] {
  return table.headers.map((header, colIdx) => {
    const h = normalizeHeader(header);
    let best: { field: string; confidence: number } = { field: "unmapped", confidence: 0 };

    for (const field of schema.fields) {
      if (field.aliases.includes(h)) {
        best = { field: field.key, confidence: 1 };
        break;
      }
    }
    if (best.field === "unmapped") {
      for (const field of schema.fields) {
        for (const alias of field.aliases) {
          if (h.includes(alias) || alias.includes(h)) {
            best = { field: field.key, confidence: 0.72 };
            break;
          }
        }
        if (best.field !== "unmapped") break;
      }
    }

    const sampleValues = table.rows
      .slice(0, 3)
      .map((r) => (r[colIdx] === null || r[colIdx] === undefined ? "—" : String(r[colIdx])));

    return {
      sourceColumn: header,
      targetField: best.field as ColumnMapping["targetField"],
      confidence: best.confidence,
      sampleValues,
    };
  });
}

/**
 * Levenshtein-distance-based similarity, 0..1, folding case/punctuation.
 * Generic reusable utility — domains supply their own canonical value lists
 * (e.g. a canonical debtor roster) and call this to rank candidates.
 */
export function stringSimilarity(a: string, b: string, fold: (s: string) => string = (s) => s.toUpperCase().trim()): number {
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb) return 1;
  const longer = fa.length > fb.length ? fa : fb;
  const shorter = fa.length > fb.length ? fb : fa;
  if (longer.length === 0) return 1;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function bestMatch(
  raw: string,
  candidates: string[],
  fold?: (s: string) => string
): { candidate: string; score: number } {
  let best = { candidate: raw, score: 0 };
  for (const candidate of candidates) {
    const score = stringSimilarity(raw, candidate, fold);
    if (score > best.score) best = { candidate, score };
  }
  return best;
}

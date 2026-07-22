import { db } from "../client";
import { bomImports, bomLines, bomDiffEntries } from "../schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import type { RawTable } from "@/core/ingestion/types";
import { normalizeBomLines } from "@/domains/deltaledger/ingestion/normalizeBom";
import { buildBomDiff } from "@/domains/deltaledger/bomDiff";
import type { BomLine as DomainBomLine } from "@/domains/deltaledger/types";
import type { Db } from "../client";

// The transaction handle drizzle passes into a db.transaction(async (tx) => ...) callback is
// a distinct (structurally similar, not identical) type from the plain Db client -- extracted
// here so recomputeBomDiff can accept either.
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

function toDomainBomLine(row: typeof bomLines.$inferSelect): DomainBomLine {
  return {
    id: row.id,
    bomImportId: row.bomImportId,
    partId: row.partId,
    rawPartNumber: row.rawPartNumber,
    rawDescription: row.rawDescription,
    quantityPer: row.quantityPer,
    quantityParseStatus: row.quantityParseStatus,
    parentBomLineId: row.parentBomLineId,
    sourceRow: row.sourceRow,
  };
}

/**
 * P0 remediation -- BOM re-import supersession, with deterministic write ordering and
 * concurrency safety. Previously, every import inserted a brand-new row with no relation to
 * any prior import for the same (EC, version), and reads had no ORDER BY, so which import
 * "won" after a re-import was not guaranteed to be the newest one. Now, a re-import
 * supersedes the prior active import for that exact slot, and a database-enforced partial
 * unique index (drizzle/*_bom_imports_active_invariant.sql) guarantees at most one active
 * row per (engineeringChangeId, versionLabel) at all times.
 *
 * Write ordering matters: the new row's id is generated in application code BEFORE any
 * write, so the prior active row can be superseded (its superseded_by_id set to the new
 * row's future id) BEFORE the new row is inserted. This way, at no point do two rows
 * simultaneously satisfy "active" for the same slot -- inserting the new row first (with the
 * old one still active) would violate the partial unique index immediately.
 *
 * A transaction-scoped advisory lock, keyed to (engineeringChangeId, versionLabel), is taken
 * before any of this -- SELECT ... FOR UPDATE alone cannot lock a row that doesn't exist yet,
 * so it cannot serialize two concurrent FIRST imports for the same slot on its own. The
 * advisory lock closes that gap; the partial unique index remains the final, always-on
 * database invariant, not the primary concurrency mechanism.
 */
export async function saveBomImport(
  ecId: string,
  versionLabel: "current" | "proposed",
  table: RawTable,
  sourceFileName: string,
  sourceSheet: string,
  importedBy: string
) {
  return db.transaction(async (tx) => {
    // Step 0: serialize all writers for this exact (ecId, versionLabel) slot.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bom_import'), hashtext(${`${ecId}:${versionLabel}`}))`);

    // Step 1: generate the new row's identity before any write.
    const newImportId = createId();

    // Step 2: find the current active row for this slot, if any. FOR UPDATE is redundant
    // with the advisory lock for callers going through this function, kept as defense in
    // depth against any future code path that might read/write this table directly.
    const [oldActive] = await tx
      .select({ id: bomImports.id })
      .from(bomImports)
      .where(
        and(eq(bomImports.engineeringChangeId, ecId), eq(bomImports.versionLabel, versionLabel), isNull(bomImports.supersededById))
      )
      .for("update");

    // Step 3: supersede the old row FIRST -- before the new row exists, so the count of rows
    // satisfying (ecId, versionLabel, superseded_by_id IS NULL) never exceeds one.
    if (oldActive) {
      await tx.update(bomImports).set({ supersededById: newImportId }).where(eq(bomImports.id, oldActive.id));
    }

    // Step 4: insert the new row using the pre-generated id.
    const [bomImport] = await tx
      .insert(bomImports)
      .values({
        id: newImportId,
        engineeringChangeId: ecId,
        versionLabel,
        ingestionMode: "current_and_proposed",
        sourceFile: sourceFileName,
        sourceSheet,
        importedBy,
        supersededById: null,
      })
      .returning();

    const lines: DomainBomLine[] = normalizeBomLines(bomImport.id, table, {
      fileName: sourceFileName,
      sheetName: sourceSheet,
      isUploaded: true,
    });

    if (lines.length > 0) {
      await tx.insert(bomLines).values(
        lines.map((l) => ({
          id: l.id,
          bomImportId: bomImport.id,
          partId: l.partId,
          rawPartNumber: l.rawPartNumber,
          rawDescription: l.rawDescription,
          quantityPer: l.quantityPer,
          quantityParseStatus: l.quantityParseStatus,
          parentBomLineId: l.parentBomLineId,
          sourceRow: l.sourceRow,
        }))
      );
    }

    await recomputeBomDiff(tx, ecId);
    return bomImport;
  });
}

/**
 * The diff is fully derived from both BOM sides and has no independent
 * history worth preserving on its own -- recomputed and replaced wholesale
 * whenever either side changes, rather than patched incrementally.
 *
 * Accepts the transaction handle (or the plain db client, outside a transaction) so callers
 * that need this atomic with a surrounding write can pass their `tx` through.
 *
 * Reads only the active row per version label (superseded_by_id IS NULL), with an explicit
 * ORDER BY as a defensive secondary tiebreaker -- the partial unique index guarantees this
 * ordering is never actually needed to pick between two "active" rows (that state is
 * unreachable), but it protects against ever silently returning an arbitrary row if that
 * invariant were ever violated by something outside this repository (e.g. a raw script).
 */
export async function recomputeBomDiff(dbOrTx: DbOrTx, ecId: string) {
  const imports = await dbOrTx
    .select()
    .from(bomImports)
    .where(and(eq(bomImports.engineeringChangeId, ecId), isNull(bomImports.supersededById)))
    .orderBy(desc(bomImports.createdAt), desc(bomImports.id));
  const currentImport = imports.find((i) => i.versionLabel === "current");
  const proposedImport = imports.find((i) => i.versionLabel === "proposed");
  if (!currentImport || !proposedImport) return; // need both sides before a diff means anything

  const currentLines = await dbOrTx.select().from(bomLines).where(eq(bomLines.bomImportId, currentImport.id));
  const proposedLines = await dbOrTx.select().from(bomLines).where(eq(bomLines.bomImportId, proposedImport.id));

  const diff = buildBomDiff(ecId, currentLines.map(toDomainBomLine), proposedLines.map(toDomainBomLine));

  await dbOrTx.delete(bomDiffEntries).where(eq(bomDiffEntries.engineeringChangeId, ecId));
  if (diff.length > 0) {
    await dbOrTx.insert(bomDiffEntries).values(
      diff.map((d) => ({
        engineeringChangeId: ecId,
        partId: d.partId,
        changeType: d.changeType,
        fromQuantity: d.fromQuantity,
        toQuantity: d.toQuantity,
        replacementPartId: d.replacementPartId,
      }))
    );
  }
}

export async function getBomImportsForEc(ecId: string) {
  const imports = await db
    .select()
    .from(bomImports)
    .where(and(eq(bomImports.engineeringChangeId, ecId), isNull(bomImports.supersededById)))
    .orderBy(desc(bomImports.createdAt), desc(bomImports.id));
  const result: Partial<Record<"current" | "proposed", { bomImport: typeof bomImports.$inferSelect; lines: DomainBomLine[] }>> = {};
  for (const imp of imports) {
    const lines = await db.select().from(bomLines).where(eq(bomLines.bomImportId, imp.id));
    result[imp.versionLabel] = { bomImport: imp, lines: lines.map(toDomainBomLine) };
  }
  return result;
}

export async function getBomDiffForEc(ecId: string) {
  const rows = await db.select().from(bomDiffEntries).where(eq(bomDiffEntries.engineeringChangeId, ecId));
  return rows.map((d) => ({
    id: d.id,
    engineeringChangeId: d.engineeringChangeId,
    partId: d.partId,
    changeType: d.changeType,
    fromQuantity: d.fromQuantity,
    toQuantity: d.toQuantity,
    replacementPartId: d.replacementPartId,
  }));
}

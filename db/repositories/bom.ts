import { db } from "../client";
import { bomImports, bomLines, bomDiffEntries } from "../schema";
import { eq } from "drizzle-orm";
import type { RawTable } from "@/core/ingestion/types";
import { normalizeBomLines } from "@/domains/deltaledger/ingestion/normalizeBom";
import { buildBomDiff } from "@/domains/deltaledger/bomDiff";
import type { BomLine as DomainBomLine } from "@/domains/deltaledger/types";

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

export async function saveBomImport(
  ecId: string,
  versionLabel: "current" | "proposed",
  table: RawTable,
  sourceFileName: string,
  sourceSheet: string,
  importedBy: string
) {
  const [bomImport] = await db
    .insert(bomImports)
    .values({
      engineeringChangeId: ecId,
      versionLabel,
      ingestionMode: "current_and_proposed",
      sourceFile: sourceFileName,
      sourceSheet,
      importedBy,
    })
    .returning();

  const lines: DomainBomLine[] = normalizeBomLines(bomImport.id, table, {
    fileName: sourceFileName,
    sheetName: sourceSheet,
    isUploaded: true,
  });

  if (lines.length > 0) {
    await db.insert(bomLines).values(
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

  await recomputeBomDiff(ecId);
  return bomImport;
}

/**
 * The diff is fully derived from both BOM sides and has no independent
 * history worth preserving on its own -- recomputed and replaced wholesale
 * whenever either side changes, rather than patched incrementally.
 */
async function recomputeBomDiff(ecId: string) {
  const imports = await db.select().from(bomImports).where(eq(bomImports.engineeringChangeId, ecId));
  const currentImport = imports.find((i) => i.versionLabel === "current");
  const proposedImport = imports.find((i) => i.versionLabel === "proposed");
  if (!currentImport || !proposedImport) return; // need both sides before a diff means anything

  const currentLines = await db.select().from(bomLines).where(eq(bomLines.bomImportId, currentImport.id));
  const proposedLines = await db.select().from(bomLines).where(eq(bomLines.bomImportId, proposedImport.id));

  const diff = buildBomDiff(ecId, currentLines.map(toDomainBomLine), proposedLines.map(toDomainBomLine));

  await db.delete(bomDiffEntries).where(eq(bomDiffEntries.engineeringChangeId, ecId));
  if (diff.length > 0) {
    await db.insert(bomDiffEntries).values(
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
  const imports = await db.select().from(bomImports).where(eq(bomImports.engineeringChangeId, ecId));
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

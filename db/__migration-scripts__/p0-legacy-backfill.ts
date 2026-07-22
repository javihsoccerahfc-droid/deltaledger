/**
 * P0 Data Integrity Remediation -- one-time legacy backfill script.
 *
 * Run ONCE, manually, after drizzle/0001_p0_data_integrity_remediation.sql has been applied
 * and committed, and BEFORE drizzle/0002_p0_enforce_constraints.sql is applied. See the
 * deployment checklist for the full sequencing and why this must be a separate step (not
 * folded into either migration file) -- it needs the actual TypeScript BOM-diff domain logic
 * (buildBomDiff), which raw SQL cannot run, and it must complete and be independently
 * validated before Migration B is allowed to enforce NOT NULL.
 *
 * Idempotent: safe to re-run. Every step only touches rows matching its own "not yet
 * backfilled" condition, so a partial prior run (e.g. a crash) is safely resumed, not
 * duplicated.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... CONFIRM_LEGACY_BACKFILL=yes npx tsx db/__migration-scripts__/p0-legacy-backfill.ts
 *
 * CONFIRM_LEGACY_BACKFILL=yes is required and deliberately not defaulted or inferred --
 * this script writes to whatever database DATABASE_URL points at, and unlike this
 * codebase's test suite (which has explicit checks preventing it from ever running
 * against what looks like a dev/prod database), this script has no way to independently
 * verify it's pointed at the intended target. Requiring an explicit, typed confirmation
 * is a deliberately cheap, low-effort safeguard against running this by copy-pasted
 * habit against the wrong environment.
 */
import { createId } from "@paralleldrive/cuid2";
import { sql, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { purchaseOrders, purchaseOrderImports, purchaseOrderLines, engineeringChanges, bomImports } from "../schema";
import { recomputeBomDiff } from "../repositories/bom";

async function main() {
  if (process.env.CONFIRM_LEGACY_BACKFILL !== "yes") {
    throw new Error(
      "Refusing to run: this script writes to whatever database DATABASE_URL points at " +
        `(currently: ${process.env.DATABASE_URL ?? "(not set)"}). ` +
        "Set CONFIRM_LEGACY_BACKFILL=yes explicitly once you've confirmed that's the intended target."
    );
  }

  console.log("P0 legacy backfill -- starting");

  // --- Pre-flight: the orphan-EC edge case (purchase_orders.engineering_change_id nullable) ---
  // This must be checked before backfilling -- a purchase_orders row with a NULL EC cannot
  // be assigned to any per-EC legacy batch (purchase_order_imports.engineering_change_id is
  // NOT NULL by design). If any exist, this is a separate, pre-existing data-quality issue
  // this script does not resolve on your behalf.
  const [{ count: orphanCount }] = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from purchase_orders where engineering_change_id is null`
  ).then((r) => r.rows as { count: string }[]);
  if (Number(orphanCount) > 0) {
    throw new Error(
      `Pre-flight check failed: ${orphanCount} purchase_orders row(s) have a NULL engineering_change_id. ` +
        `This backfill cannot assign them to a per-EC legacy batch. Resolve this data-quality issue ` +
        `(see the P0 remediation plan §3.3) before re-running this script.`
    );
  }
  console.log("Pre-flight check passed: no orphaned purchase_orders rows.");

  // --- Step 1: create one legacy batch per EC that has purchase_orders rows not yet
  // assigned to any batch. Bucketing them as "legacy, undifferentiated" is an honest
  // description -- these rows accumulated with no batch boundary at all before this
  // remediation, so this makes no claim about which specific historical upload created
  // any individual row (that information was never captured and cannot be reconstructed). ---
  const ecsNeedingBackfill = await db.execute<{ engineering_change_id: string }>(
    sql`select distinct engineering_change_id from purchase_orders where purchase_order_import_id is null and engineering_change_id is not null`
  );
  console.log(`Found ${ecsNeedingBackfill.rows.length} engineering change(s) needing a legacy PO batch.`);

  for (const row of ecsNeedingBackfill.rows as { engineering_change_id: string }[]) {
    const ecId = row.engineering_change_id;
    const legacyBatchId = createId();
    await db.insert(purchaseOrderImports).values({
      id: legacyBatchId,
      engineeringChangeId: ecId,
      sourceFile: "legacy-import (pre-migration, undifferentiated)",
      importedBy: "system",
      supersededById: null,
    });
    const backfilled = await db
      .update(purchaseOrders)
      .set({ purchaseOrderImportId: legacyBatchId })
      .where(sql`${purchaseOrders.engineeringChangeId} = ${ecId} and ${purchaseOrders.purchaseOrderImportId} is null`)
      .returning({ id: purchaseOrders.id });
    console.log(`  EC ${ecId}: created legacy batch ${legacyBatchId}, backfilled ${backfilled.length} purchase_orders row(s).`);
  }

  // --- Step 2: backfill purchase_order_lines.source_row for pre-existing rows. The true
  // original file row number was never captured before this column existed and cannot be
  // recovered -- this assigns a best-effort placeholder (row order within
  // purchase_order_lines grouped by purchase_order_id) and marks source_row_is_reconstructed
  // = true so these are always distinguishable from authentic values going forward. ---
  await db.execute(sql`
    with numbered as (
      select id, row_number() over (partition by purchase_order_id order by id) as rn
      from purchase_order_lines
      where source_row is null
    )
    update purchase_order_lines pl
    set source_row = numbered.rn, source_row_is_reconstructed = true
    from numbered
    where pl.id = numbered.id
  `);
  console.log("Backfilled purchase_order_lines.source_row for pre-existing rows (marked reconstructed).");

  // --- Step 3: recompute BOM diffs for every EC, now that Migration A's duplicate
  // reconciliation has made "the active current/proposed import" deterministic. Without
  // this, an EC that previously had duplicate active bom_imports rows (the bug this whole
  // remediation exists to fix) could have a stale diff computed against whichever row the
  // old, unordered `.find()` happened to pick. ---
  const allEcs = await db.select({ id: engineeringChanges.id }).from(engineeringChanges);
  let recomputed = 0;
  for (const ec of allEcs) {
    const hasBomData = await db.select({ id: bomImports.id }).from(bomImports).where(eq(bomImports.engineeringChangeId, ec.id)).limit(1);
    if (hasBomData.length > 0) {
      await recomputeBomDiff(db, ec.id);
      recomputed++;
    }
  }
  console.log(`Recomputed BOM diffs for ${recomputed} engineering change(s) with existing BOM data.`);

  // --- Step 4: validate. Hard gate -- Migration B independently re-checks this too, but
  // failing fast here (before anyone even attempts Migration B) gives a clearer error. ---
  const [{ count: poNulls }] = (
    await db.execute<{ count: string }>(sql`select count(*)::text as count from purchase_orders where purchase_order_import_id is null`)
  ).rows as { count: string }[];
  const [{ count: lineNulls }] = (
    await db.execute<{ count: string }>(sql`select count(*)::text as count from purchase_order_lines where source_row is null`)
  ).rows as { count: string }[];

  if (Number(poNulls) > 0 || Number(lineNulls) > 0) {
    throw new Error(
      `Validation failed after backfill: ${poNulls} purchase_orders row(s) and ${lineNulls} ` +
        `purchase_order_lines row(s) still have NULL values. Do not proceed to Migration B.`
    );
  }

  console.log("Validation passed: zero NULLs remain in purchase_order_import_id and source_row.");
  console.log("P0 legacy backfill -- complete. Safe to apply drizzle/0002_p0_enforce_constraints.sql now.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

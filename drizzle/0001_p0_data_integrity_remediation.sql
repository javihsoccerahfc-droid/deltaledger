-- P0 Data Integrity Remediation -- Migration A (expand phase)
--
-- Safe to run while OLD application code is still live: every change here is additive
-- (new table, new NULLABLE columns) except source_row_is_reconstructed, which is safe to
-- add as NOT NULL directly because it has a constant DEFAULT (a fast, O(1) metadata-only
-- change in modern Postgres, not a full table rewrite) -- old code simply never
-- references any of these new columns/table.
--
-- Deliberately does NOT enforce NOT NULL on purchase_orders.purchase_order_import_id or
-- purchase_order_lines.source_row here -- see Migration B (0002_...), which must only be
-- applied AFTER the legacy backfill script has run and validated zero nulls remain (see
-- db/__migration-scripts__/p0-legacy-backfill.ts and the deployment checklist).
--
-- Runs in a single transaction (drizzle's migrator wraps every migration file this way) --
-- if anything below fails, the whole thing rolls back, including the new table.
--> statement-breakpoint

CREATE TABLE "purchase_order_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"engineering_change_id" text NOT NULL,
	"source_file" text NOT NULL,
	"imported_by" text NOT NULL,
	"superseded_by_id" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint

ALTER TABLE "bom_imports" ADD COLUMN "superseded_by_id" text;
--> statement-breakpoint

-- Deliberately, permanently nullable -- see the column's own comment in db/schema.ts.
-- Pre-existing exposure_source_snapshots rows predate per-import PO tracking entirely;
-- before this remediation, PO data accumulated with no batch boundary, so a historical
-- snapshot may have been calculated against a strict subset of what exists today.
-- Asserting a specific historical snapshot-to-batch link for those rows would be an
-- unverifiable, likely-false claim -- NULL honestly means "legacy: PO batch provenance
-- unavailable," never backfilled to a synthetic value.
ALTER TABLE "exposure_source_snapshots" ADD COLUMN "purchase_order_import_id" text;
--> statement-breakpoint

-- Nullable for now -- true original file row numbers were never captured before this
-- column existed and cannot be reconstructed for pre-existing rows beyond a best-effort
-- placeholder (see the backfill script). Enforced NOT NULL in Migration B, after backfill.
ALTER TABLE "purchase_order_lines" ADD COLUMN "source_row" integer;
--> statement-breakpoint

-- Safe to add as NOT NULL directly: constant DEFAULT, O(1) metadata-only change even on a
-- populated table. false for every pre-existing row (correct -- the backfill script will
-- flip this to true only for the specific rows it reconstructs).
ALTER TABLE "purchase_order_lines" ADD COLUMN "source_row_is_reconstructed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Nullable for now -- enforced NOT NULL in Migration B, after the legacy backfill script
-- assigns every pre-existing purchase_orders row to a synthetic "legacy, undifferentiated"
-- batch per EC (an honest bucket -- it makes no claim about which specific historical
-- upload event created any individual pre-existing row, unlike the exposure snapshot
-- column above, which would be making exactly that kind of unverifiable claim).
ALTER TABLE "purchase_orders" ADD COLUMN "purchase_order_import_id" text;
--> statement-breakpoint

ALTER TABLE "purchase_order_imports" ADD CONSTRAINT "purchase_order_imports_engineering_change_id_engineering_changes_id_fk" FOREIGN KEY ("engineering_change_id") REFERENCES "public"."engineering_changes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "exposure_source_snapshots" ADD CONSTRAINT "exposure_source_snapshots_purchase_order_import_id_purchase_order_imports_id_fk" FOREIGN KEY ("purchase_order_import_id") REFERENCES "public"."purchase_order_imports"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ============================================================================
-- Legacy duplicate BOM import detection + deterministic reconciliation.
--
-- Before this remediation, saveBomImport() had no supersession concept at all -- every
-- import inserted a brand-new row with no relation to any prior import for the same
-- (engineering_change_id, version_label). If any EC in this database was already
-- re-imported before this fix shipped, it now has MULTIPLE bom_imports rows that would
-- all satisfy "active" (superseded_by_id IS NULL) once that column is added above -- which
-- would immediately violate the partial unique index below the moment it's created.
--
-- This single statement detects every such group and reconciles it deterministically:
-- for each (engineering_change_id, version_label) with more than one row, order the rows
-- by (created_at ASC, id ASC) -- a fixed, total, reproducible ordering -- and set each
-- row's superseded_by_id to the NEXT row's id in that order. The newest row in each group
-- (last in the ordering) keeps superseded_by_id = NULL and becomes the sole active row.
-- This produces a genuine linear supersession chain (oldest -> ... -> newest), not an
-- arbitrary pick, and requires no PL/pgSQL looping.
--
-- For any (ecId, versionLabel) with only one row (the common case), this is a no-op: LEAD()
-- returns NULL, so that row's superseded_by_id stays NULL, exactly as it already is.
-- ============================================================================
WITH ordered AS (
  SELECT
    id,
    LEAD(id) OVER (
      PARTITION BY engineering_change_id, version_label
      ORDER BY created_at ASC, id ASC
    ) AS next_id
  FROM bom_imports
)
UPDATE bom_imports b
SET superseded_by_id = o.next_id
FROM ordered o
WHERE b.id = o.id AND o.next_id IS NOT NULL;
--> statement-breakpoint

-- Recomputing BOM diffs against the now-reconciled active rows (§ above) requires the
-- actual TypeScript domain diff logic (buildBomDiff), not raw SQL -- run via
-- db/__migration-scripts__/p0-legacy-backfill.ts's recomputeAllBomDiffs() step, which must
-- run AFTER this migration commits (see the deployment checklist). The reconciliation
-- above is what makes that recompute deterministic -- without it, the diff logic would
-- still be reading an arbitrary, unordered pick between duplicate active rows.

-- Safe to create now: the reconciliation above guarantees at most one row per
-- (engineering_change_id, version_label) has superseded_by_id IS NULL before this runs.
CREATE UNIQUE INDEX "bom_imports_one_active_per_version" ON "bom_imports" USING btree ("engineering_change_id","version_label") WHERE "bom_imports"."superseded_by_id" is null;
--> statement-breakpoint

-- Safe to create now: purchase_order_imports is a brand-new, empty table.
CREATE UNIQUE INDEX "po_imports_one_active_per_ec" ON "purchase_order_imports" USING btree ("engineering_change_id") WHERE "purchase_order_imports"."superseded_by_id" is null;

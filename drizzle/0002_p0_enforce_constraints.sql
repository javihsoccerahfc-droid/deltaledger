-- P0 Data Integrity Remediation -- Migration B (contract phase)
--
-- MUST NOT be applied until AFTER db/__migration-scripts__/p0-legacy-backfill.ts has run
-- successfully against this same database (see the deployment checklist). That script:
--   1. creates one "legacy, undifferentiated" purchase_order_imports batch per EC that has
--      pre-existing purchase_orders rows, and backfills purchase_orders.purchase_order_import_id
--      to point at it;
--   2. backfills purchase_order_lines.source_row with a best-effort reconstruction
--      (row order within purchase_order_lines grouped by purchase_order_id), marking
--      source_row_is_reconstructed = true for every row it touches;
--   3. recomputes BOM diffs for every EC, now that the duplicate-BOM reconciliation in
--      Migration A has made "the active current/proposed import" deterministic;
--   4. validates zero NULLs remain in both columns before exiting successfully.
--
-- The DO block below is a second, independent validation gate -- if the backfill script
-- was skipped or something wrote a new row in the gap between it and this migration, this
-- migration aborts cleanly (whole transaction rolled back) rather than silently enforcing
-- NOT NULL against data that would violate it.
--> statement-breakpoint

DO $$
DECLARE
  po_nulls integer;
  line_nulls integer;
BEGIN
  SELECT count(*) INTO po_nulls FROM purchase_orders WHERE purchase_order_import_id IS NULL;
  SELECT count(*) INTO line_nulls FROM purchase_order_lines WHERE source_row IS NULL;
  IF po_nulls > 0 THEN
    RAISE EXCEPTION 'Migration B aborted: % purchase_orders row(s) still have a NULL purchase_order_import_id. Run db/__migration-scripts__/p0-legacy-backfill.ts first.', po_nulls;
  END IF;
  IF line_nulls > 0 THEN
    RAISE EXCEPTION 'Migration B aborted: % purchase_order_lines row(s) still have a NULL source_row. Run db/__migration-scripts__/p0-legacy-backfill.ts first.', line_nulls;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "purchase_orders" ALTER COLUMN "purchase_order_import_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchase_order_import_id_purchase_order_imports_id_fk" FOREIGN KEY ("purchase_order_import_id") REFERENCES "public"."purchase_order_imports"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "purchase_orders_purchase_order_import_id_idx" ON "purchase_orders" USING btree ("purchase_order_import_id");
--> statement-breakpoint

ALTER TABLE "purchase_order_lines" ALTER COLUMN "source_row" SET NOT NULL;

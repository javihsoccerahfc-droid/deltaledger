import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * Runs migrations against the test database (idempotent -- drizzle skips
 * already-applied migrations) and truncates every table so each test FILE
 * starts from a clean slate. This replaces the old SQLite `:memory:`
 * pattern, where a fresh, automatically-isolated database was created per
 * test file; with a single shared Postgres test database, isolation has
 * to be explicit.
 */
export async function resetTestDatabase() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log_entries,
      financial_outcomes,
      supplier_responses,
      mitigation_actions,
      exposure_records,
      exposure_source_snapshots,
      alternate_demand_allocations,
      alternate_demand_records,
      crosswalk_allocation_rules,
      part_number_crosswalks,
      exchange_rate_snapshots,
      purchase_order_lines,
      purchase_orders,
      supplier_commitment_terms,
      suppliers,
      bom_diff_entries,
      bom_lines,
      bom_imports,
      engineering_changes,
      users,
      organizations
    RESTART IDENTITY CASCADE
  `);
}

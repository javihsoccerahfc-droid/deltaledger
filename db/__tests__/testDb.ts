import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * Truncates every table so each test FILE starts from a clean slate. This replaces the old
 * SQLite `:memory:` pattern, where a fresh, automatically-isolated database was created per
 * test file; with a single shared Postgres test database, isolation has to be explicit.
 *
 * Does NOT run migrations -- that now happens exactly once, in db/__tests__/globalSetup.ts,
 * before any test file (and therefore before this function) ever runs. Previously this
 * function called migrate() itself, and since Vitest runs test files across multiple parallel
 * workers by default, multiple workers' migrate() calls could race on
 * `CREATE SCHEMA IF NOT EXISTS "drizzle"` and hit
 * `duplicate key value violates unique constraint "pg_namespace_nspname_index"`. See
 * globalSetup.ts for the full explanation.
 */
export async function resetTestDatabase() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set. This test file talks to a real Postgres database and " +
        "refuses to guess or fall back to a hardcoded default (a hardcoded default role is " +
        "exactly what broke previously on a Postgres install using a non-default role). " +
        "Add it to .env.test or .env, e.g.:\n\n" +
        "  TEST_DATABASE_URL=postgresql://<your-local-role>@localhost:5432/deltaledger_test\n\n" +
        "Create the database once with: createdb deltaledger_test"
    );
  }
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

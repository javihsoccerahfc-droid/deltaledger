/**
 * Vitest `globalSetup` (see vitest.config.ts) -- runs exactly ONCE in the main process, before
 * Vitest spawns the worker pool that executes test files. This is the actual fix for:
 *
 *   duplicate key value violates unique constraint "pg_namespace_nspname_index"
 *
 * Root cause: Vitest runs test FILES concurrently across multiple workers by default (no
 * special flag needed to trigger this -- it's the standard `npm test` behavior). Previously,
 * every DB-touching test file called `resetTestDatabase()` in its own `beforeAll`, and that
 * function called `migrate(db, { migrationsFolder: "./drizzle" })` itself. drizzle's migrator
 * runs `CREATE SCHEMA IF NOT EXISTS "drizzle"` before applying migrations -- but "IF NOT
 * EXISTS" only prevents an error against a schema that already exists at the time Postgres
 * checks; it does not make the check-then-create atomic. When two workers' migrate() calls
 * land at effectively the same moment, both can pass the "not exists" check before either has
 * committed the CREATE, so both attempt the CREATE and one loses a duplicate-key race on
 * Postgres's internal pg_namespace catalog. This is a classic TOCTOU race, not something a
 * retry or a longer timeout fixes.
 *
 * The fix is structural: migrations must run exactly once, somewhere guaranteed to complete
 * before ANY test file's code executes. Vitest's globalSetup is exactly that -- unlike
 * setupFiles (which reruns per test-file worker), globalSetup runs a single time in the main
 * process before the worker pool is created. Individual test files no longer migrate at all
 * (see db/__tests__/testDb.ts) -- they only truncate, which is safe to keep per-file since
 * TRUNCATE takes a normal Postgres lock and simply serializes rather than racing on a catalog
 * uniqueness constraint.
 *
 * If TEST_DATABASE_URL isn't configured at all, this is a silent no-op -- consistent with
 * setupTestEnv.ts, since a test run consisting only of pure-domain-logic files (no Postgres
 * required) must still succeed with zero database configuration.
 *
 * IMPORTANT -- the test database is forced to a genuinely empty state every run (see the
 * `drop schema / create schema` below), not assumed to already be empty. Previously this
 * function only called `migrate()`, which silently assumed a clean starting point -- that
 * held in every verification run only because the database had been manually dropped and
 * recreated beforehand each time, an unstated operational assumption that was never enforced
 * in code. On a database left over from an earlier run (e.g. containing pre-P0-migration
 * `purchase_orders` rows with no `purchase_order_import_id`), Migration B's validation gate
 * correctly aborts rather than silently corrupting that data -- but the fix belongs here, not
 * there: a test database is disposable by design (the same reasoning behind
 * resolveTestDatabaseUrl.ts's "must contain test" safety check), so it should never be able
 * to carry state across runs in the first place.
 */
import { resolveTestDatabaseUrl } from "./resolveTestDatabaseUrl";

export default async function globalSetup() {
  const testDatabaseUrl = resolveTestDatabaseUrl();
  if (!testDatabaseUrl) return;

  process.env.DATABASE_URL = testDatabaseUrl;

  // Imported dynamically, and only here, so this module has no import-time side effects for
  // any test file that doesn't need a database -- db/client.ts constructs its connection pool
  // at import time, so it must only ever be imported after DATABASE_URL is confirmed correct.
  const { db } = await import("../client");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { sql } = await import("drizzle-orm");

  // Force a genuinely empty starting point, regardless of what existed before. Both schemas
  // must be dropped together: drizzle's own migration-tracking table lives in a SEPARATE
  // "drizzle" schema, not "public" -- dropping only "public" desyncs the two (drizzle would
  // still believe old migrations already ran, since that record survives, while the actual
  // tables are gone, producing a confusing "relation does not exist" error instead of a clean
  // re-migration). Safe here specifically because this only ever runs against
  // TEST_DATABASE_URL, which resolveTestDatabaseUrl() has already refused to proceed with
  // unless its name contains "test" and it differs from DATABASE_URL (the dev/prod target).
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);

  await migrate(db, { migrationsFolder: "./drizzle" });

  // db/client.ts's pool is a module-level singleton. This globalSetup process is separate from
  // every worker process that will later import db/client.ts fresh (each gets its own pool),
  // so it's safe, and good hygiene, to close this one now that migrations are applied.
  const pool = db.$client;
  await pool.end();
}

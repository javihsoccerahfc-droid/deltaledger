/**
 * Registered as a Vitest `setupFiles` entry (see vitest.config.ts) -- runs once per test-file
 * worker, before that file's own imports resolve. Its only job is making sure THIS worker's
 * process.env.DATABASE_URL points at the test database before db/client.ts is ever imported
 * (db/client.ts builds its connection pool at import time from process.env.DATABASE_URL).
 *
 * Migrations are NOT run here -- see db/__tests__/globalSetup.ts for why: running migrate()
 * once per worker (as this file used to do indirectly, via each test file's own beforeAll) is
 * exactly what caused two workers to race on `CREATE SCHEMA IF NOT EXISTS "drizzle"` and hit
 * `duplicate key value violates unique constraint "pg_namespace_nspname_index"`. Migrations
 * now run exactly once, in globalSetup, before any worker (and therefore before this file)
 * even starts. This file only resolves/validates the env var and applies it to this worker's
 * own process -- see resolveTestDatabaseUrl.ts for the full loading/safety-check logic shared
 * with globalSetup.
 */
import { resolveTestDatabaseUrl } from "./resolveTestDatabaseUrl";

const testDatabaseUrl = resolveTestDatabaseUrl();
if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

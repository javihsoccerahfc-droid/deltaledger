/**
 * Loads .env.test (preferred) or .env, and resolves+validates TEST_DATABASE_URL. Shared by:
 *   - db/__tests__/globalSetup.ts (runs exactly ONCE, before any test-file worker starts --
 *     this is what actually applies migrations, so they only ever run once, never racing)
 *   - db/__tests__/setupTestEnv.ts (runs once PER test-file worker, to make sure that worker's
 *     own process.env.DATABASE_URL points at the test database before that file's own imports
 *     resolve)
 *
 * Both need the identical env-loading and safety-check logic, so it lives here once rather
 * than in two places that could quietly drift apart.
 *
 * Returns null (does nothing further, throws nothing) if TEST_DATABASE_URL isn't set --
 * callers decide what that means for them (globalSetup skips migrating; setupTestEnv.ts
 * leaves process.env alone so pure-domain-logic tests, which never touch a database, are
 * unaffected; db/__tests__/testDb.ts's resetTestDatabase() is what raises a clear, scoped
 * error for the DB-touching tests that actually need it).
 *
 * IMPORTANT: the "TEST_DATABASE_URL must not equal DATABASE_URL" safety check compares against
 * the DEV url as literally DECLARED in .env/.env.test on disk, not against the live
 * process.env.DATABASE_URL. That's deliberate, not incidental: globalSetup.ts runs once in the
 * main process and sets process.env.DATABASE_URL = testDatabaseUrl there; every worker process
 * Vitest subsequently spawns inherits that already-mutated environment. If this check compared
 * against the live process.env.DATABASE_URL inside a worker, it would be comparing
 * testDatabaseUrl against itself (a false positive), since by the time a worker's
 * setupTestEnv.ts runs, DATABASE_URL has already been legitimately overwritten. Reading the
 * file directly sidesteps that entirely.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv, parse as parseDotenv } from "dotenv";

const root = resolve(__dirname, "../..");
const envTestPath = resolve(root, ".env.test");
const envPath = resolve(root, ".env");

function parseFileIfExists(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseDotenv(readFileSync(path));
}

export function resolveTestDatabaseUrl(): string | null {
  if (existsSync(envTestPath)) {
    loadDotenv({ path: envTestPath, quiet: true });
  } else if (existsSync(envPath)) {
    loadDotenv({ path: envPath, quiet: true });
  }

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) return null;

  // .env is the normal home for DATABASE_URL; .env.test (if it also happens to declare one)
  // takes precedence, mirroring the load order above.
  const declared = { ...parseFileIfExists(envPath), ...parseFileIfExists(envTestPath) };
  const declaredDevUrl = declared.DATABASE_URL;

  if (declaredDevUrl && declaredDevUrl === testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is identical to DATABASE_URL. The test suite truncates every table " +
        "between test files, so it refuses to run against what looks like your dev/prod " +
        "database. Point TEST_DATABASE_URL at a separate, disposable database."
    );
  }

  if (!/test/i.test(testDatabaseUrl)) {
    throw new Error(
      `TEST_DATABASE_URL ("${testDatabaseUrl}") does not look like a disposable test database ` +
        '(its name should contain "test"). Refusing to run destructive TRUNCATE operations ' +
        "against it in case this is a misconfiguration."
    );
  }

  return testDatabaseUrl;
}

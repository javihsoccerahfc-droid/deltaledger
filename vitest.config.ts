import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // Runs exactly ONCE, in the main process, before Vitest spawns any worker -- this is what
    // makes migrations race-free (see db/__tests__/globalSetup.ts). globalSetup is a root-level
    // option that runs before all projects below, regardless of each project's own parallelism
    // settings.
    globalSetup: ["./db/__tests__/globalSetup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/core/**/*.ts", "src/domains/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
    // Split into two projects so file-level parallelism can be controlled separately for each
    // group. This is the fix for:
    //   duplicate key value violates unique constraint "purchase_order_lines_pkey"
    // and for a created row going missing from a subsequent read in the same test file.
    //
    // Root cause: db/__tests__/{persistence,exposureFlow,importActions}.test.ts all mutate ONE
    // shared, live Postgres test database, and Vitest runs test files across multiple parallel
    // worker PROCESSES by default. Two problems fall out of that:
    //   1. src/domains/deltaledger/idGenerator.ts's defaultIdGenerator is an in-memory counter
    //      that starts fresh at 0 in every process (documented in that file's own comment as
    //      unsafe the moment more than one process can generate IDs concurrently). Two worker
    //      processes each generate "poline-1" as their first PO line ID, then both try to
    //      INSERT it into the same shared table -- a real primary-key collision.
    //   2. Each of these files' beforeAll calls resetTestDatabase(), which TRUNCATEs every
    //      shared table for that file's own isolation. If that runs in one worker while
    //      another worker's test is mid-execution, it silently deletes rows the other file
    //      just inserted.
    // Both are fundamentally "concurrent processes sharing one mutable external resource,"
    // not something a longer timeout or a retry fixes. The db/idGenerator.ts counter is
    // application code (out of scope here); the correct, minimal test-infrastructure fix is to
    // stop running these specific files concurrently WITH EACH OTHER, while leaving the other
    // 17 pure-domain-logic files fully parallel (they don't touch a database and are
    // unaffected). This is Vitest's own documented pattern for "tests share an external
    // resource like a database that can't handle concurrent access" --
    // https://vitest.dev/guide/parallelism.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["db/**/*.test.ts"],
          // Runs once per test-file worker in this project, before that worker's own imports
          // resolve -- see db/__tests__/setupTestEnv.ts for the full rationale. Scoped to this
          // project only: the "unit" project's files never touch a database and don't need it.
          setupFiles: ["./db/__tests__/setupTestEnv.ts"],
          // The actual fix: serialize ONLY these DB-touching files relative to each other.
          fileParallelism: false,
        },
      },
    ],
  },
});

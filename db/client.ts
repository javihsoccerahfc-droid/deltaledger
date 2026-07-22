import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. DeltaLedger connects to a real Postgres database " +
      "(local, Docker, or hosted) via this single environment variable -- it no " +
      "longer opens a local SQLite file. See README.md for setup instructions."
  );
}

// Most hosted Postgres providers (Vercel Postgres/Neon/Supabase/RDS, etc.)
// require SSL; a plain local/Docker Postgres on localhost typically doesn't
// have a certificate configured at all. Heuristic: assume SSL is required
// unless the connection string is explicitly pointed at localhost, with an
// explicit override available via PGSSL for anything that doesn't fit.
const isLocalConnection = /localhost|127\.0\.0\.1/.test(connectionString);
const sslOverride = process.env.PGSSL;
const useSsl = sslOverride ? sslOverride === "true" : !isLocalConnection;

// A module-level pool is intentional: on Vercel, a warm serverless function
// reuses this same module instance (and therefore the same pool) across
// invocations; only a cold start creates a new one. Pool size is kept small
// since each function instance only ever needs a handful of concurrent
// connections, not a large shared pool.
const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;

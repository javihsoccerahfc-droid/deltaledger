/**
 * `npm run db:status` -- prints exactly what database you're pointed at, which migrations
 * are recorded as applied, which migration files exist on disk, and which (if any) are
 * pending. Exists specifically because of a real incident: a wrong working directory caused
 * `drizzle-kit migrate` to silently find zero pending migrations, and there was no fast way
 * to see that from the outside. Run this FIRST whenever `npm run db:migrate` behaves
 * unexpectedly, before assuming the migration files themselves are wrong.
 *
 * Usage: DATABASE_URL=postgresql://... npm run db:status
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. This script needs it to know which database to inspect.");
    process.exit(1);
  }

  // Mask credentials before printing -- this script's whole point is diagnostic output that
  // might get pasted into a chat/ticket.
  const masked = databaseUrl.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
  console.log(`Target database: ${masked}`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Resolved migrations folder: ${resolve(process.cwd(), "./drizzle")}\n`);

  const journalPath = resolve(process.cwd(), "./drizzle/meta/_journal.json");
  let journal: { entries: { idx: number; tag: string; when: number }[] };
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  } catch {
    console.error(
      `Could not read ${journalPath}. This almost always means the command was run from the ` +
        `wrong directory -- drizzle resolves "./drizzle" relative to the current working ` +
        `directory, not the project root. cd to the project root and try again.`
    );
    process.exit(1);
  }

  console.log(`Migration files declared in the journal (${journal.entries.length}):`);
  for (const entry of journal.entries) {
    console.log(`  [${entry.idx}] ${entry.tag}`);
  }

  const dirFiles = readdirSync(resolve(process.cwd(), "./drizzle")).filter((f) => f.endsWith(".sql"));
  const missingFromDisk = journal.entries.filter((e) => !dirFiles.includes(`${e.tag}.sql`));
  if (missingFromDisk.length > 0) {
    console.error(
      `\nWARNING: the journal references migration(s) whose .sql file is missing from disk: ` +
        missingFromDisk.map((e) => e.tag).join(", ")
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const trackingExists = await pool.query(
      `select exists (select 1 from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations') as exists`
    );
    if (!trackingExists.rows[0].exists) {
      console.log("\nNo drizzle.__drizzle_migrations table exists yet -- this database has never been migrated.");
      console.log(`Pending: all ${journal.entries.length} migration(s).`);
      return;
    }

    const applied = await pool.query(`select hash, created_at from drizzle.__drizzle_migrations order by created_at`);
    console.log(`\nApplied migrations recorded in the database (${applied.rows.length}):`);
    for (const row of applied.rows) {
      console.log(`  hash=${row.hash.slice(0, 12)}...  created_at=${row.created_at}`);
    }

    const appliedHashes = new Set(applied.rows.map((r) => r.hash as string));
    const pending: string[] = [];
    for (const entry of journal.entries) {
      const filePath = resolve(process.cwd(), "./drizzle", `${entry.tag}.sql`);
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        continue; // already warned above
      }
      const hash = createHash("sha256").update(content).digest("hex");
      if (!appliedHashes.has(hash)) pending.push(entry.tag);
    }

    if (pending.length === 0) {
      console.log("\nUp to date -- every migration file's hash matches an applied record. Nothing pending.");
    } else {
      console.log(`\nPENDING (not yet applied to this database): ${pending.join(", ")}`);
      console.log("Run: npm run db:migrate");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

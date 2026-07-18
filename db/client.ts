import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = process.env.DELTALEDGER_DB_PATH ?? path.join(process.cwd(), "db", "deltaledger.sqlite");
const sqlite = new Database(DB_PATH === ":memory:" ? ":memory:" : DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;

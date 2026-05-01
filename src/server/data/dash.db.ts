import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { runMigrations } from "./migrations.ts";

export function getDashDb(path?: string) {
  let dbPath: string;

  if (path) {
    dbPath = path;
  } else if (process.env.DASH_DB_PATH) {
    dbPath = process.env.DASH_DB_PATH;
  } else if (process.env.BUN_TEST === "1" || process.env.NODE_ENV === "test") {
    // Prevent accidental production db access from tests that omit the path argument
    dbPath = ":memory:";
  } else {
    const DASH_DB_DIR = join(process.env.HOME ?? "~", ".git-ai-dash");
    if (!existsSync(DASH_DB_DIR)) {
      mkdirSync(DASH_DB_DIR, { recursive: true });
    }
    dbPath = join(DASH_DB_DIR, "db");
  }

  const db = new Database(dbPath);
  runMigrations(db);
  return db;
}

export const dashDb = getDashDb();
export default dashDb;

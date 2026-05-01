import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { runMigrations } from "./migrations.ts";

export function getDashDb(path?: string) {
  const DASH_DB_DIR = join(process.env.HOME ?? "~", ".git-ai-dash");
  const DEFAULT_DB_PATH = join(DASH_DB_DIR, "db");
  const dbPath = path ?? process.env.DASH_DB_PATH ?? DEFAULT_DB_PATH;

  if (!path && !process.env.DASH_DB_PATH && !existsSync(DASH_DB_DIR)) {
    mkdirSync(DASH_DB_DIR, { recursive: true });
  }

  const db = new Database(dbPath);
  runMigrations(db);
  return db;
}

export const dashDb = getDashDb();
export default dashDb;

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { runMigrations } from "./migrations.ts";

const DASH_DB_DIR = join(process.env.HOME ?? "~", ".git-ai-dash");
const DASH_DB_PATH = join(DASH_DB_DIR, "db");

if (!existsSync(DASH_DB_DIR)) {
  mkdirSync(DASH_DB_DIR, { recursive: true });
}

export const dashDb = new Database(DASH_DB_PATH);

// Run migrations on startup
runMigrations(dashDb);

export default dashDb;

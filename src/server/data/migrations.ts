import { Database } from "bun:sqlite";

export function runMigrations(db: Database) {
  db.run("PRAGMA foreign_keys = ON;");

  // 1. Repos
  db.run(`
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      project_hash TEXT,
      remote_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Sessions
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      model TEXT,
      started_at DATETIME NOT NULL,
      ended_at DATETIME,
      state TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );
  `);

  // 3. Events
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      ts DATETIME NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  // 4. Shadow Refs (Incremental capture between stops)
  db.run(`
    CREATE TABLE IF NOT EXISTS shadow_refs (
      session_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      head_commit TEXT,
      dirty_paths_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );
  `);

  // 5. Checkpoints (Commit consolidation)
  db.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      commit_sha TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      strategy TEXT,
      attribution_json TEXT,
      token_usage_json TEXT,
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );
  `);

  // 6. Checkpoint Sessions (M:N relationship)
  db.run(`
    CREATE TABLE IF NOT EXISTS checkpoint_sessions (
      checkpoint_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      PRIMARY KEY (checkpoint_id, session_id),
      FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  // 7. Commits Cache
  db.run(`
    CREATE TABLE IF NOT EXISTS commits (
      sha TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      message TEXT,
      author_name TEXT,
      author_email TEXT,
      date DATETIME NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );
  `);

  // Add token_usage_json to sessions (idempotent)
  try {
    db.run("ALTER TABLE sessions ADD COLUMN token_usage_json TEXT");
  } catch (_) {
    // Column already exists
  }

  // Add plan_markdown, plan_transcript_text, allowed_prompts_json to sessions (idempotent)
  try {
    db.run("ALTER TABLE sessions ADD COLUMN plan_markdown TEXT");
  } catch (_) {}

  try {
    db.run("ALTER TABLE sessions ADD COLUMN plan_transcript_text TEXT");
  } catch (_) {}

  try {
    db.run("ALTER TABLE sessions ADD COLUMN allowed_prompts_json TEXT");
  } catch (_) {}

  console.log("Migrations applied successfully.");
}

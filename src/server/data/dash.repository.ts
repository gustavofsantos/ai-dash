import type { Database } from "bun:sqlite";

export class DashRepository {
  constructor(private db: Database) {}

  getSessions(limit = 10) {
    return this.db.query(`
      SELECT s.*, r.path as workdir, 
             (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) as event_count
      FROM sessions s
      JOIN repos r ON s.repo_id = r.id
      ORDER BY s.started_at DESC
      LIMIT ?
    `).all(limit) as any[];
  }

  getSessionEvents(sessionId: string) {
    return this.db.query("SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC").all(sessionId) as any[];
  }

  getSession(id: string) {
    return this.db.query(`
      SELECT s.*, r.path as workdir
      FROM sessions s
      JOIN repos r ON s.repo_id = r.id
      WHERE s.id = ?
    `).get(id) as any;
  }

  getSessionCheckpoints(sessionId: string) {
    return this.db.query(`
      SELECT c.* FROM checkpoints c
      JOIN checkpoint_sessions cs ON c.id = cs.checkpoint_id
      WHERE cs.session_id = ?
      ORDER BY c.created_at DESC
    `).all(sessionId) as any[];
  }

  getStats() {
    return this.db.query(`
      SELECT 
        COUNT(*) as total_sessions,
        (SELECT COUNT(DISTINCT id) FROM repos) as total_projects
      FROM sessions
    `).get() as any;
  }

  getAllAttribution() {
    return this.db.query(`
      SELECT attribution_json FROM checkpoints WHERE attribution_json IS NOT NULL
    `).all() as any[];
  }

  getRepos() {
    return this.db.query("SELECT * FROM repos").all() as any[];
  }

  getRepoSessionCount(repoId: string) {
    return this.db.query("SELECT COUNT(*) as count FROM sessions WHERE repo_id = ?").get(repoId) as any;
  }

  getRepoCheckpoints(repoId: string) {
    return this.db.query("SELECT attribution_json FROM checkpoints WHERE repo_id = ? AND attribution_json IS NOT NULL").all(repoId) as any[];
  }

  getActivityByDay() {
    return this.db.query(`
      SELECT date(started_at) as date, COUNT(*) as sessions, 0 as lines
      FROM sessions
      GROUP BY date(started_at)
      ORDER BY date ASC
    `).all() as any[];
  }

  getSessionCount() {
    return (this.db.query("SELECT COUNT(*) as count FROM sessions").get() as any)?.count || 0;
  }

  getSessionsAfter(timestamp: number) {
    // timestamp is unix epoch in seconds
    const dateStr = new Date(timestamp * 1000).toISOString();
    return this.db.query(`
      SELECT s.*, r.path as workdir
      FROM sessions s
      JOIN repos r ON s.repo_id = r.id
      WHERE s.started_at > ?
      ORDER BY s.started_at ASC
    `).all(dateStr) as any[];
  }

  // --- Write Methods ---

  upsertRepo(id: string, path: string) {
    return this.db.run(
      "INSERT OR IGNORE INTO repos (id, path) VALUES (?, ?)",
      [id, path]
    );
  }

  insertSession(session: { id: string, repo_id: string, agent: string, model?: string, started_at: string, state?: string }) {
    return this.db.run(
      `INSERT OR IGNORE INTO sessions (id, repo_id, agent, model, started_at, state)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.id, session.repo_id, session.agent, session.model || "unknown", session.started_at, session.state || "active"]
    );
  }

  updateSession(id: string, updates: Record<string, any>) {
    const keys = Object.keys(updates);
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    return this.db.run(
      `UPDATE sessions SET ${setClause} WHERE id = ?`,
      [...Object.values(updates), id]
    );
  }

  insertEvent(event: { id: string, session_id: string, seq: number, ts: string, type: string, payload_json: string }) {
    return this.db.run(
      `INSERT INTO events (id, session_id, seq, ts, type, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [event.id, event.session_id, event.seq, event.ts, event.type, event.payload_json]
    );
  }

  getNextEventSeq(sessionId: string): number {
    const res = this.db.query("SELECT COALESCE(MAX(seq), -1) + 1 as next_seq FROM events WHERE session_id = ?").get(sessionId) as { next_seq: number };
    return res.next_seq;
  }

  upsertShadowRef(shadow: { session_id: string, repo_id: string, head_commit: string, dirty_paths_json: string, updated_at: string }) {
    return this.db.run(
      `INSERT OR REPLACE INTO shadow_refs (session_id, repo_id, head_commit, dirty_paths_json, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [shadow.session_id, shadow.repo_id, shadow.head_commit, shadow.dirty_paths_json, shadow.updated_at]
    );
  }

  deleteShadowRef(sessionId: string) {
    return this.db.run("DELETE FROM shadow_refs WHERE session_id = ?", [sessionId]);
  }

  getShadowRefsByRepo(repoId: string) {
    return this.db.query("SELECT * FROM shadow_refs WHERE repo_id = ?").all(repoId) as any[];
  }

  insertCheckpoint(checkpoint: { id: string, repo_id: string, commit_sha: string, strategy: string, attribution_json?: string }) {
    return this.db.run(
      "INSERT OR IGNORE INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES (?, ?, ?, ?, ?)",
      [checkpoint.id, checkpoint.repo_id, checkpoint.commit_sha, checkpoint.strategy, checkpoint.attribution_json || null]
    );
  }

  updateCheckpointAttribution(id: string, attributionJson: string) {
    return this.db.run("UPDATE checkpoints SET attribution_json = ? WHERE id = ?", [attributionJson, id]);
  }

  getCheckpointBySha(sha: string) {
    return this.db.query("SELECT * FROM checkpoints WHERE commit_sha = ?").get(sha) as any;
  }

  linkCheckpointSession(checkpointId: string, sessionId: string) {
    return this.db.run(
      "INSERT OR IGNORE INTO checkpoint_sessions (checkpoint_id, session_id) VALUES (?, ?)",
      [checkpointId, sessionId]
    );
  }

  insertCommit(commit: { sha: string, repo_id: string, message: string, author_name: string, author_email: string, date: string }) {
    return this.db.run(
      `INSERT OR IGNORE INTO commits (sha, repo_id, message, author_name, author_email, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [commit.sha, commit.repo_id, commit.message, commit.author_name, commit.author_email, commit.date]
    );
  }
}

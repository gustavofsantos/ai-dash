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
}

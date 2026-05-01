import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(process.env.HOME ?? "~", ".git-ai", "internal", "db");

const db = new Database(DB_PATH, { readonly: true });

export interface Session {
  id: string;
  workdir: string | null;
  tool: string;
  model: string;
  external_thread_id: string;
  commit_sha: string | null;
  human_author: string | null;
  total_additions: number;
  total_deletions: number;
  accepted_lines: number;
  overridden_lines: number;
  created_at: number;
  updated_at: number;
  messages: string;
}

export interface SessionDetail extends Session {
  agent_metadata: string | null;
}

export interface Stats {
  total_sessions: number;
  total_ai_lines: number;
  total_accepted: number;
  total_projects: number;
}

export function getStats(): Stats {
  return db
    .query<Stats>(
      `SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(total_additions), 0) as total_ai_lines,
        COALESCE(SUM(accepted_lines), 0) as total_accepted,
        COUNT(DISTINCT workdir) as total_projects
      FROM prompts`
    )
    .get()!;
}

export function getSessions(limit = 20, offset = 0): Session[] {
  return db
    .query<Session>(
      `SELECT id, workdir, tool, model, external_thread_id, commit_sha,
              human_author, total_additions, total_deletions, accepted_lines,
              overridden_lines, created_at, updated_at, messages
       FROM prompts
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
}

export function getSessionCount(): number {
  return db.query<{ count: number }>("SELECT COUNT(*) as count FROM prompts").get()!.count;
}

export function getSession(id: string): SessionDetail | null {
  return db.query<SessionDetail>("SELECT * FROM prompts WHERE id = ?").get(id) ?? null;
}

export function getProjectStats(): Array<{ project: string; sessions: number; ai_lines: number }> {
  return db
    .query<{ project: string; sessions: number; ai_lines: number }>(
      `SELECT
        COALESCE(workdir, 'unknown') as project,
        COUNT(*) as sessions,
        COALESCE(SUM(total_additions), 0) as ai_lines
       FROM prompts
       GROUP BY workdir
       ORDER BY sessions DESC
       LIMIT 10`
    )
    .all();
}

export function getActivityByDay(): Array<{ date: string; sessions: number; lines: number }> {
  return db
    .query<{ date: string; sessions: number; lines: number }>(
      `SELECT
        DATE(created_at, 'unixepoch') as date,
        COUNT(*) as sessions,
        COALESCE(SUM(total_additions), 0) as lines
       FROM prompts
       GROUP BY DATE(created_at, 'unixepoch')
       ORDER BY date ASC`
    )
    .all();
}

export interface RepositoryStat {
  project: string;
  sessions: number;
  ai_lines: number;
  accepted_lines: number;
  last_active: number;
  top_model: string;
  top_tool: string;
}

export function getRepositories(): RepositoryStat[] {
  return db
    .query<RepositoryStat>(
      `SELECT
        COALESCE(workdir, 'unknown') as project,
        COUNT(*) as sessions,
        COALESCE(SUM(total_additions), 0) as ai_lines,
        COALESCE(SUM(accepted_lines), 0) as accepted_lines,
        MAX(created_at) as last_active,
        (SELECT model FROM prompts p2 WHERE COALESCE(p2.workdir, 'unknown') = COALESCE(p.workdir, 'unknown')
          GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1) as top_model,
        (SELECT tool FROM prompts p3 WHERE COALESCE(p3.workdir, 'unknown') = COALESCE(p.workdir, 'unknown')
          GROUP BY tool ORDER BY COUNT(*) DESC LIMIT 1) as top_tool
       FROM prompts p
       GROUP BY workdir
       ORDER BY last_active DESC`
    )
    .all();
}

export function getModelStats(): Array<{ model: string; count: number }> {
  return db
    .query<{ model: string; count: number }>(
      `SELECT model, COUNT(*) as count
       FROM prompts
       GROUP BY model
       ORDER BY count DESC`
    )
    .all();
}

export function getSessionsAfter(timestamp: number): Session[] {
  return db
    .query<Session>(
      `SELECT id, workdir, tool, model, external_thread_id, commit_sha,
              human_author, total_additions, total_deletions, accepted_lines,
              overridden_lines, created_at, updated_at, messages
       FROM prompts
       WHERE created_at > ?
       ORDER BY created_at ASC`
    )
    .all(timestamp);
}

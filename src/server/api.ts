import { Hono } from "hono";
import {
  getStats,
  getSessions,
  getSessionCount,
  getSession,
  getProjectStats,
  getActivityByDay,
  getModelStats,
  getRepositories,
} from "./db.ts";

import { parseGeminiTranscript } from "./gemini.ts";
import { dashDb } from "./dash_db.ts";

const api = new Hono().basePath("/api");
const PAGE_SIZE = 20;

function getDashSessions(limit = 10) {
  return dashDb.query(`
    SELECT s.*, r.path as workdir, 
           (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) as event_count
    FROM sessions s
    JOIN repos r ON s.repo_id = r.id
    ORDER BY s.started_at DESC
    LIMIT ?
  `).all(limit) as any[];
}

function getDashSession(id: string) {
  const session = dashDb.query(`
    SELECT s.*, r.path as workdir
    FROM sessions s
    JOIN repos r ON s.repo_id = r.id
    WHERE s.id = ?
  `).get(id) as any;

  if (session) {
    const events = dashDb.query(`
      SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC
    `).all(id) as any[];
    session.events = events.map(e => ({
      ...e,
      payload: JSON.parse(e.payload_json)
    }));
  }
  return session;
}

function getDashStats() {
  const result = dashDb.query(`
    SELECT 
      COUNT(*) as total_sessions,
      (SELECT COUNT(DISTINCT id) FROM repos) as total_projects
    FROM sessions
  `).get() as any;

  const attribution = dashDb.query(`
    SELECT attribution_json FROM checkpoints WHERE attribution_json IS NOT NULL
  `).all() as any[];

  let total_ai_lines = 0;
  let total_accepted = 0;

  for (const row of attribution) {
    try {
      const attr = JSON.parse(row.attribution_json);
      total_ai_lines += attr.ai_additions || 0;
      total_accepted += (attr.ai_additions || 0) - (attr.human_deletions || 0); // Simplified logic
    } catch (e) {}
  }

  return {
    total_sessions: result.total_sessions || 0,
    total_ai_lines,
    total_accepted,
    total_projects: result.total_projects || 0
  };
}

function getDashProjectStats() {
  const repos = dashDb.query("SELECT * FROM repos").all() as any[];
  const stats = [];

  for (const repo of repos) {
    const sessionCount = dashDb.query("SELECT COUNT(*) as count FROM sessions WHERE repo_id = ?").get(repo.id) as any;
    const checkpoints = dashDb.query("SELECT attribution_json FROM checkpoints WHERE repo_id = ? AND attribution_json IS NOT NULL").all(repo.id) as any[];
    
    let aiLines = 0;
    for (const cp of checkpoints) {
      try {
        const attr = JSON.parse(cp.attribution_json);
        aiLines += attr.ai_additions || 0;
      } catch (e) {}
    }

    stats.push({
      project: repo.path,
      sessions: sessionCount.count,
      ai_lines: aiLines
    });
  }
  return stats;
}

api.get("/stats", async (c) => {
  const legacyStats = getStats();
  const dashStats = getDashStats();
  
  const stats = {
    total_sessions: legacyStats.total_sessions + dashStats.total_sessions,
    total_ai_lines: legacyStats.total_ai_lines + dashStats.total_ai_lines,
    total_accepted: legacyStats.total_accepted + dashStats.total_accepted,
    total_projects: dashStats.total_projects // Assuming projects in dashDb are the ones we care about now
  };

  const projects = [...getProjectStats(), ...getDashProjectStats()].slice(0, 10);
  const activity = getActivityByDay(); // TODO: merge activity
  const models = getModelStats();
  
  const gitAiRecent = getSessions(10, 0);
  await Promise.all(gitAiRecent.map(s => enrichGeminiSession(s)));
  
  const dashRecent = getDashSessions(10);
  
  // Merge and sort
  const recent = [...gitAiRecent, ...dashRecent]
    .sort((a, b) => {
      const dateA = a.created_at || new Date(a.started_at).getTime() / 1000;
      const dateB = b.created_at || new Date(b.started_at).getTime() / 1000;
      return dateB - dateA;
    })
    .slice(0, 10);

  return c.json({
    stats,
    projects,
    activity,
    models,
    recent,
  });
});

api.get("/repositories", (c) => {
  const repos = getRepositories();
  return c.json({ repositories: repos });
});

api.get("/sessions", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  
  const gitAiSessions = getSessions(PAGE_SIZE, offset);
  await Promise.all(gitAiSessions.map(s => enrichGeminiSession(s)));
  
  const dashSessions = getDashSessions(PAGE_SIZE); // Simplified pagination for now

  const sessions = [...gitAiSessions, ...dashSessions].sort((a, b) => {
    const dateA = a.created_at || new Date(a.started_at).getTime() / 1000;
    const dateB = b.created_at || new Date(b.started_at).getTime() / 1000;
    return dateB - dateA;
  });

  const total = getSessionCount(); // Still using git-ai count for now
  
  return c.json({
    sessions,
    total,
    page,
    pageSize: PAGE_SIZE,
  });
});

api.get("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  
  // Try dashDb first
  const dashSession = getDashSession(id);
  if (dashSession) {
    return c.json(dashSession);
  }

  // Fallback to git-ai
  const session = getSession(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  await enrichGeminiSession(session);
  return c.json(session);
});

api.get("/sessions/:id/diff", async (c) => {
  const session = getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Not found" }, 404);

  if (!session.commit_sha || !session.workdir) {
    return c.json({ files: [] });
  }

  try {
    const raw = await Bun.$`git -C ${session.workdir} show ${session.commit_sha} --format="" --patch`.text();
    return c.json(parseDiff(raw));
  } catch {
    return c.json({ files: [] });
  }
});

interface ParsedDiffLine { type: 'context' | 'add' | 'remove'; content: string; }
interface ParsedDiffHunk { header: string; oldStart: number; newStart: number; lines: ParsedDiffLine[]; }
interface ParsedDiffFile { path: string; status: 'M' | 'A' | 'D' | 'R'; binary: boolean; additions: number; deletions: number; hunks: ParsedDiffHunk[]; }

function parseDiff(raw: string): { files: ParsedDiffFile[] } {
  const files: ParsedDiffFile[] = [];
  const sections = raw.split(/(?=^diff --git )/m).filter(s => s.startsWith('diff --git'));

  for (const section of sections) {
    const lines = section.split('\n');
    const pathMatch = lines[0].match(/diff --git a\/.+ b\/(.+)/);
    if (!pathMatch) continue;

    let path = pathMatch[1];
    let status: 'M' | 'A' | 'D' | 'R' = 'M';
    let binary = false;
    let additions = 0;
    let deletions = 0;
    const hunks: ParsedDiffHunk[] = [];
    let currentHunk: ParsedDiffHunk | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('new file mode')) {
        status = 'A';
      } else if (line.startsWith('deleted file mode')) {
        status = 'D';
      } else if (line.startsWith('rename to ')) {
        status = 'R';
        path = line.slice('rename to '.length);
      } else if (line.includes('Binary files')) {
        binary = true;
      } else if (line.startsWith('@@ ')) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        currentHunk = {
          header: line,
          oldStart: m ? parseInt(m[1]) : 0,
          newStart: m ? parseInt(m[2]) : 0,
          lines: []
        };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({ type: 'add', content: line.slice(1) });
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({ type: 'remove', content: line.slice(1) });
          deletions++;
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({ type: 'context', content: line.slice(1) });
        }
      }
    }

    files.push({ path, status, binary, additions, deletions, hunks });
  }

  return { files };
}

async function enrichGeminiSession(session: any) {
  if (session.tool === "gemini" && session.agent_metadata) {
    try {
      const metadata = typeof session.agent_metadata === 'string' 
        ? JSON.parse(session.agent_metadata) 
        : session.agent_metadata;
      
      if (metadata.transcript_path) {
        const enriched = await parseGeminiTranscript(metadata.transcript_path);
        if (enriched) {
          session.messages = JSON.stringify(enriched.messages);
          if (session.model === "unknown" && enriched.model) {
            session.model = enriched.model;
          }
        }
      }
    } catch (e) {
      console.error(`Error enriching Gemini session ${session.id}: ${e}`);
    }
  }
}

export default api;

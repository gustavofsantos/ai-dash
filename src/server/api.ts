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
import { existsSync, readFileSync } from "node:fs";

const api = new Hono().basePath("/api");
const PAGE_SIZE = 20;

function getDashSessions(limit = 10) {
  const sessions = dashDb.query(`
    SELECT s.*, r.path as workdir, 
           (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) as event_count
    FROM sessions s
    JOIN repos r ON s.repo_id = r.id
    ORDER BY s.started_at DESC
    LIMIT ?
  `).all(limit) as any[];

  for (const s of sessions) {
    const events = dashDb.query("SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC").all(s.id) as any[];
    const parsedEvents = events.map(e => ({ ...e, payload: JSON.parse(e.payload_json) }));
    const messages = dashEventsToMessages(parsedEvents);
    s.messages = JSON.stringify(messages);
    s.created_at = Math.floor(new Date(s.started_at).getTime() / 1000);
    s.tool = s.agent;
  }

  return sessions;
}

function dashEventsToMessages(events: any[]): any[] {
  // Check if we have a Stop event with a transcript_path
  const stopEvent = events.find(e => e.type === "Stop");
  const transcriptPath = stopEvent?.payload?.transcript_path;

  if (transcriptPath && existsSync(transcriptPath)) {
    try {
      const fileContent = readFileSync(transcriptPath, "utf8");
      const lines = fileContent.split("\n").filter(l => l.trim() !== "");
      const messages: any[] = [];
      
      for (const line of lines) {
        try {
          const p = JSON.parse(line);
          const msg = p.message;
          if (!msg) continue;

          if (msg.role === "user") {
            const text = Array.isArray(msg.content) 
              ? msg.content.map((c: any) => c.text || "").join("")
              : msg.content || "";
            if (text) {
              messages.push({ type: "user", text, timestamp: p.timestamp });
            }
          } else if (msg.role === "assistant") {
            if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === "text") {
                  messages.push({ type: "assistant", text: block.text, timestamp: p.timestamp });
                } else if (block.type === "tool_use") {
                  messages.push({ type: "tool_use", name: block.name, input: block.input, timestamp: p.timestamp });
                }
              }
            }
          }
        } catch (e) {}
      }
      if (messages.length > 0) return messages;
    } catch (e) {
      console.error("Failed to parse transcript from Stop event:", e);
    }
  }

  const messages: any[] = [];
  for (const event of events) {
    const p = event.payload;
    const ts = event.ts;

    switch (event.type) {
      case "UserPromptSubmit":
        messages.push({
          type: "user",
          text: p.prompt || p.text || "",
          timestamp: ts
        });
        break;
      
      case "PreToolUse":
        // Avoid duplicate tool uses if we already have them from a better source
        messages.push({
          type: "tool_use",
          name: p.tool_name || p.name,
          input: p.tool_input || p.input,
          timestamp: ts
        });
        break;
      
      case "Stop":
        if (p.last_assistant_message || p.text) {
          messages.push({
            type: "assistant",
            text: p.last_assistant_message || p.text,
            timestamp: ts
          });
        }
        break;
    }
  }
  return messages;
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

    // Convert events to messages for frontend compatibility
    const messages = dashEventsToMessages(session.events);
    session.messages = JSON.stringify(messages);
    
    // Convert dates to Unix timestamps for frontend consistency
    session.created_at = Math.floor(new Date(session.started_at).getTime() / 1000);
    session.updated_at = session.ended_at 
      ? Math.floor(new Date(session.ended_at).getTime() / 1000)
      : Math.floor(new Date().getTime() / 1000);
    
    session.tool = session.agent; // Frontend expects .tool

    // Calculate additions/deletions from checkpoints
    const checkpoints = dashDb.query(`
      SELECT attribution_json FROM checkpoints c
      JOIN checkpoint_sessions cs ON c.id = cs.checkpoint_id
      WHERE cs.session_id = ?
    `).all(session.id) as any[];

    let total_additions = 0;
    let total_deletions = 0;
    for (const cp of checkpoints) {
      try {
        const attr = JSON.parse(cp.attribution_json);
        total_additions += attr.ai_additions || 0;
        total_deletions += attr.ai_deletions || 0;
      } catch (e) {}
    }
    session.total_additions = total_additions;
    session.total_deletions = total_deletions;
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
  
  // Merge Activity
  const legacyActivity = getActivityByDay();
  const dashActivity = dashDb.query(`
    SELECT date(started_at) as date, COUNT(*) as sessions, 0 as lines
    FROM sessions
    GROUP BY date(started_at)
    ORDER BY date ASC
  `).all() as any[];
  
  // Simple merge by date
  const activityMap = new Map();
  legacyActivity.forEach(a => activityMap.set(a.date, a));
  dashActivity.forEach(a => {
    const existing = activityMap.get(a.date) || { date: a.date, sessions: 0, lines: 0 };
    activityMap.set(a.date, {
      ...existing,
      sessions: existing.sessions + a.sessions
    });
  });
  const activity = Array.from(activityMap.values()).sort((a, b) => a.date.localeCompare(b.date));

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
  const legacyRepos = getRepositories();
  const dashRepos = getDashProjectStats().map(r => ({
    project: r.project,
    sessions: r.sessions,
    ai_lines: r.ai_lines,
    accepted_lines: r.ai_lines, // Simplified
    last_active: Math.floor(Date.now() / 1000), // Simplified
    top_model: "claude-code"
  }));
  
  // Merge by project path
  const repoMap = new Map();
  legacyRepos.forEach(r => repoMap.set(r.project, r));
  dashRepos.forEach(r => {
    const existing = repoMap.get(r.project);
    if (existing) {
      repoMap.set(r.project, {
        ...existing,
        sessions: existing.sessions + r.sessions,
        ai_lines: existing.ai_lines + r.ai_lines,
        accepted_lines: existing.accepted_lines + r.accepted_lines
      });
    } else {
      repoMap.set(r.project, r);
    }
  });

  return c.json({ repositories: Array.from(repoMap.values()) });
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

  const dashCount = dashDb.query("SELECT COUNT(*) as count FROM sessions").get() as any;
  const total = getSessionCount() + (dashCount?.count || 0);
  
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
  const id = c.req.param("id");
  
  // Try dashDb sessions first
  const dashSession = getDashSession(id);
  if (dashSession) {
    // For local sessions, we look at associated checkpoints
    const checkpoints = dashDb.query(`
      SELECT c.* FROM checkpoints c
      JOIN checkpoint_sessions cs ON c.id = cs.checkpoint_id
      WHERE cs.session_id = ?
      ORDER BY c.created_at DESC
    `).all(id) as any[];

    if (checkpoints.length > 0) {
      const allFiles: any[] = [];
      for (const cp of checkpoints) {
        try {
          const raw = await Bun.$`git -C ${dashSession.workdir} show ${cp.commit_sha} --format="" --patch`.text();
          const parsed = parseDiff(raw);
          allFiles.push(...parsed.files);
        } catch (e) {}
      }
      return c.json({ files: allFiles });
    }
    return c.json({ files: [] });
  }

  const session = getSession(id);
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

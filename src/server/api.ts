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

const api = new Hono().basePath("/api");
const PAGE_SIZE = 20;

api.get("/stats", async (c) => {
  const stats = getStats();
  const projects = getProjectStats();
  const activity = getActivityByDay();
  const models = getModelStats();
  const recent = getSessions(10, 0);
  
  await Promise.all(recent.map(s => enrichGeminiSession(s)));

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
  const sessions = getSessions(PAGE_SIZE, offset);
  const total = getSessionCount();
  
  await Promise.all(sessions.map(s => enrichGeminiSession(s)));

  return c.json({
    sessions,
    total,
    page,
    pageSize: PAGE_SIZE,
  });
});

api.get("/sessions/:id", async (c) => {
  const session = getSession(c.req.param("id"));
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

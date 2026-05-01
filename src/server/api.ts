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

import { Hono } from "hono";
import {
  getStats,
  getSessions,
  getSessionCount,
  getSession,
  getProjectStats,
  getActivityByDay,
  getModelStats,
} from "./db.ts";

const api = new Hono().basePath("/api");
const PAGE_SIZE = 20;

api.get("/stats", (c) => {
  const stats = getStats();
  const projects = getProjectStats();
  const activity = getActivityByDay();
  const models = getModelStats();
  const recent = getSessions(10, 0);
  
  return c.json({
    stats,
    projects,
    activity,
    models,
    recent,
  });
});

api.get("/sessions", (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  const sessions = getSessions(PAGE_SIZE, offset);
  const total = getSessionCount();
  
  return c.json({
    sessions,
    total,
    page,
    pageSize: PAGE_SIZE,
  });
});

api.get("/sessions/:id", (c) => {
  const session = getSession(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  return c.json(session);
});

export default api;

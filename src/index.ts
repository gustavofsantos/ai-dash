import { Hono } from "hono";
import {
  getStats,
  getSessions,
  getSessionCount,
  getSession,
  getProjectStats,
  getActivityByDay,
  getModelStats,
} from "./db";
import {
  dashboardView,
  sessionsView,
  sessionDetailView,
  notFoundView,
} from "./views";

const app = new Hono();
const PAGE_SIZE = 20;

app.get("/", (c) => {
  const stats = getStats();
  const recent = getSessions(10, 0);
  const projects = getProjectStats();
  const activity = getActivityByDay();
  const models = getModelStats();
  return c.html(dashboardView(stats, recent, projects, activity, models));
});

app.get("/sessions", (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  const sessions = getSessions(PAGE_SIZE, offset);
  const total = getSessionCount();
  return c.html(sessionsView(sessions, total, page, PAGE_SIZE));
});

app.get("/sessions/:id", (c) => {
  const session = getSession(c.req.param("id"));
  if (!session) return c.html(notFoundView(), 404);
  return c.html(sessionDetailView(session));
});

app.notFound((c) => c.html(notFoundView(), 404));

const PORT = parseInt(process.env.PORT ?? "3333", 10);

const server = Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`Git AI Dashboard → http://localhost:${server.port}`);

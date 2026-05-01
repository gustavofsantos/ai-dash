import { Hono } from "hono";
import type { SessionService } from "../services/session.service.ts";

export function createSessionRoutes(sessionService: SessionService) {
  const app = new Hono();

  app.get("/", async (c) => {
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const sessions = await sessionService.getSessions(pageSize, offset);
    const total = sessionService.getSessionCount();

    return c.json({
      sessions,
      total,
      page,
      pageSize,
    });
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const session = await sessionService.getSession(id);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
  });

  app.get("/:id/diff", async (c) => {
    const id = c.req.param("id");
    const diff = await sessionService.getSessionDiff(id);
    if (!diff) return c.json({ error: "Session not found" }, 404);
    return c.json(diff);
  });

  return app;
}

import { Hono } from "hono";
import { logger } from "hono/logger";
import { DashRepository } from "./data/dash.repository.ts";
import { dashDb } from "./data/dash.db.ts";
import { GitService } from "./services/git.service.ts";
import { GeminiService } from "./services/gemini.service.ts";
import { SessionService } from "./services/session.service.ts";
import { AnalyticsService } from "./services/analytics.service.ts";
import { createSessionRoutes } from "./routes/sessions.ts";
import { createStatsRoutes } from "./routes/stats.ts";
import { createRepositoryRoutes } from "./routes/repositories.ts";
import { createAnalyticsRoutes } from "./routes/analytics.ts";
import { WsHub } from "./ws/hub.ts";
import { handleCollect } from "./ws/collection.ts";

export function createApp() {
  const app = new Hono().basePath("/api");
  app.use("*", logger());

  const dashRepo = new DashRepository(dashDb);
  const gitService = new GitService();
  const geminiService = new GeminiService();

  const sessionService = new SessionService(dashRepo, gitService, geminiService);
  const analyticsService = new AnalyticsService(dashRepo);
  const hub = new WsHub();

  app.route("/sessions", createSessionRoutes(sessionService));
  app.route("/stats", createStatsRoutes(analyticsService, sessionService));
  app.route("/repositories", createRepositoryRoutes(analyticsService));
  app.route("/analytics", createAnalyticsRoutes(analyticsService));

  return {
    api: app,
    websocket: hub.clientHandlers,
    collect: (req: Request) => handleCollect(req, dashRepo, (msg) => hub.broadcast(msg)),
  };
}

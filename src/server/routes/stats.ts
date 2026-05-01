import { Hono } from "hono";
import type { AnalyticsService } from "../services/analytics.service.ts";
import type { SessionService } from "../services/session.service.ts";

export function createStatsRoutes(
  analyticsService: AnalyticsService,
  sessionService: SessionService
) {
  const app = new Hono();

  app.get("/", async (c) => {
    const stats = analyticsService.getStats();
    const projects = analyticsService.getProjectStats().slice(0, 10);
    const activity = analyticsService.getActivityByDay();
    const recent = await sessionService.getSessions(10, 0);

    return c.json({
      stats,
      projects,
      activity,
      models: [], // Placeholder as we deprecated legacy model stats
      recent,
    });
  });

  return app;
}

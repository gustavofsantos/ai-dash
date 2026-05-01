import { Hono } from "hono";
import type { AnalyticsService } from "../services/analytics.service.ts";

export function createRepositoryRoutes(analyticsService: AnalyticsService) {
  const app = new Hono();

  app.get("/", (c) => {
    const repositories = analyticsService.getRepositories();
    return c.json({ repositories });
  });

  return app;
}

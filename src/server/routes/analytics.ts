import { Hono } from "hono";
import type { AnalyticsService } from "../services/analytics.service.ts";

export function createAnalyticsRoutes(analyticsService: AnalyticsService) {
  const app = new Hono();

  app.get("/", (c) => {
    const tokenByDay = analyticsService.getTokenUsageByDay();
    const filesByDay = analyticsService.getFileChangesByDay();
    const totalTokens = tokenByDay.reduce(
      (acc: number, d: any) => acc + (d.input_tokens || 0) + (d.output_tokens || 0) + (d.cache_tokens || 0),
      0
    );
    return c.json({ tokenByDay, filesByDay, totalTokens });
  });

  return app;
}

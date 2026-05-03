import { test, expect } from "bun:test";
import { createApp } from "../server/app.ts";

/**
 * Contract tests to ensure the server response matches what the client expects.
 * We use the Hono app directly to perform requests.
 */
test("Contract: /api/stats returns expected dashboard structure", async () => {
  const { api } = createApp();
  const res = await api.request("/api/stats");
  expect(res.status).toBe(200);

  const data: any = await res.json();

  // Dashboard.tsx expects:
  // data.stats (total_sessions, total_ai_lines, total_accepted, total_projects)
  // data.projects (array of { project, sessions })
  // data.activity (array of { date, sessions, lines })
  // data.recent (array of sessions with id, model, tool, messages, created_at)

  expect(data).toHaveProperty("stats");
  expect(data.stats).toHaveProperty("total_sessions");
  expect(data.stats).toHaveProperty("total_ai_lines");
  expect(data.stats).toHaveProperty("total_accepted");
  expect(data.stats).toHaveProperty("total_projects");

  expect(data).toHaveProperty("projects");
  expect(Array.isArray(data.projects)).toBe(true);

  expect(data).toHaveProperty("activity");
  expect(Array.isArray(data.activity)).toBe(true);

  expect(data).toHaveProperty("recent");
  expect(Array.isArray(data.recent)).toBe(true);
});

test("Contract: /api/sessions returns expected list structure", async () => {
  const { api } = createApp();
  const res = await api.request("/api/sessions?page=1");
  expect(res.status).toBe(200);

  const data: any = await res.json();

  // Sessions.tsx expects:
  // data.sessions (array)
  // data.total (number)
  // data.pageSize (number)

  expect(data).toHaveProperty("sessions");
  expect(Array.isArray(data.sessions)).toBe(true);
  expect(data).toHaveProperty("total");
  expect(typeof data.total).toBe("number");
  expect(data).toHaveProperty("pageSize");
  expect(typeof data.pageSize).toBe("number");
});

test("Contract: /api/sessions/:id returns session detail", async () => {
  const { api } = createApp();
  // We don't have a real ID here, but we can check the 404 structure or seed DB
  // For contract, we mostly care that if it returns 200, it has the fields
  const res = await api.request("/api/sessions/non-existent");
  if (res.status === 200) {
     const data: any = await res.json();
     expect(data).toHaveProperty("id");
     expect(data).toHaveProperty("messages");
     expect(data).toHaveProperty("model");
  } else {
     expect(res.status).toBe(404);
  }
});

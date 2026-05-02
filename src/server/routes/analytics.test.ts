import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { DashRepository } from "../data/dash.repository.ts";
import { AnalyticsService } from "../services/analytics.service.ts";

test("getTokenUsageByDay returns correctly formatted data", () => {
  const db = new Database(":memory:");
  
  // Create minimal schema
  db.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      repo_id TEXT,
      agent TEXT,
      model TEXT,
      started_at TEXT,
      ended_at TEXT,
      state TEXT,
      token_usage_json TEXT
    );
    CREATE TABLE repos (id TEXT PRIMARY KEY, path TEXT);
  `);
  
  // Insert test data
  db.run(
    `INSERT INTO sessions (id, repo_id, agent, model, started_at, state, token_usage_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["s1", "r1", "test", "model", "2024-01-01 10:00:00", "completed", 
     JSON.stringify({
       input_tokens: 100,
       output_tokens: 50,
       cache_creation_tokens: 10,
       cache_read_tokens: 5
     })]
  );
  
  db.run(
    `INSERT INTO sessions (id, repo_id, agent, model, started_at, state, token_usage_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["s2", "r1", "test", "model", "2024-01-01 11:00:00", "completed", 
     JSON.stringify({
       input_tokens: 200,
       output_tokens: 100,
       cache_creation_tokens: 20,
       cache_read_tokens: 10
     })]
  );
  
  const repo = new DashRepository(db);
  const service = new AnalyticsService(repo);
  
  const result = service.getTokenUsageByDay();
  
  expect(result.length).toBe(1); // Both sessions on same day
  expect(result[0].date).toBe("2024-01-01");
  expect(result[0].input_tokens).toBe(300); // 100 + 200
  expect(result[0].output_tokens).toBe(150); // 50 + 100
  expect(result[0].cache_tokens).toBe(45); // (10 + 20) + (5 + 10)
});

test("getTokenUsageByDay handles missing token_usage_json", () => {
  const db = new Database(":memory:");
  
  db.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      repo_id TEXT,
      agent TEXT,
      model TEXT,
      started_at TEXT,
      ended_at TEXT,
      state TEXT,
      token_usage_json TEXT
    );
    CREATE TABLE repos (id TEXT PRIMARY KEY, path TEXT);
  `);
  
  // Insert session without token_usage_json
  db.run(
    `INSERT INTO sessions (id, repo_id, agent, model, started_at, state, token_usage_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["s1", "r1", "test", "model", "2024-01-01 10:00:00", "completed", null]
  );
  
  const repo = new DashRepository(db);
  const service = new AnalyticsService(repo);
  
  const result = service.getTokenUsageByDay();
  
  expect(result.length).toBe(0); // No results since WHERE token_usage_json IS NOT NULL
});

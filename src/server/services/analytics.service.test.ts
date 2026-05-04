import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../data/migrations.ts";
import { DashRepository } from "../data/dash.repository.ts";
import { AnalyticsService } from "./analytics.service.ts";
import { seedDb } from "../../../fixtures/loader.ts";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function makeService(db: Database) {
  return new AnalyticsService(new DashRepository(db));
}

describe("AnalyticsService.getStats", () => {
  test("returns zeros when database is empty", () => {
    const stats = makeService(makeDb()).getStats();
    expect(stats.total_sessions).toBe(0);
    expect(stats.total_ai_lines).toBe(0);
    expect(stats.total_accepted).toBe(0);
    expect(stats.total_projects).toBe(0);
  });

  test("counts all sessions and distinct projects", () => {
    const db = makeDb();
    // multi-session: 2 repos (r1, r2), 3 sessions (s1+s2 in r1, s3 in r2)
    seedDb(db, "multi-session");
    const stats = makeService(db).getStats();
    expect(stats.total_sessions).toBe(3);
    expect(stats.total_projects).toBe(2);
  });

  test("sums ai_additions across all checkpoints", () => {
    const db = makeDb();
    // analytics-dataset: cp1.ai_additions=10, cp2.ai_additions=5 → 15
    seedDb(db, "analytics-dataset");
    const stats = makeService(db).getStats();
    expect(stats.total_ai_lines).toBe(15);
  });

  test("calculates total_accepted as sum of (ai_additions - human_deletions) per checkpoint", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    // checkpoint 1: ai_additions=10, human_deletions=1 → accepted=9
    // checkpoint 2: ai_additions=5, human_deletions=2 → accepted=3
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', '{\"ai_additions\":10,\"human_deletions\":1}'), ('c2', 'r1', 'sha2', 'manual', '{\"ai_additions\":5,\"human_deletions\":2}')");
    const stats = makeService(db).getStats();
    expect(stats.total_accepted).toBe(12); // 9 + 3
  });

  test("treats missing attribution fields as zero", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', '{\"ai_additions\":7}')");
    const stats = makeService(db).getStats();
    expect(stats.total_ai_lines).toBe(7);
    expect(stats.total_accepted).toBe(7);
  });

  test("skips malformed attribution_json without throwing", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', 'not-valid-json'), ('c2', 'r1', 'sha2', 'manual', '{\"ai_additions\":8}')");
    const stats = makeService(db).getStats();
    expect(stats.total_ai_lines).toBe(8);
  });
});

describe("AnalyticsService.getProjectStats", () => {
  test("returns empty array when no repos exist", () => {
    expect(makeService(makeDb()).getProjectStats()).toEqual([]);
  });

  test("returns one entry per repo with correct project path", () => {
    const db = makeDb();
    // multi-session: repos at /projects/alpha and /projects/beta
    seedDb(db, "multi-session");
    const stats = makeService(db).getProjectStats();
    expect(stats).toHaveLength(2);
    const paths = stats.map((s: any) => s.project);
    expect(paths).toContain("/projects/alpha");
    expect(paths).toContain("/projects/beta");
  });

  test("returns correct session count per repo", () => {
    const db = makeDb();
    // multi-session: r1 has s1+s2 (2 sessions), r2 has s3 (1 session)
    seedDb(db, "multi-session");
    const stats = makeService(db).getProjectStats();
    const r1 = stats.find((s: any) => s.project === "/projects/alpha");
    const r2 = stats.find((s: any) => s.project === "/projects/beta");
    expect(r1?.sessions).toBe(2);
    expect(r2?.sessions).toBe(1);
  });

  test("sums ai_lines from checkpoints per repo", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a'), ('r2', '/b')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', '{\"ai_additions\":10}'), ('c2', 'r1', 'sha2', 'manual', '{\"ai_additions\":5}'), ('c3', 'r2', 'sha3', 'manual', '{\"ai_additions\":30}')");
    const stats = makeService(db).getProjectStats();
    const r1 = stats.find((s: any) => s.project === "/a");
    const r2 = stats.find((s: any) => s.project === "/b");
    expect(r1?.ai_lines).toBe(15);
    expect(r2?.ai_lines).toBe(30);
  });

  test("returns zero ai_lines for repos with no checkpoints", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    const stats = makeService(db).getProjectStats();
    expect(stats[0].ai_lines).toBe(0);
  });
});

describe("AnalyticsService.getActivityByDay", () => {
  test("returns empty array when no sessions exist", () => {
    expect(makeService(makeDb()).getActivityByDay()).toEqual([]);
  });

  test("groups sessions by calendar date", () => {
    const db = makeDb();
    // analytics-dataset: s1+s2 on 2025-04-01, s3 on 2025-04-02
    seedDb(db, "analytics-dataset");
    const activity = makeService(db).getActivityByDay() as any[];
    expect(activity).toHaveLength(2);
    const day1 = activity.find(a => a.date === "2025-04-01");
    const day2 = activity.find(a => a.date === "2025-04-02");
    expect(day1?.sessions).toBe(2);
    expect(day2?.sessions).toBe(1);
  });

  test("results are ordered by date ascending", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'agent', '2024-03-01', 'active'), ('s2', 'r1', 'agent', '2024-01-01', 'active'), ('s3', 'r1', 'agent', '2024-02-01', 'active')");
    const dates = (makeService(db).getActivityByDay() as any[]).map(a => a.date);
    expect(dates).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
  });
});

describe("AnalyticsService.getTokenUsageByDay", () => {
  test("returns empty array when no sessions have token data", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'agent', '2024-01-01', 'active')");
    expect(makeService(db).getTokenUsageByDay()).toEqual([]);
  });

  test("aggregates input, output, and cache tokens per day", () => {
    const db = makeDb();
    // analytics-dataset: s1=(100,50,10,5) + s2=(200,100,20,10) both on 2025-04-01
    seedDb(db, "analytics-dataset");
    const result = makeService(db).getTokenUsageByDay() as any[];
    const day1 = result.find(r => r.date === "2025-04-01");
    expect(day1?.input_tokens).toBe(300);
    expect(day1?.output_tokens).toBe(150);
    expect(day1?.cache_tokens).toBe(45); // (10+20) + (5+10)
  });

  test("separates token counts across different days", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run(`INSERT INTO sessions (id, repo_id, agent, started_at, state, token_usage_json) VALUES
      ('s1', 'r1', 'agent', '2024-01-01', 'active', '{"input_tokens":100,"output_tokens":50,"cache_creation_tokens":0,"cache_read_tokens":0}'),
      ('s2', 'r1', 'agent', '2024-01-02', 'active', '{"input_tokens":200,"output_tokens":75,"cache_creation_tokens":0,"cache_read_tokens":0}')`);
    const result = makeService(db).getTokenUsageByDay() as any[];
    expect(result).toHaveLength(2);
    const jan1 = result.find(r => r.date === "2024-01-01");
    const jan2 = result.find(r => r.date === "2024-01-02");
    expect(jan1?.input_tokens).toBe(100);
    expect(jan2?.input_tokens).toBe(200);
  });
});

describe("AnalyticsService.getFileChangesByDay", () => {
  test("returns empty when no checkpoint-session links exist", () => {
    expect(makeService(makeDb()).getFileChangesByDay()).toEqual([]);
  });

  test("sums ai_additions and ai_deletions per day", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'agent', '2024-01-01 10:00:00', 'active')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', '{\"ai_additions\":15,\"ai_deletions\":3}'), ('c2', 'r1', 'sha2', 'manual', '{\"ai_additions\":5,\"ai_deletions\":1}')");
    db.run("INSERT INTO checkpoint_sessions (checkpoint_id, session_id) VALUES ('c1', 's1'), ('c2', 's1')");
    const changes = makeService(db).getFileChangesByDay() as any[];
    expect(changes).toHaveLength(1);
    expect(changes[0].date).toBe("2024-01-01");
    expect(changes[0].additions).toBe(20);
    expect(changes[0].deletions).toBe(4);
  });

  test("separates file changes across different days", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'agent', '2024-01-01 10:00:00', 'active'), ('s2', 'r1', 'agent', '2024-01-02 10:00:00', 'active')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', '{\"ai_additions\":10,\"ai_deletions\":2}'), ('c2', 'r1', 'sha2', 'manual', '{\"ai_additions\":7,\"ai_deletions\":1}')");
    db.run("INSERT INTO checkpoint_sessions (checkpoint_id, session_id) VALUES ('c1', 's1'), ('c2', 's2')");
    const changes = makeService(db).getFileChangesByDay() as any[];
    expect(changes).toHaveLength(2);
    expect(changes.find(c => c.date === "2024-01-01")?.additions).toBe(10);
    expect(changes.find(c => c.date === "2024-01-02")?.additions).toBe(7);
  });

  test("excludes checkpoints without attribution_json", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'agent', '2024-01-01 10:00:00', 'active')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', '{\"ai_additions\":5,\"ai_deletions\":1}'), ('c2', 'r1', 'sha2', 'manual', NULL)");
    db.run("INSERT INTO checkpoint_sessions (checkpoint_id, session_id) VALUES ('c1', 's1'), ('c2', 's1')");
    const changes = makeService(db).getFileChangesByDay() as any[];
    expect(changes).toHaveLength(1);
    expect(changes[0].additions).toBe(5);
  });
});

describe("AnalyticsService.getRepositories", () => {
  test("returns array with one entry per repo", () => {
    const db = makeDb();
    // multi-session: 2 repos
    seedDb(db, "multi-session");
    const repos = makeService(db).getRepositories() as any[];
    expect(repos).toHaveLength(2);
  });

  test("each repository entry has required fields", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/project/alpha')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'sha1', 'manual', '{\"ai_additions\":20}')");
    const repos = makeService(db).getRepositories() as any[];
    expect(repos[0]).toHaveProperty("project");
    expect(repos[0]).toHaveProperty("sessions");
    expect(repos[0]).toHaveProperty("ai_lines");
    expect(repos[0]).toHaveProperty("accepted_lines");
    expect(repos[0]).toHaveProperty("last_active");
    expect(repos[0]).toHaveProperty("top_model");
    expect(repos[0].project).toBe("/project/alpha");
    expect(repos[0].sessions).toBe(1);
    expect(repos[0].ai_lines).toBe(20);
  });
});

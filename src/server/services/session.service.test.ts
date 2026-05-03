import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../data/migrations.ts";
import { DashRepository } from "../data/dash.repository.ts";
import { SessionService } from "./session.service.ts";

const mockGitService = { getShowPatch: async () => null } as any;
const mockGeminiService = {} as any;

function makeService(db: Database) {
  return new SessionService(new DashRepository(db), mockGitService, mockGeminiService);
}

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("SessionService.getSession token accumulation", () => {
  test("returns null for a non-existent session", async () => {
    const result = await makeService(makeDb()).getSession("does-not-exist");
    expect(result).toBeNull();
  });

  test("total_tokens is zero when session has no token data", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01 10:00:00', 'active')");
    const session = await makeService(db).getSession("s1");
    expect(session.total_tokens).toBe(0);
  });

  test("uses session-level token_usage_json for total_tokens", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run(`INSERT INTO sessions (id, repo_id, agent, started_at, state, token_usage_json)
            VALUES ('s1', 'r1', 'claude-code', '2024-01-01 10:00:00', 'active',
            '{"input_tokens":500,"output_tokens":300,"cache_creation_tokens":20,"cache_read_tokens":10}')`);
    const session = await makeService(db).getSession("s1");
    expect(session.total_tokens).toBe(830); // 500+300+20+10
  });

  test("accumulates cumulative tokens across events in sequence order", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01 10:00:00', 'active')");
    db.run(`INSERT INTO events (id, session_id, seq, ts, type, payload_json, token_usage_json) VALUES
      ('e1', 's1', 0, '2024-01-01 10:01:00', 'PreToolUse', '{}',
       '{"input_tokens":100,"output_tokens":50,"cache_creation_tokens":0,"cache_read_tokens":0}'),
      ('e2', 's1', 1, '2024-01-01 10:02:00', 'PostToolUse', '{}',
       '{"input_tokens":200,"output_tokens":75,"cache_creation_tokens":10,"cache_read_tokens":5}')`);
    const session = await makeService(db).getSession("s1");
    const e1 = session.events.find((e: any) => e.id === "e1");
    const e2 = session.events.find((e: any) => e.id === "e2");
    // After e1: input=100, output=50, cache=0
    expect(e1.cumulative_tokens.input_tokens).toBe(100);
    expect(e1.cumulative_tokens.output_tokens).toBe(50);
    expect(e1.cumulative_tokens.cache_tokens).toBe(0);
    expect(e1.cumulative_tokens.total).toBe(150);
    // After e2: input=300, output=125, cache=15
    expect(e2.cumulative_tokens.input_tokens).toBe(300);
    expect(e2.cumulative_tokens.output_tokens).toBe(125);
    expect(e2.cumulative_tokens.cache_tokens).toBe(15);
    expect(e2.cumulative_tokens.total).toBe(440);
  });

  test("events without token_usage have no cumulative_tokens attached", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01 10:00:00', 'active')");
    db.run("INSERT INTO events (id, session_id, seq, ts, type, payload_json) VALUES ('e1', 's1', 0, '2024-01-01 10:01:00', 'SessionStart', '{}')");
    const session = await makeService(db).getSession("s1");
    const e1 = session.events[0];
    expect(e1.cumulative_tokens).toBeUndefined();
    expect(e1.token_usage).toBeUndefined();
  });
});

describe("SessionService.getSession attribution aggregation", () => {
  test("returns zero attribution when no checkpoints exist", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active')");
    const session = await makeService(db).getSession("s1");
    expect(session.total_additions).toBe(0);
    expect(session.total_deletions).toBe(0);
    expect(session.checkpoint_count).toBe(0);
  });

  test("sums ai_additions and ai_deletions across multiple checkpoints", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active')");
    db.run(`INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES
      ('c1', 'r1', 'sha1', 'manual', '{"ai_additions":10,"ai_deletions":2,"human_additions":3,"human_deletions":1}'),
      ('c2', 'r1', 'sha2', 'manual', '{"ai_additions":5,"ai_deletions":1,"human_additions":0,"human_deletions":0}')`);
    db.run("INSERT INTO checkpoint_sessions (checkpoint_id, session_id) VALUES ('c1', 's1'), ('c2', 's1')");
    const session = await makeService(db).getSession("s1");
    expect(session.total_additions).toBe(15); // 10 + 5
    expect(session.total_deletions).toBe(3);  // 2 + 1
    expect(session.checkpoint_count).toBe(2);
  });

  test("handles checkpoint with malformed attribution_json gracefully", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active')");
    db.run(`INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES
      ('c1', 'r1', 'sha1', 'manual', 'bad-json'),
      ('c2', 'r1', 'sha2', 'manual', '{"ai_additions":8,"ai_deletions":2}')`);
    db.run("INSERT INTO checkpoint_sessions (checkpoint_id, session_id) VALUES ('c1', 's1'), ('c2', 's1')");
    const session = await makeService(db).getSession("s1");
    expect(session.total_additions).toBe(8); // only valid checkpoint counted
    expect(session.total_deletions).toBe(2);
  });
});

describe("SessionService.getSession metadata", () => {
  test("exposes plan_markdown as plan field", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state, plan_markdown) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active', '# My Plan\n- Step 1')");
    const session = await makeService(db).getSession("s1");
    expect(session.plan).toBe("# My Plan\n- Step 1");
    expect(session.transcript).toBeFalsy();
  });

  test("parses allowed_prompts_json into allowed_prompts array", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    const prompts = [{ tool: "Bash", prompt: "bun test" }];
    db.run(`INSERT INTO sessions (id, repo_id, agent, started_at, state, allowed_prompts_json)
            VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active', '${JSON.stringify(prompts)}')`);
    const session = await makeService(db).getSession("s1");
    expect(session.allowed_prompts).toEqual(prompts);
  });

  test("sets created_at as unix timestamp", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-06-15 12:00:00', 'active')");
    const session = await makeService(db).getSession("s1");
    expect(typeof session.created_at).toBe("number");
    expect(session.created_at).toBeGreaterThan(0);
  });

  test("exposes agent as tool field", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, model, started_at, state) VALUES ('s1', 'r1', 'claude-code', 'claude-3-5-sonnet', '2024-01-01', 'active')");
    const session = await makeService(db).getSession("s1");
    expect(session.tool).toBe("claude-code");
    expect(session.model).toBe("claude-3-5-sonnet");
  });
});

describe("SessionService.getSessions", () => {
  test("returns empty array when no sessions with events exist", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    // Session exists but has no events — getSessions filters these out
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active')");
    const sessions = await makeService(db).getSessions();
    expect(sessions).toHaveLength(0);
  });

  test("returns sessions that have at least one event", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, model, started_at, state) VALUES ('s1', 'r1', 'claude-code', 'claude-3', '2024-01-01 10:00:00', 'active')");
    db.run("INSERT INTO events (id, session_id, seq, ts, type, payload_json) VALUES ('e1', 's1', 0, '2024-01-01 10:01:00', 'UserPromptSubmit', '{\"text\":\"hello\"}')");
    const sessions = await makeService(db).getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("s1");
    expect(sessions[0].tool).toBe("claude-code");
    expect(typeof sessions[0].created_at).toBe("number");
  });

  test("includes messages JSON on each session", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active')");
    db.run("INSERT INTO events (id, session_id, seq, ts, type, payload_json) VALUES ('e1', 's1', 0, '2024-01-01 10:00:00', 'UserPromptSubmit', '{\"text\":\"do the thing\"}')");
    const sessions = await makeService(db).getSessions();
    expect(typeof sessions[0].messages).toBe("string");
    const messages = JSON.parse(sessions[0].messages);
    expect(Array.isArray(messages)).toBe(true);
  });

  test("getSessionCount returns count of sessions with events", () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'agent', '2024-01-01', 'active'), ('s2', 'r1', 'agent', '2024-01-02', 'active')");
    // Only s1 has events
    db.run("INSERT INTO events (id, session_id, seq, ts, type, payload_json) VALUES ('e1', 's1', 0, '2024-01-01', 'SessionStart', '{}')");
    expect(makeService(db).getSessionCount()).toBe(1);
  });
});

describe("SessionService.getSessionCheckpointsDetail", () => {
  test("returns null for non-existent session", async () => {
    const result = await makeService(makeDb()).getSessionCheckpointsDetail("no-such-session");
    expect(result).toBeNull();
  });

  test("returns checkpoint list with parsed attribution", async () => {
    const db = makeDb();
    db.run("INSERT INTO repos (id, path) VALUES ('r1', '/a')");
    db.run("INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES ('s1', 'r1', 'claude-code', '2024-01-01', 'active')");
    db.run("INSERT INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES ('c1', 'r1', 'abcdef1234567', 'manual', '{\"ai_additions\":5,\"ai_deletions\":1}')");
    db.run("INSERT INTO checkpoint_sessions (checkpoint_id, session_id) VALUES ('c1', 's1')");
    const detail = await makeService(db).getSessionCheckpointsDetail("s1") as any[];
    expect(detail).toHaveLength(1);
    expect(detail[0].commit_sha).toBe("abcdef1234567");
    expect(detail[0].short_sha).toBe("abcdef1");
    expect(detail[0].attribution?.ai_additions).toBe(5);
    expect(detail[0].strategy).toBe("manual");
  });
});

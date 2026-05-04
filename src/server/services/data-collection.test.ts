import { expect, test, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDashDb } from "../data/dash.db.ts";
import { DashRepository } from "../data/dash.repository.ts";
import { HookService } from "./hook.service.ts";
import { AttributionService } from "./attribution.service.ts";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadHookPayload, loadTranscript } from "../../../fixtures/loader.ts";

describe("Data Collection - event recording correctness", () => {
  const testDir = join(tmpdir(), "data-collection-" + Math.random().toString(36).slice(2));
  const testDbPath = join(testDir, "test.db");
  let db: any;
  let service: HookService;

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    db = getDashDb(testDbPath);
    service = new HookService(new DashRepository(db), new AttributionService());
  });

  afterAll(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.run("DELETE FROM checkpoint_sessions");
    db.run("DELETE FROM checkpoints");
    db.run("DELETE FROM shadow_refs");
    db.run("DELETE FROM events");
    db.run("DELETE FROM commits");
    db.run("DELETE FROM sessions");
    db.run("DELETE FROM repos");
  });

  // helper: merge test-specific fields over a fixture payload
  function cc(event: string, overrides: Record<string, any> = {}) {
    return { ...loadHookPayload("claude-code", event) as any, cwd: testDir, ...overrides };
  }

  // --- Required fields ---

  test("ignores events missing session_id", async () => {
    await service.handleHookEvent("claude-code", { cwd: testDir, hook_event_name: "SessionStart", model: "claude-3" });
    expect((db.query("SELECT COUNT(*) as n FROM sessions").get() as any).n).toBe(0);
  });

  test("ignores events missing cwd", async () => {
    await service.handleHookEvent("claude-code", { session_id: "x", hook_event_name: "SessionStart" });
    expect((db.query("SELECT COUNT(*) as n FROM sessions").get() as any).n).toBe(0);
  });

  // --- Repo deduplication ---

  test("creates exactly one repo record regardless of how many events arrive", async () => {
    const id = "dedup-session";
    for (const event of ["session-start", "user-prompt-submit", "pre-tool-use-bash", "post-tool-use", "stop"]) {
      await service.handleHookEvent("claude-code", cc(event, { session_id: id }));
    }
    const count = (db.query("SELECT COUNT(*) as n FROM repos WHERE path = ?").get(testDir) as any).n;
    expect(count).toBe(1);
  });

  // --- SessionStart ---

  test("SessionStart creates a session record with correct agent and model", async () => {
    // fixture model is "claude-opus-4-5"
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: "start-session" }));
    const session = db.query("SELECT * FROM sessions WHERE id = 'start-session'").get() as any;
    expect(session).toBeDefined();
    expect(session.agent).toBe("claude-code");
    expect(session.model).toBe("claude-opus-4-5");
    expect(session.state).toBe("active");
  });

  test("SessionStart event is stored in the events table", async () => {
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: "start-events" }));
    const events = db.query("SELECT * FROM events WHERE session_id = 'start-events'").all() as any[];
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SessionStart");
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.model).toBe("claude-opus-4-5");
  });

  // --- UserPromptSubmit ---

  test("UserPromptSubmit records the user prompt text in payload", async () => {
    const id = "prompt-session";
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    // fixture text is "refactor the authentication module"
    await service.handleHookEvent("claude-code", cc("user-prompt-submit", { session_id: id }));
    const events = db.query("SELECT * FROM events WHERE session_id = ? AND type = 'UserPromptSubmit'").all(id) as any[];
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.text).toBe("refactor the authentication module");
  });

  // --- PreToolUse ---

  test("PreToolUse records tool_name and tool_input in payload", async () => {
    const id = "pretool-session";
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    // fixture: tool_name="Bash", tool_input.command="bun test --bail"
    await service.handleHookEvent("claude-code", cc("pre-tool-use-bash", { session_id: id }));
    const events = db.query("SELECT * FROM events WHERE session_id = ? AND type = 'PreToolUse'").all(id) as any[];
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.tool_name).toBe("Bash");
    expect(payload.tool_input.command).toBe("bun test --bail");
  });

  // --- PostToolUse ---

  test("PostToolUse records tool_name and tool_response in payload", async () => {
    const id = "posttool-session";
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    // fixture: tool_name="Read", tool_response.content="file contents here"
    await service.handleHookEvent("claude-code", cc("post-tool-use", { session_id: id }));
    const events = db.query("SELECT * FROM events WHERE session_id = ? AND type = 'PostToolUse'").all(id) as any[];
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.tool_name).toBe("Read");
    expect(payload.tool_response.content).toBe("file contents here");
  });

  // --- Sequence numbers ---

  test("assigns monotonically increasing seq numbers per session", async () => {
    const id = "seq-session";
    for (const event of ["session-start", "user-prompt-submit", "pre-tool-use-bash", "post-tool-use", "stop"]) {
      await service.handleHookEvent("claude-code", cc(event, { session_id: id }));
    }
    const events = db.query("SELECT seq, type FROM events WHERE session_id = ? ORDER BY seq ASC").all(id) as any[];
    expect(events).toHaveLength(5);
    expect(events.map((e: any) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(events[0].type).toBe("SessionStart");
    expect(events[4].type).toBe("Stop");
  });

  test("seq numbers are independent per session", async () => {
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: "session-a" }));
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: "session-b" }));
    await service.handleHookEvent("claude-code", cc("user-prompt-submit", { session_id: "session-a" }));
    const seqsA = (db.query("SELECT seq FROM events WHERE session_id = 'session-a' ORDER BY seq").all() as any[]).map(e => e.seq);
    const seqsB = (db.query("SELECT seq FROM events WHERE session_id = 'session-b' ORDER BY seq").all() as any[]).map(e => e.seq);
    expect(seqsA).toEqual([0, 1]);
    expect(seqsB).toEqual([0]);
  });

  // --- SessionEnd ---

  test("SessionEnd updates state to ended and sets ended_at", async () => {
    const id = "end-session";
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    await service.handleHookEvent("claude-code", cc("session-end", { session_id: id }));
    const session = db.query("SELECT state, ended_at FROM sessions WHERE id = ?").get(id) as any;
    expect(session.state).toBe("ended");
    expect(session.ended_at).toBeTruthy();
  });

  test("SessionEnd extracts token usage from transcript when provided", async () => {
    // simple.jsonl: input=100, output=200
    const id = "end-transcript-session";
    const transcriptPath = join(testDir, `${id}.jsonl`);
    await Bun.write(transcriptPath, loadTranscript("simple"));

    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    await service.handleHookEvent("claude-code", cc("session-end", { session_id: id, transcript_path: transcriptPath }));

    const row = db.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(id) as any;
    expect(row.token_usage_json).toBeTruthy();
    const usage = JSON.parse(row.token_usage_json);
    expect(usage.input_tokens).toBe(100);
    expect(usage.output_tokens).toBe(200);
  });

  // --- ExitPlanMode data capture ---

  test("ExitPlanMode PostToolUse stores plan_markdown on session", async () => {
    const id = "plan-capture-session";
    const fixture = loadHookPayload("claude-code", "exit-plan-mode") as any;
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    await service.handleHookEvent("claude-code", { ...fixture, session_id: id, cwd: testDir });
    const session = db.query("SELECT plan_markdown FROM sessions WHERE id = ?").get(id) as any;
    expect(session.plan_markdown).toBe(fixture.tool_response.plan);
  });

  test("ExitPlanMode PostToolUse stores allowed_prompts_json on session", async () => {
    const id = "plan-prompts-session";
    const fixture = loadHookPayload("claude-code", "exit-plan-mode") as any;
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    await service.handleHookEvent("claude-code", { ...fixture, session_id: id, cwd: testDir });
    const session = db.query("SELECT allowed_prompts_json FROM sessions WHERE id = ?").get(id) as any;
    expect(JSON.parse(session.allowed_prompts_json)).toEqual(fixture.tool_response.allowedPrompts);
  });

  // --- Stop event token extraction ---

  test("Stop event extracts token usage from transcript file", async () => {
    // with-cache.jsonl: input=3, output=255, cache_creation=5887, cache_read=10580
    const id = "stop-token-session";
    const transcriptPath = join(testDir, `${id}.jsonl`);
    await Bun.write(transcriptPath, loadTranscript("with-cache"));

    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    await service.handleHookEvent("claude-code", cc("stop", { session_id: id, transcript_path: transcriptPath }));

    const row = db.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(id) as any;
    const usage = JSON.parse(row.token_usage_json);
    expect(usage.input_tokens).toBe(3);
    expect(usage.output_tokens).toBe(255);
    expect(usage.cache_creation_tokens).toBe(5887);
    expect(usage.cache_read_tokens).toBe(10580);
  });

  test("Stop event with nonexistent transcript does not crash or set token data", async () => {
    const id = "stop-notranscript";
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: id }));
    await service.handleHookEvent("claude-code", cc("stop", {
      session_id: id,
      transcript_path: join(testDir, "does-not-exist.jsonl")
    }));
    const row = db.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(id) as any;
    expect(row.token_usage_json).toBeNull();
  });

  // --- Multi-session isolation ---

  test("events from different sessions are stored independently", async () => {
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: "iso-a" }));
    await service.handleHookEvent("claude-code", cc("session-start", { session_id: "iso-b" }));
    await service.handleHookEvent("claude-code", cc("user-prompt-submit", { session_id: "iso-a", text: "prompt for A" }));
    await service.handleHookEvent("claude-code", cc("user-prompt-submit", { session_id: "iso-b", text: "prompt for B" }));

    const eventsA = db.query("SELECT type, payload_json FROM events WHERE session_id = 'iso-a'").all() as any[];
    const eventsB = db.query("SELECT type, payload_json FROM events WHERE session_id = 'iso-b'").all() as any[];

    expect(eventsA).toHaveLength(2);
    expect(eventsB).toHaveLength(2);

    expect(JSON.parse(eventsA.find((e: any) => e.type === "UserPromptSubmit").payload_json).text).toBe("prompt for A");
    expect(JSON.parse(eventsB.find((e: any) => e.type === "UserPromptSubmit").payload_json).text).toBe("prompt for B");
  });
});

import { expect, test, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDashDb } from "../data/dash.db.ts";
import { DashRepository } from "../data/dash.repository.ts";
import { HookService } from "./hook.service.ts";
import { AttributionService } from "./attribution.service.ts";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
    for (const type of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]) {
      await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: type });
    }
    const count = (db.query("SELECT COUNT(*) as n FROM repos WHERE path = ?").get(testDir) as any).n;
    expect(count).toBe(1);
  });

  // --- SessionStart ---

  test("SessionStart creates a session record with correct agent and model", async () => {
    await service.handleHookEvent("claude-code", {
      session_id: "start-session",
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-opus-4"
    });
    const session = db.query("SELECT * FROM sessions WHERE id = 'start-session'").get() as any;
    expect(session).toBeDefined();
    expect(session.agent).toBe("claude-code");
    expect(session.model).toBe("claude-opus-4");
    expect(session.state).toBe("active");
  });

  test("SessionStart event is stored in the events table", async () => {
    await service.handleHookEvent("claude-code", {
      session_id: "start-events",
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-3"
    });
    const events = db.query("SELECT * FROM events WHERE session_id = 'start-events'").all() as any[];
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SessionStart");
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.model).toBe("claude-3");
  });

  // --- UserPromptSubmit ---

  test("UserPromptSubmit records the user prompt text in payload", async () => {
    const id = "prompt-session";
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", {
      session_id: id,
      cwd: testDir,
      hook_event_name: "UserPromptSubmit",
      text: "refactor the authentication module"
    });
    const events = db.query("SELECT * FROM events WHERE session_id = ? AND type = 'UserPromptSubmit'").all(id) as any[];
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.text).toBe("refactor the authentication module");
  });

  // --- PreToolUse ---

  test("PreToolUse records tool_name and tool_input in payload", async () => {
    const id = "pretool-session";
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", {
      session_id: id,
      cwd: testDir,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "bun test --bail" }
    });
    const events = db.query("SELECT * FROM events WHERE session_id = ? AND type = 'PreToolUse'").all(id) as any[];
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.tool_name).toBe("Bash");
    expect(payload.tool_input.command).toBe("bun test --bail");
  });

  // --- PostToolUse ---

  test("PostToolUse records tool_name and tool_response in payload", async () => {
    const id = "posttool-session";
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", {
      session_id: id,
      cwd: testDir,
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_response: { content: "file contents here" }
    });
    const events = db.query("SELECT * FROM events WHERE session_id = ? AND type = 'PostToolUse'").all(id) as any[];
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.tool_name).toBe("Read");
    expect(payload.tool_response.content).toBe("file contents here");
  });

  // --- Sequence numbers ---

  test("assigns monotonically increasing seq numbers per session", async () => {
    const id = "seq-session";
    const types = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];
    for (const type of types) {
      await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: type });
    }
    const events = db.query("SELECT seq, type FROM events WHERE session_id = ? ORDER BY seq ASC").all(id) as any[];
    expect(events).toHaveLength(5);
    expect(events.map((e: any) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    // Verify order matches insertion order
    expect(events[0].type).toBe("SessionStart");
    expect(events[4].type).toBe("Stop");
  });

  test("seq numbers are independent per session", async () => {
    await service.handleHookEvent("claude-code", { session_id: "session-a", cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", { session_id: "session-b", cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", { session_id: "session-a", cwd: testDir, hook_event_name: "UserPromptSubmit", text: "hi" });
    const seqsA = (db.query("SELECT seq FROM events WHERE session_id = 'session-a' ORDER BY seq").all() as any[]).map(e => e.seq);
    const seqsB = (db.query("SELECT seq FROM events WHERE session_id = 'session-b' ORDER BY seq").all() as any[]).map(e => e.seq);
    expect(seqsA).toEqual([0, 1]); // two events for session-a
    expect(seqsB).toEqual([0]);    // one event for session-b, starts at 0
  });

  // --- SessionEnd ---

  test("SessionEnd updates state to ended and sets ended_at", async () => {
    const id = "end-session";
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart", model: "claude-3" });
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionEnd" });
    const session = db.query("SELECT state, ended_at FROM sessions WHERE id = ?").get(id) as any;
    expect(session.state).toBe("ended");
    expect(session.ended_at).toBeTruthy();
  });

  test("SessionEnd extracts token usage from transcript when provided", async () => {
    const id = "end-transcript-session";
    const transcriptPath = join(testDir, `${id}.jsonl`);
    const usageLine = JSON.stringify({ type: "assistant", message: { role: "assistant", usage: { input_tokens: 300, output_tokens: 150, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    await Bun.write(transcriptPath, usageLine);

    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionEnd", transcript_path: transcriptPath });

    const row = db.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(id) as any;
    expect(row.token_usage_json).toBeTruthy();
    const usage = JSON.parse(row.token_usage_json);
    expect(usage.input_tokens).toBe(300);
    expect(usage.output_tokens).toBe(150);
  });

  // --- ExitPlanMode data capture ---

  test("ExitPlanMode PostToolUse stores plan_markdown on session", async () => {
    const id = "plan-capture-session";
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", {
      session_id: id,
      cwd: testDir,
      hook_event_name: "PostToolUse",
      tool_name: "ExitPlanMode",
      tool_input: {},
      tool_response: { plan: "## Phase 1\n- Write tests\n## Phase 2\n- Deploy" }
    });
    const session = db.query("SELECT plan_markdown FROM sessions WHERE id = ?").get(id) as any;
    expect(session.plan_markdown).toBe("## Phase 1\n- Write tests\n## Phase 2\n- Deploy");
  });

  test("ExitPlanMode PostToolUse stores allowed_prompts_json on session", async () => {
    const id = "plan-prompts-session";
    const prompts = [{ tool: "Bash", prompt: "bun test" }, { tool: "Edit", prompt: "fix lint" }];
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", {
      session_id: id,
      cwd: testDir,
      hook_event_name: "PostToolUse",
      tool_name: "ExitPlanMode",
      tool_input: {},
      tool_response: { plan: "# Plan", allowedPrompts: prompts }
    });
    const session = db.query("SELECT allowed_prompts_json FROM sessions WHERE id = ?").get(id) as any;
    expect(JSON.parse(session.allowed_prompts_json)).toEqual(prompts);
  });

  // --- Stop event token extraction ---

  test("Stop event extracts token usage from transcript file", async () => {
    const id = "stop-token-session";
    const transcriptPath = join(testDir, `${id}.jsonl`);
    const lines = [
      JSON.stringify({ type: "assistant", message: { role: "assistant", usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 50, cache_read_input_tokens: 25 } } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", usage: { input_tokens: 50, output_tokens: 75 } } }),
    ].join("\n");
    await Bun.write(transcriptPath, lines);

    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "Stop", transcript_path: transcriptPath });

    const row = db.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(id) as any;
    const usage = JSON.parse(row.token_usage_json);
    expect(usage.input_tokens).toBe(150);    // 100 + 50
    expect(usage.output_tokens).toBe(275);   // 200 + 75
    expect(usage.cache_creation_tokens).toBe(50);
    expect(usage.cache_read_tokens).toBe(25);
  });

  test("Stop event with nonexistent transcript does not crash or set token data", async () => {
    const id = "stop-notranscript";
    await service.handleHookEvent("claude-code", { session_id: id, cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", {
      session_id: id,
      cwd: testDir,
      hook_event_name: "Stop",
      transcript_path: join(testDir, "does-not-exist.jsonl")
    });
    const row = db.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(id) as any;
    expect(row.token_usage_json).toBeNull();
  });

  // --- Multi-session isolation ---

  test("events from different sessions are stored independently", async () => {
    await service.handleHookEvent("claude-code", { session_id: "iso-a", cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", { session_id: "iso-b", cwd: testDir, hook_event_name: "SessionStart" });
    await service.handleHookEvent("claude-code", { session_id: "iso-a", cwd: testDir, hook_event_name: "UserPromptSubmit", text: "prompt for A" });
    await service.handleHookEvent("claude-code", { session_id: "iso-b", cwd: testDir, hook_event_name: "UserPromptSubmit", text: "prompt for B" });

    const eventsA = db.query("SELECT type, payload_json FROM events WHERE session_id = 'iso-a'").all() as any[];
    const eventsB = db.query("SELECT type, payload_json FROM events WHERE session_id = 'iso-b'").all() as any[];

    expect(eventsA).toHaveLength(2);
    expect(eventsB).toHaveLength(2);

    const promptA = eventsA.find((e: any) => e.type === "UserPromptSubmit");
    const promptB = eventsB.find((e: any) => e.type === "UserPromptSubmit");
    expect(JSON.parse(promptA.payload_json).text).toBe("prompt for A");
    expect(JSON.parse(promptB.payload_json).text).toBe("prompt for B");
  });
});

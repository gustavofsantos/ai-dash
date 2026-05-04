import { expect, test, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDashDb } from "../data/dash.db.ts";
import { DashRepository } from "../data/dash.repository.ts";
import { HookService } from "./hook.service.ts";
import { AttributionService } from "./attribution.service.ts";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadTranscript, loadHookPayload } from "../../../fixtures/loader.ts";

describe("HookService ExitPlanMode", () => {
  const testDir = join(tmpdir(), "hook-service-test-" + Math.random().toString(36).slice(2));
  const testDbPath = join(testDir, "test.db");
  let testDb: any;
  let testRepo: DashRepository;
  let hookService: HookService;

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    testDb = getDashDb(testDbPath);
    testRepo = new DashRepository(testDb);
    hookService = new HookService(testRepo, new AttributionService());
  });

  afterAll(() => {
    testDb.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    testDb.run("DELETE FROM checkpoint_sessions");
    testDb.run("DELETE FROM checkpoints");
    testDb.run("DELETE FROM shadow_refs");
    testDb.run("DELETE FROM events");
    testDb.run("DELETE FROM commits");
    testDb.run("DELETE FROM sessions");
    testDb.run("DELETE FROM repos");
  });

  test("should capture ExitPlanMode tool use and store plan and allowedPrompts", async () => {
    const sessionId = "test-plan-session";
    const fixture = loadHookPayload("claude-code", "exit-plan-mode") as any;

    await hookService.handleHookEvent("claude-code", {
      ...loadHookPayload("claude-code", "session-start") as any,
      session_id: sessionId,
      cwd: testDir,
    });

    await hookService.handleHookEvent("claude-code", {
      ...fixture,
      session_id: sessionId,
      cwd: testDir,
    });

    const session = testDb.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    expect(session).toBeDefined();
    expect(session.plan_markdown).toBe(fixture.tool_response.plan);

    const storedPrompts = JSON.parse(session.allowed_prompts_json);
    expect(storedPrompts).toEqual(fixture.tool_response.allowedPrompts);

    const events = testDb.query("SELECT * FROM events WHERE session_id = ? AND type = 'PostToolUse'").all(sessionId) as any[];
    expect(events).toHaveLength(1);
  });

  test("should handle ExitPlanMode with plan only (no allowedPrompts)", async () => {
    const sessionId = "partial-plan-session";

    await hookService.handleHookEvent("claude-code", {
      ...loadHookPayload("claude-code", "session-start") as any,
      session_id: sessionId,
      cwd: testDir,
    });

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "PostToolUse",
      tool_name: "ExitPlanMode",
      tool_input: {},
      tool_response: { plan: "# Quick Plan" }
    });

    const session = testDb.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    expect(session.plan_markdown).toBe("# Quick Plan");
    expect(session.allowed_prompts_json).toBeNull();
  });

  test("should return plan through SessionService API", async () => {
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const sessionService = new SessionService(testRepo, new GitService(), new GeminiService());
    const sessionId = "api-plan-session";
    const fixture = loadHookPayload("claude-code", "exit-plan-mode") as any;

    await hookService.handleHookEvent("claude-code", {
      ...loadHookPayload("claude-code", "session-start") as any,
      session_id: sessionId,
      cwd: testDir,
    });

    await hookService.handleHookEvent("claude-code", {
      ...fixture,
      session_id: sessionId,
      cwd: testDir,
    });

    const session = await sessionService.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session.plan).toBe(fixture.tool_response.plan);
    expect(session.transcript).toBeFalsy();
  });

  test("should extract token usage from transcript_path on Stop event", async () => {
    // with-cache.jsonl: input=3, output=255, cache_creation=5887, cache_read=10580
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const sessionId = "token-tracking-session";
    const transcriptPath = join(testDir, `${sessionId}.jsonl`);
    await Bun.write(transcriptPath, loadTranscript("with-cache"));

    await hookService.handleHookEvent("claude-code", {
      ...loadHookPayload("claude-code", "session-start") as any,
      session_id: sessionId,
      cwd: testDir,
    });

    await hookService.handleHookEvent("claude-code", {
      ...loadHookPayload("claude-code", "stop") as any,
      session_id: sessionId,
      cwd: testDir,
      transcript_path: transcriptPath,
    });

    const sessionService = new SessionService(testRepo, new GitService(), new GeminiService());
    const session = await sessionService.getSession(sessionId);

    expect(session.total_tokens).toBe(3 + 255 + 5887 + 10580); // 16725
    const raw = JSON.parse(testDb.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(sessionId).token_usage_json);
    expect(raw.input_tokens).toBe(3);
    expect(raw.output_tokens).toBe(255);
    expect(raw.cache_creation_tokens).toBe(5887);
    expect(raw.cache_read_tokens).toBe(10580);
  });

  test("should handle Stop event with missing or nonexistent transcript_path", async () => {
    const sessionId = "no-transcript-session";

    await hookService.handleHookEvent("claude-code", {
      ...loadHookPayload("claude-code", "session-start") as any,
      session_id: sessionId,
      cwd: testDir,
    });

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "Stop",
      transcript_path: join(testDir, "nonexistent.jsonl"),
      last_assistant_message: "Done."
    });

    const row = testDb.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(sessionId) as any;
    expect(row.token_usage_json).toBeNull();
  });

  test("should handle events without token usage", async () => {
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const sessionService = new SessionService(testRepo, new GitService(), new GeminiService());
    const sessionId = "no-tokens-session";

    await hookService.handleHookEvent("claude-code", {
      ...loadHookPayload("claude-code", "session-start") as any,
      session_id: sessionId,
      cwd: testDir,
    });

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ToolCall"
    });

    const session = await sessionService.getSession(sessionId);
    expect(session.total_tokens).toBe(0);

    const toolCallEvent = session.events.find((e: any) => e.type === "ToolCall");
    expect(toolCallEvent.token_usage).toBeUndefined();
    expect(toolCallEvent.cumulative_tokens).toBeUndefined();
  });
});

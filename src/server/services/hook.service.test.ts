import { expect, test, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDashDb } from "../data/dash.db.ts";
import { DashRepository } from "../data/dash.repository.ts";
import { HookService } from "./hook.service.ts";
import { AttributionService } from "./attribution.service.ts";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
    const planContent = "# Session Plan\n\n## Phase 1\n- Task A\n- Task B";
    const allowedPrompts = [
      { tool: "Bash", prompt: "run bun test" },
      { tool: "Bash", prompt: "run git commands" }
    ];

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    });

    // ExitPlanMode arrives as a PostToolUse event; plan is in tool_response
    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "PostToolUse",
      tool_name: "ExitPlanMode",
      tool_input: {},
      tool_response: { plan: planContent, allowedPrompts, filePath: "/tmp/plan.md" }
    });

    const session = testDb.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    expect(session).toBeDefined();
    expect(session.plan_markdown).toBe(planContent);

    const storedPrompts = JSON.parse(session.allowed_prompts_json);
    expect(storedPrompts).toEqual(allowedPrompts);

    const events = testDb.query("SELECT * FROM events WHERE session_id = ? AND type = 'PostToolUse'").all(sessionId) as any[];
    expect(events).toHaveLength(1);
  });

  test("should handle ExitPlanMode with plan only (no allowedPrompts)", async () => {
    const sessionId = "partial-plan-session";
    const planContent = "# Quick Plan";

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    });

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "PostToolUse",
      tool_name: "ExitPlanMode",
      tool_input: {},
      tool_response: { plan: planContent }
    });

    const session = testDb.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    expect(session.plan_markdown).toBe(planContent);
    expect(session.allowed_prompts_json).toBeNull();
  });

  test("should return plan through SessionService API", async () => {
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const gitService = new GitService();
    const geminiService = new GeminiService();
    const sessionService = new SessionService(testRepo, gitService, geminiService);

    const sessionId = "api-plan-session";
    const planContent = "# Test Plan";

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    });

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "PostToolUse",
      tool_name: "ExitPlanMode",
      tool_input: {},
      tool_response: { plan: planContent }
    });

    const session = await sessionService.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session.plan).toBe(planContent);
    expect(session.transcript).toBeFalsy();
  });

  test("should extract token usage from transcript_path on Stop event", async () => {
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const sessionId = "token-tracking-session";
    const transcriptPath = join(testDir, `${sessionId}.jsonl`);

    const makeAssistantLine = (usage: Record<string, number>) =>
      JSON.stringify({ type: "assistant", message: { role: "assistant", usage } });

    await Bun.write(
      transcriptPath,
      [
        makeAssistantLine({ input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 50, cache_read_input_tokens: 25 }),
        makeAssistantLine({ input_tokens: 50, output_tokens: 75 }),
      ].join("\n")
    );

    const sessionStartPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-code"
    };
    await hookService.handleHookEvent("claude-code", sessionStartPayload);

    const stopPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "Stop",
      transcript_path: transcriptPath,
      last_assistant_message: "Done."
    };
    await hookService.handleHookEvent("claude-code", stopPayload);

    const gitService = new GitService();
    const geminiService = new GeminiService();
    const sessionService = new SessionService(testRepo, gitService, geminiService);
    const session = await sessionService.getSession(sessionId);

    // Session should have summed totals from the JSONL transcript
    expect(session.total_tokens).toBe(150 + 275 + 50 + 25); // input+output+cache
    const raw = JSON.parse(testDb.query("SELECT token_usage_json FROM sessions WHERE id = ?").get(sessionId).token_usage_json);
    expect(raw.input_tokens).toBe(150);
    expect(raw.output_tokens).toBe(275);
    expect(raw.cache_creation_tokens).toBe(50);
    expect(raw.cache_read_tokens).toBe(25);
  });

  test("should handle Stop event with missing or nonexistent transcript_path", async () => {
    const sessionId = "no-transcript-session";

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-code"
    });

    // transcript_path points to a nonexistent file — should not throw
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

    const gitService = new GitService();
    const geminiService = new GeminiService();
    const sessionService = new SessionService(testRepo, gitService, geminiService);

    const sessionId = "no-tokens-session";

    await hookService.handleHookEvent("claude-code", {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-code"
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

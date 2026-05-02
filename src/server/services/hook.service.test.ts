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

  test("should capture ExitPlanMode event and store plan, transcript, and allowedPrompts", async () => {
    const sessionId = "test-plan-session";
    const planContent = "# Session Plan\n\n## Phase 1\n- Task A\n- Task B";
    const transcriptContent = "Claude: Hello!\nUser: Let's start with task A";
    const allowedPrompts = [
      { tool: "Bash", prompt: "run bun test" },
      { tool: "Bash", prompt: "run git commands" }
    ];

    // First, create a session
    const sessionStartPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    };
    await hookService.handleHookEvent("claude-code", sessionStartPayload);

    // Then send ExitPlanMode event
    const exitPlanPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ExitPlanMode",
      plan: planContent,
      transcript: transcriptContent,
      allowedPrompts: allowedPrompts
    };
    await hookService.handleHookEvent("claude-code", exitPlanPayload);

    // Verify the data was stored
    const session = testDb.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    expect(session).toBeDefined();
    expect(session.plan_markdown).toBe(planContent);
    expect(session.plan_transcript_text).toBe(transcriptContent);
    
    const storedPrompts = JSON.parse(session.allowed_prompts_json);
    expect(storedPrompts).toEqual(allowedPrompts);

    // Verify event was recorded
    const events = testDb.query("SELECT * FROM events WHERE session_id = ? AND type = 'ExitPlanMode'").all(sessionId) as any[];
    expect(events).toHaveLength(1);
  });

  test("should handle partial ExitPlanMode data", async () => {
    const sessionId = "partial-plan-session";
    const planContent = "# Quick Plan";

    const sessionStartPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    };
    await hookService.handleHookEvent("claude-code", sessionStartPayload);

    // Only send plan, no transcript or allowedPrompts
    const partialPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ExitPlanMode",
      plan: planContent
    };
    await hookService.handleHookEvent("claude-code", partialPayload);

    const session = testDb.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    expect(session.plan_markdown).toBe(planContent);
    expect(session.plan_transcript_text).toBeNull();
    expect(session.allowed_prompts_json).toBeNull();
  });

  test("should return plan and transcript through SessionService API", async () => {
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const gitService = new GitService();
    const geminiService = new GeminiService();
    const sessionService = new SessionService(testRepo, gitService, geminiService);

    const sessionId = "api-plan-session";
    const planContent = "# Test Plan";
    const transcriptContent = "Test transcript";

    const sessionStartPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    };
    await hookService.handleHookEvent("claude-code", sessionStartPayload);

    const exitPlanPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ExitPlanMode",
      plan: planContent,
      transcript: transcriptContent
    };
    await hookService.handleHookEvent("claude-code", exitPlanPayload);

    // Fetch via SessionService
    const session = await sessionService.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session.plan).toBe(planContent);
    expect(session.transcript).toBe(transcriptContent);
  });

  test("should extract token usage from transcript in events", async () => {
    const sessionId = "token-tracking-session";
    const transcriptWithTokens = `
      Interaction 1:
      input_tokens: 100
      output_tokens: 200
      cache_creation_input_tokens: 50
      cache_read_input_tokens: 25
    `;

    const sessionStartPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-code"
    };
    await hookService.handleHookEvent("claude-code", sessionStartPayload);

    // Send an event with transcript containing token data
    const eventPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ToolCall",
      transcript: transcriptWithTokens
    };
    await hookService.handleHookEvent("claude-code", eventPayload);

    // Verify token usage was extracted and stored in event
    const events = testDb.query(
      "SELECT * FROM events WHERE session_id = ? AND type = 'ToolCall'"
    ).all(sessionId) as any[];
    
    expect(events).toHaveLength(1);
    expect(events[0].token_usage_json).toBeDefined();
    
    const tokenUsage = JSON.parse(events[0].token_usage_json);
    expect(tokenUsage.input_tokens).toBe(100);
    expect(tokenUsage.output_tokens).toBe(200);
    expect(tokenUsage.cache_creation_tokens).toBe(50);
    expect(tokenUsage.cache_read_tokens).toBe(25);
  });

  test("should calculate cumulative token usage across events", async () => {
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const gitService = new GitService();
    const geminiService = new GeminiService();
    const sessionService = new SessionService(testRepo, gitService, geminiService);

    const sessionId = "cumulative-tokens-session";

    const sessionStartPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-code"
    };
    await hookService.handleHookEvent("claude-code", sessionStartPayload);

    // Send first event with tokens
    const event1Payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ToolCall",
      transcript: "input_tokens: 100\noutput_tokens: 200"
    };
    await hookService.handleHookEvent("claude-code", event1Payload);

    // Send second event with more tokens
    const event2Payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ToolCall",
      transcript: "input_tokens: 50\noutput_tokens: 100"
    };
    await hookService.handleHookEvent("claude-code", event2Payload);

    // Fetch session and verify cumulative totals
    const session = await sessionService.getSession(sessionId);
    
    expect(session.events).toHaveLength(3); // SessionStart + 2 ToolCalls
    
    // First ToolCall should have cumulative: 100 input, 200 output
    const firstToolCall = session.events.find((e: any) => e.type === "ToolCall" && e.seq === 1);
    expect(firstToolCall.cumulative_tokens).toBeDefined();
    expect(firstToolCall.cumulative_tokens.input_tokens).toBe(100);
    expect(firstToolCall.cumulative_tokens.output_tokens).toBe(200);
    expect(firstToolCall.cumulative_tokens.total).toBe(300);

    // Second ToolCall should have cumulative: 150 input, 300 output
    const secondToolCall = session.events.find((e: any) => e.type === "ToolCall" && e.seq === 2);
    expect(secondToolCall.cumulative_tokens).toBeDefined();
    expect(secondToolCall.cumulative_tokens.input_tokens).toBe(150);
    expect(secondToolCall.cumulative_tokens.output_tokens).toBe(300);
    expect(secondToolCall.cumulative_tokens.total).toBe(450);

    // Session should have total_tokens
    expect(session.total_tokens).toBe(450);
  });

  test("should handle events without token usage", async () => {
    const { SessionService } = await import("./session.service.ts");
    const { GitService } = await import("./git.service.ts");
    const { GeminiService } = await import("./gemini.service.ts");

    const gitService = new GitService();
    const geminiService = new GeminiService();
    const sessionService = new SessionService(testRepo, gitService, geminiService);

    const sessionId = "no-tokens-session";

    const sessionStartPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "claude-code"
    };
    await hookService.handleHookEvent("claude-code", sessionStartPayload);

    // Send event without transcript
    const eventPayload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "ToolCall"
    };
    await hookService.handleHookEvent("claude-code", eventPayload);

    const session = await sessionService.getSession(sessionId);
    expect(session.total_tokens).toBe(0);
    
    const toolCallEvent = session.events.find((e: any) => e.type === "ToolCall");
    expect(toolCallEvent.token_usage).toBeUndefined();
    expect(toolCallEvent.cumulative_tokens).toBeUndefined();
  });
});

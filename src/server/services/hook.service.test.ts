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
});

import { expect, test, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { getRepoId } from "../server/utils/repoId.ts";
import { getDashDb } from "../server/data/dash.db.ts";
import { DashRepository } from "../server/data/dash.repository.ts";
import { HookService } from "../server/services/hook.service.ts";
import { AttributionService } from "../server/services/attribution.service.ts";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Cursor Hook Integration - Full Pipeline", () => {
  const testDir = join(tmpdir(), "cursor-integration-test-" + Math.random().toString(36).slice(2));
  const testDbPath = join(testDir, "test.db");
  let testDb: any;
  let testRepo: DashRepository;
  let hookService: HookService;
  const fixturesDir = join(import.meta.dir, "../../fixtures/hooks/cursor");

  // Load all fixture files
  const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith(".json")).sort();

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
    // Clear all relevant tables
    testDb.run("DELETE FROM checkpoint_sessions");
    testDb.run("DELETE FROM checkpoints");
    testDb.run("DELETE FROM shadow_refs");
    testDb.run("DELETE FROM events");
    testDb.run("DELETE FROM commits");
    testDb.run("DELETE FROM sessions");
    testDb.run("DELETE FROM repos");
  });

  test("should load all cursor fixture files", () => {
    expect(fixtureFiles.length).toBeGreaterThan(0);
    expect(fixtureFiles).toContain("session-start.json");
    expect(fixtureFiles).toContain("session-end.json");
  });

  describe("individual fixture processing", () => {
    fixtureFiles.forEach((fileName) => {
      test(`should process ${fileName} without errors`, () => {
        const filePath = join(fixturesDir, fileName);
        const payload = JSON.parse(readFileSync(filePath, "utf-8"));

        // Ensure required fields are present
        expect(payload).toHaveProperty("conversation_id");
        expect(payload).toHaveProperty("hook_event_name");

        // Should be parseable JSON
        expect(() => JSON.stringify(payload)).not.toThrow();
      });
    });
  });

  describe("session-start payload processing", () => {
    test("should process session-start and persist to database", async () => {
      const sessionId = "cursor-integration-session-start";
      const payload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;

      // Set up payload with test directory
      payload.session_id = sessionId;
      payload.cwd = testDir;
      payload.workspace_roots = [testDir];

      await hookService.handleHookEvent("cursor", payload);

      // Verify repo was created
      const repos = testDb.query("SELECT * FROM repos WHERE path = ?").all(testDir) as any[];
      expect(repos.length).toBeGreaterThan(0);
      const repoId = repos[0].id;

      // Verify session was created with correct agent
      const sessions = testDb
        .query("SELECT * FROM sessions WHERE id = ?")
        .all(sessionId) as any[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].agent).toBe("cursor");
      expect(sessions[0].model).toBe("claude-opus-4-5");
      expect(sessions[0].repo_id).toBe(repoId);
      expect(sessions[0].state).toBe("active");

      // Verify event was recorded
      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ?")
        .all(sessionId) as any[];
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("sessionStart");
      expect(events[0].seq).toBe(0);

      // Verify payload was stored
      const eventPayload = JSON.parse(events[0].payload_json);
      expect(eventPayload.conversation_id).toBe(payload.conversation_id);
      expect(eventPayload.model).toBe("claude-opus-4-5");
      expect(eventPayload.cursor_version).toBe("1.7.2");
    });
  });

  describe("session-end payload processing", () => {
    test("should process session-end and update session state", async () => {
      const sessionId = "cursor-integration-session-end";

      // First create a session
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", startPayload);

      // Now send session-end
      const endPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-end.json"), "utf-8")
      ) as any;
      endPayload.session_id = sessionId;
      endPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", endPayload);

      // Verify session state changed to ended
      const sessions = testDb
        .query("SELECT * FROM sessions WHERE id = ?")
        .all(sessionId) as any[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].state).toBe("ended");
      expect(sessions[0].ended_at).not.toBeNull();

      // Verify both events exist
      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as any[];
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("sessionStart");
      expect(events[1].type).toBe("sessionEnd");
    });
  });

  describe("file edit payload processing", () => {
    test("should process afterFileEdit event with edit details", async () => {
      const sessionId = "cursor-integration-file-edit";

      // Create session first
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", startPayload);

      // Now send file edit event
      const editPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-file-edit.json"), "utf-8")
      ) as any;
      editPayload.session_id = sessionId;
      editPayload.cwd = testDir;
      editPayload.file_path = join(testDir, "src/utils.ts");

      await hookService.handleHookEvent("cursor", editPayload);

      // Verify event was recorded
      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? AND type = ?")
        .all(sessionId, "afterFileEdit") as any[];
      expect(events).toHaveLength(1);

      // Verify edit details in payload
      const eventPayload = JSON.parse(events[0].payload_json);
      expect(eventPayload.file_path).toBe(join(testDir, "src/utils.ts"));
      expect(eventPayload.edits).toBeDefined();
      expect(Array.isArray(eventPayload.edits)).toBe(true);
      expect(eventPayload.edits[0].old_string).toContain("add");
      expect(eventPayload.edits[0].new_string).toContain("/**");
    });
  });

  describe("MCP execution events", () => {
    test("should process beforeMCPExecution event", async () => {
      const sessionId = "cursor-integration-mcp-before";

      // Create session
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", startPayload);

      // Send beforeMCPExecution
      const mcpPayload = JSON.parse(
        readFileSync(join(fixturesDir, "before-mcp-execution.json"), "utf-8")
      ) as any;
      mcpPayload.session_id = sessionId;
      mcpPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", mcpPayload);

      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? AND type = ?")
        .all(sessionId, "beforeMCPExecution") as any[];
      expect(events).toHaveLength(1);

      const payload = JSON.parse(events[0].payload_json);
      expect(payload.tool_name).toBe("filesystem");
      expect(payload.tool_input).toBeDefined();
    });

    test("should process afterMCPExecution event with result", async () => {
      const sessionId = "cursor-integration-mcp-after";

      // Create session
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", startPayload);

      // Send afterMCPExecution
      const mcpPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-mcp-execution.json"), "utf-8")
      ) as any;
      mcpPayload.session_id = sessionId;
      mcpPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", mcpPayload);

      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? AND type = ?")
        .all(sessionId, "afterMCPExecution") as any[];
      expect(events).toHaveLength(1);

      const payload = JSON.parse(events[0].payload_json);
      expect(payload.tool_name).toBe("filesystem");
      expect(payload.duration).toBe(145);
      expect(payload.result_json).toBeDefined();
    });
  });

  describe("shell execution events", () => {
    test("should process afterShellExecution event", async () => {
      const sessionId = "cursor-integration-shell";

      // Create session
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", startPayload);

      // Send shell execution
      const shellPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-shell-execution.json"), "utf-8")
      ) as any;
      shellPayload.session_id = sessionId;
      shellPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", shellPayload);

      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? AND type = ?")
        .all(sessionId, "afterShellExecution") as any[];
      expect(events).toHaveLength(1);

      const payload = JSON.parse(events[0].payload_json);
      expect(payload.command).toBe("npm test");
      expect(payload.output).toContain("PASS");
      expect(payload.duration).toBe(2345);
    });
  });

  describe("payload truncation", () => {
    test("should truncate large string payloads to 50000 characters", async () => {
      const sessionId = "cursor-integration-truncation";

      // Create a payload with a very long string
      const largePayload = {
        conversation_id: "test-conv",
        generation_id: "gen-123",
        model: "claude-opus-4-5",
        hook_event_name: "afterShellExecution",
        cursor_version: "1.7.2",
        workspace_roots: [testDir],
        user_email: "test@example.com",
        session_id: sessionId,
        cwd: testDir,
        command: "npm test",
        output: "x".repeat(100000), // Exceeds 50000 char limit
        duration: 1000,
        sandbox: false,
      };

      await hookService.handleHookEvent("cursor", largePayload);

      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ?")
        .all(sessionId) as any[];
      expect(events).toHaveLength(1);

      const storedPayload = JSON.parse(events[0].payload_json);
      const outputStr = storedPayload.output;

      // Should be truncated to 50000 chars + truncation message
      expect(outputStr.length).toBeLessThan(100000);
      expect(outputStr).toContain("... (truncated)");
      expect(outputStr.length).toBe(50000 + "... (truncated)".length);
    });

    test("should preserve normal-sized payloads without truncation", async () => {
      const sessionId = "cursor-integration-no-truncation";

      const normalPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-file-edit.json"), "utf-8")
      ) as any;
      normalPayload.session_id = sessionId;
      normalPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", normalPayload);

      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ?")
        .all(sessionId) as any[];
      expect(events).toHaveLength(1);

      const storedPayload = JSON.parse(events[0].payload_json);
      // Should not contain truncation message
      expect(JSON.stringify(storedPayload)).not.toContain("... (truncated)");
    });
  });

  describe("agent field validation", () => {
    test("should set agent = 'cursor' for all events", async () => {
      const sessionId = "cursor-integration-agent-validation";

      // Process session-start
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", startPayload);

      // Verify agent is set to cursor
      const sessions = testDb
        .query("SELECT * FROM sessions WHERE id = ?")
        .all(sessionId) as any[];
      expect(sessions[0].agent).toBe("cursor");

      // Process another event
      const editPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-file-edit.json"), "utf-8")
      ) as any;
      editPayload.session_id = sessionId;
      editPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", editPayload);

      // Session agent should still be cursor
      const updatedSessions = testDb
        .query("SELECT * FROM sessions WHERE id = ?")
        .all(sessionId) as any[];
      expect(updatedSessions[0].agent).toBe("cursor");
    });
  });

  describe("full session lifecycle", () => {
    test("should handle complete session lifecycle with multiple events", async () => {
      const sessionId = "cursor-integration-full-lifecycle";
      const testCwd = testDir;

      // Get the repo ID by creating the repo first
      const repoId = await getRepoId(testCwd);
      testRepo.upsertRepo(repoId, testCwd);

      // 1. Session start
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testCwd;

      await hookService.handleHookEvent("cursor", startPayload);

      let sessions = testDb
        .query("SELECT * FROM sessions WHERE id = ?")
        .all(sessionId) as any[];
      expect(sessions[0].state).toBe("active");

      // 2. File edit event
      const editPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-file-edit.json"), "utf-8")
      ) as any;
      editPayload.session_id = sessionId;
      editPayload.cwd = testCwd;
      editPayload.file_path = join(testCwd, "src/utils.ts");

      await hookService.handleHookEvent("cursor", editPayload);

      // 3. MCP execution
      const mcpPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-mcp-execution.json"), "utf-8")
      ) as any;
      mcpPayload.session_id = sessionId;
      mcpPayload.cwd = testCwd;

      await hookService.handleHookEvent("cursor", mcpPayload);

      // 4. Shell execution
      const shellPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-shell-execution.json"), "utf-8")
      ) as any;
      shellPayload.session_id = sessionId;
      shellPayload.cwd = testCwd;

      await hookService.handleHookEvent("cursor", shellPayload);

      // 5. Session end
      const endPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-end.json"), "utf-8")
      ) as any;
      endPayload.session_id = sessionId;
      endPayload.cwd = testCwd;

      await hookService.handleHookEvent("cursor", endPayload);

      // Verify final state
      sessions = testDb
        .query("SELECT * FROM sessions WHERE id = ?")
        .all(sessionId) as any[];
      expect(sessions[0].state).toBe("ended");
      expect(sessions[0].ended_at).not.toBeNull();
      expect(sessions[0].agent).toBe("cursor");

      // Verify all events were recorded
      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as any[];
      expect(events).toHaveLength(5);
      expect(events[0].type).toBe("sessionStart");
      expect(events[1].type).toBe("afterFileEdit");
      expect(events[2].type).toBe("afterMCPExecution");
      expect(events[3].type).toBe("afterShellExecution");
      expect(events[4].type).toBe("sessionEnd");

      // Verify all events have correct sequence
      events.forEach((event, index) => {
        expect(event.seq).toBe(index);
      });
    });
  });

  describe("stop event handling", () => {
    test("should process stop event from fixture", async () => {
      const sessionId = "cursor-integration-stop";

      // Create session
      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", startPayload);

      // Send stop event
      const stopPayload = JSON.parse(
        readFileSync(join(fixturesDir, "stop.json"), "utf-8")
      ) as any;
      stopPayload.session_id = sessionId;
      stopPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", stopPayload);

      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? AND type = ?")
        .all(sessionId, "stop") as any[];
      expect(events).toHaveLength(1);

      const payload = JSON.parse(events[0].payload_json);
      expect(payload.status).toBe("completed");
      expect(payload.loop_count).toBe(0);
    });
  });

  describe("event sequencing", () => {
    test("should assign sequential seq values to events", async () => {
      const sessionId = "cursor-integration-sequencing";

      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;

      // Send 3 events
      await hookService.handleHookEvent("cursor", startPayload);

      const editPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-file-edit.json"), "utf-8")
      ) as any;
      editPayload.session_id = sessionId;
      editPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", editPayload);

      const shellPayload = JSON.parse(
        readFileSync(join(fixturesDir, "after-shell-execution.json"), "utf-8")
      ) as any;
      shellPayload.session_id = sessionId;
      shellPayload.cwd = testDir;

      await hookService.handleHookEvent("cursor", shellPayload);

      const events = testDb
        .query("SELECT * FROM events WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as any[];

      expect(events).toHaveLength(3);
      expect(events[0].seq).toBe(0);
      expect(events[1].seq).toBe(1);
      expect(events[2].seq).toBe(2);
    });
  });

  describe("model field handling", () => {
    test("should correctly set model from cursor payload", async () => {
      const sessionId = "cursor-integration-model-field";

      const startPayload = JSON.parse(
        readFileSync(join(fixturesDir, "session-start.json"), "utf-8")
      ) as any;
      startPayload.session_id = sessionId;
      startPayload.cwd = testDir;
      startPayload.model = "claude-opus-4-5";

      await hookService.handleHookEvent("cursor", startPayload);

      const sessions = testDb
        .query("SELECT * FROM sessions WHERE id = ?")
        .all(sessionId) as any[];
      expect(sessions[0].model).toBe("claude-opus-4-5");
    });
  });
});

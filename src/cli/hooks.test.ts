import { expect, test, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { handleHook } from "./hooks.ts";
import { getRepoId } from "../server/utils/repoId.ts";
import { getDashDb } from "../server/data/dash.db.ts";
import { DashRepository } from "../server/data/dash.repository.ts";
import { HookService } from "../server/services/hook.service.ts";
import { AttributionService } from "../server/services/attribution.service.ts";
import { mkdirSync, rmSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cli/hooks characterization", () => {
  const testDir = join(tmpdir(), "git-ai-dash-test-" + Math.random().toString(36).slice(2));
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
    // Clear relevant tables before each test
    testDb.run("DELETE FROM checkpoint_sessions");
    testDb.run("DELETE FROM checkpoints");
    testDb.run("DELETE FROM shadow_refs");
    testDb.run("DELETE FROM events");
    testDb.run("DELETE FROM commits");
    testDb.run("DELETE FROM sessions");
    testDb.run("DELETE FROM repos");
  });

  test("should record a SessionStart event", async () => {
    const sessionId = "test-session-123";
    const payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    };

    await hookService.handleHookEvent("claude-code", payload);

    const sessions = testDb.query("SELECT * FROM sessions WHERE id = ?").all(sessionId) as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(sessionId);
    expect(sessions[0].agent).toBe("claude-code");
    expect(sessions[0].model).toBe("gpt-4");

    const events = testDb.query("SELECT * FROM events WHERE session_id = ?").all(sessionId) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SessionStart");
  });

  test("should handle shadow snapshots on Stop event", async () => {
    // Initialize git repo in testDir
    await Bun.$`git -C ${testDir} init`;
    await Bun.$`git -C ${testDir} config user.email "test@example.com"`;
    await Bun.$`git -C ${testDir} config user.name "Test User"`;
    await Bun.$`git -C ${testDir} config commit.gpgsign false`;
    
    writeFileSync(join(testDir, "test.txt"), "hello");
    await Bun.$`git -C ${testDir} add test.txt`;
    await Bun.$`git -C ${testDir} commit -m "initial"`;

    // Make a change
    writeFileSync(join(testDir, "test.txt"), "hello world");

    const sessionId = "test-session-stop";
    const payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "Stop"
    };

    await hookService.handleHookEvent("claude-code", payload);

    const specificShadow = testDb.query("SELECT * FROM shadow_refs WHERE session_id = ?").all(sessionId) as any[];
    expect(specificShadow).toHaveLength(1);
    const dirtyPaths = JSON.parse(specificShadow[0].dirty_paths_json);
    expect(Object.keys(dirtyPaths)).toContain("test.txt");
  });

  test("should attribute changes on post-commit hook", async () => {
    // 1. Setup repo and initial commit
    await Bun.$`git -C ${testDir} init`;
    await Bun.$`git -C ${testDir} config user.email "test@example.com"`;
    await Bun.$`git -C ${testDir} config user.name "Test User"`;
    await Bun.$`git -C ${testDir} config commit.gpgsign false`;
    
    const filePath = join(testDir, "feat.txt");
    writeFileSync(filePath, "line 1\nline 2\nline 3\n");
    await Bun.$`git -C ${testDir} add feat.txt`;
    await Bun.$`git -C ${testDir} commit -m "base"`;

    const sessionId = "session-attribution";
    // 2. Mock Session Start and Stop to create shadow ref
    // We'll insert directly to save time/stdin complexity
    const repoId = await getRepoId(testDir);
    testDb.run("INSERT INTO repos (id, path) VALUES (?, ?)", [repoId, testDir]);
    testDb.run(
      "INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES (?, ?, ?, ?, ?)",
      [sessionId, repoId, "claude-code", new Date().toISOString(), "active"]
    );

    // AI makes a change (Stop event)
    writeFileSync(filePath, "line 1\nline 2 AI\nline 3\n");
    // We need to hash it like the hook does
    const aiBlobSha = (await Bun.$`git -C ${testDir} hash-object -w ${filePath}`.text()).trim();
    testDb.run(
      "INSERT INTO shadow_refs (session_id, repo_id, head_commit, dirty_paths_json) VALUES (?, ?, ?, ?)",
      [sessionId, repoId, (await Bun.$`git -C ${testDir} rev-parse HEAD`.text()).trim(), JSON.stringify({ "feat.txt": aiBlobSha })]
    );

    // Human makes more changes before committing
    writeFileSync(filePath, "line 1\nline 2 AI\nline 3 Human\n");
    await Bun.$`git -C ${testDir} add feat.txt`;
    await Bun.$`git -C ${testDir} commit -m "ai and human changes"`;

    // 3. Run post-commit hook
    await hookService.handleGitPostCommit(testDir);

    // 4. Verify attribution
    const checkpoints = testDb.query("SELECT * FROM checkpoints WHERE repo_id = ?").all(repoId) as any[];
    expect(checkpoints).toHaveLength(1);
    const attribution = JSON.parse(checkpoints[0].attribution_json);
    
    // AI changed line 2 (1 addition, 1 deletion)
    // Human changed line 3 (1 addition, 1 deletion)
    expect(attribution.ai_additions).toBe(1);
    expect(attribution.ai_deletions).toBe(1);
    expect(attribution.human_additions).toBe(1);
    expect(attribution.human_deletions).toBe(1);

    // Shadow ref should be cleared
    const shadow = testDb.query("SELECT * FROM shadow_refs WHERE session_id = ?").all(sessionId);
    expect(shadow).toHaveLength(0);
  });

  test("should handle Gemini SessionStart event", async () => {
    const sessionId = "gemini-session-start";
    const payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      timestamp: new Date().toISOString()
    };

    await hookService.handleHookEvent("gemini", payload);

    const sessions = testDb.query("SELECT * FROM sessions WHERE id = ?").all(sessionId) as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(sessionId);
    expect(sessions[0].agent).toBe("gemini");
    expect(sessions[0].model).toBeNull();

    const events = testDb.query("SELECT * FROM events WHERE session_id = ?").all(sessionId) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SessionStart");
  });

  test("should handle Gemini AfterAgent event", async () => {
    const sessionId = "gemini-session-afteragent";
    const repoId = await getRepoId(testDir);

    // Create session
    testDb.run("INSERT INTO repos (id, path) VALUES (?, ?)", [repoId, testDir]);
    testDb.run(
      "INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES (?, ?, ?, ?, ?)",
      [sessionId, repoId, "gemini", new Date().toISOString(), "active"]
    );

    const payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "AfterAgent",
      timestamp: new Date().toISOString()
    };

    await hookService.handleHookEvent("gemini", payload);

    const sessions = testDb.query("SELECT * FROM sessions WHERE id = ?").all(sessionId) as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].state).toBe("idle");

    const events = testDb.query("SELECT * FROM events WHERE session_id = ?").all(sessionId) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("AfterAgent");
  });

  test("should handle Gemini SessionEnd event", async () => {
    const sessionId = "gemini-session-end";
    const repoId = await getRepoId(testDir);

    // Create session
    testDb.run("INSERT INTO repos (id, path) VALUES (?, ?)", [repoId, testDir]);
    testDb.run(
      "INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES (?, ?, ?, ?, ?)",
      [sessionId, repoId, "gemini", new Date().toISOString(), "active"]
    );

    const payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionEnd",
      timestamp: new Date().toISOString()
    };

    await hookService.handleHookEvent("gemini", payload);

    const sessions = testDb.query("SELECT * FROM sessions WHERE id = ?").all(sessionId) as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].state).toBe("ended");
    expect(sessions[0].ended_at).not.toBeNull();

    const events = testDb.query("SELECT * FROM events WHERE session_id = ?").all(sessionId) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SessionEnd");
  });
});

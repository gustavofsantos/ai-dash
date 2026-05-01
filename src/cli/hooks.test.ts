import { expect, test, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { handleHook } from "./hooks.ts";
import { getRepoId } from "../server/utils/repoId.ts";
import { dashDb } from "../server/data/dash.db.ts";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cli/hooks characterization", () => {
  const testDir = join(tmpdir(), "git-ai-dash-test-" + Math.random().toString(36).slice(2));

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear relevant tables before each test
    dashDb.run("DELETE FROM checkpoint_sessions");
    dashDb.run("DELETE FROM checkpoints");
    dashDb.run("DELETE FROM shadow_refs");
    dashDb.run("DELETE FROM events");
    dashDb.run("DELETE FROM commits");
    dashDb.run("DELETE FROM sessions");
    dashDb.run("DELETE FROM repos");
  });

  test("should record a SessionStart event", async () => {
    const sessionId = "test-session-123";
    const payload = {
      session_id: sessionId,
      cwd: testDir,
      hook_event_name: "SessionStart",
      model: "gpt-4"
    };

    // Mock stdin
    const originalStdin = Bun.stdin;
    // @ts-ignore
    Bun.stdin = {
      text: async () => JSON.stringify(payload)
    };

    await handleHook(["claude-code", "SessionStart"]);

    const sessions = dashDb.query("SELECT * FROM sessions WHERE id = ?").all(sessionId) as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(sessionId);
    expect(sessions[0].agent).toBe("claude-code");
    expect(sessions[0].model).toBe("gpt-4");

    const events = dashDb.query("SELECT * FROM events WHERE session_id = ?").all(sessionId) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SessionStart");

    // Restore stdin if needed (though it might not be easy with Bun.stdin)
  });

  test("should handle shadow snapshots on Stop event", async () => {
    // Initialize git repo in testDir
    await Bun.$`git -C ${testDir} init`;
    await Bun.$`git -C ${testDir} config user.email "test@example.com"`;
    await Bun.$`git -C ${testDir} config user.name "Test User"`;
    
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

    // @ts-ignore
    Bun.stdin = {
      text: async () => JSON.stringify(payload)
    };

    await handleHook(["claude-code", "Stop"]);

    const specificShadow = dashDb.query("SELECT * FROM shadow_refs WHERE session_id = ?").all(sessionId) as any[];
    expect(specificShadow).toHaveLength(1);
    const dirtyPaths = JSON.parse(specificShadow[0].dirty_paths_json);
    expect(Object.keys(dirtyPaths)).toContain("test.txt");
  });

  test("should attribute changes on post-commit hook", async () => {
    // 1. Setup repo and initial commit
    await Bun.$`git -C ${testDir} init`;
    await Bun.$`git -C ${testDir} config user.email "test@example.com"`;
    await Bun.$`git -C ${testDir} config user.name "Test User"`;
    
    const filePath = join(testDir, "feat.txt");
    writeFileSync(filePath, "line 1\nline 2\nline 3\n");
    await Bun.$`git -C ${testDir} add feat.txt`;
    await Bun.$`git -C ${testDir} commit -m "base"`;

    const sessionId = "session-attribution";
    // 2. Mock Session Start and Stop to create shadow ref
    // We'll insert directly to save time/stdin complexity
    const repoId = await getRepoId(testDir);
    dashDb.run("INSERT INTO repos (id, path) VALUES (?, ?)", [repoId, testDir]);
    dashDb.run(
      "INSERT INTO sessions (id, repo_id, agent, started_at, state) VALUES (?, ?, ?, ?, ?)",
      [sessionId, repoId, "claude-code", new Date().toISOString(), "active"]
    );

    // AI makes a change (Stop event)
    writeFileSync(filePath, "line 1\nline 2 AI\nline 3\n");
    // We need to hash it like the hook does
    const aiBlobSha = (await Bun.$`git -C ${testDir} hash-object -w ${filePath}`.text()).trim();
    dashDb.run(
      "INSERT INTO shadow_refs (session_id, repo_id, head_commit, dirty_paths_json) VALUES (?, ?, ?, ?)",
      [sessionId, repoId, (await Bun.$`git -C ${testDir} rev-parse HEAD`.text()).trim(), JSON.stringify({ "feat.txt": aiBlobSha })]
    );

    // Human makes more changes before committing
    writeFileSync(filePath, "line 1\nline 2 AI\nline 3 Human\n");
    await Bun.$`git -C ${testDir} add feat.txt`;
    await Bun.$`git -C ${testDir} commit -m "ai and human changes"`;

    // 3. Run post-commit hook
    const originalCwd = process.cwd();
    process.chdir(testDir);
    try {
      await handleHook(["git", "post-commit"]);
    } finally {
      process.chdir(originalCwd);
    }

    // 4. Verify attribution
    const checkpoints = dashDb.query("SELECT * FROM checkpoints WHERE repo_id = ?").all(repoId) as any[];
    expect(checkpoints).toHaveLength(1);
    const attribution = JSON.parse(checkpoints[0].attribution_json);
    
    // AI changed line 2 (1 addition, 1 deletion)
    // Human changed line 3 (1 addition, 1 deletion)
    expect(attribution.ai_additions).toBe(1);
    expect(attribution.ai_deletions).toBe(1);
    expect(attribution.human_additions).toBe(1);
    expect(attribution.human_deletions).toBe(1);

    // Shadow ref should be cleared
    const shadow = dashDb.query("SELECT * FROM shadow_refs WHERE session_id = ?").all(sessionId);
    expect(shadow).toHaveLength(0);
  });
});

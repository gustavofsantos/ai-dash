import { dashDb } from "./dash_db.ts";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export async function handleHook(args: string[]) {
  const tool = args[0]; // e.g., "claude-code" or "git"
  const eventName = args[1];

  if (tool === "git") {
    if (eventName === "post-commit") {
      await handleGitPostCommit(process.cwd());
    } else if (eventName === "prepare-commit-msg") {
      await handleGitPrepareCommitMsg(process.cwd(), args.slice(2));
    }
    return;
  }

  const rawInput = await Bun.stdin.text();
  if (!rawInput) return;

  let payload: any;
  try {
    payload = JSON.parse(rawInput);
  } catch (e) {
    console.error("Failed to parse hook JSON input");
    return;
  }

  const { session_id, cwd, hook_event_name } = payload;
  if (!session_id || !cwd) return;

  const repoId = await getRepoId(cwd);
  
  // Ensure repo exists
  dashDb.run(
    "INSERT OR IGNORE INTO repos (id, path) VALUES (?, ?)",
    [repoId, cwd]
  );

  // Handle Lifecycle
  if (hook_event_name === "SessionStart") {
    dashDb.run(
      `INSERT OR IGNORE INTO sessions (id, repo_id, agent, model, started_at, state)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session_id, repoId, tool, payload.model || "unknown", new Date().toISOString(), "active"]
    );
  }

  // Record Event
  const seqQuery = dashDb.query("SELECT COALESCE(MAX(seq), -1) + 1 as next_seq FROM events WHERE session_id = ?");
  const { next_seq } = seqQuery.get(session_id) as { next_seq: number };

  dashDb.run(
    `INSERT INTO events (id, session_id, seq, ts, type, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), session_id, next_seq, new Date().toISOString(), hook_event_name, rawInput]
  );

  // Handle Shadow Tracking on Stop
  if (hook_event_name === "Stop") {
    await handleShadowSnapshot(session_id, repoId, cwd);
  }

  if (hook_event_name === "SessionEnd") {
    dashDb.run("UPDATE sessions SET state = 'ended', ended_at = ? WHERE id = ?", [new Date().toISOString(), session_id]);
  }
}

async function getRepoId(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256").update(path).digest("hex");
  return hash.slice(0, 12);
}

async function handleShadowSnapshot(sessionId: string, repoId: string, cwd: string) {
  try {
    // 1. Get current HEAD
    const headSha = (await Bun.$`git -C ${cwd} rev-parse HEAD`.text()).trim();

    // 2. Find dirty files (modified or staged)
    const statusRaw = await Bun.$`git -C ${cwd} status --porcelain`.text();
    const dirtyLines = statusRaw.split("\n").filter(l => l.trim() !== "");
    
    const dirtyPaths: Record<string, string> = {};

    for (const line of dirtyLines) {
      const status = line.slice(0, 2);
      const filePath = line.slice(3).trim();
      
      // We only care about modified/added files (M, A, R, C, U)
      // If it's deleted (D), we just track the path as null/deleted
      if (status.includes("M") || status.includes("A") || status.includes("R") || status.includes("C") || status.includes("U") || status.includes("??")) {
        const fullPath = join(cwd, filePath);
        
        // Skip if it's a directory
        try {
          if (require("node:fs").statSync(fullPath).isDirectory()) continue;
        } catch (e) { continue; }
        try {
          // Generate blob in git object store
          const blobSha = (await Bun.$`git -C ${cwd} hash-object -w ${fullPath}`.text()).trim();
          dirtyPaths[filePath] = blobSha;
        } catch (e) {
          console.error(`Failed to hash object ${filePath}:`, e);
        }
      } else if (status.includes("D")) {
        dirtyPaths[filePath] = "deleted";
      }
    }

    // 3. Update shadow_refs
    dashDb.run(
      `INSERT OR REPLACE INTO shadow_refs (session_id, repo_id, head_commit, dirty_paths_json, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, repoId, headSha, JSON.stringify(dirtyPaths), new Date().toISOString()]
    );
  } catch (e) {
    console.error("Shadow snapshot failed:", e);
  }
}

async function handleGitPrepareCommitMsg(cwd: string, gitArgs: string[]) {
  const msgFile = gitArgs[0];
  if (!msgFile) return;

  const repoId = await getRepoId(cwd);
  const activeSessions = dashDb.query("SELECT session_id FROM shadow_refs WHERE repo_id = ?").all(repoId) as any[];
  
  if (activeSessions.length === 0) return;

  let content = await Bun.file(msgFile).text();
  
  // Append trailers
  for (const session of activeSessions) {
    if (!content.includes(`AI-Session: ${session.session_id}`)) {
      content += `\nAI-Session: ${session.session_id}`;
    }
  }

  await Bun.write(msgFile, content);
}

async function handleGitPostCommit(cwd: string) {
  const repoId = await getRepoId(cwd);
  const activeSessions = dashDb.query("SELECT * FROM shadow_refs WHERE repo_id = ?").all(repoId) as any[];
  
  if (activeSessions.length === 0) return;

  const headSha = (await Bun.$`git -C ${cwd} rev-parse HEAD`.text()).trim();
  const parentSha = (await Bun.$`git -C ${cwd} rev-parse HEAD~1`.text()).trim();
  const checkpointId = randomUUID();

  dashDb.run(
    "INSERT INTO checkpoints (id, repo_id, commit_sha, strategy) VALUES (?, ?, ?, ?)",
    [checkpointId, repoId, headSha, "manual"]
  );

  for (const session of activeSessions) {
    const dirtyPaths = JSON.parse(session.dirty_paths_json);
    const attribution = {
      ai_additions: 0,
      ai_deletions: 0,
      human_additions: 0,
      human_deletions: 0
    };

    for (const [path, aiBlobSha] of Object.entries(dirtyPaths)) {
      if (aiBlobSha === "deleted") {
        attribution.ai_deletions++; // Simplified
        continue;
      }

      // Get blob from parent (A)
      let parentBlobSha = "";
      try {
        parentBlobSha = (await Bun.$`git -C ${cwd} rev-parse ${parentSha}:${path}`.text()).trim();
      } catch (e) {
        // File might be new
      }

      // Get blob from HEAD (C)
      let headBlobSha = "";
      try {
        headBlobSha = (await Bun.$`git -C ${cwd} rev-parse ${headSha}:${path}`.text()).trim();
      } catch (e) {
        // File might have been deleted in the final commit
      }

      // AI Diff (A -> B)
      if (parentBlobSha !== aiBlobSha) {
        const aiDiff = await getDiffStats(cwd, parentBlobSha, aiBlobSha as string);
        attribution.ai_additions += aiDiff.additions;
        attribution.ai_deletions += aiDiff.deletions;
      }

      // Human Diff (B -> C)
      if (aiBlobSha !== headBlobSha) {
        const humanDiff = await getDiffStats(cwd, aiBlobSha as string, headBlobSha);
        attribution.human_additions += humanDiff.additions;
        attribution.human_deletions += humanDiff.deletions;
      }
    }

    // Update Checkpoint with attribution
    dashDb.run(
      "UPDATE checkpoints SET attribution_json = ? WHERE id = ?",
      [JSON.stringify(attribution), checkpointId]
    );

    // Link session to checkpoint
    dashDb.run(
      "INSERT INTO checkpoint_sessions (checkpoint_id, session_id) VALUES (?, ?)",
      [checkpointId, session.session_id]
    );

    // Clear shadow ref
    dashDb.run("DELETE FROM shadow_refs WHERE session_id = ?", [session.session_id]);
    
    // Mark session as idle or check if it should be ended
    dashDb.run("UPDATE sessions SET state = 'idle' WHERE id = ? AND state = 'active'", [session.session_id]);
  }

  console.log(`Reconciled ${activeSessions.length} sessions for commit ${headSha.slice(0, 7)}`);
}

async function getDiffStats(cwd: string, shaA: string, shaB: string): Promise<{ additions: number, deletions: number }> {
  if (!shaA) {
    // New file: count all lines in B
    if (!shaB || shaB === "deleted") return { additions: 0, deletions: 0 };
    try {
      const content = await Bun.$`git -C ${cwd} cat-file -p ${shaB}`.text();
      return { additions: content.split("\n").length, deletions: 0 };
    } catch (e) {
      return { additions: 0, deletions: 0 };
    }
  }
  if (!shaB || shaB === "deleted") {
    // Deleted file: count all lines in A as deletions
    try {
      const content = await Bun.$`git -C ${cwd} cat-file -p ${shaA}`.text();
      return { additions: 0, deletions: content.split("\n").length };
    } catch (e) {
      return { additions: 0, deletions: 0 };
    }
  }

  try {
    const raw = await Bun.$`git -C ${cwd} diff --numstat ${shaA} ${shaB}`.text();
    const parts = raw.trim().split(/\s+/);
    const add = Number(parts[0]);
    const del = Number(parts[1]);
    return { additions: isNaN(add) ? 0 : add, deletions: isNaN(del) ? 0 : del };
  } catch (e) {
    return { additions: 0, deletions: 0 };
  }
}

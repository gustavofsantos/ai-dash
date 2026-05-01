import { dashDb } from "../server/dash_db.ts";
import { crypto } from "bun";

export async function reconcileRepo(cwd: string) {
  const repoId = await getRepoId(cwd);

  // Ensure repo exists
  dashDb.run(
    "INSERT OR IGNORE INTO repos (id, path) VALUES (?, ?)",
    [repoId, cwd]
  );

  console.log(`Reconciling repo ${cwd}...`);

  // Get commits with trailers
  // Format: SHA|AuthorName|AuthorEmail|Date|Subject|Trailers
  const logRaw = await Bun.$`git -C ${cwd} log --format="%H|%an|%ae|%ai|%s|%(trailers:key=AI-Session,valueonly=true)"`.text();
  const lines = logRaw.split("\n").filter(l => l.trim() !== "");

  let newCommits = 0;
  let linkedSessions = 0;

  for (const line of lines) {
    const [sha, name, email, date, subject, sessionsRaw] = line.split("|");
    
    // 1. Insert commit into cache
    const changed = dashDb.run(
      `INSERT OR IGNORE INTO commits (sha, repo_id, message, author_name, author_email, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sha, repoId, subject, name, email, date]
    );

    if (changed.changes > 0) newCommits++;

    // 2. Handle AI-Session trailers
    if (sessionsRaw) {
      const sessionIds = sessionsRaw.split(/\s+/).filter(id => id.trim() !== "");
      for (const sessionId of sessionIds) {
        // Ensure session exists (even if we don't have events for it yet)
        dashDb.run(
          "INSERT OR IGNORE INTO sessions (id, repo_id, agent, started_at) VALUES (?, ?, ?, ?)",
          [sessionId, repoId, "unknown", date]
        );

        // Ensure checkpoint exists for this commit
        const cpId = crypto.randomUUID();
        dashDb.run(
          "INSERT OR IGNORE INTO checkpoints (id, repo_id, commit_sha, strategy) VALUES (?, ?, ?, ?)",
          [cpId, repoId, sha, "discovered"]
        );

        // Get the real checkpoint ID if it already existed
        const cp = dashDb.query("SELECT id FROM checkpoints WHERE commit_sha = ?").get(sha) as { id: string };

        // Link session to checkpoint
        const link = dashDb.run(
          "INSERT OR IGNORE INTO checkpoint_sessions (checkpoint_id, session_id) VALUES (?, ?)",
          [cp.id, sessionId]
        );
        if (link.changes > 0) linkedSessions++;
      }
    }
  }

  console.log(`Reconciliation complete: ${newCommits} new commits, ${linkedSessions} sessions linked.`);
}

async function getRepoId(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256").update(path).digest("hex");
  return hash.slice(0, 12);
}

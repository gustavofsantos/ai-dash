import { DashRepository } from "../data/dash.repository.ts";
import { getRepoId } from "../utils/repoId.ts";
import { crypto } from "bun";

export class ReconcileService {
  constructor(private repository: DashRepository) {}

  async reconcileRepo(cwd: string) {
    const repoId = await getRepoId(cwd);

    // Ensure repo exists
    this.repository.upsertRepo(repoId, cwd);

    console.log(`Reconciling repo ${cwd}...`);

    // Get commits with trailers
    const logRaw = await Bun.$`git -C ${cwd} log --format="%H|%an|%ae|%ai|%s|%(trailers:key=AI-Session,valueonly=true)"`.text();
    const lines = logRaw.split("\n").filter(l => l.trim() !== "");

    let newCommits = 0;
    let linkedSessions = 0;

    for (const line of lines) {
      const [sha, name, email, date, subject, sessionsRaw] = line.split("|");
      
      // 1. Insert commit into cache
      const changed = this.repository.insertCommit({
        sha,
        repo_id: repoId,
        message: subject,
        author_name: name,
        author_email: email,
        date
      });

      if ((changed as any).changes > 0) newCommits++;

      // 2. Handle AI-Session trailers
      if (sessionsRaw) {
        const sessionIds = sessionsRaw.split(/\s+/).filter(id => id.trim() !== "");
        for (const sessionId of sessionIds) {
          // Ensure session exists
          this.repository.insertSession({
            id: sessionId,
            repo_id: repoId,
            agent: "unknown",
            started_at: date
          });

          // Ensure checkpoint exists for this commit
          const cpId = crypto.randomUUID();
          this.repository.insertCheckpoint({
            id: cpId,
            repo_id: repoId,
            commit_sha: sha,
            strategy: "discovered"
          });

          // Get the real checkpoint if it already existed
          const cp = this.repository.getCheckpointBySha(sha);

          // Link session to checkpoint
          const link = this.repository.linkCheckpointSession(cp.id, sessionId);
          if ((link as any).changes > 0) linkedSessions++;
        }
      }
    }

    console.log(`Reconciliation complete: ${newCommits} new commits, ${linkedSessions} sessions linked.`);
  }
}

import { DashRepository } from "../data/dash.repository.ts";
import { AttributionService } from "./attribution.service.ts";
import { getRepoId } from "../utils/repoId.ts";
import { extractTokenUsageFromTranscript } from "../utils/tokenUsageParser.ts";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { statSync, existsSync } from "node:fs";

export class HookService {
  constructor(
    private repository: DashRepository,
    private attributionService: AttributionService
  ) {}

  async handleHookEvent(tool: string, payload: any) {
    const { session_id, cwd, hook_event_name } = payload;
    if (!session_id || !cwd) return;

    const repoId = await getRepoId(cwd);
    
    // Ensure repo exists
    this.repository.upsertRepo(repoId, cwd);

    // Ensure session exists
    this.repository.insertSession({
      id: session_id,
      repo_id: repoId,
      agent: tool,
      model: payload.model,
      started_at: new Date().toISOString(),
      state: "active"
    });

    // Update session info if this is a SessionStart event
    if (hook_event_name === "SessionStart") {
      this.repository.updateSession(session_id, {
        model: payload.model || "unknown",
        agent: tool
      });
    }

    // Record Event
    const nextSeq = this.repository.getNextEventSeq(session_id);
    this.repository.insertEvent({
      id: randomUUID(),
      session_id,
      seq: nextSeq,
      ts: new Date().toISOString(),
      type: hook_event_name,
      payload_json: JSON.stringify(payload)
    });

    // Handle Shadow Tracking on Stop
    if (hook_event_name === "Stop") {
      await this.handleShadowSnapshot(session_id, repoId, cwd);
    }

    if (hook_event_name === "ExitPlanMode") {
      const updates: Record<string, any> = {};
      
      if (payload.plan) {
        updates.plan_markdown = payload.plan;
      }
      if (payload.transcript) {
        updates.plan_transcript_text = payload.transcript;
        
        // Extract token usage from transcript
        const tokenUsage = extractTokenUsageFromTranscript(payload.transcript);
        if (tokenUsage) {
          updates.token_usage_json = JSON.stringify(tokenUsage);
        }
      }
      if (payload.allowedPrompts) {
        updates.allowed_prompts_json = JSON.stringify(payload.allowedPrompts);
      }
      
      if (Object.keys(updates).length > 0) {
        this.repository.updateSession(session_id, updates);
      }
    }

    if (hook_event_name === "SessionEnd") {
      const updates: Record<string, any> = { state: "ended", ended_at: new Date().toISOString() };
      // Note: token_usage is no longer populated from .git/entire-sessions
      // Token usage analytics will need to be implemented via a different data source
      this.repository.updateSession(session_id, updates);
    }
  }

  async handleShadowSnapshot(sessionId: string, repoId: string, cwd: string) {
    try {
      const headSha = (await Bun.$`git -C ${cwd} rev-parse HEAD`.text()).trim();
      const statusRaw = await Bun.$`git -C ${cwd} status --porcelain`.text();
      const dirtyLines = statusRaw.split("\n").filter(l => l.trim() !== "");
      
      const dirtyPaths: Record<string, string> = {};

      for (const line of dirtyLines) {
        const status = line.slice(0, 2);
        const filePath = line.slice(3).trim();
        
        if (status.includes("M") || status.includes("A") || status.includes("R") || status.includes("C") || status.includes("U") || status.includes("??")) {
          const fullPath = join(cwd, filePath);
          
          try {
            if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) continue;
            const blobSha = (await Bun.$`git -C ${cwd} hash-object -w ${fullPath}`.text()).trim();
            dirtyPaths[filePath] = blobSha;
          } catch (e) {
            console.error(`Failed to hash object ${filePath}:`, e);
          }
        } else if (status.includes("D")) {
          dirtyPaths[filePath] = "deleted";
        }
      }

      this.repository.upsertShadowRef({
        session_id: sessionId,
        repo_id: repoId,
        head_commit: headSha,
        dirty_paths_json: JSON.stringify(dirtyPaths),
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("Shadow snapshot failed:", e);
    }
  }

  async handleGitPrepareCommitMsg(cwd: string, gitArgs: string[]) {
    const msgFile = gitArgs[0];
    if (!msgFile) return;

    const repoId = await getRepoId(cwd);
    const activeSessions = this.repository.getShadowRefsByRepo(repoId);
    
    if (activeSessions.length === 0) return;

    let content = await Bun.file(msgFile).text();
    
    for (const session of activeSessions) {
      if (!content.includes(`AI-Session: ${session.session_id}`)) {
        content += `\nAI-Session: ${session.session_id}`;
      }
    }

    await Bun.write(msgFile, content);
  }

  async handleGitPostCommit(cwd: string) {
    const repoId = await getRepoId(cwd);
    const activeSessions = this.repository.getShadowRefsByRepo(repoId);
    
    if (activeSessions.length === 0) return;

    const headSha = (await Bun.$`git -C ${cwd} rev-parse HEAD`.text()).trim();
    const parentSha = (await Bun.$`git -C ${cwd} rev-parse HEAD~1`.text()).trim();
    const checkpointId = randomUUID();

    this.repository.insertCheckpoint({
      id: checkpointId,
      repo_id: repoId,
      commit_sha: headSha,
      strategy: "manual"
    });

    try {
      const logLine = (await Bun.$`git -C ${cwd} log -1 --format="%an|%ae|%s"`.text()).trim();
      const [authorName, authorEmail, message] = logLine.split("|");
      this.repository.insertCommit({
        sha: headSha,
        repo_id: repoId,
        message: message || "",
        author_name: authorName || "",
        author_email: authorEmail || "",
        date: new Date().toISOString()
      });
    } catch (e) {
      console.error("Failed to store commit author:", e);
    }

    for (const session of activeSessions) {
      const dirtyPaths = JSON.parse(session.dirty_paths_json);
      const attribution = await this.attributionService.calculateAttribution(cwd, parentSha, headSha, dirtyPaths);

      this.repository.updateCheckpointAttribution(checkpointId, JSON.stringify(attribution));
      this.repository.linkCheckpointSession(checkpointId, session.session_id);
      this.repository.deleteShadowRef(session.session_id);
      
      this.repository.updateSession(session.session_id, { state: "idle" });
    }

    console.log(`Reconciled ${activeSessions.length} sessions for commit ${headSha.slice(0, 7)}`);
  }
}

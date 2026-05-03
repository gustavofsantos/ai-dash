import { DashRepository } from "../data/dash.repository.ts";
import { AttributionService } from "./attribution.service.ts";
import { GeminiService } from "./gemini.service.ts";
import { getRepoId } from "../utils/repoId.ts";
import { extractTokenUsageFromTranscriptJsonl } from "../utils/tokenUsageParser.ts";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { statSync, existsSync } from "node:fs";

export class HookService {
  private geminiService: GeminiService;

  constructor(
    private repository: DashRepository,
    private attributionService: AttributionService
  ) {
    this.geminiService = new GeminiService();
  }

  async handleHookEvent(tool: string, payload: any) {
    const { session_id, cwd, hook_event_name } = payload;
    if (!session_id || !cwd) return;

    const repoId = await getRepoId(cwd);
    
    // Ensure repo exists
    this.repository.upsertRepo(repoId, cwd);

    // Ensure session exists
    // For Gemini, model is always null (no model field in payload)
    const sessionModel = tool === "gemini" ? null : payload.model;
    this.repository.insertSession({
      id: session_id,
      repo_id: repoId,
      agent: tool,
      model: sessionModel,
      started_at: new Date().toISOString(),
      state: "active"
    });

    // Update session info if this is a SessionStart event
    if (hook_event_name === "SessionStart") {
      const updates: Record<string, any> = { agent: tool };
      if (tool !== "gemini") {
        // For Claude Code, set model to payload.model or "unknown"
        updates.model = payload.model || "unknown";
      }
      // For Gemini, model stays null (no payload.model field)
      this.repository.updateSession(session_id, updates);
    }

    // Handle Gemini lifecycle events
    if (tool === "gemini") {
      await this._handleGeminiEvent(session_id, hook_event_name, payload, repoId, cwd);
    }

    // Record Event
    const nextSeq = this.repository.getNextEventSeq(session_id);

    const processedPayload = this.truncatePayload(payload);

    this.repository.insertEvent({
      id: randomUUID(),
      session_id,
      seq: nextSeq,
      ts: new Date().toISOString(),
      type: hook_event_name,
      payload_json: JSON.stringify(processedPayload),
      token_usage_json: null
    });

    // Handle Shadow Tracking on Stop
    if (hook_event_name === "Stop") {
      await this.handleShadowSnapshot(session_id, repoId, cwd);
      await this.updateSessionTokenUsageFromTranscript(session_id, payload.transcript_path);
    }

    if (hook_event_name === "PostToolUse" && payload.tool_name === "ExitPlanMode") {
      const updates: Record<string, any> = {};

      // Plan content is in tool_response.plan (Claude Code ≥2.x) or tool_input.plan (older)
      const plan = payload.tool_response?.plan ?? payload.tool_input?.plan;
      if (plan) updates.plan_markdown = plan;

      const allowedPrompts = payload.tool_response?.allowedPrompts ?? payload.tool_input?.allowedPrompts;
      if (allowedPrompts) updates.allowed_prompts_json = JSON.stringify(allowedPrompts);

      if (Object.keys(updates).length > 0) {
        this.repository.updateSession(session_id, updates);
      }
    }

    if (hook_event_name === "SessionEnd") {
      this.repository.updateSession(session_id, { state: "ended", ended_at: new Date().toISOString() });
      await this.updateSessionTokenUsageFromTranscript(session_id, payload.transcript_path);
    }
  }

  private async _handleGeminiEvent(session_id: string, hook_event_name: string, payload: any, repoId: string, cwd: string) {
    if (hook_event_name === "AfterAgent") {
      this.repository.updateSession(session_id, { state: "idle" });
      
      // Extract model from transcript
      if (payload.transcript_path) {
        await this._backfillGeminiModel(session_id, payload.transcript_path);
        await this._extractGeminiTokenUsage(session_id, payload.transcript_path);
      }

      // Shadow snapshot (same as Claude's Stop)
      await this.handleShadowSnapshot(session_id, repoId, cwd);
    }
  }

  private async _backfillGeminiModel(session_id: string, transcriptPath: string) {
    if (!existsSync(transcriptPath)) return;
    try {
      const result = await this.geminiService.parseGeminiTranscript(transcriptPath);
      if (result?.model) {
        this.repository.updateSession(session_id, { model: result.model });
      }
    } catch (e) {
      console.error("Failed to extract model from Gemini transcript:", e);
    }
  }

  private async _extractGeminiTokenUsage(session_id: string, transcriptPath: string) {
    if (!existsSync(transcriptPath)) return;
    try {
      const result = await this.geminiService.parseGeminiTranscript(transcriptPath);
      if (result?.tokenCounts) {
        const tokenUsage = this.geminiService.extractGeminiTokenUsage(result.tokenCounts);
        if (tokenUsage) {
          this.repository.updateSession(session_id, { token_usage_json: JSON.stringify(tokenUsage) });
        }
      }
    } catch (e) {
      console.error("Failed to extract token usage from Gemini transcript:", e);
    }
  }

  async updateSessionTokenUsageFromTranscript(sessionId: string, transcriptPath?: string) {
    if (!transcriptPath || !existsSync(transcriptPath)) return;
    try {
      const content = await Bun.file(transcriptPath).text();
      const tokenUsage = extractTokenUsageFromTranscriptJsonl(content);
      if (tokenUsage) {
        this.repository.updateSession(sessionId, { token_usage_json: JSON.stringify(tokenUsage) });
      }
    } catch (e) {
      console.error("Failed to extract token usage from transcript:", e);
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

  private truncatePayload(payload: any): any {
    if (!payload || typeof payload !== "object") return payload;

    const MAX_SIZE = 50000;
    const TRUNCATED_MSG = "... (truncated)";

    const truncate = (val: any): any => {
      if (typeof val === "string" && val.length > MAX_SIZE) {
        return val.slice(0, MAX_SIZE) + TRUNCATED_MSG;
      }
      if (Array.isArray(val)) {
        return val.map(truncate);
      }
      if (val !== null && typeof val === "object") {
        const result: any = {};
        for (const key in val) {
          result[key] = truncate(val[key]);
        }
        return result;
      }
      return val;
    };

    return truncate(payload);
  }
}

import type { DashEvent } from "../../types/canonical.ts";
import type { DashRepository } from "../data/dash.repository.ts";
import { GeminiService } from "../services/gemini.service.ts";
import { AttributionService } from "../services/attribution.service.ts";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const geminiService = new GeminiService();
const attributionService = new AttributionService();

export async function persistEvent(event: DashEvent, cwd: string, repo: DashRepository): Promise<void> {
  const { sessionId, repoId, agent, type, ts, payload, tokenUsage, model } = event;

  // Git events are handled separately (no session concept)
  if (agent === "git") {
    if (type === "post-commit") {
      await handleGitPostCommit(cwd, repo);
    } else if (type === "prepare-commit-msg") {
      await handleGitPrepareCommitMsg(cwd, (payload as any).commit_msg_file, repo);
    }
    return;
  }

  if (!sessionId) return;

  // Upsert session
  const sessionModel = agent === "gemini" ? null : ((payload as any).model ?? null);
  repo.insertSession({
    id: sessionId,
    repo_id: repoId,
    agent,
    model: sessionModel,
    started_at: ts,
    state: "active",
  });

  // Apply event-specific session mutations
  if (type === "SessionStart") {
    const updates: Record<string, any> = { agent };
    if (agent !== "gemini") updates.model = (payload as any).model || "unknown";
    repo.updateSession(sessionId, updates);
  }

  if (type === "AfterAgent") {
    repo.updateSession(sessionId, { state: "idle" });
    if ((payload as any).transcript_path) {
      await backfillGeminiModel(sessionId, (payload as any).transcript_path, repo);
      await extractGeminiTokenUsage(sessionId, (payload as any).transcript_path, repo);
    }
  }

  if (type === "PostToolUse" && (payload as any).tool_name === "ExitPlanMode") {
    const updates: Record<string, any> = {};
    const plan = (payload as any).tool_response?.plan ?? (payload as any).tool_input?.plan;
    if (plan) updates.plan_markdown = plan;
    const allowedPrompts = (payload as any).tool_response?.allowedPrompts ?? (payload as any).tool_input?.allowedPrompts;
    if (allowedPrompts) updates.allowed_prompts_json = JSON.stringify(allowedPrompts);
    if (Object.keys(updates).length > 0) repo.updateSession(sessionId, updates);
  }

  if (type === "Stop") {
    if (tokenUsage) {
      repo.updateSession(sessionId, { token_usage_json: JSON.stringify(tokenUsage) });
    }
    try {
      await handleShadowSnapshot(sessionId, repoId, cwd, repo);
    } catch (e) {
      console.error("[pipeline] Shadow snapshot failed:", e);
    }
  }

  if (type === "SessionEnd") {
    const updates: Record<string, any> = { state: "ended", ended_at: ts };
    if (tokenUsage) updates.token_usage_json = JSON.stringify(tokenUsage);
    repo.updateSession(sessionId, updates);
  }

  // Record the event
  const nextSeq = repo.getNextEventSeq(sessionId);
  repo.insertEvent({
    id: event.id,
    session_id: sessionId,
    seq: nextSeq,
    ts,
    type,
    payload_json: JSON.stringify(truncatePayload(payload)),
    token_usage_json: tokenUsage ? JSON.stringify(tokenUsage) : null,
  });
}

async function handleShadowSnapshot(sessionId: string, repoId: string, cwd: string, repo: DashRepository) {
  const headSha = (await Bun.$`git -C ${cwd} rev-parse HEAD`.text()).trim();
  const statusRaw = await Bun.$`git -C ${cwd} status --porcelain`.text();
  const dirtyLines = statusRaw.split("\n").filter(l => l.trim() !== "");
  const dirtyPaths: Record<string, string> = {};

  for (const line of dirtyLines) {
    const status = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (status.includes("M") || status.includes("A") || status.includes("R") || status.includes("C") || status.includes("U") || status.includes("??")) {
      try {
        const { join } = await import("node:path");
        const { statSync } = await import("node:fs");
        const fullPath = join(cwd, filePath);
        if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) continue;
        const blobSha = (await Bun.$`git -C ${cwd} hash-object -w ${fullPath}`.text()).trim();
        dirtyPaths[filePath] = blobSha;
      } catch {}
    } else if (status.includes("D")) {
      dirtyPaths[filePath] = "deleted";
    }
  }

  repo.upsertShadowRef({
    session_id: sessionId,
    repo_id: repoId,
    head_commit: headSha,
    dirty_paths_json: JSON.stringify(dirtyPaths),
    updated_at: new Date().toISOString(),
  });
}

async function handleGitPrepareCommitMsg(cwd: string, msgFile: string, repo: DashRepository) {
  const { getRepoId } = await import("../utils/repoId.ts");
  const repoId = await getRepoId(cwd);
  const activeSessions = repo.getShadowRefsByRepo(repoId);
  if (activeSessions.length === 0 || !msgFile) return;

  let content = await Bun.file(msgFile).text();
  for (const session of activeSessions) {
    if (!content.includes(`AI-Session: ${session.session_id}`)) {
      content += `\nAI-Session: ${session.session_id}`;
    }
  }
  await Bun.write(msgFile, content);
}

async function handleGitPostCommit(cwd: string, repo: DashRepository) {
  const { getRepoId } = await import("../utils/repoId.ts");
  const repoId = await getRepoId(cwd);
  const activeSessions = repo.getShadowRefsByRepo(repoId);
  if (activeSessions.length === 0) return;

  const headSha = (await Bun.$`git -C ${cwd} rev-parse HEAD`.text()).trim();
  const parentSha = (await Bun.$`git -C ${cwd} rev-parse HEAD~1`.text()).trim();
  const checkpointId = randomUUID();

  repo.insertCheckpoint({ id: checkpointId, repo_id: repoId, commit_sha: headSha, strategy: "manual" });

  try {
    const logLine = (await Bun.$`git -C ${cwd} log -1 --format="%an|%ae|%s"`.text()).trim();
    const [authorName, authorEmail, message] = logLine.split("|");
    repo.insertCommit({ sha: headSha, repo_id: repoId, message: message || "", author_name: authorName || "", author_email: authorEmail || "", date: new Date().toISOString() });
  } catch {}

  for (const session of activeSessions) {
    const dirtyPaths = JSON.parse(session.dirty_paths_json);
    const attribution = await attributionService.calculateAttribution(cwd, parentSha, headSha, dirtyPaths);
    repo.updateCheckpointAttribution(checkpointId, JSON.stringify(attribution));
    repo.linkCheckpointSession(checkpointId, session.session_id);
    repo.deleteShadowRef(session.session_id);
    repo.updateSession(session.session_id, { state: "idle" });
  }

  console.log(`[pipeline] Reconciled ${activeSessions.length} sessions for commit ${headSha.slice(0, 7)}`);
}

async function backfillGeminiModel(sessionId: string, transcriptPath: string, repo: DashRepository) {
  if (!existsSync(transcriptPath)) return;
  try {
    const result = await geminiService.parseGeminiTranscript(transcriptPath);
    if (result?.model) repo.updateSession(sessionId, { model: result.model });
  } catch {}
}

async function extractGeminiTokenUsage(sessionId: string, transcriptPath: string, repo: DashRepository) {
  if (!existsSync(transcriptPath)) return;
  try {
    const result = await geminiService.parseGeminiTranscript(transcriptPath);
    if (result?.tokenCounts) {
      const usage = geminiService.extractGeminiTokenUsage(result.tokenCounts);
      if (usage) repo.updateSession(sessionId, { token_usage_json: JSON.stringify(usage) });
    }
  } catch {}
}

function truncatePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const MAX = 50000;
  const truncate = (val: any): any => {
    if (typeof val === "string" && val.length > MAX) return val.slice(0, MAX) + "... (truncated)";
    if (Array.isArray(val)) return val.map(truncate);
    if (val !== null && typeof val === "object") {
      const result: any = {};
      for (const key in val) result[key] = truncate(val[key]);
      return result;
    }
    return val;
  };
  return truncate(payload);
}

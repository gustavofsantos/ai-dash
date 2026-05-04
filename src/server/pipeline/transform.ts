import { randomUUID } from "node:crypto";
import type { Envelope } from "../../types/envelope.ts";
import type { DashEvent } from "../../types/canonical.ts";

type Transformer = (envelope: Envelope, repoId: string) => DashEvent;

const transformers: Record<string, Transformer> = {};

function register(agent: string, event: string, fn: Transformer) {
  transformers[`${agent}/${event}`] = fn;
}

// --- Claude Code ---

register("claude-code", "SessionStart", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "claude-code",
  type: "SessionStart",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
  model: (env.payload as any).model,
}));

register("claude-code", "UserPromptSubmit", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "claude-code",
  type: "UserPromptSubmit",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
}));

register("claude-code", "PreToolUse", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "claude-code",
  type: "PreToolUse",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
}));

register("claude-code", "PostToolUse", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "claude-code",
  type: "PostToolUse",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
}));

register("claude-code", "Stop", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "claude-code",
  type: "Stop",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
  transcriptPath: (env.payload as any).transcript_path,
}));

register("claude-code", "SessionEnd", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "claude-code",
  type: "SessionEnd",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
  transcriptPath: (env.payload as any).transcript_path,
}));

// --- Gemini ---

register("gemini", "SessionStart", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "gemini",
  type: "SessionStart",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
}));

register("gemini", "AfterAgent", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "gemini",
  type: "AfterAgent",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
  transcriptPath: (env.payload as any).transcript_path,
}));

register("gemini", "SessionEnd", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as any).session_id,
  repoId,
  agent: "gemini",
  type: "SessionEnd",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
}));

// --- Git ---

register("git", "post-commit", (env, repoId) => ({
  id: randomUUID(),
  sessionId: "",
  repoId,
  agent: "git",
  type: "post-commit",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
}));

register("git", "prepare-commit-msg", (env, repoId) => ({
  id: randomUUID(),
  sessionId: "",
  repoId,
  agent: "git",
  type: "prepare-commit-msg",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
}));

export function transformEnvelope(envelope: Envelope, repoId: string): DashEvent {
  const key = `${envelope.source.agent}/${envelope.source.event}`;
  const transformer = transformers[key];

  if (!transformer) {
    // Fallback: store the event verbatim so unknown events aren't silently dropped
    return {
      id: randomUUID(),
      sessionId: (envelope.payload as any)?.session_id ?? "",
      repoId,
      agent: envelope.source.agent as any,
      type: envelope.source.event,
      ts: envelope.source.timestamp,
      payload: envelope.payload as Record<string, unknown>,
    };
  }

  return transformer(envelope, repoId);
}

export function hasTransformer(agent: string, event: string): boolean {
  return `${agent}/${event}` in transformers;
}

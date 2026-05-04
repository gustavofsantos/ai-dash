import type { Envelope } from "../../types/envelope.ts";

const KNOWN_AGENTS = new Set(["claude-code", "gemini", "git"]);

export function validateEnvelope(raw: unknown): Envelope {
  if (!raw || typeof raw !== "object") {
    throw new Error("Envelope must be a non-null object");
  }

  const env = raw as Record<string, unknown>;

  if (typeof env.id !== "string" || !env.id) {
    throw new Error("Envelope missing required field: id");
  }

  if (!env.source || typeof env.source !== "object") {
    throw new Error("Envelope missing required field: source");
  }

  const source = env.source as Record<string, unknown>;

  if (typeof source.agent !== "string" || !KNOWN_AGENTS.has(source.agent)) {
    throw new Error(`Unknown agent: ${source.agent}`);
  }

  if (typeof source.event !== "string" || !source.event) {
    throw new Error("Envelope source missing required field: event");
  }

  if (typeof source.repoDirPath !== "string" || !source.repoDirPath) {
    throw new Error("Envelope source missing required field: repoDirPath");
  }

  if (typeof source.cwd !== "string" || !source.cwd) {
    throw new Error("Envelope source missing required field: cwd");
  }

  if (typeof source.timestamp !== "string" || !source.timestamp) {
    throw new Error("Envelope source missing required field: timestamp");
  }

  return env as unknown as Envelope;
}

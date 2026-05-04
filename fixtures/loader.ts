import { join } from "node:path";
import { readFileSync } from "node:fs";

const dir = import.meta.dir;

export function loadHookPayload(
  agent: "claude-code" | "gemini" | "git",
  event: string
): unknown {
  const path = join(dir, "hooks", agent, `${event}.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function loadTranscript(name: string): string {
  return readFileSync(join(dir, "transcripts", `${name}.jsonl`), "utf-8");
}

export function loadDiff(name: string): string {
  return readFileSync(join(dir, "diffs", `${name}.diff`), "utf-8");
}

export { seedDb, type SeedName } from "./seeds/index.ts";

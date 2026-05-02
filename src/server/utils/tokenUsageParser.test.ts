import { test, expect } from "bun:test";
import { extractTokenUsageFromTranscriptJsonl } from "./tokenUsageParser.ts";

const makeAssistantLine = (usage: Record<string, number>) =>
  JSON.stringify({ type: "assistant", message: { role: "assistant", usage } });

test("extractTokenUsageFromTranscriptJsonl parses a single assistant entry", () => {
  const jsonl = makeAssistantLine({ input_tokens: 100, output_tokens: 200 });
  const result = extractTokenUsageFromTranscriptJsonl(jsonl);
  expect(result).toEqual({ input_tokens: 100, output_tokens: 200, cache_creation_tokens: 0, cache_read_tokens: 0 });
});

test("extractTokenUsageFromTranscriptJsonl sums multiple assistant entries", () => {
  const lines = [
    makeAssistantLine({ input_tokens: 100, output_tokens: 200 }),
    makeAssistantLine({ input_tokens: 50, output_tokens: 75 }),
  ].join("\n");
  const result = extractTokenUsageFromTranscriptJsonl(lines);
  expect(result).toEqual({ input_tokens: 150, output_tokens: 275, cache_creation_tokens: 0, cache_read_tokens: 0 });
});

test("extractTokenUsageFromTranscriptJsonl parses cache tokens", () => {
  const jsonl = makeAssistantLine({
    input_tokens: 3,
    output_tokens: 255,
    cache_creation_input_tokens: 5887,
    cache_read_input_tokens: 10580,
  });
  const result = extractTokenUsageFromTranscriptJsonl(jsonl);
  expect(result).toEqual({
    input_tokens: 3,
    output_tokens: 255,
    cache_creation_tokens: 5887,
    cache_read_tokens: 10580,
  });
});

test("extractTokenUsageFromTranscriptJsonl skips non-assistant entries", () => {
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    makeAssistantLine({ input_tokens: 50, output_tokens: 100 }),
    JSON.stringify({ type: "permission-mode", permissionMode: "acceptEdits" }),
  ].join("\n");
  const result = extractTokenUsageFromTranscriptJsonl(lines);
  expect(result).toEqual({ input_tokens: 50, output_tokens: 100, cache_creation_tokens: 0, cache_read_tokens: 0 });
});

test("extractTokenUsageFromTranscriptJsonl returns null for empty content", () => {
  expect(extractTokenUsageFromTranscriptJsonl("")).toBeNull();
});

test("extractTokenUsageFromTranscriptJsonl returns null when no usage found", () => {
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    JSON.stringify({ type: "permission-mode", permissionMode: "acceptEdits" }),
  ].join("\n");
  expect(extractTokenUsageFromTranscriptJsonl(lines)).toBeNull();
});

test("extractTokenUsageFromTranscriptJsonl ignores malformed lines", () => {
  const lines = [
    "not valid json {{{",
    makeAssistantLine({ input_tokens: 10, output_tokens: 20 }),
  ].join("\n");
  const result = extractTokenUsageFromTranscriptJsonl(lines);
  expect(result?.input_tokens).toBe(10);
  expect(result?.output_tokens).toBe(20);
});

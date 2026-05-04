import { test, expect } from "bun:test";
import { extractTokenUsageFromTranscriptJsonl } from "./tokenUsageParser.ts";
import { loadTranscript } from "../../../fixtures/loader.ts";

// simple.jsonl:    1 assistant line  → input=100, output=200
// with-tool-use.jsonl: 2 assistant lines → input=150, output=275 (user + tool_result lines skipped)
// with-cache.jsonl:  1 assistant line  → input=3, output=255, cache_creation=5887, cache_read=10580
// malformed.jsonl:   bad lines + 1 good assistant → input=10, output=20

test("extractTokenUsageFromTranscriptJsonl parses a single assistant entry", () => {
  const result = extractTokenUsageFromTranscriptJsonl(loadTranscript("simple"));
  expect(result).toEqual({ input_tokens: 100, output_tokens: 200, cache_creation_tokens: 0, cache_read_tokens: 0 });
});

test("extractTokenUsageFromTranscriptJsonl sums multiple assistant entries", () => {
  const result = extractTokenUsageFromTranscriptJsonl(loadTranscript("with-tool-use"));
  expect(result).toEqual({ input_tokens: 150, output_tokens: 275, cache_creation_tokens: 0, cache_read_tokens: 0 });
});

test("extractTokenUsageFromTranscriptJsonl parses cache tokens", () => {
  const result = extractTokenUsageFromTranscriptJsonl(loadTranscript("with-cache"));
  expect(result).toEqual({
    input_tokens: 3,
    output_tokens: 255,
    cache_creation_tokens: 5887,
    cache_read_tokens: 10580,
  });
});

test("extractTokenUsageFromTranscriptJsonl skips non-assistant entries", () => {
  // with-tool-use has user + tool_result lines mixed with 2 assistant lines
  const result = extractTokenUsageFromTranscriptJsonl(loadTranscript("with-tool-use"));
  expect(result).toEqual({ input_tokens: 150, output_tokens: 275, cache_creation_tokens: 0, cache_read_tokens: 0 });
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
  const result = extractTokenUsageFromTranscriptJsonl(loadTranscript("malformed"));
  expect(result?.input_tokens).toBe(10);
  expect(result?.output_tokens).toBe(20);
});

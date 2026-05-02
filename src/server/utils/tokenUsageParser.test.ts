import { test, expect } from "bun:test";
import { extractTokenUsageFromTranscript } from "./tokenUsageParser.ts";

test("extractTokenUsageFromTranscript parses input_tokens", () => {
  const transcript = "input_tokens: 1234";
  const result = extractTokenUsageFromTranscript(transcript);
  expect(result).toEqual({ input_tokens: 1234 });
});

test("extractTokenUsageFromTranscript parses output_tokens", () => {
  const transcript = "output_tokens: 5678";
  const result = extractTokenUsageFromTranscript(transcript);
  expect(result).toEqual({ output_tokens: 5678 });
});

test("extractTokenUsageFromTranscript parses cache tokens", () => {
  const transcript = "cache_creation_input_tokens: 100\ncache_read_input_tokens: 200";
  const result = extractTokenUsageFromTranscript(transcript);
  expect(result).toEqual({
    cache_creation_tokens: 100,
    cache_read_tokens: 200,
  });
});

test("extractTokenUsageFromTranscript parses all token types", () => {
  const transcript = `
    input_tokens: 1000
    output_tokens: 2000
    cache_creation_input_tokens: 500
    cache_read_input_tokens: 300
  `;
  const result = extractTokenUsageFromTranscript(transcript);
  expect(result).toEqual({
    input_tokens: 1000,
    output_tokens: 2000,
    cache_creation_tokens: 500,
    cache_read_tokens: 300,
  });
});

test("extractTokenUsageFromTranscript returns null for empty transcript", () => {
  const result = extractTokenUsageFromTranscript("");
  expect(result).toBeNull();
});

test("extractTokenUsageFromTranscript returns null when no tokens found", () => {
  const result = extractTokenUsageFromTranscript("Some random text without token info");
  expect(result).toBeNull();
});

test("extractTokenUsageFromTranscript handles different spacing formats", () => {
  const transcript = `
    input_tokens=1234
    output_tokens: 5678
    cache_creation_input_tokens: 999
  `;
  const result = extractTokenUsageFromTranscript(transcript);
  expect(result?.input_tokens).toBe(1234);
  expect(result?.output_tokens).toBe(5678);
  expect(result?.cache_creation_tokens).toBe(999);
});

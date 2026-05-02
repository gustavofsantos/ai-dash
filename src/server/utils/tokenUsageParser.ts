export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
}

/**
 * Parse token usage by summing all assistant message usage entries in a Claude Code JSONL transcript.
 * Each assistant entry has a `message.usage` object with input_tokens, output_tokens, etc.
 */
export function extractTokenUsageFromTranscriptJsonl(jsonlContent: string): TokenUsage | null {
  if (!jsonlContent) return null;

  let input = 0;
  let output = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let found = false;

  for (const line of jsonlContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      const usage = entry?.message?.usage;
      if (!usage) continue;
      found = true;
      input += usage.input_tokens || 0;
      output += usage.output_tokens || 0;
      cacheCreation += usage.cache_creation_input_tokens || 0;
      cacheRead += usage.cache_read_input_tokens || 0;
    } catch {}
  }

  if (!found) return null;

  return {
    input_tokens: input,
    output_tokens: output,
    cache_creation_tokens: cacheCreation,
    cache_read_tokens: cacheRead,
  };
}

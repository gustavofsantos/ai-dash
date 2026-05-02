/**
 * Parse token usage from Claude Code session transcript
 * Claude Code includes token usage stats in the transcript
 */
export function extractTokenUsageFromTranscript(transcript: string): {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
} | null {
  if (!transcript) return null;

  const tokenUsage: Record<string, number> = {};

  // Look for token usage patterns in the transcript
  // Claude Code typically includes tokens info like:
  // "input_tokens: 1234"
  // "output_tokens: 5678"
  // "cache_creation_input_tokens: 123"
  // "cache_read_input_tokens: 456"

  // Match plain "input_tokens" (not cache_*_input_tokens)
  const inputMatch = transcript.match(/^[^c]*?\binput_tokens[:\s=]+(\d+)/im);
  if (inputMatch) {
    tokenUsage.input_tokens = parseInt(inputMatch[1], 10);
  }

  const outputMatch = transcript.match(/output_tokens[:\s=]+(\d+)/i);
  if (outputMatch) {
    tokenUsage.output_tokens = parseInt(outputMatch[1], 10);
  }

  const cacheCreationMatch = transcript.match(/cache_creation[_\s]+input_tokens[:\s=]+(\d+)/i);
  if (cacheCreationMatch) {
    tokenUsage.cache_creation_tokens = parseInt(cacheCreationMatch[1], 10);
  }

  const cacheReadMatch = transcript.match(/cache_read[_\s]+input_tokens[:\s=]+(\d+)/i);
  if (cacheReadMatch) {
    tokenUsage.cache_read_tokens = parseInt(cacheReadMatch[1], 10);
  }

  // Return null if no token data found
  if (Object.keys(tokenUsage).length === 0) {
    return null;
  }

  return tokenUsage;
}

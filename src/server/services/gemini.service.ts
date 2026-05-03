import { readFile } from "fs/promises";

export interface DashboardMessage {
  type: "user" | "assistant" | "tool_use";
  text?: string;
  name?: string;
  timestamp: string | number;
}

export class GeminiService {
  constructor(private reader = { readFile }) {}

  async parseGeminiTranscript(path: string) {
    try {
      const content = await this.reader.readFile(path, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      const messages: DashboardMessage[] = [];
      let model: string | undefined;
      const tokenCounts: Array<{ input: number; output: number; cached?: number; thoughts?: number; tool?: number }> = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          // Skip metadata updates
          if (parsed.$set) continue;

          const geminiMsg = parsed;

          if (geminiMsg.model) {
            model = geminiMsg.model;
          }

          // Extract token usage from gemini messages
          if (geminiMsg.type === "gemini" && geminiMsg.tokens) {
            tokenCounts.push(geminiMsg.tokens);
          }

          if (geminiMsg.type === "user") {
            const text = Array.isArray(geminiMsg.content)
              ? geminiMsg.content.map((c: any) => c.text).join("\n")
              : geminiMsg.content;

            messages.push({
              type: "user",
              text,
              timestamp: geminiMsg.timestamp,
            });
          } else if (geminiMsg.type === "gemini") {
            // Add the assistant response if it has content
            if (geminiMsg.content) {
              messages.push({
                type: "assistant",
                text: geminiMsg.content as string,
                timestamp: geminiMsg.timestamp,
              });
            }

            // Add tool calls as separate messages if present
            if (geminiMsg.toolCalls) {
              for (const tool of geminiMsg.toolCalls) {
                messages.push({
                  type: "tool_use",
                  name: tool.name,
                  timestamp: geminiMsg.timestamp,
                });
              }
            }
          }
        } catch (e) {
          // Skip malformed lines
          console.error(`Error parsing Gemini transcript line: ${e}`);
        }
      }

      return { messages, model, tokenCounts };
    } catch (e) {
      console.error(`Error reading Gemini transcript at ${path}: ${e}`);
      return null;
    }
  }

  extractGeminiTokenUsage(tokenCounts: Array<{ input: number; output: number; cached?: number; thoughts?: number; tool?: number }>) {
    if (!tokenCounts || tokenCounts.length === 0) return null;

    const totals = {
      input: 0,
      output: 0,
      cached: 0,
      thoughts: 0,
      tool: 0,
      total: 0
    };

    for (const count of tokenCounts) {
      totals.input += count.input || 0;
      totals.output += count.output || 0;
      totals.cached += count.cached || 0;
      totals.thoughts += count.thoughts || 0;
      totals.tool += count.tool || 0;
    }

    totals.total = totals.input + totals.output;

    return totals;
  }
}

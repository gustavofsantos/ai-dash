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

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          // Skip metadata updates
          if (parsed.$set) continue;

          const geminiMsg = parsed;

          if (geminiMsg.model) {
            model = geminiMsg.model;
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

      return { messages, model };
    } catch (e) {
      console.error(`Error reading Gemini transcript at ${path}: ${e}`);
      return null;
    }
  }
}

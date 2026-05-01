import { existsSync, readFileSync } from "node:fs";

export interface Message {
  type: "user" | "assistant" | "tool_use";
  text?: string;
  name?: string;
  input?: any;
  timestamp: number;
}

export function dashEventsToMessages(
  events: any[],
  fs = { existsSync, readFileSync }
): Message[] {
  // Check if we have a Stop event with a transcript_path
  const stopEvent = events.find((e) => e.type === "Stop");
  const transcriptPath = stopEvent?.payload?.transcript_path;

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const fileContent = fs.readFileSync(transcriptPath, "utf8");
      const lines = fileContent.split("\n").filter((l) => l.trim() !== "");
      const messages: Message[] = [];

      for (const line of lines) {
        try {
          const p = JSON.parse(line);
          const msg = p.message;
          if (!msg) continue;

          if (msg.role === "user") {
            const text = Array.isArray(msg.content)
              ? msg.content.map((c: any) => c.text || "").join("")
              : msg.content || "";
            if (text) {
              messages.push({ type: "user", text, timestamp: p.timestamp });
            }
          } else if (msg.role === "assistant") {
            if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === "text") {
                  messages.push({ type: "assistant", text: block.text, timestamp: p.timestamp });
                } else if (block.type === "tool_use") {
                  messages.push({ type: "tool_use", name: block.name, input: block.input, timestamp: p.timestamp });
                }
              }
            }
          }
        } catch (e) {}
      }
      if (messages.length > 0) return messages;
    } catch (e) {
      console.error("Failed to parse transcript from Stop event:", e);
    }
  }

  const messages: Message[] = [];
  for (const event of events) {
    const p = event.payload;
    if (!p) continue;
    
    const ts = event.ts;

    switch (event.type) {
      case "UserPromptSubmit":
        messages.push({
          type: "user",
          text: p.prompt || p.text || "",
          timestamp: ts,
        });
        break;

      case "PreToolUse":
        messages.push({
          type: "tool_use",
          name: p.tool_name || p.name,
          input: p.tool_input || p.input,
          timestamp: ts,
        });
        break;

      case "Stop":
        if (p.last_assistant_message || p.text) {
          messages.push({
            type: "assistant",
            text: p.last_assistant_message || p.text,
            timestamp: ts,
          });
        }
        break;
    }
  }
  return messages;
}

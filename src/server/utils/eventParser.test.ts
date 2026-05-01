import { expect, test, describe } from "bun:test";
import { dashEventsToMessages } from "./eventParser.ts";

describe("eventParser", () => {
  test("should fallback to events if transcript does not exist", () => {
    const events = [
      { type: "UserPromptSubmit", ts: 100, payload: { text: "hello" } },
      { type: "Stop", ts: 200, payload: { text: "hi there" } },
    ];
    
    const fsMock = {
      existsSync: () => false,
      readFileSync: () => "",
    };

    const messages = dashEventsToMessages(events, fsMock as any);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: "user", text: "hello", timestamp: 100 });
    expect(messages[1]).toEqual({ type: "assistant", text: "hi there", timestamp: 200 });
  });

  test("should parse transcript if it exists", () => {
    const events = [
      { type: "Stop", ts: 200, payload: { transcript_path: "/path/to/transcript" } },
    ];
    
    const transcript = JSON.stringify({
      timestamp: 150,
      message: { role: "user", content: "from transcript" }
    }) + "\n" + JSON.stringify({
      timestamp: 160,
      message: { role: "assistant", content: [{ type: "text", text: "response" }] }
    });

    const fsMock = {
      existsSync: (p: string) => p === "/path/to/transcript",
      readFileSync: () => transcript,
    };

    const messages = dashEventsToMessages(events, fsMock as any);
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe("from transcript");
    expect(messages[1].text).toBe("response");
  });
});

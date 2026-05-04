import { expect, test, describe } from "bun:test";
import { dashEventsToMessages } from "./eventParser.ts";
import { loadTranscript, loadHookPayload } from "../../../fixtures/loader.ts";

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
    // simple.jsonl: user "from transcript" + assistant "response"
    const transcript = loadTranscript("simple");

    const events = [
      { type: "Stop", ts: 200, payload: { transcript_path: "/path/to/transcript" } },
    ];

    const fsMock = {
      existsSync: (p: string) => p === "/path/to/transcript",
      readFileSync: () => transcript,
    };

    const messages = dashEventsToMessages(events, fsMock as any);
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe("from transcript");
    expect(messages[1].text).toBe("response");
  });

  test("should parse plan from ExitPlanMode event", () => {
    const fixture = loadHookPayload("claude-code", "exit-plan-mode") as any;
    const events = [
      { type: "PostToolUse", ts: 300, payload: fixture }
    ];

    const fsMock = {
      existsSync: () => false,
      readFileSync: () => "",
    };

    const messages = dashEventsToMessages(events, fsMock as any);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("plan");
    expect(messages[0].text).toBe(fixture.tool_response.plan);
    expect(messages[0].timestamp).toBe(300);
  });
});

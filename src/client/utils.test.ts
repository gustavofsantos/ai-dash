import { test, expect } from "bun:test";
import {
  esc,
  projectName,
  shortModel,
  formatDate,
  acceptanceRate,
  firstUserMessage
} from "./utils.ts";

test("esc escapes HTML characters", () => {
  expect(esc("<b>\"Me & You\"</b>")).toBe("&lt;b&gt;&quot;Me &amp; You&quot;&lt;/b&gt;");
});

test("projectName extracts last part of path", () => {
  expect(projectName("/home/user/project")).toBe("project");
  expect(projectName("project")).toBe("project");
  expect(projectName(null)).toBe("unknown");
  expect(projectName("")).toBe("unknown");
});

test("shortModel removes prefixes and dates", () => {
  expect(shortModel("claude-3-5-sonnet-20241022")).toBe("3-5-sonnet");
  expect(shortModel("gemini-1.5-pro")).toBe("gemini-1.5-pro");
});

test("formatDate formats timestamps", () => {
  const ts = 1739814400; // 2025-02-17 17:46:40 UTC
  const formatted = formatDate(ts);
  // Format depends on environment locale, so we check for key parts
  expect(formatted).toContain("2025");
  expect(formatted).toContain("Feb");
  expect(formatted).toContain("17");
});

test("acceptanceRate calculates percentage", () => {
  expect(acceptanceRate(80, 100)).toBe("80%");
  expect(acceptanceRate(1, 3)).toBe("33%");
  expect(acceptanceRate(0, 100)).toBe("0%");
  expect(acceptanceRate(100, 0)).toBe("—");
});

test("firstUserMessage extracts first user message from JSON", () => {
  const messages = JSON.stringify([
    { type: "user", text: "Hello AI" },
    { type: "assistant", text: "Hello human" }
  ]);
  expect(firstUserMessage(messages)).toBe("Hello AI");

  const longMessage = "A".repeat(150);
  const messagesLong = JSON.stringify([
    { type: "user", text: longMessage }
  ]);
  const result = firstUserMessage(messagesLong);
  expect(result.length).toBe(121); // 120 + "…"
  expect(result.endsWith("…")).toBe(true);

  expect(firstUserMessage("invalid json")).toBe("");
  expect(firstUserMessage(JSON.stringify([]))).toBe("");
});

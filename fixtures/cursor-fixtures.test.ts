import { test, expect, describe } from "bun:test";
import type {
  CursorPayload,
  CursorSessionStart,
  CursorSessionEnd,
  CursorBeforeShellExecution,
  CursorAfterShellExecution,
  CursorBeforeMCPExecution,
  CursorAfterMCPExecution,
  CursorAfterFileEdit,
  CursorStop,
} from "../src/types/agents/cursor";

// Helper to load fixture files
async function loadFixture(
  filename: string
): Promise<Record<string, unknown>> {
  const path = `./fixtures/hooks/cursor/${filename}`;
  const file = Bun.file(path);
  const content = await file.text();
  return JSON.parse(content);
}

// Type guard helpers
function isCursorSessionStart(
  payload: Record<string, unknown>
): payload is CursorSessionStart {
  return (
    payload.hook_event_name === "sessionStart" &&
    typeof payload.session_id === "string" &&
    typeof payload.conversation_id === "string" &&
    typeof payload.generation_id === "string" &&
    typeof payload.model === "string" &&
    typeof payload.cursor_version === "string" &&
    Array.isArray(payload.workspace_roots)
  );
}

function isCursorSessionEnd(
  payload: Record<string, unknown>
): payload is CursorSessionEnd {
  return (
    payload.hook_event_name === "sessionEnd" &&
    typeof payload.session_id === "string" &&
    typeof payload.reason === "string" &&
    typeof payload.duration_ms === "number"
  );
}

function isCursorBeforeShellExecution(
  payload: Record<string, unknown>
): payload is CursorBeforeShellExecution {
  return (
    payload.hook_event_name === "beforeShellExecution" &&
    typeof payload.command === "string" &&
    typeof payload.cwd === "string" &&
    typeof payload.sandbox === "boolean"
  );
}

function isCursorAfterShellExecution(
  payload: Record<string, unknown>
): payload is CursorAfterShellExecution {
  return (
    payload.hook_event_name === "afterShellExecution" &&
    typeof payload.command === "string" &&
    typeof payload.output === "string" &&
    typeof payload.duration === "number" &&
    typeof payload.sandbox === "boolean"
  );
}

function isCursorBeforeMCPExecution(
  payload: Record<string, unknown>
): payload is CursorBeforeMCPExecution {
  return (
    payload.hook_event_name === "beforeMCPExecution" &&
    typeof payload.tool_name === "string" &&
    typeof payload.tool_input === "string"
  );
}

function isCursorAfterMCPExecution(
  payload: Record<string, unknown>
): payload is CursorAfterMCPExecution {
  return (
    payload.hook_event_name === "afterMCPExecution" &&
    typeof payload.tool_name === "string" &&
    typeof payload.tool_input === "string" &&
    typeof payload.result_json === "string" &&
    typeof payload.duration === "number"
  );
}

function isCursorAfterFileEdit(
  payload: Record<string, unknown>
): payload is CursorAfterFileEdit {
  return (
    payload.hook_event_name === "afterFileEdit" &&
    typeof payload.file_path === "string" &&
    Array.isArray(payload.edits) &&
    payload.edits.every(
      (edit: unknown) =>
        typeof (edit as Record<string, unknown>).old_string === "string" &&
        typeof (edit as Record<string, unknown>).new_string === "string"
    )
  );
}

function isCursorStop(payload: Record<string, unknown>): payload is CursorStop {
  return (
    payload.hook_event_name === "stop" &&
    typeof payload.status === "string" &&
    typeof payload.loop_count === "number"
  );
}

// Test base fields present in all payloads
function validateBaseCursorFields(payload: Record<string, unknown>) {
  expect(typeof payload.conversation_id).toBe("string");
  expect(typeof payload.generation_id).toBe("string");
  expect(typeof payload.model).toBe("string");
  expect(typeof payload.hook_event_name).toBe("string");
  expect(typeof payload.cursor_version).toBe("string");
  expect(Array.isArray(payload.workspace_roots)).toBe(true);
}

describe("Cursor Hook Fixtures", () => {
  test("session-start.json parses and validates correctly", async () => {
    const payload = await loadFixture("session-start.json");
    validateBaseCursorFields(payload);
    expect(isCursorSessionStart(payload)).toBe(true);

    const data = payload as CursorSessionStart;
    expect(data.hook_event_name).toBe("sessionStart");
    expect(data.session_id).toBeDefined();
    expect(data.is_background_agent).toBe(false);
    expect(data.composer_mode).toBe("agent");
  });

  test("session-end.json parses and validates correctly", async () => {
    const payload = await loadFixture("session-end.json");
    validateBaseCursorFields(payload);
    expect(isCursorSessionEnd(payload)).toBe(true);

    const data = payload as CursorSessionEnd;
    expect(data.hook_event_name).toBe("sessionEnd");
    expect(data.session_id).toBeDefined();
    expect(data.reason).toBe("completed");
    expect(data.duration_ms).toBeGreaterThan(0);
    expect(data.final_status).toBe("completed");
  });

  test("before-shell-execution.json parses and validates correctly", async () => {
    const payload = await loadFixture("before-shell-execution.json");
    validateBaseCursorFields(payload);
    expect(isCursorBeforeShellExecution(payload)).toBe(true);

    const data = payload as CursorBeforeShellExecution;
    expect(data.hook_event_name).toBe("beforeShellExecution");
    expect(data.command).toBe("npm test");
    expect(data.cwd).toBeDefined();
    expect(data.sandbox).toBe(false);
  });

  test("after-shell-execution.json parses and validates correctly", async () => {
    const payload = await loadFixture("after-shell-execution.json");
    validateBaseCursorFields(payload);
    expect(isCursorAfterShellExecution(payload)).toBe(true);

    const data = payload as CursorAfterShellExecution;
    expect(data.hook_event_name).toBe("afterShellExecution");
    expect(data.command).toBe("npm test");
    expect(data.output).toBeDefined();
    expect(data.duration).toBeGreaterThan(0);
    expect(data.sandbox).toBe(false);
  });

  test("before-mcp-execution.json parses and validates correctly", async () => {
    const payload = await loadFixture("before-mcp-execution.json");
    validateBaseCursorFields(payload);
    expect(isCursorBeforeMCPExecution(payload)).toBe(true);

    const data = payload as CursorBeforeMCPExecution;
    expect(data.hook_event_name).toBe("beforeMCPExecution");
    expect(data.tool_name).toBeDefined();
    expect(data.tool_input).toBeDefined();
    expect(typeof data.tool_input).toBe("string");
  });

  test("after-mcp-execution.json parses and validates correctly", async () => {
    const payload = await loadFixture("after-mcp-execution.json");
    validateBaseCursorFields(payload);
    expect(isCursorAfterMCPExecution(payload)).toBe(true);

    const data = payload as CursorAfterMCPExecution;
    expect(data.hook_event_name).toBe("afterMCPExecution");
    expect(data.tool_name).toBeDefined();
    expect(data.tool_input).toBeDefined();
    expect(data.result_json).toBeDefined();
    expect(data.duration).toBeGreaterThan(0);
  });

  test("after-file-edit.json parses and validates correctly", async () => {
    const payload = await loadFixture("after-file-edit.json");
    validateBaseCursorFields(payload);
    expect(isCursorAfterFileEdit(payload)).toBe(true);

    const data = payload as CursorAfterFileEdit;
    expect(data.hook_event_name).toBe("afterFileEdit");
    expect(data.file_path).toBeDefined();
    expect(Array.isArray(data.edits)).toBe(true);
    expect(data.edits.length).toBeGreaterThan(0);
    expect(data.edits[0]).toHaveProperty("old_string");
    expect(data.edits[0]).toHaveProperty("new_string");
  });

  test("stop.json parses and validates correctly", async () => {
    const payload = await loadFixture("stop.json");
    validateBaseCursorFields(payload);
    expect(isCursorStop(payload)).toBe(true);

    const data = payload as CursorStop;
    expect(data.hook_event_name).toBe("stop");
    expect(data.status).toBe("completed");
    expect(data.loop_count).toBeGreaterThanOrEqual(0);
  });

  test("All fixtures have required base fields", async () => {
    const fixtures = [
      "session-start.json",
      "session-end.json",
      "before-shell-execution.json",
      "after-shell-execution.json",
      "before-mcp-execution.json",
      "after-mcp-execution.json",
      "after-file-edit.json",
      "stop.json",
    ];

    for (const fixture of fixtures) {
      const payload = await loadFixture(fixture);
      expect(payload.conversation_id).toBeDefined();
      expect(payload.generation_id).toBeDefined();
      expect(payload.model).toBeDefined();
      expect(payload.hook_event_name).toBeDefined();
      expect(payload.cursor_version).toBeDefined();
      expect(payload.workspace_roots).toBeDefined();
    }
  });

  test("All fixtures parse as valid JSON", async () => {
    const fixtures = [
      "session-start.json",
      "session-end.json",
      "before-shell-execution.json",
      "after-shell-execution.json",
      "before-mcp-execution.json",
      "after-mcp-execution.json",
      "after-file-edit.json",
      "stop.json",
    ];

    for (const fixture of fixtures) {
      try {
        await loadFixture(fixture);
      } catch (error) {
        throw new Error(`Failed to parse ${fixture}: ${error}`);
      }
    }
  });
});

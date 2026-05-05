// Payload shapes emitted by Cursor hooks.
// See https://cursor.com/docs/hooks#common-schema for full reference.

interface CursorBase {
  conversation_id: string;
  generation_id: string;
  model: string;
  hook_event_name: string;
  cursor_version: string;
  workspace_roots: string[];
  user_email?: string | null;
  transcript_path?: string | null;
}

export interface CursorSessionStart extends CursorBase {
  hook_event_name: "sessionStart";
  session_id: string;
  is_background_agent?: boolean;
  composer_mode?: "agent" | "ask" | "edit";
}

export interface CursorSessionEnd extends CursorBase {
  hook_event_name: "sessionEnd";
  session_id: string;
  reason: "completed" | "aborted" | "error" | "window_close" | "user_close";
  duration_ms: number;
  is_background_agent?: boolean;
  final_status?: string;
  error_message?: string;
}

export interface CursorBeforeShellExecution extends CursorBase {
  hook_event_name: "beforeShellExecution";
  command: string;
  cwd: string;
  sandbox: boolean;
}

export interface CursorAfterShellExecution extends CursorBase {
  hook_event_name: "afterShellExecution";
  command: string;
  output: string;
  duration: number;
  sandbox: boolean;
}

export interface CursorBeforeMCPExecution extends CursorBase {
  hook_event_name: "beforeMCPExecution";
  tool_name: string;
  tool_input: string;
  url?: string;
  command?: string;
}

export interface CursorAfterMCPExecution extends CursorBase {
  hook_event_name: "afterMCPExecution";
  tool_name: string;
  tool_input: string;
  result_json: string;
  duration: number;
}

export interface CursorAfterFileEdit extends CursorBase {
  hook_event_name: "afterFileEdit";
  file_path: string;
  edits: Array<{
    old_string: string;
    new_string: string;
  }>;
}

export interface CursorStop extends CursorBase {
  hook_event_name: "stop";
  status: "completed" | "aborted" | "error";
  loop_count: number;
}

export interface CursorPreToolUse extends CursorBase {
  hook_event_name: "preToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  cwd: string;
  agent_message: string;
}

export interface CursorPostToolUse extends CursorBase {
  hook_event_name: "postToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: string;
  tool_use_id: string;
  cwd: string;
  duration: number;
}

export interface CursorAfterAgentResponse extends CursorBase {
  hook_event_name: "afterAgentResponse";
  text: string;
}

export interface CursorAfterAgentThought extends CursorBase {
  hook_event_name: "afterAgentThought";
  text: string;
  duration_ms?: number;
}

export type CursorPayload =
  | CursorSessionStart
  | CursorSessionEnd
  | CursorBeforeShellExecution
  | CursorAfterShellExecution
  | CursorBeforeMCPExecution
  | CursorAfterMCPExecution
  | CursorAfterFileEdit
  | CursorStop
  | CursorPreToolUse
  | CursorPostToolUse
  | CursorAfterAgentResponse
  | CursorAfterAgentThought;

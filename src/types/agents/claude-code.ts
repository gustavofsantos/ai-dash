// Payload shapes emitted by Claude Code hooks.
// See fixtures/hooks/claude-code/ for real examples.

interface ClaudeCodeBase {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}

export interface ClaudeCodeSessionStart extends ClaudeCodeBase {
  hook_event_name: "SessionStart";
  model: string;
}

export interface ClaudeCodeUserPromptSubmit extends ClaudeCodeBase {
  hook_event_name: "UserPromptSubmit";
  text: string;
}

export interface ClaudeCodePreToolUse extends ClaudeCodeBase {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ClaudeCodePostToolUse extends ClaudeCodeBase {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
}

export interface ClaudeCodeExitPlanMode extends ClaudeCodeBase {
  hook_event_name: "PostToolUse";
  tool_name: "ExitPlanMode";
  tool_input: Record<string, unknown>;
  tool_response: {
    plan?: string;
    allowedPrompts?: { tool: string; prompt: string }[];
    filePath?: string;
  };
}

export interface ClaudeCodeStop extends ClaudeCodeBase {
  hook_event_name: "Stop";
  transcript_path: string;
  last_assistant_message?: string;
}

export interface ClaudeCodeSessionEnd extends ClaudeCodeBase {
  hook_event_name: "SessionEnd";
  transcript_path?: string;
}

export type ClaudeCodePayload =
  | ClaudeCodeSessionStart
  | ClaudeCodeUserPromptSubmit
  | ClaudeCodePreToolUse
  | ClaudeCodePostToolUse
  | ClaudeCodeExitPlanMode
  | ClaudeCodeStop
  | ClaudeCodeSessionEnd;

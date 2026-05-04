// Payload shapes emitted by Gemini CLI hooks.
// See fixtures/hooks/gemini/ for real examples.

interface GeminiBase {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  timestamp: string;
}

export interface GeminiSessionStart extends GeminiBase {
  hook_event_name: "SessionStart";
}

export interface GeminiAfterAgent extends GeminiBase {
  hook_event_name: "AfterAgent";
  transcript_path?: string;
}

export interface GeminiSessionEnd extends GeminiBase {
  hook_event_name: "SessionEnd";
}

export type GeminiPayload =
  | GeminiSessionStart
  | GeminiAfterAgent
  | GeminiSessionEnd;

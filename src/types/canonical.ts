export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

export interface DashEvent {
  id: string;
  sessionId: string;
  repoId: string;
  agent: "claude-code" | "gemini" | "git";
  type: string;
  ts: string;
  payload: Record<string, unknown>;
  tokenUsage?: TokenUsage;
  // Enriched fields populated after transform
  transcriptPath?: string;
  model?: string;
}

// What the WS hub broadcasts to frontend clients
export type WsMessage =
  | { type: "session.started";     payload: { id: string; agent: string; model?: string; startedAt: string } }
  | { type: "session.updated";     payload: { id: string; state?: string; model?: string } }
  | { type: "session.ended";       payload: { id: string; endedAt: string } }
  | { type: "event.recorded";      payload: DashEvent }
  | { type: "checkpoint.created";  payload: { id: string; sessionId: string; commitSha: string } };

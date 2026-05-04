export interface EnvelopeSource {
  agent: "claude-code" | "gemini" | "git";
  event: string;
  sessionId?: string;
  repoDirPath: string;
  cwd: string;
  timestamp: string;
}

export interface Envelope<T = unknown> {
  id: string;
  source: EnvelopeSource;
  payload: T;
}

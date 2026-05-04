export const multiSession = {
  repos: [
    { id: "r1", path: "/projects/alpha" },
    { id: "r2", path: "/projects/beta" },
  ],
  sessions: [
    { id: "s1", repo_id: "r1", agent: "claude-code", model: "claude-opus-4-5", started_at: "2025-04-01 10:00:00", state: "ended", ended_at: "2025-04-01 11:00:00" },
    { id: "s2", repo_id: "r1", agent: "claude-code", model: "claude-sonnet-4-5", started_at: "2025-04-02 09:00:00", state: "ended", ended_at: "2025-04-02 10:00:00" },
    { id: "s3", repo_id: "r2", agent: "gemini",      model: null,               started_at: "2025-04-02 14:00:00", state: "active" },
  ],
  events: [
    { id: "e1", session_id: "s1", seq: 0, ts: "2025-04-01 10:00:00", type: "SessionStart", payload_json: "{}" },
    { id: "e2", session_id: "s2", seq: 0, ts: "2025-04-02 09:00:00", type: "SessionStart", payload_json: "{}" },
    { id: "e3", session_id: "s3", seq: 0, ts: "2025-04-02 14:00:00", type: "SessionStart", payload_json: "{}" },
  ],
  checkpoints: [] as any[],
  checkpointSessions: [] as any[],
};

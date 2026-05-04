export const singleSession = {
  repos: [
    { id: "r1", path: "/projects/myapp" },
  ],
  sessions: [
    { id: "s1", repo_id: "r1", agent: "claude-code", model: "claude-opus-4-5", started_at: "2025-04-01 10:00:00", state: "active" },
  ],
  events: [
    { id: "e1", session_id: "s1", seq: 0, ts: "2025-04-01 10:00:00", type: "SessionStart", payload_json: '{"hook_event_name":"SessionStart","model":"claude-opus-4-5"}' },
    { id: "e2", session_id: "s1", seq: 1, ts: "2025-04-01 10:01:00", type: "UserPromptSubmit", payload_json: '{"hook_event_name":"UserPromptSubmit","text":"refactor the auth module"}' },
  ],
  checkpoints: [] as any[],
  checkpointSessions: [] as any[],
};

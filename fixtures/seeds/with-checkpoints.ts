export const withCheckpoints = {
  repos: [
    { id: "r1", path: "/projects/myapp" },
  ],
  sessions: [
    { id: "s1", repo_id: "r1", agent: "claude-code", model: "claude-opus-4-5", started_at: "2025-04-01 10:00:00", state: "ended", ended_at: "2025-04-01 12:00:00" },
  ],
  events: [
    { id: "e1", session_id: "s1", seq: 0, ts: "2025-04-01 10:00:00", type: "SessionStart", payload_json: "{}" },
  ],
  checkpoints: [
    { id: "cp1", repo_id: "r1", commit_sha: "abc1234567890abcdef", strategy: "manual", attribution_json: JSON.stringify({ ai_additions: 45, ai_deletions: 12, human_additions: 8,  human_deletions: 3 }) },
    { id: "cp2", repo_id: "r1", commit_sha: "def0987654321fedcba", strategy: "manual", attribution_json: JSON.stringify({ ai_additions: 20, ai_deletions: 5,  human_additions: 2,  human_deletions: 1 }) },
  ],
  checkpointSessions: [
    { checkpoint_id: "cp1", session_id: "s1" },
    { checkpoint_id: "cp2", session_id: "s1" },
  ],
};

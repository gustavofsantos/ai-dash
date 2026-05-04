// Two repos, three sessions across two days, two checkpoints.
// Designed so analytics assertions are predictable:
//   total_sessions=3, total_projects=2
//   total_ai_lines=15  (10+5), total_accepted=12  ((10-1)+(5-2))
//   2025-04-01: 2 sessions, input=300, output=150, cache_tokens=45
//   2025-04-02: 1 session
export const analyticsDataset = {
  repos: [
    { id: "r1", path: "/projects/alpha", remote_url: "git@github.com:org/alpha.git" },
    { id: "r2", path: "/projects/beta",  remote_url: "git@github.com:org/beta.git" },
  ],
  sessions: [
    {
      id: "s1", repo_id: "r1", agent: "claude-code", model: "claude-opus-4-5",
      started_at: "2025-04-01 10:00:00", state: "ended",
      token_usage_json: JSON.stringify({ input_tokens: 100, output_tokens: 50, cache_creation_tokens: 10, cache_read_tokens: 5 }),
    },
    {
      id: "s2", repo_id: "r1", agent: "claude-code", model: "claude-opus-4-5",
      started_at: "2025-04-01 15:00:00", state: "ended",
      token_usage_json: JSON.stringify({ input_tokens: 200, output_tokens: 100, cache_creation_tokens: 20, cache_read_tokens: 10 }),
    },
    {
      id: "s3", repo_id: "r2", agent: "gemini", model: null,
      started_at: "2025-04-02 14:00:00", state: "active",
    },
  ],
  events: [
    { id: "e1", session_id: "s1", seq: 0, ts: "2025-04-01 10:00:00", type: "SessionStart", payload_json: "{}" },
    { id: "e2", session_id: "s2", seq: 0, ts: "2025-04-01 15:00:00", type: "SessionStart", payload_json: "{}" },
    { id: "e3", session_id: "s3", seq: 0, ts: "2025-04-02 14:00:00", type: "SessionStart", payload_json: "{}" },
  ],
  checkpoints: [
    { id: "cp1", repo_id: "r1", commit_sha: "abc123", strategy: "manual", attribution_json: JSON.stringify({ ai_additions: 10, ai_deletions: 2, human_additions: 3, human_deletions: 1 }) },
    { id: "cp2", repo_id: "r1", commit_sha: "def456", strategy: "manual", attribution_json: JSON.stringify({ ai_additions: 5,  ai_deletions: 1, human_additions: 0, human_deletions: 2 }) },
  ],
  checkpointSessions: [
    { checkpoint_id: "cp1", session_id: "s1" },
    { checkpoint_id: "cp2", session_id: "s2" },
  ],
};

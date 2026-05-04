import type { Database } from "bun:sqlite";
import { singleSession } from "./single-session.ts";
import { multiSession } from "./multi-session.ts";
import { withCheckpoints } from "./with-checkpoints.ts";
import { analyticsDataset } from "./analytics-dataset.ts";

export type SeedName = "single-session" | "multi-session" | "with-checkpoints" | "analytics-dataset";

type SeedData = {
  repos?: { id: string; path: string; remote_url?: string }[];
  sessions?: { id: string; repo_id: string; agent: string; model?: string | null; started_at: string; state: string; ended_at?: string; token_usage_json?: string }[];
  events?: { id: string; session_id: string; seq: number; ts: string; type: string; payload_json: string; token_usage_json?: string }[];
  checkpoints?: { id: string; repo_id: string; commit_sha: string; strategy: string; attribution_json?: string }[];
  checkpointSessions?: { checkpoint_id: string; session_id: string }[];
};

const seeds: Record<SeedName, SeedData> = {
  "single-session": singleSession,
  "multi-session": multiSession,
  "with-checkpoints": withCheckpoints,
  "analytics-dataset": analyticsDataset,
};

export function seedDb(db: Database, name: SeedName): void {
  const seed = seeds[name];

  for (const r of seed.repos ?? []) {
    db.run(
      "INSERT OR IGNORE INTO repos (id, path, remote_url) VALUES (?, ?, ?)",
      [r.id, r.path, r.remote_url ?? null]
    );
  }

  for (const s of seed.sessions ?? []) {
    db.run(
      `INSERT OR IGNORE INTO sessions (id, repo_id, agent, model, started_at, state, ended_at, token_usage_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.repo_id, s.agent, s.model ?? null, s.started_at, s.state, s.ended_at ?? null, s.token_usage_json ?? null]
    );
  }

  for (const e of seed.events ?? []) {
    db.run(
      `INSERT OR IGNORE INTO events (id, session_id, seq, ts, type, payload_json, token_usage_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.session_id, e.seq, e.ts, e.type, e.payload_json, e.token_usage_json ?? null]
    );
  }

  for (const cp of seed.checkpoints ?? []) {
    db.run(
      "INSERT OR IGNORE INTO checkpoints (id, repo_id, commit_sha, strategy, attribution_json) VALUES (?, ?, ?, ?, ?)",
      [cp.id, cp.repo_id, cp.commit_sha, cp.strategy, cp.attribution_json ?? null]
    );
  }

  for (const cs of seed.checkpointSessions ?? []) {
    db.run(
      "INSERT OR IGNORE INTO checkpoint_sessions (checkpoint_id, session_id) VALUES (?, ?)",
      [cs.checkpoint_id, cs.session_id]
    );
  }
}

import type { DashRepository } from "../data/dash.repository.ts";
import type { WsMessage } from "../../types/canonical.ts";
import { validateEnvelope } from "./validate.ts";
import { transformEnvelope } from "./transform.ts";
import { enrichEvent } from "./enrich.ts";
import { persistEvent } from "./persist.ts";
import { getRepoId } from "../utils/repoId.ts";

export type BroadcastFn = (msg: WsMessage) => void;

export async function processEnvelope(
  raw: unknown,
  repo: DashRepository,
  broadcast: BroadcastFn
): Promise<void> {
  // 1. Validate
  let envelope;
  try {
    envelope = validateEnvelope(raw);
  } catch (e) {
    console.error("[pipeline] Invalid envelope:", (e as Error).message);
    return;
  }

  const cwd = envelope.source.cwd;

  // 2. Transform
  const repoId = await getRepoId(cwd);
  const event = transformEnvelope(envelope, repoId);

  // 3. Enrich
  const enriched = await enrichEvent(event, cwd, repo);

  // 4. Persist
  try {
    await persistEvent(enriched, cwd, repo);
  } catch (e) {
    console.error("[pipeline] Persist error:", e);
    return;
  }

  // 5. Broadcast to frontend clients
  broadcast({ type: "event.recorded", payload: enriched });

  // Emit higher-level session lifecycle messages for convenience
  if (enriched.type === "SessionStart") {
    broadcast({
      type: "session.started",
      payload: {
        id: enriched.sessionId,
        agent: enriched.agent,
        model: enriched.model,
        startedAt: enriched.ts,
      },
    });
  } else if (enriched.type === "SessionEnd") {
    broadcast({ type: "session.ended", payload: { id: enriched.sessionId, endedAt: enriched.ts } });
  }
}

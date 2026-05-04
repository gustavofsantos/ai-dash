import { randomUUID } from "node:crypto";
import type { Envelope } from "../types/envelope.ts";

const DAEMON_URL = `http://localhost:${process.env.PORT ?? 3333}/collect`;
const DAEMON_TIMEOUT_MS = 2000;

export async function handleHook(args: string[]) {
  const agent = args[0] as "claude-code" | "gemini" | "git";
  const eventName = args[1];
  const cwd = process.cwd();

  if (agent === "git") {
    await sendEnvelope(agent, eventName, {}, cwd, args.slice(2));
    return;
  }

  const rawInput = await Bun.stdin.text();
  if (!rawInput) {
    console.log(JSON.stringify({ allow: true }));
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    console.log(JSON.stringify({ allow: true }));
    return;
  }

  if (!payload || typeof payload !== "object") {
    console.log(JSON.stringify({ allow: true }));
    return;
  }

  await sendEnvelope(agent, eventName, payload, cwd);

  console.log(JSON.stringify({ allow: true }));
}

async function sendEnvelope(
  agent: "claude-code" | "gemini" | "git",
  event: string,
  payload: unknown,
  cwd: string,
  gitArgs?: string[]
): Promise<void> {
  const envelope: Envelope = {
    id: randomUUID(),
    source: {
      agent,
      event,
      sessionId: (payload as any)?.session_id,
      repoDirPath: cwd,
      cwd: (payload as any)?.cwd ?? cwd,
      timestamp: new Date().toISOString(),
    },
    payload: agent === "git" ? buildGitPayload(event, cwd, gitArgs ?? []) : payload,
  };

  const sent = await tryPostToDaemon(envelope);
  if (!sent) {
    await fallbackDirect(envelope, cwd, gitArgs);
  }
}

async function tryPostToDaemon(envelope: Envelope): Promise<boolean> {
  try {
    const res = await fetch(DAEMON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(DAEMON_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fallbackDirect(envelope: Envelope, cwd: string, gitArgs?: string[]): Promise<void> {
  const { dashDb } = await import("../server/data/dash.db.ts");
  const { DashRepository } = await import("../server/data/dash.repository.ts");
  const { HookService } = await import("../server/services/hook.service.ts");
  const { AttributionService } = await import("../server/services/attribution.service.ts");

  const hookService = new HookService(new DashRepository(dashDb), new AttributionService());
  const { agent, event } = envelope.source;

  if (agent === "git") {
    if (event === "post-commit") {
      await hookService.handleGitPostCommit(cwd);
    } else if (event === "prepare-commit-msg" && gitArgs?.length) {
      await hookService.handleGitPrepareCommitMsg(cwd, gitArgs);
    }
    return;
  }

  await hookService.handleHookEvent(agent, envelope.payload);
}

function buildGitPayload(event: string, cwd: string, gitArgs: string[]): Record<string, unknown> {
  if (event === "prepare-commit-msg") {
    return {
      GIT_DIR: `${cwd}/.git`,
      GIT_WORK_TREE: cwd,
      commit_msg_file: gitArgs[0] ?? "",
      commit_source: gitArgs[1] ?? "",
      sha1: gitArgs[2] ?? "",
    };
  }
  return { GIT_DIR: `${cwd}/.git`, GIT_WORK_TREE: cwd };
}

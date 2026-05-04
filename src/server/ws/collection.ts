import type { DashRepository } from "../data/dash.repository.ts";
import type { BroadcastFn } from "../pipeline/index.ts";
import { processEnvelope } from "../pipeline/index.ts";

export async function handleCollect(
  req: Request,
  repo: DashRepository,
  broadcast: BroadcastFn
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await processEnvelope(body, repo, broadcast);
  } catch (e) {
    console.error("[collect] Pipeline error:", e);
    return new Response(JSON.stringify({ error: "Pipeline error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

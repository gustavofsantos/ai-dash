import { dashDb } from "../server/data/dash.db.ts";
import { DashRepository } from "../server/data/dash.repository.ts";
import { HookService } from "../server/services/hook.service.ts";
import { AttributionService } from "../server/services/attribution.service.ts";

const repository = new DashRepository(dashDb);
const attributionService = new AttributionService();
const hookService = new HookService(repository, attributionService);

export async function handleHook(args: string[]) {
  const tool = args[0]; // e.g., "claude-code" or "git"
  const eventName = args[1];

  if (tool === "git") {
    if (eventName === "post-commit") {
      await hookService.handleGitPostCommit(process.cwd());
    } else if (eventName === "prepare-commit-msg") {
      await hookService.handleGitPrepareCommitMsg(process.cwd(), args.slice(2));
    }
    return;
  }

  const rawInput = await Bun.stdin.text();
  if (!rawInput) {
    // For Gemini hooks: return allow by default if no input
    console.log(JSON.stringify({ allow: true }));
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawInput);
  } catch (e) {
    // For Gemini hooks: return allow on parse error (don't block)
    console.log(JSON.stringify({ allow: true }));
    return;
  }

  if (!payload || typeof payload !== "object") {
    // For Gemini hooks: return allow on invalid payload (don't block)
    console.log(JSON.stringify({ allow: true }));
    return;
  }

  try {
    await hookService.handleHookEvent(tool, payload);
  } catch (e) {
    console.error(`Hook processing error: ${e}`, { stderr: true });
  }

  // For Gemini hooks: always return allow after processing
  // This tells Gemini CLI to continue normally
  console.log(JSON.stringify({ allow: true }));
}

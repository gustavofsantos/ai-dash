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
  if (!rawInput) return;

  let payload: any;
  try {
    payload = JSON.parse(rawInput);
  } catch (e) {
    console.error("Failed to parse hook JSON input");
    return;
  }

  if (!payload || typeof payload !== "object") {
    console.error("Invalid hook payload: expected object");
    return;
  }

  await hookService.handleHookEvent(tool, payload);
}

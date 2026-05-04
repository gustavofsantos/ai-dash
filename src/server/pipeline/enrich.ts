import { existsSync } from "node:fs";
import type { DashEvent } from "../../types/canonical.ts";
import type { DashRepository } from "../data/dash.repository.ts";
import { getRepoId } from "../utils/repoId.ts";
import { extractTokenUsageFromTranscriptJsonl } from "../utils/tokenUsageParser.ts";

export async function enrichEvent(event: DashEvent, cwd: string, repo: DashRepository): Promise<DashEvent> {
  // Resolve and upsert the repo
  const repoId = await getRepoId(cwd);
  repo.upsertRepo(repoId, cwd);

  const enriched: DashEvent = { ...event, repoId };

  // Extract token usage from transcript if present
  const transcriptPath = event.transcriptPath;
  if (transcriptPath && existsSync(transcriptPath)) {
    try {
      const content = await Bun.file(transcriptPath).text();
      const tokenUsage = extractTokenUsageFromTranscriptJsonl(content);
      if (tokenUsage) {
        enriched.tokenUsage = {
          input_tokens: tokenUsage.input_tokens ?? 0,
          output_tokens: tokenUsage.output_tokens ?? 0,
          cache_creation_tokens: tokenUsage.cache_creation_tokens ?? 0,
          cache_read_tokens: tokenUsage.cache_read_tokens ?? 0,
        };
      }
    } catch (e) {
      console.error(`[pipeline] Failed to read transcript ${transcriptPath}:`, e);
    }
  }

  return enriched;
}

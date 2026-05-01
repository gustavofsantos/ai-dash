import { join } from "node:path";
import { statSync } from "node:fs";

export interface Attribution {
  ai_additions: number;
  ai_deletions: number;
  human_additions: number;
  human_deletions: number;
}

export class AttributionService {
  async calculateAttribution(cwd: string, parentSha: string, headSha: string, dirtyPaths: Record<string, string>): Promise<Attribution> {
    const attribution: Attribution = {
      ai_additions: 0,
      ai_deletions: 0,
      human_additions: 0,
      human_deletions: 0
    };

    for (const [path, aiBlobSha] of Object.entries(dirtyPaths)) {
      if (aiBlobSha === "deleted") {
        attribution.ai_deletions++; // Simplified logic from hooks.ts
        continue;
      }

      // Get blob from parent (A)
      let parentBlobSha = "";
      try {
        parentBlobSha = (await Bun.$`git -C ${cwd} rev-parse ${parentSha}:${path}`.text()).trim();
      } catch (e) {
        // File might be new
      }

      // Get blob from HEAD (C)
      let headBlobSha = "";
      try {
        headBlobSha = (await Bun.$`git -C ${cwd} rev-parse ${headSha}:${path}`.text()).trim();
      } catch (e) {
        // File might have been deleted in the final commit
      }

      // AI Diff (A -> B)
      if (parentBlobSha !== aiBlobSha) {
        const aiDiff = await this.getDiffStats(cwd, parentBlobSha, aiBlobSha as string);
        attribution.ai_additions += aiDiff.additions;
        attribution.ai_deletions += aiDiff.deletions;
      }

      // Human Diff (B -> C)
      if (aiBlobSha !== headBlobSha) {
        const humanDiff = await this.getDiffStats(cwd, aiBlobSha as string, headBlobSha);
        attribution.human_additions += humanDiff.additions;
        attribution.human_deletions += humanDiff.deletions;
      }
    }

    return attribution;
  }

  private async getDiffStats(cwd: string, shaA: string, shaB: string): Promise<{ additions: number, deletions: number }> {
    if (!shaA) {
      // New file: count all lines in B
      if (!shaB || shaB === "deleted") return { additions: 0, deletions: 0 };
      try {
        const content = await Bun.$`git -C ${cwd} cat-file -p ${shaB}`.text();
        return { additions: content.split("\n").length, deletions: 0 };
      } catch (e) {
        return { additions: 0, deletions: 0 };
      }
    }
    if (!shaB || shaB === "deleted") {
      // Deleted file: count all lines in A as deletions
      try {
        const content = await Bun.$`git -C ${cwd} cat-file -p ${shaA}`.text();
        return { additions: 0, deletions: content.split("\n").length };
      } catch (e) {
        return { additions: 0, deletions: 0 };
      }
    }

    try {
      const raw = await Bun.$`git -C ${cwd} diff --numstat ${shaA} ${shaB}`.text();
      const parts = raw.trim().split(/\s+/);
      const add = Number(parts[0]);
      const del = Number(parts[1]);
      return { additions: isNaN(add) ? 0 : add, deletions: isNaN(del) ? 0 : del };
    } catch (e) {
      return { additions: 0, deletions: 0 };
    }
  }
}

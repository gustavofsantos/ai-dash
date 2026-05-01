import type { DashRepository } from "../data/dash.repository.ts";

export class AnalyticsService {
  constructor(private dashRepo: DashRepository) {}

  getStats() {
    const result = this.dashRepo.getStats();
    const attribution = this.dashRepo.getAllAttribution();

    let total_ai_lines = 0;
    let total_accepted = 0;

    for (const row of attribution) {
      try {
        const attr = JSON.parse(row.attribution_json);
        total_ai_lines += attr.ai_additions || 0;
        total_accepted += (attr.ai_additions || 0) - (attr.human_deletions || 0);
      } catch (e) {}
    }

    return {
      total_sessions: result.total_sessions || 0,
      total_ai_lines,
      total_accepted,
      total_projects: result.total_projects || 0
    };
  }

  getProjectStats() {
    const repos = this.dashRepo.getRepos();
    const stats = [];

    for (const repo of repos) {
      const sessionCount = this.dashRepo.getRepoSessionCount(repo.id);
      const checkpoints = this.dashRepo.getRepoCheckpoints(repo.id);
      
      let aiLines = 0;
      for (const cp of checkpoints) {
        try {
          const attr = JSON.parse(cp.attribution_json);
          aiLines += attr.ai_additions || 0;
        } catch (e) {}
      }

      stats.push({
        project: repo.path,
        sessions: sessionCount.count,
        ai_lines: aiLines
      });
    }
    return stats;
  }

  getActivityByDay() {
    return this.dashRepo.getActivityByDay();
  }

  getRepositories() {
    return this.getProjectStats().map(r => ({
      project: r.project,
      sessions: r.sessions,
      ai_lines: r.ai_lines,
      accepted_lines: r.ai_lines, // Simplified as in original
      last_active: Math.floor(Date.now() / 1000), // Simplified
      top_model: "claude-code"
    }));
  }
}

import type { DashRepository } from "../data/dash.repository.ts";
import type { GitService } from "./git.service.ts";
import type { GeminiService } from "./gemini.service.ts";
import { dashEventsToMessages } from "../utils/eventParser.ts";
import { parseDiff } from "../utils/diffParser.ts";

export class SessionService {
  constructor(
    private dashRepo: DashRepository,
    private gitService: GitService,
    private geminiService: GeminiService
  ) {}

  async getSessions(limit = 20, offset = 0) {
    const dashSessions = this.dashRepo.getSessions(limit);
    
    for (const s of dashSessions) {
      const events = this.dashRepo.getSessionEvents(s.id).map(e => ({
        ...e,
        payload: JSON.parse(e.payload_json)
      }));
      const messages = dashEventsToMessages(events);
      s.messages = JSON.stringify(messages);
      s.created_at = Math.floor(new Date(s.started_at).getTime() / 1000);
      s.tool = s.agent;
    }

    return dashSessions;
  }

  async getSession(id: string) {
    const session = this.dashRepo.getSession(id);
    if (!session) return null;

    const events = this.dashRepo.getSessionEvents(id);
    session.events = events.map(e => {
      const parsed: any = {
        ...e,
        payload: JSON.parse(e.payload_json)
      };
      // Parse token_usage_json if present
      if (e.token_usage_json) {
        try {
          parsed.token_usage = JSON.parse(e.token_usage_json);
        } catch {}
      }
      return parsed;
    });

    const messages = dashEventsToMessages(session.events);
    session.messages = JSON.stringify(messages);
    
    // Calculate cumulative token usage per event
    let cumulativeInput = 0;
    let cumulativeOutput = 0;
    let cumulativeCache = 0;
    let totalTokens = 0;
    
    for (const event of session.events) {
      if (event.token_usage) {
        const tu = event.token_usage;
        cumulativeInput += tu.input_tokens || 0;
        cumulativeOutput += tu.output_tokens || 0;
        cumulativeCache += (tu.cache_creation_tokens || 0) + (tu.cache_read_tokens || 0);
        totalTokens = cumulativeInput + cumulativeOutput + cumulativeCache;
        
        // Attach cumulative totals to event for display
        event.cumulative_tokens = {
          input_tokens: cumulativeInput,
          output_tokens: cumulativeOutput,
          cache_tokens: cumulativeCache,
          total: totalTokens
        };
      }
    }
    
    session.total_tokens = totalTokens;
    
    session.created_at = Math.floor(new Date(session.started_at).getTime() / 1000);
    session.updated_at = session.ended_at 
      ? Math.floor(new Date(session.ended_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    
    session.tool = session.agent;

    const checkpoints = this.dashRepo.getSessionCheckpoints(id);
    let total_additions = 0;
    let total_deletions = 0;
    for (const cp of checkpoints) {
      try {
        const attr = JSON.parse(cp.attribution_json);
        total_additions += attr.ai_additions || 0;
        total_deletions += attr.ai_deletions || 0;
      } catch (e) {}
    }
    session.total_additions = total_additions;
    session.total_deletions = total_deletions;
    session.checkpoint_count = checkpoints.length;

    if (session.token_usage_json) {
      try {
        const u = JSON.parse(session.token_usage_json);
        session.total_tokens = (u.input_tokens || 0) + (u.output_tokens || 0)
          + (u.cache_creation_tokens || 0) + (u.cache_read_tokens || 0);
      } catch {}
    }

    const author = this.dashRepo.getSessionAuthor(id);
    session.human_author = author?.author_name ?? null;

    // Expose plan and transcript if present
    if (session.plan_markdown) {
      session.plan = session.plan_markdown;
    }
    if (session.plan_transcript_text) {
      session.transcript = session.plan_transcript_text;
    }
    if (session.allowed_prompts_json) {
      try {
        session.allowed_prompts = JSON.parse(session.allowed_prompts_json);
      } catch {}
    }

    return session;
  }

  async getSessionCheckpointsDetail(id: string) {
    const session = this.dashRepo.getSession(id);
    if (!session) return null;

    const checkpoints = this.dashRepo.getSessionCheckpoints(id);
    return checkpoints.map(cp => {
      let attribution = null;
      try { attribution = JSON.parse(cp.attribution_json); } catch {}
      return {
        id: cp.id,
        commit_sha: cp.commit_sha,
        short_sha: cp.commit_sha.slice(0, 7),
        created_at: cp.created_at,
        strategy: cp.strategy,
        attribution,
      };
    });
  }

  async getCheckpointDiff(sessionId: string, sha: string) {
    const session = this.dashRepo.getSession(sessionId);
    if (!session) return null;

    const raw = await this.gitService.getShowPatch(session.workdir, sha);
    if (!raw) return { files: [] };
    return parseDiff(raw);
  }

  async getSessionDiff(id: string) {
    const session = this.dashRepo.getSession(id);
    if (!session) return null;

    const checkpoints = this.dashRepo.getSessionCheckpoints(id);
    if (checkpoints.length === 0) return { files: [] };

    const allFiles: any[] = [];
    for (const cp of checkpoints) {
      const raw = await this.gitService.getShowPatch(session.workdir, cp.commit_sha);
      if (raw) {
        const parsed = parseDiff(raw);
        allFiles.push(...parsed.files);
      }
    }
    return { files: allFiles };
  }

  getSessionCount() {
    return this.dashRepo.getSessionCount();
  }
}

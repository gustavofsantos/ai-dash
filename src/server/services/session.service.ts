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
    session.events = events.map(e => ({
      ...e,
      payload: JSON.parse(e.payload_json)
    }));

    const messages = dashEventsToMessages(session.events);
    session.messages = JSON.stringify(messages);
    
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

    return session;
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

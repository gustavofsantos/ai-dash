import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { 
  projectName, 
  shortModel, 
  formatDate, 
  acceptanceRate 
} from "../utils.ts";

const SessionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data: session, isLoading, error } = useQuery({
    queryKey: ["sessions", id],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error("Session not found");
      return res.json();
    },
  });

  if (isLoading) return <div>Loading session detail...</div>;
  if (error || !session) return (
    <div className="empty-state" style={{ padding: "80px" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>404</div>
      <div>Page not found. <Link to="/">Go home</Link></div>
    </div>
  );

  let messages: any[] = [];
  try {
    const parsed = JSON.parse(session.messages);
    messages = Array.isArray(parsed) ? parsed : parsed.messages ?? [];
  } catch {
    // leave empty
  }

  const rate = acceptanceRate(session.accepted_lines ?? 0, session.total_additions ?? 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
        <Link to="/sessions" className="text-muted" style={{ fontSize: "12px" }}>← ALL SESSIONS</Link>
        <div className="page-title" style={{ margin: 0 }}>{projectName(session.workdir)}</div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h3>Session Info</h3>
          <div className="detail-row">
            <span className="detail-key">Project</span>
            <span className="detail-val">{projectName(session.workdir)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Workdir</span>
            <span className="detail-val mono">{session.workdir ?? "—"}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Tool</span>
            <span className="detail-val mono">{session.tool}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Model</span>
            <span className="detail-val mono">{session.model}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Author</span>
            <span className="detail-val">{session.human_author ?? "—"}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Created</span>
            <span className="detail-val">{formatDate(session.created_at)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Commit</span>
            <span className="detail-val mono">
              {session.commit_sha ? session.commit_sha.slice(0, 12) : "—"}
            </span>
          </div>
        </div>
        <div className="detail-card">
          <h3>Attribution Stats</h3>
          <div className="detail-row">
            <span className="detail-key">Lines Written</span>
            <span className="detail-val text-tertiary">+{session.total_additions ?? 0}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Lines Removed</span>
            <span className="detail-val text-error">-{session.total_deletions ?? 0}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Lines Accepted</span>
            <span className="detail-val">{session.accepted_lines ?? 0}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Lines Overridden</span>
            <span className="detail-val">{session.overridden_lines ?? 0}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Acceptance Rate</span>
            <span className="detail-val">
              <span
                className="status-dot"
                style={{
                  background:
                    parseFloat(rate) >= 80 ? "var(--tertiary)" : "var(--secondary)",
                }}
              ></span>
              <span className="status-label">{rate}</span>
            </span>
          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="messages-section">
          <div className="messages-header">Conversation · {messages.length} messages</div>
          <div className="message-list">
            {messages.map((m: any, i: number) => {
              if (m.type === "user") {
                return (
                  <div className="msg" key={i}>
                    <div className="msg-icon">U</div>
                    <div className="msg-body">
                      <div className="msg-role">User</div>
                      <div className="msg-text">{m.text ?? ""}</div>
                      {m.timestamp && (
                        <div className="msg-ts">{new Date(m.timestamp).toLocaleTimeString()}</div>
                      )}
                    </div>
                  </div>
                );
              }
              if (m.type === "assistant") {
                return (
                  <div className="msg" key={i}>
                    <div className="msg-icon">AI</div>
                    <div className="msg-body">
                      <div className="msg-role">{shortModel(session.model)}</div>
                      <div className="msg-text">{m.text ?? ""}</div>
                      {m.timestamp && (
                        <div className="msg-ts">{new Date(m.timestamp).toLocaleTimeString()}</div>
                      )}
                    </div>
                  </div>
                );
              }
              if (m.type === "tool_use") {
                return (
                  <div className="msg" key={i}>
                    <div className="msg-icon">⚙</div>
                    <div className="msg-body">
                      <div className="msg-role">Tool</div>
                      <div className="msg-tool">{m.name ?? "unknown"}</div>
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}
    </>
  );
};

export default SessionDetail;

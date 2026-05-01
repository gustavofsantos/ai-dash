import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { 
  User, 
  Bot, 
  Settings, 
  Clock, 
  Calendar, 
  Database, 
  ChevronDown, 
  ChevronUp,
  Terminal,
  FileCode,
  MessageSquare,
  Zap,
  CheckCircle2,
  Clock3
} from "lucide-react";
import { 
  shortModel, 
  formatDate,
  firstUserMessage
} from "../utils.ts";

const SessionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});

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

  const toggleTool = (idx: number) => {
    setExpandedTools(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const isGemini = session.model?.toLowerCase().includes("gemini");
  const isClaude = session.model?.toLowerCase().includes("claude");
  const title = firstUserMessage(session.messages) || "Untitled Session";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <header className="session-header">
        <h1 className="session-title">{title}</h1>
        <div className="session-metadata-bar">
          <div className="meta-item">
            <span className={`badge ${isClaude ? "badge-secondary" : isGemini ? "badge-primary" : ""}`}>
              {isClaude ? "Claude Code" : isGemini ? "Gemini" : session.tool}
            </span>
            <span className="mono">{shortModel(session.model)}</span>
          </div>
          <div className="meta-item">
            <User size={14} />
            {session.human_author || "gustavofsantos"}
          </div>
          <div className="meta-item">
            <Clock3 size={14} />
            26m ago
          </div>
          <div className="meta-item">
            <Clock size={14} />
            13min
          </div>
          <div className="meta-item">
            <CheckCircle2 size={14} />
            1 Checkpoint
          </div>
          <div className="meta-item">
            <FileCode size={14} />
            1 file
          </div>
          <div className="meta-item" style={{ color: "var(--tertiary)" }}>
            +{session.total_additions || 0} added
          </div>
          <div className="meta-item" style={{ color: "var(--error)" }}>
            -{session.total_deletions || 0} removed
          </div>
          <div className="meta-item">
            <Zap size={14} />
            6.9k tokens
          </div>
        </div>
      </header>

      <div className="session-detail-layout">
        <div className="timeline">
          {messages.map((m: any, i: number) => {
            if (m.type === "user") {
              return (
                <div className="timeline-item" key={i}>
                  <div className="timeline-dot">
                    <User size={18} color="var(--on-surface-variant)" />
                  </div>
                  <div className="timeline-content">
                    <div className="message-card">
                      <div className="message-header">
                        <span>User</span>
                        <span>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}</span>
                      </div>
                      <div className="message-text">{m.text}</div>
                    </div>
                  </div>
                </div>
              );
            }
            if (m.type === "assistant") {
              return (
                <div className="timeline-item" key={i}>
                  <div className="timeline-dot">
                    <Bot size={18} color="var(--primary)" />
                  </div>
                  <div className="timeline-content">
                    <div className="message-text" style={{ padding: "8px 0" }}>{m.text}</div>
                  </div>
                </div>
              );
            }
            if (m.type === "tool_use") {
              const isExpanded = expandedTools[i];
              return (
                <div className="timeline-item" key={i}>
                  <div className="timeline-dot" style={{ borderStyle: "dashed" }}>
                    <Settings size={16} color="var(--on-surface-variant)" />
                  </div>
                  <div className="timeline-content">
                    <div className="tool-call">
                      <div className="tool-call-header" onClick={() => toggleTool(i)}>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <Terminal size={14} />
                        <span>{m.name}</span>
                      </div>
                      {isExpanded && (
                        <div className="tool-call-content">
                          <pre>{JSON.stringify(m.input, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>

        <aside className="detail-sidebar">
          <div className="detail-sidebar-section">
            <div className="detail-sidebar-title">Checkpoints</div>
            <div className="badge" style={{ width: "100%", justifyContent: "space-between", padding: "8px 12px" }}>
              <span>All checkpoints</span>
              <ChevronDown size={14} />
            </div>
          </div>

          <div className="detail-sidebar-section">
            <div className="detail-sidebar-title">Filters</div>
            <div className="filter-list">
              <div className="filter-item">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MessageSquare size={14} color="var(--on-surface-variant)" />
                  <span>Prompts</span>
                </div>
                <span>2</span>
              </div>
              <div className="filter-item">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Bot size={14} color="var(--on-surface-variant)" />
                  <span>Responses</span>
                </div>
                <span>7</span>
              </div>
              <div className="filter-item">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Settings size={14} color="var(--on-surface-variant)" />
                  <span>Tool calls</span>
                </div>
                <span>17</span>
              </div>
            </div>
          </div>

          <div className="detail-sidebar-section">
            <div className="detail-sidebar-title">View</div>
            <div className="filter-list">
              <div className="filter-item" style={{ color: "var(--on-surface-variant)" }}>
                <span>Show hidden indicators</span>
              </div>
              <div className="filter-item" style={{ color: "var(--on-surface-variant)" }}>
                <span>Expand all tool calls</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SessionDetail;

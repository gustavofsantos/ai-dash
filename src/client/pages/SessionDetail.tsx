import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm'
import { PatchDiff } from "@pierre/diffs/react";
import {
  User,
  Bot,
  Settings,
  Clock,
  ChevronDown,
  ChevronUp,
  Terminal,
  FileCode,
  MessageSquare,
  Zap,
  CheckCircle2,
  Clock3,
  GitCommit
} from "lucide-react";
import {
  shortModel,
  formatDate,
  firstUserMessage
} from "../utils.ts";
import { ContextTimeline } from "../components/ContextTimeline.tsx";

interface DiffLine { type: 'context' | 'add' | 'remove'; content: string; }
interface DiffHunk { header: string; oldStart: number; newStart: number; lines: DiffLine[]; }
interface DiffFile { path: string; status: 'M' | 'A' | 'D' | 'R'; binary: boolean; additions: number; deletions: number; hunks: DiffHunk[]; raw: string; }
interface DiffData { files: DiffFile[]; }

const DiffViewer: React.FC<{ file: DiffFile }> = ({ file }) => {
  if (file.binary) {
    return <div className="diff-empty">Binary file — diff not shown.</div>;
  }
  
  return (
    <div className="diff-viewer">
      <div className="diff-file-header">
        <span className="diff-file-path">{file.path}</span>
        <div className="diff-file-stats">
          {file.additions > 0 && <span className="stat-add">+{file.additions}</span>}
          {file.deletions > 0 && <span className="stat-del">-{file.deletions}</span>}
        </div>
      </div>
      <div className="pierre-diff-container">
        <PatchDiff 
          patch={file.raw} 
          options={{
            theme: { dark: 'pierre-dark', light: 'pierre-light' },
            themeType: 'system',
          }}
        />
      </div>
    </div>
  );
};

const ChangesPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const { data: diffData, isLoading } = useQuery<DiffData>({
    queryKey: ['sessions', sessionId, 'diff'],
    queryFn: async (): Promise<DiffData> => {
      const res = await fetch(`/api/sessions/${sessionId}/diff`);
      if (!res.ok) return { files: [] };
      return res.json() as Promise<DiffData>;
    }
  });

  const effectivePath = selectedPath ?? diffData?.files[0]?.path ?? null;
  const selectedFile = diffData?.files.find(f => f.path === effectivePath) ?? null;

  if (isLoading) return <div style={{ padding: 32, color: "var(--on-surface-variant)" }}>Loading changes...</div>;

  if (!diffData?.files.length) {
    return (
      <div className="empty-state" style={{ padding: "80px" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>~</div>
        <div>No changes recorded for this session.</div>
      </div>
    );
  }

  return (
    <div className="changes-layout">
      <div className="changes-file-list">
        {diffData.files.map(file => {
          const name = file.path.split('/').pop() ?? file.path;
          const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
          return (
            <div
              key={file.path}
              className={`changes-file-item${effectivePath === file.path ? ' selected' : ''}`}
              onClick={() => setSelectedPath(file.path)}
            >
              <span className={`file-status-badge status-${file.status}`}>{file.status}</span>
              <div className="changes-file-name">
                <span>{name}</span>
                {dir && <span className="changes-file-dir">{dir}</span>}
              </div>
              <div className="changes-file-stats">
                {file.additions > 0 && <span className="stat-add">+{file.additions}</span>}
                {file.deletions > 0 && <span className="stat-del">-{file.deletions}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="changes-diff-panel">
        {selectedFile && <DiffViewer file={selectedFile} />}
      </div>
    </div>
  );
};

interface CheckpointAttribution {
  ai_additions: number;
  ai_deletions: number;
  human_additions: number;
  human_deletions: number;
}

interface Checkpoint {
  id: string;
  commit_sha: string;
  short_sha: string;
  created_at: string;
  strategy: string;
  attribution: CheckpointAttribution | null;
}

const CheckpointDiff: React.FC<{ sessionId: string; sha: string }> = ({ sessionId, sha }) => {
  const { data, isLoading } = useQuery<DiffData>({
    queryKey: ['sessions', sessionId, 'checkpoints', sha, 'diff'],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/checkpoints/${sha}/diff`);
      if (!res.ok) return { files: [] };
      return res.json() as Promise<DiffData>;
    }
  });

  if (isLoading) return <div style={{ padding: "16px", color: "var(--on-surface-variant)", fontSize: "13px" }}>Loading diff...</div>;
  if (!data?.files.length) return <div style={{ padding: "16px", color: "var(--on-surface-variant)", fontSize: "13px" }}>No changes in this checkpoint.</div>;

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: "8px" }}>
      {data.files.map(file => <DiffViewer key={file.path} file={file} />)}
    </div>
  );
};

const CheckpointsPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [expandedSha, setExpandedSha] = useState<string | null>(null);

  const { data: checkpoints, isLoading } = useQuery<Checkpoint[]>({
    queryKey: ['sessions', sessionId, 'checkpoints'],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/checkpoints`);
      if (!res.ok) return [];
      return res.json() as Promise<Checkpoint[]>;
    }
  });

  if (isLoading) return <div style={{ padding: 32, color: "var(--on-surface-variant)" }}>Loading checkpoints...</div>;

  if (!checkpoints?.length) {
    return (
      <div className="empty-state" style={{ padding: "80px" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>~</div>
        <div>No checkpoints recorded for this session.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 0" }}>
      {checkpoints.map(cp => {
        const isExpanded = expandedSha === cp.commit_sha;
        const attr = cp.attribution;
        return (
          <div key={cp.id} style={{ marginBottom: "8px", border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden", background: "var(--surface)" }}>
            <div
              onClick={() => setExpandedSha(isExpanded ? null : cp.commit_sha)}
              style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px 16px", cursor: "pointer", userSelect: "none" }}
            >
              <GitCommit size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
              <code style={{ fontFamily: "monospace", fontSize: "13px", color: "var(--primary)", minWidth: "60px" }}>{cp.short_sha}</code>
              <span style={{ fontSize: "12px", color: "var(--on-surface-variant)", minWidth: "120px" }}>
                {new Date(cp.created_at).toLocaleTimeString()}
              </span>
              {cp.strategy && (
                <span style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: cp.strategy === "manual" ? "var(--primary-container)" : "var(--surface-variant)",
                  color: cp.strategy === "manual" ? "var(--on-primary-container)" : "var(--on-surface-variant)"
                }}>
                  {cp.strategy}
                </span>
              )}
              <div style={{ display: "flex", gap: "12px", marginLeft: "auto", fontSize: "13px" }}>
                {attr ? (
                  <>
                    <span style={{ color: "var(--tertiary)" }}>+{attr.ai_additions} AI</span>
                    <span style={{ color: "var(--error)" }}>-{attr.ai_deletions} AI</span>
                    {(attr.human_additions > 0 || attr.human_deletions > 0) && (
                      <>
                        <span style={{ color: "var(--on-surface-variant)" }}>+{attr.human_additions} human</span>
                        <span style={{ color: "var(--on-surface-variant)" }}>-{attr.human_deletions} human</span>
                      </>
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--on-surface-variant)", fontSize: "12px" }}>no attribution</span>
                )}
              </div>
              {isExpanded ? <ChevronUp size={16} color="var(--on-surface-variant)" style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color="var(--on-surface-variant)" style={{ flexShrink: 0 }} />}
            </div>
            {isExpanded && <CheckpointDiff sessionId={sessionId} sha={cp.commit_sha} />}
          </div>
        );
      })}
    </div>
  );
};

const TokenHistogram: React.FC<{ turns: any[] }> = ({ turns }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const chartRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!canvasRef.current || turns.length < 2) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    if (chartRef.current) chartRef.current.destroy();

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const colors = {
      text: isDark ? "#A1A1AA" : "#666666",
      border: isDark ? "#27272A" : "#E0E0E0",
      grid: isDark ? "#1A1A1A" : "#FAFAFA",
    };

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: turns.map(t => new Date(t.timestamp).toLocaleTimeString()),
        datasets: [
          {
            label: "Input",
            data: turns.map(t => t.input_tokens || 0),
            backgroundColor: isDark ? "#3B82F6" : "#0052FF",
            stack: "tokens",
          },
          {
            label: "Output",
            data: turns.map(t => t.output_tokens || 0),
            backgroundColor: isDark ? "#22C55E" : "#10B981",
            stack: "tokens",
          },
          {
            label: "Cache",
            data: turns.map(t => (t.cache_creation_tokens || 0) + (t.cache_read_tokens || 0)),
            backgroundColor: isDark ? "#A855F7" : "#8B5CF6",
            stack: "tokens",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: true, labels: { color: colors.text, font: { size: 10 } } },
          tooltip: {
            backgroundColor: isDark ? "#0A0A0A" : "#FFFFFF",
            titleColor: isDark ? "#F2F2F2" : "#1A1A1A",
            bodyColor: isDark ? "#A1A1AA" : "#666666",
            borderColor: colors.border,
            borderWidth: 1,
            cornerRadius: 0,
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 }, color: colors.text, maxRotation: 45 } },
          y: { stacked: true, grid: { color: colors.grid }, ticks: { font: { size: 9 }, color: colors.text } },
        },
      },
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [turns.length]);

  if (turns.length < 2) return null;

  return <canvas ref={canvasRef} style={{ width: "100%", maxHeight: 180 }} />;
};

const SessionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'transcript' | 'changes' | 'checkpoints' | 'plan' | 'context'>('transcript');
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});
  const [compactToolUses, setCompactToolUses] = useState(true);

  const { data: session, isLoading, error } = useQuery({
    queryKey: ["sessions", id],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error("Session not found");
      return res.json();
    },
  });

  const { data: diffData } = useQuery<DiffData>({
    queryKey: ['sessions', id, 'diff'],
    queryFn: async (): Promise<DiffData> => {
      const res = await fetch(`/api/sessions/${id}/diff`);
      if (!res.ok) return { files: [] };
      return res.json() as Promise<DiffData>;
    },
    enabled: !!id,
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

  const toggleGroup = (idx: number) => {
    setExpandedGroups(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const isGemini = session.model?.toLowerCase().includes("gemini");
  const isClaude = session.model?.toLowerCase().includes("claude");
  const title = firstUserMessage(session.messages) || "Untitled Session";

  let metadata: any = {};
  try {
    metadata = typeof session.agent_metadata === "string"
      ? JSON.parse(session.agent_metadata)
      : session.agent_metadata || {};
  } catch {
    // leave empty
  }

  const promptCount = messages.filter(m => m.type === "user").length;
  const responseCount = messages.filter(m => m.type === "assistant").length;
  const toolCallCount = messages.filter(m => m.type === "tool_use").length;
  const changedFilesCount = diffData?.files.length ?? 0;

  const timeAgo = (ts: number) => {
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const formatDuration = (start: number, end: number) => {
    const diff = end - start;
    if (diff <= 0) return "0s";
    if (diff < 60) return `${diff}s`;
    return `${Math.floor(diff / 60)}min`;
  };

  const groupedMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (compactToolUses && m.type === "tool_use") {
      const group = [{ ...m, originalIndex: i }];
      while (i + 1 < messages.length && messages[i + 1].type === "tool_use") {
        i++;
        group.push({ ...messages[i], originalIndex: i });
      }
      groupedMessages.push({ type: "tool_use_group", items: group });
    } else {
      groupedMessages.push({ ...m, originalIndex: i });
    }
  }

  function getToolSummary(name: string, input: any) {
    let summary = "";
    if (typeof input === "string") {
      summary = input;
    } else if (input) {
      summary = input.command || input.path || input.AbsolutePath || input.TargetFile || JSON.stringify(input);
    }

    let displayName = name;
    if (name === "run_command" || name === "bash") displayName = "Bash";
    else if (name === "read_file" || name === "view_file") displayName = "Read";
    else if (name === "replace_file_content" || name === "multi_replace_file_content" || name === "write_to_file") displayName = "File edit";
    else if (name === "agent" || name === "subagent") displayName = "Agent";

    return { displayName, summary };
  }

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
            {session.human_author || "-"}
          </div>
          <div className="meta-item">
            <Clock3 size={14} />
            {timeAgo(session.created_at)}
          </div>
          <div className="meta-item">
            <Clock size={14} />
            {formatDuration(session.created_at, session.updated_at)}
          </div>
          <div className="meta-item">
            <CheckCircle2 size={14} />
            {session.checkpoint_count ? `${session.checkpoint_count} Checkpoint${session.checkpoint_count !== 1 ? "s" : ""}` : "-"}
          </div>
          <div className="meta-item">
            <FileCode size={14} />
            {changedFilesCount ? `${changedFilesCount} file${changedFilesCount !== 1 ? "s" : ""}` : "-"}
          </div>
          <div className="meta-item" style={{ color: "var(--tertiary)" }}>
            +{session.total_additions || 0} added
          </div>
          <div className="meta-item" style={{ color: "var(--error)" }}>
            -{session.total_deletions || 0} removed
          </div>
          <div className="meta-item">
            <Zap size={14} />
            {session.total_tokens ? `${session.total_tokens.toLocaleString()} tokens` : "-"}
          </div>
        </div>
      </header>

      <div className="session-tabs">
        <button
          className={`session-tab${activeTab === 'transcript' ? ' active' : ''}`}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
        <button
          className={`session-tab${activeTab === 'context' ? ' active' : ''}`}
          onClick={() => setActiveTab('context')}
        >
          Context
        </button>
        <button
          className={`session-tab${activeTab === 'changes' ? ' active' : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          Changes
          {changedFilesCount > 0 && <span className="tab-badge">{changedFilesCount}</span>}
        </button>
        <button
          className={`session-tab${activeTab === 'checkpoints' ? ' active' : ''}`}
          onClick={() => setActiveTab('checkpoints')}
        >
          Checkpoints
          {session.checkpoint_count > 0 && <span className="tab-badge">{session.checkpoint_count}</span>}
        </button>
      </div>

      {activeTab === 'transcript' ? (
        <div className="session-detail-layout">
          <div className="timeline">
            {groupedMessages.map((gm: any, idx: number) => {
              if (gm.type === "user") {
                return (
                  <div className="timeline-item" key={idx}>
                    <div className="timeline-dot">
                      <User size={18} color="var(--on-surface-variant)" />
                    </div>
                    <div className="timeline-content">
                      <div className="message-card">
                        <div className="message-header">
                          <span>User</span>
                          <span>{gm.timestamp ? new Date(gm.timestamp).toLocaleTimeString() : ""}</span>
                        </div>
                        <div className="message-text">
                          <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{gm.text}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (gm.type === "plan") {
                return (
                  <div className="timeline-item" key={idx}>
                    <div className="timeline-dot">
                      <FileCode size={18} color="var(--tertiary)" />
                    </div>
                    <div className="timeline-content">
                      <div className="message-card" style={{ background: "var(--surface-container)", borderColor: "var(--outline)" }}>
                        <div className="message-header">
                          <span style={{ color: "var(--tertiary)", fontWeight: 600 }}>Plan</span>
                          <span>{gm.timestamp ? new Date(gm.timestamp).toLocaleTimeString() : ""}</span>
                        </div>
                        <div className="message-text">
                          <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{gm.text}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (gm.type === "assistant") {
                return (
                  <div className="timeline-item" key={idx}>
                    <div className="timeline-dot">
                      <Bot size={18} color="var(--primary)" />
                    </div>
                    <div className="timeline-content">
                      <div className="message-text" style={{ padding: "8px 0" }}>
                        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{gm.text}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              }
              if (gm.type === "tool_use") {
                const isExpanded = expandedTools[gm.originalIndex];
                return (
                  <div className="timeline-item" key={idx}>
                    <div className="timeline-dot" style={{ borderStyle: "dashed" }}>
                      <Settings size={16} color="var(--on-surface-variant)" />
                    </div>
                    <div className="timeline-content">
                      <div className="tool-call">
                        <div className="tool-call-header" onClick={() => toggleTool(gm.originalIndex)}>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          <Terminal size={14} />
                          <span>{gm.name}</span>
                        </div>
                        {isExpanded && (
                          <div className="tool-call-content">
                            <pre>{JSON.stringify(gm.input, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              if (gm.type === "tool_use_group") {
                const groupIndex = gm.items[0].originalIndex;
                const isGroupExpanded = expandedGroups[groupIndex];

                return (
                  <div className="timeline-item" key={idx}>
                    <div className="timeline-dot" style={{ borderStyle: "dashed" }}>
                      <Settings size={16} color="var(--on-surface-variant)" />
                    </div>
                    <div className="timeline-content" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div
                        onClick={() => toggleGroup(groupIndex)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          color: "var(--on-surface)",
                          fontSize: "14px"
                        }}
                      >
                        <span>{gm.items.length} tool calls</span>
                        {isGroupExpanded ? <ChevronUp size={16} color="var(--on-surface-variant)" /> : <ChevronDown size={16} color="var(--on-surface-variant)" />}
                      </div>

                      {isGroupExpanded && (
                        <div style={{ display: "flex", flexDirection: "column", paddingLeft: "8px" }}>
                          {gm.items.map((m: any) => {
                            const isExpanded = expandedTools[m.originalIndex];
                            const { displayName, summary } = getToolSummary(m.name, m.input);
                            return (
                              <div key={m.originalIndex}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "6px 0",
                                    cursor: "pointer",
                                    fontFamily: "monospace",
                                    fontSize: "13px"
                                  }}
                                  onClick={() => toggleTool(m.originalIndex)}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "32px", flex: 1, overflow: "hidden" }}>
                                    <span style={{ color: m.name === "read_file" || m.name === "view_file" ? "var(--primary)" : "var(--on-surface)", minWidth: "60px" }}>{displayName}</span>
                                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--on-surface-variant)" }}>{summary}</span>
                                  </div>
                                  {isExpanded ? <ChevronUp size={14} color="var(--on-surface-variant)" /> : <ChevronDown size={14} color="var(--on-surface-variant)" />}
                                </div>
                                {isExpanded && (
                                  <div className="tool-call-content" style={{ marginTop: "8px", marginBottom: "16px" }}>
                                    <pre>{JSON.stringify(m.input, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>

          <aside className="detail-sidebar">
            {session.token_timeline?.length >= 2 && (
              <div className="detail-sidebar-section">
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginBottom: 8 }}>Token usage per turn</div>
                <TokenHistogram turns={session.token_timeline} />
              </div>
            )}
            <div className="detail-sidebar-section">
              <div className="filter-list">
                <div className="filter-item">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MessageSquare size={14} color="var(--on-surface-variant)" />
                    <span>Prompts</span>
                  </div>
                  <span>{promptCount}</span>
                </div>
                <div className="filter-item">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Bot size={14} color="var(--on-surface-variant)" />
                    <span>Responses</span>
                  </div>
                  <span>{responseCount}</span>
                </div>
                <div className="filter-item">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Settings size={14} color="var(--on-surface-variant)" />
                    <span>Tool calls</span>
                  </div>
                  <span>{toolCallCount}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : activeTab === 'context' ? (
        <ContextTimeline sessionId={id!} />
      ) : activeTab === 'changes' ? (
        <ChangesPanel sessionId={id!} />
      ) : (
        <CheckpointsPanel sessionId={id!} />
      )}
    </div>
  );
};

export default SessionDetail;

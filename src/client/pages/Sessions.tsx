import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Filter, History, User } from "lucide-react";
import { 
  shortModel, 
  firstUserMessage 
} from "../utils.ts";

const Sessions: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", page],
    queryFn: async () => {
      const res = await fetch(`/api/sessions?page=${page}`);
      return res.json();
    },
  });

  if (isLoading) return <div>Loading sessions...</div>;
  if (!data) return <div>Error loading sessions</div>;

  // Group sessions by date
  const groups: { [key: string]: any[] } = {};
  data.sessions.forEach((s: any) => {
    const date = new Date(s.created_at * 1000);
    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(s);
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div className="badge" style={{ padding: "4px 8px", gap: 4 }}>
            <History size={14} />
            main
          </div>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--on-surface-variant)" }} />
            <input 
              type="text" 
              placeholder="Filter sessions..." 
              className="badge" 
              style={{ paddingLeft: 36, height: 32, width: 240, background: "transparent" }} 
            />
          </div>
          <button className="badge" style={{ padding: "0 8px" }}>
            <Filter size={16} />
          </button>
        </div>
      </div>

      {Object.keys(groups).length === 0 ? (
        <div className="empty-state">No sessions yet.</div>
      ) : (
        Object.entries(groups).map(([date, sessions]) => (
          <div key={date} className="session-group">
            <div className="session-group-title">
              <span>{date}</span>
              <span style={{ fontWeight: 400, color: "var(--on-surface-variant)", fontSize: 12 }}>
                {sessions.length} sessions
              </span>
            </div>
            <div className="session-list">
              {sessions.map((s: any) => {
                const preview = firstUserMessage(s.messages ?? "");
                const isGemini = s.model?.toLowerCase().includes("gemini");
                const isClaude = s.model?.toLowerCase().includes("claude");
                
                return (
                  <Link key={s.id} to={`/sessions/${s.id}`} className="session-item">
                    <div className="avatar">
                      <User size={18} color="var(--on-surface-variant)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="session-summary">{preview || "Untitled Session"}</span>
                        <span className={`badge ${isClaude ? "badge-secondary" : isGemini ? "badge-primary" : ""}`}>
                          {isClaude ? "Claude Code" : isGemini ? "Gemini" : s.tool}
                        </span>
                      </div>
                    </div>
                    <div className="session-meta">
                      <span className="mono">{shortModel(s.model)}</span>
                      <span>•</span>
                      <span>1 checkpoint</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div className="pagination" style={{ borderTop: "none", marginTop: 24 }}>
        <div className="pagination-btns">
          <button
            className={`btn ${page <= 1 ? "disabled" : ""}`}
            disabled={page <= 1}
            onClick={() => setSearchParams({ page: (page - 1).toString() })}
          >
            Prev
          </button>
          <button
            className={`btn ${page >= Math.ceil(data.total / data.pageSize) ? "disabled" : ""}`}
            disabled={page >= Math.ceil(data.total / data.pageSize)}
            onClick={() => setSearchParams({ page: (page + 1).toString() })}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
};

export default Sessions;

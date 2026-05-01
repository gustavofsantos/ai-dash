import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FolderGit2 } from "lucide-react";
import { projectName, shortModel, formatDate } from "../utils.ts";

const Repositories: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["repositories"],
    queryFn: async () => {
      const res = await fetch("/api/repositories");
      return res.json();
    },
  });

  if (isLoading) return <div>Loading repositories...</div>;
  if (!data) return <div>Error loading repositories</div>;

  const repos: any[] = data.repositories;

  return (
    <>
      <div className="page-title">Repositories</div>

      {repos.length === 0 ? (
        <div className="empty-state">No repositories found.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Sessions</th>
                <th>AI Lines</th>
                <th>Acceptance</th>
                <th>Last Active</th>
                <th>Tool / Model</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((r: any) => {
                const rate =
                  r.ai_lines > 0
                    ? `${Math.round((r.accepted_lines / r.ai_lines) * 100)}%`
                    : "—";
                const isGemini = r.top_model?.toLowerCase().includes("gemini");
                const isClaude = r.top_model?.toLowerCase().includes("claude");

                return (
                  <tr key={r.project}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: "var(--surface-container)",
                            border: "1px solid var(--outline)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <FolderGit2 size={16} color="var(--on-surface-variant)" />
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13, color: "var(--on-surface)" }}>
                            {projectName(r.project)}
                          </div>
                          <div
                            className="mono"
                            style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}
                          >
                            {r.project}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Link
                        to={`/sessions?repo=${encodeURIComponent(r.project)}`}
                        style={{ color: "var(--primary)", fontWeight: 500 }}
                      >
                        {r.sessions}
                      </Link>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                      {r.ai_lines.toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            height: 4,
                            width: 64,
                            background: "var(--surface-container)",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: rate === "—" ? "0%" : rate,
                              background: "var(--primary)",
                              borderRadius: 2,
                            }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: 12 }}>
                          {rate}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                      {formatDate(r.last_active)}
                    </td>
                    <td>
                      <span
                        className={`badge ${isClaude ? "badge-secondary" : isGemini ? "badge-primary" : ""}`}
                      >
                        {isClaude ? "Claude Code" : isGemini ? "Gemini" : r.top_tool ?? "—"}
                      </span>
                      {r.top_model && (
                        <span className="mono" style={{ fontSize: 11, color: "var(--on-surface-variant)", marginLeft: 8 }}>
                          {shortModel(r.top_model)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default Repositories;

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { 
  projectName, 
  shortModel, 
  formatDate, 
  acceptanceRate, 
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

  const totalPages = Math.ceil(data.total / data.pageSize);
  const start = (page - 1) * data.pageSize + 1;
  const end = Math.min(page * data.pageSize, data.total);

  return (
    <>
      <div className="page-title">Sessions</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Project / Prompt</th>
              <th>Tool</th>
              <th>Model</th>
              <th>+Lines</th>
              <th>-Lines</th>
              <th>Accepted</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">No sessions yet.</div>
                </td>
              </tr>
            ) : (
              data.sessions.map((s: any) => {
                const preview = firstUserMessage(s.messages ?? "");
                const rate = acceptanceRate(s.accepted_lines ?? 0, s.total_additions ?? 0);
                return (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/sessions/${s.id}`} style={{ fontWeight: 500 }}>
                        {projectName(s.workdir)}
                      </Link>
                      {preview && (
                        <div className="text-muted" style={{ fontSize: "12px", marginTop: "2px" }}>
                          {preview}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: "11px" }}>
                        {s.tool}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: "11px" }}>
                        {shortModel(s.model)}
                      </span>
                    </td>
                    <td className="text-tertiary">+{s.total_additions ?? 0}</td>
                    <td className="text-error">-{s.total_deletions ?? 0}</td>
                    <td>
                      <span
                        className="status-dot"
                        style={{
                          background:
                            parseFloat(rate) >= 80 ? "var(--tertiary)" : "var(--secondary)",
                        }}
                      ></span>
                      <span className="status-label">{rate}</span>
                    </td>
                    <td className="text-muted">{formatDate(s.created_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="pagination">
          <span>
            Showing {start}–{end} of {data.total} sessions
          </span>
          <div className="pagination-btns">
            <button
              className={`btn ${page <= 1 ? "disabled" : ""}`}
              disabled={page <= 1}
              onClick={() => setSearchParams({ page: (page - 1).toString() })}
            >
              Prev
            </button>
            <button
              className={`btn ${page >= totalPages ? "disabled" : ""}`}
              disabled={page >= totalPages}
              onClick={() => setSearchParams({ page: (page + 1).toString() })}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sessions;

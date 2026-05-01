import type { Session, SessionDetail, Stats } from "./db";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function projectName(workdir: string | null): string {
  if (!workdir) return "unknown";
  return workdir.split("/").pop() || workdir;
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "");
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function acceptanceRate(accepted: number, added: number): string {
  if (!added) return "—";
  return `${Math.round((accepted / added) * 100)}%`;
}

function firstUserMessage(messagesJson: string): string {
  try {
    const parsed = JSON.parse(messagesJson);
    const msgs = Array.isArray(parsed) ? parsed : parsed.messages ?? [];
    const first = msgs.find((m: { type: string }) => m.type === "user");
    const text: string = first?.text ?? "";
    return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  } catch {
    return "";
  }
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface2: #21262d;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #7d8590;
    --accent: #58a6ff;
    --green: #3fb950;
    --orange: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
    --radius: 8px;
    --mono: 'SFMono-Regular', Consolas, monospace;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .header {
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 32px;
    height: 56px;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
  }
  .header-brand {
    font-weight: 600;
    font-size: 15px;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header-brand span { color: var(--accent); }
  .nav { display: flex; gap: 4px; }
  .nav a {
    padding: 6px 12px;
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
  }
  .nav a:hover { color: var(--text); background: var(--surface2); text-decoration: none; }
  .nav a.active { color: var(--text); background: var(--surface2); }

  .container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }

  .page-title {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 24px;
    color: var(--text);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }
  .stat-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }
  .stat-sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
    margin-bottom: 32px;
  }
  @media (max-width: 768px) { .charts-grid { grid-template-columns: 1fr; } }
  .chart-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }
  .chart-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 16px;
  }
  canvas { max-height: 220px; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 15px;
    font-weight: 600;
  }
  .section-link { font-size: 13px; color: var(--accent); }

  .table-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    padding: 10px 16px;
    text-align: left;
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border);
    background: var(--surface2);
    white-space: nowrap;
  }
  tbody td {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--surface2); }
  .empty-state {
    padding: 48px;
    text-align: center;
    color: var(--muted);
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 500;
    font-family: var(--mono);
  }
  .badge-blue { background: rgba(88,166,255,0.15); color: var(--accent); }
  .badge-purple { background: rgba(188,140,255,0.15); color: var(--purple); }
  .badge-green { background: rgba(63,185,80,0.15); color: var(--green); }

  .mono { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .text-muted { color: var(--muted); }
  .text-green { color: var(--green); }
  .text-red { color: var(--red); }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-top: 1px solid var(--border);
    font-size: 13px;
    color: var(--muted);
  }
  .pagination-btns { display: flex; gap: 8px; }
  .btn {
    padding: 6px 14px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--text);
    cursor: pointer;
    font-size: 13px;
    text-decoration: none;
    display: inline-block;
  }
  .btn:hover { background: var(--border); text-decoration: none; }
  .btn:disabled, .btn.disabled { opacity: 0.4; pointer-events: none; }

  /* Session detail */
  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 768px) { .detail-grid { grid-template-columns: 1fr; } }
  .detail-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }
  .detail-card h3 {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .detail-row:last-child { border-bottom: none; }
  .detail-key { color: var(--muted); }
  .detail-val { font-weight: 500; text-align: right; word-break: break-all; max-width: 60%; }

  .messages-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .messages-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--surface2);
  }
  .message-list { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .msg {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .msg-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .msg-icon-user { background: rgba(88,166,255,0.2); color: var(--accent); }
  .msg-icon-ai { background: rgba(188,140,255,0.2); color: var(--purple); }
  .msg-icon-tool { background: rgba(63,185,80,0.15); color: var(--green); }
  .msg-body { flex: 1; min-width: 0; }
  .msg-role {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
    color: var(--muted);
  }
  .msg-text {
    font-size: 13px;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg-tool {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    font-family: var(--mono);
    color: var(--muted);
  }
  .msg-ts { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .show-more {
    text-align: center;
    padding: 12px;
    border-top: 1px solid var(--border);
    font-size: 13px;
  }
`;

const CHART_JS = `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>`;

function layout(title: string, activePage: string, content: string, scripts = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} · Git AI Dashboard</title>
  <style>${CSS}</style>
</head>
<body>
<header class="header">
  <div class="header-brand">⬡ Git AI <span>Dashboard</span></div>
  <nav class="nav">
    <a href="/" class="${activePage === "overview" ? "active" : ""}">Overview</a>
    <a href="/sessions" class="${activePage === "sessions" ? "active" : ""}">Sessions</a>
  </nav>
</header>
<main>
  <div class="container">
    ${content}
  </div>
</main>
${scripts}
</body>
</html>`;
}

export function dashboardView(
  stats: Stats,
  recentSessions: Session[],
  projectStats: Array<{ project: string; sessions: number; ai_lines: number }>,
  activityByDay: Array<{ date: string; sessions: number; lines: number }>,
  modelStats: Array<{ model: string; count: number }>
): string {
  const acceptRate =
    stats.total_ai_lines > 0
      ? `${Math.round((stats.total_accepted / stats.total_ai_lines) * 100)}%`
      : "—";

  const statsHtml = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Sessions</div>
        <div class="stat-value">${stats.total_sessions}</div>
        <div class="stat-sub">AI coding sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">AI Lines Written</div>
        <div class="stat-value">${stats.total_ai_lines.toLocaleString()}</div>
        <div class="stat-sub">${stats.total_accepted.toLocaleString()} accepted</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Acceptance Rate</div>
        <div class="stat-value">${acceptRate}</div>
        <div class="stat-sub">Lines kept vs written</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Projects</div>
        <div class="stat-value">${stats.total_projects}</div>
        <div class="stat-sub">Distinct workdirs</div>
      </div>
    </div>`;

  const chartsHtml = `
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Activity Over Time</div>
        <canvas id="activityChart"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Top Projects</div>
        <canvas id="projectChart"></canvas>
      </div>
    </div>`;

  const sessionRows =
    recentSessions.length === 0
      ? `<div class="empty-state">No sessions recorded yet.</div>`
      : recentSessions
          .map((s) => {
            const preview = firstUserMessage(s.messages ?? "");
            return `<tr>
              <td>
                <a href="/sessions/${esc(s.id)}" style="font-weight:500">${esc(projectName(s.workdir))}</a>
                ${preview ? `<div class="text-muted" style="font-size:12px;margin-top:2px">${esc(preview)}</div>` : ""}
              </td>
              <td><span class="badge badge-purple">${esc(shortModel(s.model))}</span></td>
              <td class="text-green">+${s.total_additions ?? 0}</td>
              <td class="text-muted">${acceptanceRate(s.accepted_lines ?? 0, s.total_additions ?? 0)}</td>
              <td class="text-muted">${formatDate(s.created_at)}</td>
            </tr>`;
          })
          .join("");

  const sessionsHtml = `
    <div class="section-header">
      <div class="section-title">Recent Sessions</div>
      <a href="/sessions" class="section-link">View all →</a>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project / Prompt</th>
            <th>Model</th>
            <th>Lines</th>
            <th>Accepted</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>${sessionRows}</tbody>
      </table>
    </div>`;

  const activityData = JSON.stringify({
    labels: activityByDay.map((d) => d.date),
    sessions: activityByDay.map((d) => d.sessions),
    lines: activityByDay.map((d) => d.lines),
  });

  const projectData = JSON.stringify({
    labels: projectStats.map((p) => projectName(p.project)),
    sessions: projectStats.map((p) => p.sessions),
    lines: projectStats.map((p) => p.ai_lines),
  });

  const scripts = `
${CHART_JS}
<script>
(function() {
  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { labels: { color: '#7d8590', font: { size: 11 } } } },
  };
  Chart.defaults.color = '#7d8590';
  Chart.defaults.borderColor = '#30363d';

  const activity = ${activityData};
  new Chart(document.getElementById('activityChart'), {
    type: 'line',
    data: {
      labels: activity.labels,
      datasets: [
        {
          label: 'Sessions',
          data: activity.sessions,
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.1)',
          tension: 0.3,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'AI Lines',
          data: activity.lines,
          borderColor: '#bc8cff',
          backgroundColor: 'rgba(188,140,255,0.1)',
          tension: 0.3,
          fill: true,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...chartDefaults,
      scales: {
        x: { grid: { color: '#21262d' }, ticks: { color: '#7d8590' } },
        y: { position: 'left', grid: { color: '#21262d' }, ticks: { color: '#58a6ff' } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#bc8cff' } },
      },
    },
  });

  const proj = ${projectData};
  new Chart(document.getElementById('projectChart'), {
    type: 'bar',
    data: {
      labels: proj.labels,
      datasets: [{
        label: 'Sessions',
        data: proj.sessions,
        backgroundColor: 'rgba(88,166,255,0.6)',
        borderColor: '#58a6ff',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      scales: {
        x: { grid: { color: '#21262d' }, ticks: { color: '#7d8590' } },
        y: { grid: { color: '#21262d' }, ticks: { color: '#7d8590' } },
      },
    },
  });
})();
</script>`;

  return layout(
    "Overview",
    "overview",
    `<div class="page-title">Overview</div>${statsHtml}${chartsHtml}${sessionsHtml}`,
    scripts
  );
}

export function sessionsView(
  sessions: Session[],
  total: number,
  page: number,
  pageSize: number
): string {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const rows =
    sessions.length === 0
      ? `<tr><td colspan="7"><div class="empty-state">No sessions yet.</div></td></tr>`
      : sessions
          .map((s) => {
            const preview = firstUserMessage(s.messages ?? "");
            const rate = acceptanceRate(s.accepted_lines ?? 0, s.total_additions ?? 0);
            return `<tr>
              <td>
                <a href="/sessions/${esc(s.id)}">${esc(projectName(s.workdir))}</a>
                ${preview ? `<div class="text-muted" style="font-size:12px;margin-top:2px">${esc(preview)}</div>` : ""}
              </td>
              <td><span class="badge badge-blue">${esc(s.tool)}</span></td>
              <td><span class="badge badge-purple">${esc(shortModel(s.model))}</span></td>
              <td class="text-green">+${s.total_additions ?? 0}</td>
              <td class="text-red">-${s.total_deletions ?? 0}</td>
              <td class="${parseFloat(rate) >= 80 ? "text-green" : "text-muted"}">${rate}</td>
              <td class="text-muted">${formatDate(s.created_at)}</td>
            </tr>`;
          })
          .join("");

  const pagination = `
    <div class="pagination">
      <span>Showing ${start}–${end} of ${total} sessions</span>
      <div class="pagination-btns">
        <a href="/sessions?page=${page - 1}" class="btn ${page <= 1 ? "disabled" : ""}">← Prev</a>
        <a href="/sessions?page=${page + 1}" class="btn ${page >= totalPages ? "disabled" : ""}">Next →</a>
      </div>
    </div>`;

  const content = `
    <div class="page-title">Sessions</div>
    <div class="table-wrap">
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
        <tbody>${rows}</tbody>
      </table>
      ${total > 0 ? pagination : ""}
    </div>`;

  return layout("Sessions", "sessions", content);
}

export function sessionDetailView(session: SessionDetail): string {
  let messages: Array<{
    type: string;
    text?: string;
    name?: string;
    input?: unknown;
    timestamp?: string;
  }> = [];

  try {
    const parsed = JSON.parse(session.messages);
    messages = Array.isArray(parsed) ? parsed : parsed.messages ?? [];
  } catch {
    // leave empty
  }

  const rate = acceptanceRate(session.accepted_lines ?? 0, session.total_additions ?? 0);

  const infoHtml = `
    <div class="detail-grid">
      <div class="detail-card">
        <h3>Session Info</h3>
        <div class="detail-row"><span class="detail-key">Project</span><span class="detail-val">${esc(projectName(session.workdir))}</span></div>
        <div class="detail-row"><span class="detail-key">Workdir</span><span class="detail-val mono">${esc(session.workdir ?? "—")}</span></div>
        <div class="detail-row"><span class="detail-key">Tool</span><span class="detail-val"><span class="badge badge-blue">${esc(session.tool)}</span></span></div>
        <div class="detail-row"><span class="detail-key">Model</span><span class="detail-val"><span class="badge badge-purple">${esc(session.model)}</span></span></div>
        <div class="detail-row"><span class="detail-key">Author</span><span class="detail-val">${esc(session.human_author ?? "—")}</span></div>
        <div class="detail-row"><span class="detail-key">Created</span><span class="detail-val">${formatDate(session.created_at)}</span></div>
        <div class="detail-row"><span class="detail-key">Commit</span><span class="detail-val mono">${session.commit_sha ? esc(session.commit_sha.slice(0, 12)) : "—"}</span></div>
      </div>
      <div class="detail-card">
        <h3>Attribution Stats</h3>
        <div class="detail-row"><span class="detail-key">Lines Written</span><span class="detail-val text-green">+${session.total_additions ?? 0}</span></div>
        <div class="detail-row"><span class="detail-key">Lines Removed</span><span class="detail-val text-red">-${session.total_deletions ?? 0}</span></div>
        <div class="detail-row"><span class="detail-key">Lines Accepted</span><span class="detail-val">${session.accepted_lines ?? 0}</span></div>
        <div class="detail-row"><span class="detail-key">Lines Overridden</span><span class="detail-val">${session.overridden_lines ?? 0}</span></div>
        <div class="detail-row"><span class="detail-key">Acceptance Rate</span><span class="detail-val ${parseFloat(rate) >= 80 ? "text-green" : "text-muted"}">${rate}</span></div>
      </div>
    </div>`;

  const renderedMsgs = messages
    .map((m) => {
      if (m.type === "user") {
        return `<div class="msg">
          <div class="msg-icon msg-icon-user">U</div>
          <div class="msg-body">
            <div class="msg-role">You</div>
            <div class="msg-text">${esc(m.text ?? "")}</div>
            ${m.timestamp ? `<div class="msg-ts">${new Date(m.timestamp).toLocaleTimeString()}</div>` : ""}
          </div>
        </div>`;
      }
      if (m.type === "assistant") {
        return `<div class="msg">
          <div class="msg-icon msg-icon-ai">AI</div>
          <div class="msg-body">
            <div class="msg-role">${esc(shortModel(session.model))}</div>
            <div class="msg-text">${esc(m.text ?? "")}</div>
            ${m.timestamp ? `<div class="msg-ts">${new Date(m.timestamp).toLocaleTimeString()}</div>` : ""}
          </div>
        </div>`;
      }
      if (m.type === "tool_use") {
        return `<div class="msg">
          <div class="msg-icon msg-icon-tool">⚙</div>
          <div class="msg-body">
            <div class="msg-role">Tool</div>
            <div class="msg-tool">${esc(m.name ?? "unknown")}</div>
          </div>
        </div>`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const messagesHtml =
    messages.length > 0
      ? `<div class="messages-section">
          <div class="messages-header">Conversation · ${messages.length} messages</div>
          <div class="message-list">${renderedMsgs}</div>
        </div>`
      : "";

  const content = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <a href="/sessions" class="text-muted" style="font-size:13px">← Sessions</a>
      <div class="page-title" style="margin:0">${esc(projectName(session.workdir))}</div>
    </div>
    ${infoHtml}
    ${messagesHtml}`;

  return layout(`Session · ${projectName(session.workdir)}`, "sessions", content);
}

export function notFoundView(): string {
  return layout(
    "Not Found",
    "",
    `<div class="empty-state" style="padding:80px">
      <div style="font-size:48px;margin-bottom:16px">404</div>
      <div>Page not found. <a href="/">Go home</a></div>
    </div>`
  );
}

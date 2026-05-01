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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  :root {
    /* Dark Mode (The Observatory) - Default */
    --background: #050505;
    --surface: #0A0A0A;
    --surface-dim: #121212;
    --surface-container: #1A1A1A;
    --on-surface: #F2F2F2;
    --on-surface-variant: #A1A1AA;
    --outline: #27272A;
    --primary: #3B82F6;
    --secondary: #94A3B8;
    --tertiary: #22C55E;
    --error: #F87171;
    --radius: 4px;
    --font-headline: 'Space Grotesk', sans-serif;
    --font-body: 'Inter', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
  }

  @media (prefers-color-scheme: light) {
    :root {
      /* Light Mode (The Laboratory) */
      --background: #FFFFFF;
      --surface: #FFFFFF;
      --surface-dim: #F5F5F5;
      --surface-container: #FAFAFA;
      --on-surface: #1A1A1A;
      --on-surface-variant: #666666;
      --outline: #E0E0E0;
      --primary: #0052FF;
      --secondary: #6B7280;
      --tertiary: #10B981;
      --error: #EF4444;
    }
  }

  body {
    background: var(--background);
    color: var(--on-surface);
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  a { color: var(--primary); text-decoration: none; transition: opacity 0.2s; }
  a:hover { opacity: 0.8; text-decoration: none; }

  .header {
    border-bottom: 1px solid var(--outline);
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 32px;
    height: 56px;
    position: sticky;
    top: 0;
    background: var(--background);
    z-index: 10;
  }
  .header-brand {
    font-family: var(--font-headline);
    font-weight: 500;
    font-size: 16px;
    letter-spacing: -0.02em;
    color: var(--on-surface);
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
  }
  .header-brand span { color: var(--primary); }
  
  .nav { display: flex; gap: 8px; }
  .nav a {
    padding: 4px 8px;
    color: var(--on-surface-variant);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-headline);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .nav a:hover { color: var(--on-surface); }
  .nav a.active { color: var(--on-surface); border-bottom: 1.5px solid var(--primary); }

  .container { max-width: 1200px; margin: 0 auto; padding: 40px 24px; }

  .page-title {
    font-family: var(--font-headline);
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.02em;
    margin-bottom: 32px;
    color: var(--on-surface);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 40px;
  }
  .stat-card {
    background: var(--surface-container);
    border: 1px solid var(--outline);
    border-radius: var(--radius);
    padding: 24px;
  }
  .stat-label {
    font-size: 11px;
    color: var(--on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 12px;
    font-family: var(--font-headline);
  }
  .stat-value {
    font-size: 32px;
    font-weight: 500;
    color: var(--on-surface);
    line-height: 1;
    font-family: var(--font-headline);
    letter-spacing: -0.02em;
  }
  .stat-sub {
    font-size: 12px;
    color: var(--on-surface-variant);
    margin-top: 8px;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
    margin-bottom: 40px;
  }
  @media (max-width: 768px) { .charts-grid { grid-template-columns: 1fr; } }
  .chart-card {
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--radius);
    padding: 24px;
  }
  .chart-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 24px;
    font-family: var(--font-headline);
  }
  canvas { max-height: 240px; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .section-title {
    font-family: var(--font-headline);
    font-size: 16px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .section-link { font-size: 12px; color: var(--primary); font-weight: 500; }

  .table-wrap {
    border: 1px solid var(--outline);
    border-radius: var(--radius);
    overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    padding: 12px 16px;
    text-align: left;
    font-size: 11px;
    color: var(--on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    border-bottom: 1px solid var(--outline);
    background: var(--surface-dim);
    font-family: var(--font-headline);
  }
  tbody td {
    padding: 14px 16px;
    border-bottom: 1px solid var(--outline);
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--surface-dim); }
  
  .empty-state {
    padding: 64px;
    text-align: center;
    color: var(--on-surface-variant);
    font-size: 14px;
    border: 1px solid var(--outline);
    border-radius: var(--radius);
  }

  .status-dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    margin-right: 8px;
    vertical-align: middle;
  }
  .status-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--on-surface-variant);
  }

  .mono { font-family: var(--font-mono); font-size: 13px; color: var(--on-surface-variant); }
  .text-muted { color: var(--on-surface-variant); }
  .text-primary { color: var(--primary); }
  .text-tertiary { color: var(--tertiary); }
  .text-error { color: var(--error); }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-top: 1px solid var(--outline);
    font-size: 13px;
    color: var(--on-surface-variant);
    background: var(--surface-dim);
  }
  .pagination-btns { display: flex; gap: 8px; }
  
  .btn {
    padding: 8px 16px;
    border-radius: var(--radius);
    border: 1px solid var(--outline);
    background: transparent;
    color: var(--on-surface);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    display: inline-block;
    transition: opacity 0.2s;
    font-family: var(--font-headline);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .btn:hover { opacity: 0.7; }
  .btn-primary {
    background: var(--on-surface);
    color: var(--background);
    border-color: var(--on-surface);
  }
  .btn:disabled, .btn.disabled { opacity: 0.2; pointer-events: none; }

  /* Session detail */
  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 32px;
  }
  @media (max-width: 768px) { .detail-grid { grid-template-columns: 1fr; } }
  .detail-card {
    background: var(--surface-container);
    border: 1px solid var(--outline);
    border-radius: var(--radius);
    padding: 24px;
  }
  .detail-card h3 {
    font-size: 11px;
    color: var(--on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 20px;
    font-family: var(--font-headline);
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--outline);
    font-size: 13px;
  }
  .detail-row:last-child { border-bottom: none; }
  .detail-key { color: var(--on-surface-variant); }
  .detail-val { font-weight: 500; text-align: right; word-break: break-all; max-width: 60%; }

  .messages-section {
    border: 1px solid var(--outline);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .messages-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--outline);
    font-size: 11px;
    color: var(--on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    background: var(--surface-dim);
    font-family: var(--font-headline);
  }
  .message-list { padding: 24px; display: flex; flex-direction: column; gap: 24px; }
  .msg {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .msg-icon {
    width: 32px;
    height: 32px;
    border-radius: 0;
    border: 1px solid var(--outline);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 500;
    flex-shrink: 0;
    font-family: var(--font-headline);
    background: var(--surface-dim);
  }
  .msg-body { flex: 1; min-width: 0; }
  .msg-role {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
    color: var(--on-surface-variant);
    font-family: var(--font-headline);
  }
  .msg-text {
    font-size: 14px;
    color: var(--on-surface);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg-tool {
    background: var(--surface-dim);
    border: 1px solid var(--outline);
    border-radius: 0;
    padding: 12px;
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--on-surface-variant);
  }
  .msg-ts { font-size: 11px; color: var(--on-surface-variant); margin-top: 8px; }
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
              <td><span class="mono" style="font-size:11px">${esc(shortModel(s.model))}</span></td>
              <td class="text-tertiary">+${s.total_additions ?? 0}</td>
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
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const colors = {
    primary: isDark ? '#3B82F6' : '#0052FF',
    text: isDark ? '#A1A1AA' : '#666666',
    border: isDark ? '#27272A' : '#E0E0E0',
    grid: isDark ? '#1A1A1A' : '#FAFAFA'
  };

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { 
      legend: { 
        display: false
      },
      tooltip: {
        backgroundColor: isDark ? '#0A0A0A' : '#FFFFFF',
        titleColor: isDark ? '#F2F2F2' : '#1A1A1A',
        bodyColor: isDark ? '#A1A1AA' : '#666666',
        borderColor: colors.border,
        borderWidth: 1,
        cornerRadius: 0,
        titleFont: { family: 'Space Grotesk', size: 12, weight: 500 },
        bodyFont: { family: 'Inter', size: 12 }
      }
    },
  };
  Chart.defaults.color = colors.text;
  Chart.defaults.borderColor = colors.border;
  Chart.defaults.font.family = 'Inter';

  const activity = ${activityData};
  new Chart(document.getElementById('activityChart'), {
    type: 'line',
    data: {
      labels: activity.labels,
      datasets: [
        {
          label: 'Sessions',
          data: activity.sessions,
          borderColor: colors.primary,
          borderWidth: 1.5,
          tension: 0,
          pointRadius: 0,
          yAxisID: 'y',
        },
        {
          label: 'AI Lines',
          data: activity.lines,
          borderColor: isDark ? '#22C55E' : '#10B981',
          borderWidth: 1.5,
          tension: 0,
          pointRadius: 0,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...chartDefaults,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { position: 'left', grid: { color: colors.grid }, ticks: { font: { size: 10 } } },
        y1: { position: 'right', grid: { display: false }, ticks: { font: { size: 10 } } },
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
        backgroundColor: colors.primary,
        barThickness: 12,
      }],
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      scales: {
        x: { grid: { color: colors.grid }, ticks: { font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } },
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
                <a href="/sessions/${esc(s.id)}" style="font-weight:500">${esc(projectName(s.workdir))}</a>
                ${preview ? `<div class="text-muted" style="font-size:12px;margin-top:2px">${esc(preview)}</div>` : ""}
              </td>
              <td><span class="mono" style="font-size:11px">${esc(s.tool)}</span></td>
              <td><span class="mono" style="font-size:11px">${esc(shortModel(s.model))}</span></td>
              <td class="text-tertiary">+${s.total_additions ?? 0}</td>
              <td class="text-error">-${s.total_deletions ?? 0}</td>
              <td>
                <span class="status-dot" style="background:${parseFloat(rate) >= 80 ? "var(--tertiary)" : "var(--secondary)"}"></span>
                <span class="status-label">${rate}</span>
              </td>
              <td class="text-muted">${formatDate(s.created_at)}</td>
            </tr>`;
          })
          .join("");

  const pagination = `
    <div class="pagination">
      <span>Showing ${start}–${end} of ${total} sessions</span>
      <div class="pagination-btns">
        <a href="/sessions?page=${page - 1}" class="btn ${page <= 1 ? "disabled" : ""}">Prev</a>
        <a href="/sessions?page=${page + 1}" class="btn ${page >= totalPages ? "disabled" : ""}">Next</a>
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
        <div class="detail-row"><span class="detail-key">Tool</span><span class="detail-val mono">${esc(session.tool)}</span></div>
        <div class="detail-row"><span class="detail-key">Model</span><span class="detail-val mono">${esc(session.model)}</span></div>
        <div class="detail-row"><span class="detail-key">Author</span><span class="detail-val">${esc(session.human_author ?? "—")}</span></div>
        <div class="detail-row"><span class="detail-key">Created</span><span class="detail-val">${formatDate(session.created_at)}</span></div>
        <div class="detail-row"><span class="detail-key">Commit</span><span class="detail-val mono">${session.commit_sha ? esc(session.commit_sha.slice(0, 12)) : "—"}</span></div>
      </div>
      <div class="detail-card">
        <h3>Attribution Stats</h3>
        <div class="detail-row"><span class="detail-key">Lines Written</span><span class="detail-val text-tertiary">+${session.total_additions ?? 0}</span></div>
        <div class="detail-row"><span class="detail-key">Lines Removed</span><span class="detail-val text-error">-${session.total_deletions ?? 0}</span></div>
        <div class="detail-row"><span class="detail-key">Lines Accepted</span><span class="detail-val">${session.accepted_lines ?? 0}</span></div>
        <div class="detail-row"><span class="detail-key">Lines Overridden</span><span class="detail-val">${session.overridden_lines ?? 0}</span></div>
        <div class="detail-row">
          <span class="detail-key">Acceptance Rate</span>
          <span class="detail-val">
            <span class="status-dot" style="background:${parseFloat(rate) >= 80 ? "var(--tertiary)" : "var(--secondary)"}"></span>
            <span class="status-label">${rate}</span>
          </span>
        </div>
      </div>
    </div>`;

  const renderedMsgs = messages
    .map((m) => {
      if (m.type === "user") {
        return `<div class="msg">
          <div class="msg-icon">U</div>
          <div class="msg-body">
            <div class="msg-role">User</div>
            <div class="msg-text">${esc(m.text ?? "")}</div>
            ${m.timestamp ? `<div class="msg-ts">${new Date(m.timestamp).toLocaleTimeString()}</div>` : ""}
          </div>
        </div>`;
      }
      if (m.type === "assistant") {
        return `<div class="msg">
          <div class="msg-icon">AI</div>
          <div class="msg-body">
            <div class="msg-role">${esc(shortModel(session.model))}</div>
            <div class="msg-text">${esc(m.text ?? "")}</div>
            ${m.timestamp ? `<div class="msg-ts">${new Date(m.timestamp).toLocaleTimeString()}</div>` : ""}
          </div>
        </div>`;
      }
      if (m.type === "tool_use") {
        return `<div class="msg">
          <div class="msg-icon">⚙</div>
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
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px">
      <a href="/sessions" class="text-muted" style="font-size:12px">← ALL SESSIONS</a>
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

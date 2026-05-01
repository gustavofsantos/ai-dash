import React, { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import { 
  projectName, 
  shortModel, 
  formatDate, 
  acceptanceRate, 
  firstUserMessage 
} from "../utils.ts";

declare const Chart: any;

const Dashboard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      return res.json();
    },
  });

  const activityChartRef = useRef<HTMLCanvasElement>(null);
  const projectChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<{ activity?: any; project?: any }>({});

  useEffect(() => {
    if (!data || !activityChartRef.current || !projectChartRef.current) return;

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const colors = {
      primary: isDark ? "#3B82F6" : "#0052FF",
      text: isDark ? "#A1A1AA" : "#666666",
      border: isDark ? "#27272A" : "#E0E0E0",
      grid: isDark ? "#1A1A1A" : "#FAFAFA",
    };

    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "#0A0A0A" : "#FFFFFF",
          titleColor: isDark ? "#F2F2F2" : "#1A1A1A",
          bodyColor: isDark ? "#A1A1AA" : "#666666",
          borderColor: colors.border,
          borderWidth: 1,
          cornerRadius: 0,
          titleFont: { family: "Space Grotesk", size: 12, weight: 500 },
          bodyFont: { family: "Inter", size: 12 },
        },
      },
    };

    if (chartInstances.current.activity) chartInstances.current.activity.destroy();
    if (chartInstances.current.project) chartInstances.current.project.destroy();

    chartInstances.current.activity = new Chart(activityChartRef.current, {
      type: "line",
      data: {
        labels: data.activity.map((d: any) => d.date),
        datasets: [
          {
            label: "Sessions",
            data: data.activity.map((d: any) => d.sessions),
            borderColor: colors.primary,
            borderWidth: 1.5,
            tension: 0,
            pointRadius: 0,
            yAxisID: "y",
          },
          {
            label: "AI Lines",
            data: data.activity.map((d: any) => d.lines),
            borderColor: isDark ? "#22C55E" : "#10B981",
            borderWidth: 1.5,
            tension: 0,
            pointRadius: 0,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: colors.text } },
          y: { position: "left", grid: { color: colors.grid }, ticks: { font: { size: 10 }, color: colors.text } },
          y1: { position: "right", grid: { display: false }, ticks: { font: { size: 10 }, color: colors.text } },
        },
      },
    });

    chartInstances.current.project = new Chart(projectChartRef.current, {
      type: "bar",
      data: {
        labels: data.projects.map((p: any) => projectName(p.project)),
        datasets: [
          {
            label: "Sessions",
            data: data.projects.map((p: any) => p.sessions),
            backgroundColor: colors.primary,
            barThickness: 12,
          },
        ],
      },
      options: {
        ...chartDefaults,
        indexAxis: "y",
        scales: {
          x: { grid: { color: colors.grid }, ticks: { font: { size: 10 }, color: colors.text } },
          y: { grid: { display: false }, ticks: { font: { size: 10 }, color: colors.text } },
        },
      },
    });

    return () => {
      if (chartInstances.current.activity) chartInstances.current.activity.destroy();
      if (chartInstances.current.project) chartInstances.current.project.destroy();
    };
  }, [data]);

  if (isLoading) return <div>Loading dashboard...</div>;
  if (!data) return <div>Error loading dashboard</div>;

  const acceptRate =
    data.stats.total_ai_lines > 0
      ? `${Math.round((data.stats.total_accepted / data.stats.total_ai_lines) * 100)}%`
      : "—";

  return (
    <>
      <div className="page-title">Overview</div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Sessions</div>
          <div className="stat-value">{data.stats.total_sessions}</div>
          <div className="stat-sub">AI coding sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">AI Lines Written</div>
          <div className="stat-value">{data.stats.total_ai_lines.toLocaleString()}</div>
          <div className="stat-sub">{data.stats.total_accepted.toLocaleString()} accepted</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Acceptance Rate</div>
          <div className="stat-value">{acceptRate}</div>
          <div className="stat-sub">Lines kept vs written</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Projects</div>
          <div className="stat-value">{data.stats.total_projects}</div>
          <div className="stat-sub">Distinct workdirs</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">Activity Over Time</div>
          <canvas ref={activityChartRef}></canvas>
        </div>
        <div className="chart-card">
          <div className="chart-title">Top Projects</div>
          <canvas ref={projectChartRef}></canvas>
        </div>
      </div>

      <div className="section-header">
        <div className="section-title">Recent Sessions</div>
        <Link to="/sessions" className="section-link">View all →</Link>
      </div>

      <div className="session-list">
        {data.recent.length === 0 ? (
          <div className="empty-state">No sessions recorded yet.</div>
        ) : (
          data.recent.map((s: any) => {
            const preview = firstUserMessage(s.messages ?? "");
            const isGemini = s.model?.toLowerCase().includes("gemini");
            const isClaude = s.model?.toLowerCase().includes("claude");
            
            return (
              <Link key={s.id} to={`/sessions/${s.id}`} className="session-item">
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
                  <span>{formatDate(s.created_at)}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
};

export default Dashboard;

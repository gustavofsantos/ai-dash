import React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  History, 
  GitBranch, 
  Settings, 
  ChevronRight,
  Database,
  Terminal,
  Zap
} from "lucide-react";

const Layout: React.FC = () => {
  const location = useLocation();
  const pathParts = location.pathname.split("/").filter(Boolean);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div style={{ width: 24, height: 24, background: "var(--on-surface)", borderRadius: 4 }}></div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>git-ai-dash</span>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-section">
            <nav className="sidebar-nav">
              <NavLink to="/" end className="sidebar-nav-item">
                <LayoutDashboard size={18} />
                Overview
              </NavLink>
              <NavLink to="/repositories" className="sidebar-nav-item">
                <Database size={18} />
                Repositories
              </NavLink>
              <NavLink to="/sessions" className="sidebar-nav-item">
                <History size={18} />
                Sessions
              </NavLink>
            </nav>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <header className="header">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--on-surface-variant)" }}>
            {pathParts.length > 0 && (
              <>
                <ChevronRight size={14} />
                <span style={{ color: "var(--on-surface)", textTransform: "capitalize" }}>
                  {pathParts[pathParts.length - 1]}
                </span>
              </>
            )}
          </div>
        </header>
        <main className="container">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

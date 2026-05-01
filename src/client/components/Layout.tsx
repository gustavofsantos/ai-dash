import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

const Layout: React.FC = () => {
  return (
    <>
      <header className="header">
        <Link to="/" className="header-brand">
          Git AI <span>Dashboard</span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/sessions" className={({ isActive }) => (isActive ? "active" : "")}>
            Sessions
          </NavLink>
        </nav>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
};

export default Layout;

import React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";

export default function AdminLayout() {
  const qc = useQueryClient();
  const userQuery = useQuery(['user'], () => qc.getQueryData(['user']), { initialData: qc.getQueryData(['user']), enabled: false });
  const user = userQuery.data || JSON.parse(localStorage.getItem("user") || "null");

  const location = useLocation();

  return (
    <div className="d-flex min-vh-100">
      <aside className="d-flex flex-column flex-shrink-0 p-3 bg-white border-end" style={{ width: 250 }}>
        <div className="d-flex align-items-center mb-4">
          <div
            className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-3"
            style={{ width: 40, height: 40 }}
          >
            {user ? (user.name ? user.name.charAt(0).toUpperCase() : "?") : "?"}
          </div>
          <div>
            <div className="fw-bold">{user?.name || "User"}</div>
            <div className="text-muted small">{user?.role || ""}</div>
          </div>
        </div>

        <nav className="nav nav-pills flex-column mb-auto">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center px-3 py-2 rounded mb-1 ${ (isActive || location.pathname === '/') ? 'bg-primary text-white' : 'text-dark'}`
            }
          >
            <i className="bi bi-speedometer2 me-2" />
            Dashboard
          </NavLink>

          <NavLink
            to="teamsection"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center px-3 py-2 rounded mb-1 ${isActive ? 'bg-primary text-white' : 'text-dark'}`
            }
          >
            <i className="bi bi-people me-2" />
            Team Section
          </NavLink>
        </nav>

        <div className="mt-auto small text-muted">© ShiftTracker</div>
      </aside>

      <main className="flex-grow-1 p-3 bg-light">
        <div className="container-fluid">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

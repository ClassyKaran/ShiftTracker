import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminLayout() {
  const qc = useQueryClient();
  const user =
    qc.getQueryData(["user"]) ||
    JSON.parse(localStorage.getItem("user") || "null");

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <aside style={{ width: 240 }} className="bg-light border-end p-3">
        
        <div className="d-flex align-items-center mb-4">
          <div
            className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-2"
            style={{ width: 34, height: 34 }}
          >
            {user ? (user.name ? user.name.charAt(0).toUpperCase() : "?") : "?"}
          </div>
          <div>
            <div className="fw-bold">{user?.name || "User"}</div>
            <div className="text-muted small">{user?.role || ""}</div>
          </div>
        </div>
        <nav className="nav flex-column">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
             Dashboard
            </NavLink>
            
            <NavLink
              to="teamsection"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
             TeamSection
            </NavLink>
        </nav>
      </aside>

      <main className="flex-grow-1 p-3">
        <Outlet />
      </main>
    </div>
  );
}

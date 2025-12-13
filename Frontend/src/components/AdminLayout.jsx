import React, { useEffect, useState } from "react";
import { Outlet, NavLink } from "react-router-dom";

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    try {
      setSidebarOpen(window.innerWidth >= 768);
    } catch (e) {
      void e;
    }
  }, []);
  return (
    <div
  className="d-flex"
  style={{
    background: "#ebecede4",
    height: "83vh",
    overflow: "hidden"
  }}
>

      {/* style={{ height: "87vh", overflow: "hidden" }} */}
      {/* Sidebar */}
      <aside
        className={`p-3 ${sidebarOpen ? 'd-block' : 'd-none'} d-md-block`}
        style={{
          width: "240px",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <nav className="nav nav-pills flex-column mb-auto">
          {/* Dashboard */}
          <NavLink
            to="/dashboard"
            end
            className={({ isActive }) =>
              `nav-link d-flex align-items-center py-2 mb-2  ${
                isActive
                  ? "active text-white bg-primary "
                  : "text-dark bg-white "
              }`
            }
          >
            <i className="bi bi-speedometer2 me-2"></i>
            Dashboard
          </NavLink>

          <NavLink
            to="/dashboard/teamsection"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center  py-2 mb-2  ${
                isActive ? "active text-white bg-primary" : "text-dark bg-white"
              }`
            }
          >
            <i className="bi bi-people me-2"></i>
            Team Section
          </NavLink>
         
         


          <NavLink
            to="/dashboard/exportcsv"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center  py-2 mb-2  ${
                isActive ? "active text-white bg-primary" : "text-dark bg-white"
              }`
            }
          >
            <i className="bi bi-files me-2"></i>
            Export 
          </NavLink>

          
         
        </nav>

        
       
      </aside>

      {/* Main Content */}
      <div className="d-md-none mb-2">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => setSidebarOpen((s) => !s)}
          aria-label="Toggle sidebar"
        >
          <i className="bi bi-list"></i>
        </button>
      </div>
      <main
        className="flex-grow-1 p-3"
        style={{
          height: "100%",
          overflowY: "auto",
          background: "#f8f9fa",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

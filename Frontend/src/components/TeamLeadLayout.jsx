
import { Outlet, NavLink } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="d-flex" style={{background:'#f7f9ffdc', height: "83vh", overflow: "hidden"}}>
      {/* style={{ height: "87vh", overflow: "hidden" }} */}
      {/* Sidebar */}
      <aside
        className=" p-3"
        style={{
          width: "240px",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <nav className="nav nav-pills flex-column mb-auto">
          {/* Dashboard */}
          <NavLink
            to="/teamlead"
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
              to="trackteam"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center  py-2 mb-2  ${
                isActive ? "active text-white bg-primary" : "text-dark bg-white"
              }`
            }
          >
            <i className="bi bi-people me-2"></i>
           Track Team
          </NavLink>
        </nav>

        <div className="mt-auto small text-white opacity-75">
          © ShiftTracker
        </div>
      </aside>

      {/* Main Content */}
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

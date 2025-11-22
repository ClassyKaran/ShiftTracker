import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import useAuth from "../hooks/useAuth";

export default function Header() {
  const qc = useQueryClient();
  const user = qc.getQueryData(["user"]);
  const { logout } = useAuth();

  const [open, setOpen] = useState(false);
  const menuRef = useRef();

  const avatar = user ? (user.name ? user.name.charAt(0).toUpperCase() : "?") : "?";

  // CLOSE MENU OUTSIDE CLICK
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light shadow-sm">
      <div className="container-fluid">

        <Link className="navbar-brand d-flex align-items-center" to="/">
          <img src="/kavyashift.png" width="40" className="me-2" />
          <span className="fw-bold">ShiftTracker</span>
        </Link>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#mainNavbar"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse justify-content-end" id="mainNavbar">
          <ul className="navbar-nav align-items-center">
            {user && (
              <li className="nav-item" ref={menuRef}>

                {/* USER CLICK BUTTON */}
                <button
                  className="btn d-flex align-items-center"
                  onClick={() => setOpen((p) => !p)}
                >
                  <div
                    className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-2"
                    style={{ width: 34, height: 34 }}
                  >
                    {avatar}
                  </div>
                  <span className="fw-semibold">{user.name}</span>
                </button>

                {/* CUSTOM POPUP MENU */}
                {open && (
                  <div
                    className="position-absolute bg-white shadow p-2 rounded"
                    style={{
                      right: 0,
                      marginTop: 3,
                      zIndex: 100,
                    }}
                  >
                    <button
                      className="btn btn-sm btn-danger "
                      onClick={logout}
                    >
                      Logout
                    </button>
                  </div>
                )}

              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

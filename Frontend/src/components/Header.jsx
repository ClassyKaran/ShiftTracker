import React from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import useAuth from "../hooks/useAuth";
export default function Header() {
  const qc = useQueryClient();
  const userQuery = useQuery(['user'], () => qc.getQueryData(['user']), { initialData: qc.getQueryData(['user']), enabled: false });
  const user = userQuery.data;
  const { logout } = useAuth();
  const avatar = user
    ? user.name
      ? user.name.charAt(0).toUpperCase()
      : "?"
    : "?";
  const target = user ? (user.role === 'admin' ? '/dashboard' : user.role === 'teamlead' ? '/teamlead' : '/employee') : '/login';

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light ">
      <div className="container-fluid">
        <Link className="navbar-brand d-flex align-items-center" to={target}>
          <img
            src="/kavyashift.png"
            alt="logo"
            width="40"
            className="me-2"
          />
          <span>KavyaShift</span>
        </Link>
        <div className="collapse navbar-collapse justify-content-end">
          
          <ul className="navbar-nav align-items-center">
          
            {user && (
              <li className="nav-item d-flex align-items-center">
               
                <div
                  className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-2"
                  style={{ width: 34, height: 34 }}
                >
                  {avatar}
                </div>
                <span className="me-3">{user.name}</span>{" "}
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={logout}
                >
                  Logout
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

import React, { useState } from "react";
import { toast } from "react-toastify";
import useAuth from "../hooks/useAuth";
import "./login.css";

export default function Login() {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");

  const { login } = useAuth();

  const submit = async (e) => {
    e.preventDefault();
    try {
      await login(employeeId, password);
      toast.success("Logged in");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="avatar-wrap">
          <div className="avatar-gradient">
            <img
              src="/kavyashift.png"
              alt="kavyashift"
              width="100"
              height="100"
            />
          </div>
        </div>

        <h1 className="login-title">Welcome Back</h1>
        <p className="login-sub">Sign in to track your shift</p>

        <form className="login-form" onSubmit={submit}>
          <div className="form-group">
            {/* <label className="sr">Employee ID or Email</label> */}
            <input
              className="input-field"
              placeholder="Employee ID "
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>

          <div className="form-group">
            {/* <label className="sr">Password</label> */}
            <input
              type="password"
              className="input-field"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary-gradient">
             <i className="bi bi-box-arrow-in-right" style={{ fontSize: "18px" }}></i>
            <span>Sign In</span>
          </button>
        </form>
      </div>
    </div>
  );
}

/* eslint-disable no-irregular-whitespace */
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
    <div className="container-fluid ">


  <div className=" row justify-content-center auth-layout">

    {/* LEFT SIDE */}
    <div className="left-section col-md-4">
      <h1 className="welcome-title">Welcome to</h1>
      <h1 className="brand-name">KavyaShift</h1>

      <button className="tracking-btn">
        <i className="bi bi-clock-history"></i> Real-Time Tracking System
      </button>

      <p className="dev-info">Developed by: Kavya Infoweb Pvt. Ltd.</p>
      <a className="support-link" href="#">
        Need Help? Contact Support
      </a>
    </div>

    {/* RIGHT SIDE */}
    <div className="col-md-4 right-login">
      <div className="login-card">
        <h1 className="login-title">Welcome to KavyaShift</h1>
        <p className="login-sub">Please login to start your shift</p>

        <form className="login-form" onSubmit={submit}>
          <div className="form-group input-wrap">
            <input
              className="input-field input-id"
              placeholder="Employee ID"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>

          <div className="form-group input-wrap">
            <input
              type="password"
              className="input-field input-pass"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary-gradient">
            <i className="bi bi-box-arrow-in-right"></i>
            <span>Sign In</span>
          </button>
        </form>
      </div>
    </div>

  </div>
</div>

  );
}

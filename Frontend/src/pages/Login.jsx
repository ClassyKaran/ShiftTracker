/* eslint-disable no-irregular-whitespace */ 
import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import useAuth from "../hooks/useAuth";
import "./login.css";

export default function Login() {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");

  // 👁️ password toggle state
  const [showPassword, setShowPassword] = useState(false);


  const { login, bootstrap } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      let user = qc.getQueryData(["user"]);
      const token = qc.getQueryData(["token"]) || localStorage.getItem("token");

      if (!user && token) {
        try {
          user = await bootstrap();
        } catch {
          user = null;
        }
      }

      if (mounted && user) {
        if (user.role === "admin") return navigate("/dashboard");
        if (user.role === "teamlead") return navigate("/teamlead");
        return navigate("/employee");
      }
    })();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="container-fluid">
      <div className="row justify-content-center auth-layout">

        {/* LEFT SIDE */}
        <div className="left-section col-md-4">
          <h1 className="welcome-title">Welcome to</h1>
          <h1 className="brand-name">KavyaShift</h1>

          <button className="tracking-btn">
            <i className="bi bi-clock-history"></i> Real-Time Tracking System
          </button>

        
        </div>

        {/* RIGHT SIDE */}
        <div className="col-md-4 right-login">
          <div className="login-card">
            <h1 className="login-title">Welcome to KavyaShift</h1>
            <p className="login-sub">Please login to start your shift</p>

            <form className="login-form" onSubmit={submit}>

              {/* EMPLOYEE ID */}
              <div className="form-group input-wrap">
                <input
                  className="input-field input-id"
                  placeholder="Employee ID"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
              </div>

              {/* PASSWORD + EYE ICON */}
              <div className="form-group input-wrap" style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-field input-pass"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                {/* Eye Icon Button */}
                <i
                  className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "65%",
                    transform: "translateY(-50%)",
                    cursor: "pointer",
                    fontSize: "18px"
                  }}
                ></i>
              </div>

              <button type="submit" className="btn-primary-gradient">
                <i className="bi bi-box-arrow-in-right"></i>
                <span>Log In</span>
              </button>

            </form>
          </div>
        </div>

          <p className=" mt-2 dev-info text-dark text-center">Developed by: Kavya Infoweb Pvt. Ltd.</p>
      </div>
    </div>
  );
}

import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket } from "../context/socket";
import useSession from "../hooks/useSession";
import Timer from "../components/Timer";
// import './employeeHome.css';
import createIdleTracker from "../utils/idle";
import { formatTime, durationSeconds } from "../utils/time";

export default function EmployeeHome() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");

  const { start, end } = useSession();
  const [session, setSession] = useState(null);
  const [deviceType, setDeviceType] = useState("Unknown");
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);

  const detectDevice = () => {
    const ua = navigator.userAgent || "";
    if (/mobile/i.test(ua)) return "Mobile";
    if (/tablet/i.test(ua)) return "Tablet";
    return "Desktop";
  };

  // Start shift (explicit by button)
  const handleStartShift = async () => {
    setLoading(true);
    try {
      const detected = detectDevice();
      setDeviceType(detected);
      const res = await start(token, { device: detected });
      setSession(res.session);

      // connect socket and idle tracker
      try {
        const socket = connectSocket(token);
        socketRef.current = socket;
        const idle = createIdleTracker(socket, {
          idleMs: 5 * 60 * 1000,
          heartbeatMs: 30 * 1000,
        });
        idle.start();
        window.__idleTracker = idle;
      } catch (e) {
        console.warn("socket init failed", e);
      }

      toast.success("Shift started");
    } catch (e) {
      console.error("start failed", e);
      toast.error("Could not start shift");
    } finally {
      setLoading(false);
    }
  };

  // End shift (explicit by button)
  const handleEndShift = async () => {
    setLoading(true);
    try {
      await end(token, session?._id);
      setSession(null);
      try {
        if (
          window.__idleTracker &&
          typeof window.__idleTracker.stop === "function"
        )
          window.__idleTracker.stop();
      } catch (e) {
        void e;
      }
      try {
        disconnectSocket();
      } catch (e) {
        void e;
      }
      toast.success("Shift ended");
    } catch (e) {
      console.error("end failed", e);
      toast.error("Could not end shift");
    } finally {
      setLoading(false);
    }
  };

  // Send beacon on unload if a session is active
  useEffect(() => {
    const handleUnload = () => {
      try {
        const s = qc.getQueryData(["activeSession"]) || session;
        if (s && s._id) {
          const payload = JSON.stringify({ sessionId: s._id, token });
          const url =
            (window.__REACT_APP_API__ ||
              import.meta.env.VITE_API_BASE_URL ||
              "http://localhost:5000") + "/api/session/end-beacon";
          if (navigator.sendBeacon) navigator.sendBeacon(url, payload);
          else {
            navigator.fetch &&
              navigator
                .fetch(url, {
                  method: "POST",
                  body: payload,
                  headers: { "Content-Type": "application/json" },
                  keepalive: true,
                })
                .catch(() => {});
          }
        }
      } catch (e) {
        void e;
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [session, qc, token]);

  // hydrate local session state from react-query cache or server on mount
  useEffect(() => {
    (async () => {
      try {
        const cached = qc.getQueryData(['activeSession']);
        if (cached) { setSession(cached); return; }
        // fetch active sessions and find this user's session
        const user = qc.getQueryData(['user']);
        if (!user) return;
        const api = await import('../api/sessionApi');
        const resp = await api.getActive(token).catch(() => null);
        if (resp && Array.isArray(resp.users)) {
          const mine = resp.users.find(u => String(u._id) === String(user.id || user._id));
          if (mine) setSession(mine);
        }
      } catch (e) { void e; }
    })();
    // run on mount
  }, [qc, token]);

  const handleLogout = async () => {
    try {
      if (session && session._id) await end(token, session._id);
      try {
        if (
          window.__idleTracker &&
          typeof window.__idleTracker.stop === "function"
        )
          window.__idleTracker.stop();
      } catch (e) {
        void e;
      }
      try {
        disconnectSocket();
      } catch (e) {
        void e;
      }
      window.location.href = "/login";
    } catch {
      toast.error("Error logging out");
    }
  };

  return (
    <div className="container p-2">
      <div className="row justify-content-center">
        <div className="col-12 col-md-12 col-lg-12">
          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <div className="d-flex align-items-center mb-3">
                <i className="bi bi-person-circle fs-2 text-primary me-3" />
                <div>
                  <h4 className="mb-0">Shift Tracker</h4>
                  <small className="text-muted">
                    Start/end your shift from here
                  </small>
                </div>
              </div>

              <div className="text-center mb-3">
                <button
                  className={`btn btn-lg ${
                    session ? "btn-danger" : "btn-success"
                  } w-100 d-flex align-items-center justify-content-center gap-2`}
                  onClick={session ? handleEndShift : handleStartShift}
                  disabled={loading}
                >
                  <i
                    className={`bi ${
                      session ? "bi-stop-circle" : "bi-play-circle-fill"
                    }`}
                  />
                  <span className="fs-5">
                    {session ? "End Shift" : "Start Shift"}
                  </span>
                </button>
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <div className="border rounded-3 p-2 text-center">
                    <div className="text-muted small">Device</div>
                    <div className="fw-bold">{deviceType}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="border rounded-3 p-2 text-center">
                    <div className="text-muted small">Location</div>
                    <div className="fw-bold">
                      {session?.locationName || session?.location || "-"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted small">Active Time</div>
                  <div className="fw-bold">
                    {session?.loginTime ? (
                      <Timer start={session.loginTime} />
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
                <div>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={handleLogout}
                  >
                    <i className="bi bi-box-arrow-right me-1" /> Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-12 col-lg-12">
          <div className="card">
            <div className="card-body">
              <h5 className="mb-3">
                <i className="bi bi-clock-history me-2 text-info" /> Shift
                History
              </h5>
              <HistoryTable session={session} token={token} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}







//===================== History Table====================






function HistoryTable({ session, token }) {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(5);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = { page: p, limit };
      if (from) params.from = new Date(from).toISOString();
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        params.to = d.toISOString();
      }
      const api = await import("../api/sessionApi");
      const res = await api.getLogs(token, params);
      setLogs(res.sessions || []);
      setPage(res.page || p);
      setTotal(res.total || 0);
    } catch (e) {
      console.error("fetchLogs", e);
    } finally {
      setLoading(false);
    }
  };

  // run once when session changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchLogs(1);
  }, [session]);

  const applyFilters = () => fetchLogs(1);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label">Start Date</label>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                type="date"
                className="form-control"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">End Date</label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                type="date"
                className="form-control"
              />
            </div>
            <div className="col-md-4">
              <button className="btn btn-primary w-100" onClick={applyFilters}>
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Login</th>
                  <th>Logout</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="text-center">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center">
                      No records
                    </td>
                  </tr>
                )}
                {!loading &&
                  logs.map((s) => (
                    <tr key={s.sessionId}>
                      <td>{new Date(s.loginTime).toLocaleDateString()}</td>
                      <td>{formatTime(s.loginTime)}</td>
                      <td>
                        {s.logoutTime ? formatTime(s.logoutTime) : "--:--:--"}
                      </td>
                      <td>
                        {s.totalDuration
                          ? new Date(s.totalDuration * 1000)
                              .toISOString()
                              .substr(11, 8)
                          : s.status === "online" && s.loginTime
                          ? new Date(durationSeconds(s.loginTime) * 1000)
                              .toISOString()
                              .substr(11, 8)
                          : "00:00:00"}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            s.status === "online"
                              ? "bg-success"
                              : s.status === "offline"
                              ? "bg-secondary"
                              : "bg-warning"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-footer d-flex justify-content-between align-items-center">
          <div>
            Showing page {page} of {totalPages} — {total} records
          </div>
          <div>
            <button
              className="btn btn-sm btn-outline-secondary me-2"
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
            >
              Prev
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => fetchLogs(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
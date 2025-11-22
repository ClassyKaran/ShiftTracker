import React, { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as sessionApi from "../api/sessionApi";
import * as teamleadApi from "../api/teamleadApi";
import { toast } from "react-toastify";
import useSession from "../hooks/useSession";
import Timer from "../components/Timer";
import { formatTime, durationSeconds } from "../utils/time";
import { connectSocket, disconnectSocket } from "../context/socket";
import createIdleTracker from "../utils/idle";

export default function TeamLeadDashboard() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");
  const [users, setUsers] = useState([]);
  const [tracked, setTracked] = useState(new Set());
  const [trackedDocs, setTrackedDocs] = useState([]);
  const [saving, setSaving] = useState(false);
  const { start, end } = useSession();
  const [session, setSession] = useState(null);
  const [deviceType, setDeviceType] = useState("Unknown");
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);

  // Device detection
  const detectDevice = () => {
    const ua = navigator.userAgent || "";
    if (/mobile/i.test(ua)) return "Mobile";
    if (/tablet/i.test(ua)) return "Tablet";
    return "Desktop";
  };

  // TeamLead: start shift explicitly from this page
  const handleStartShift = async () => {
    setLoading(true);
    try {
      const detected = detectDevice();
      setDeviceType(detected);
      const res = await start(token, { device: detected });
      setSession(res.session);
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
        void e;
      }
      toast.success("Shift started");
    } catch (e) {
      console.error(e);
      toast.error("Could not start shift");
    } finally {
      setLoading(false);
    }
  };

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
      console.error(e);
      toast.error("Could not end shift");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      let currentUser = qc.getQueryData(["user"]);
      if (!currentUser) {
        try {
          const meResp = await import("../api/authApi").then((m) =>
            m.me(token)
          );
          currentUser = meResp.user;
          qc.setQueryData(["user"], currentUser);
        } catch {
          // ignore
        }
      }
      try {
        const resp = await sessionApi.getActive(token);
        setUsers(resp.users || []);
      } catch (err) {
        console.error(err);
      }
    })();
    (async () => {
      try {
        const resp = await teamleadApi.getTracked(token);
        const ids = (resp.tracked || []).map((t) => String(t._id || t.id));
        setTracked(new Set(ids));
        setTrackedDocs(resp.tracked || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [qc, token]);

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
                <button
                  className="btn btn-primary w-100"
                  onClick={applyFilters}
                >
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

  const toggle = (id) => {
    setTracked((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const ids = Array.from(tracked);
      await teamleadApi.setTracked(token, ids);
      // refresh persisted tracked list from server to confirm save
      try {
        const refreshed = await teamleadApi.getTracked(token);
        const idsRef = (refreshed.tracked || []).map((t) =>
          String(t._id || t.id)
        );
        setTracked(new Set(idsRef));
        setTrackedDocs(refreshed.tracked || []);
      } catch (e) {
        console.warn("Failed to refresh tracked after save", e);
      }
      toast.success("Tracked users updated");
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e.message ||
        "Failed to update tracked users";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3>TeamLead Dashboard</h3>
      <p className="text-muted">Select employees to track and click Save.</p>
      {/* TeamLead personal shift control (exact EmployeeHome UI) */}
      <div className="container py-4">
        <div className="row justify-content-center">
          <div className="col-12 col-md-6 col-lg-6  ">
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
                      onClick={async () => {
                        try {
                          if (session && session._id)
                            await end(token, session._id);
                          disconnectSocket();
                          window.location.href = "/login";
                        } catch (e) {
                          void e;
                          toast.error("Logout failed");
                        }
                      }}
                    >
                      <i className="bi bi-box-arrow-right me-1" /> Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-lg-6">
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

      <div className="card mb-3">
        <div className="card-body">
          <div className="row">
            <div className="col-md-8">
              <div
                className="table-responsive"
                style={{ maxHeight: 360, overflowY: "auto", overflowX: "auto" }}
              >
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Employee ID</th>
                      <th>Device</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u._id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={tracked.has(String(u._id))}
                            onChange={() => toggle(String(u._id))}
                          />
                        </td>
                        <td>{u.name}</td>
                        <td>{u.employeeId}</td>
                        <td>{u.device || u.ip || "-"}</td>
                        <td>{u.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col-md-4">
              <div className="mb-2">Tracked Users</div>
              <ul className="list-unstyled small">
                {Array.from(tracked).map((id) => {
                  const u =
                    users.find((x) => String(x._id) === id) ||
                    trackedDocs.find((x) => String(x._id || x.id) === id);
                  return (
                    <li key={id}>
                      {u
                        ? (u.name || id) + " (" + (u.employeeId || "") + ")"
                        : id}
                    </li>
                  );
                })}
              </ul>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Full details table for tracked users (merge active session data when available) */}
      <div className="card">
        <div className="card-body">
          <h5>Tracked Users — Details</h5>
          <div
            className="table-responsive"
            style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}
          >
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Device</th>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Login</th>
                  <th>Logout</th>
                  <th>Active Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(tracked).map((id) => {
                  const active = users.find((u) => String(u._id) === id);
                  const profile =
                    trackedDocs.find((t) => String(t._id || t.id) === id) || {};
                  const row = {
                    _id: id,
                    name: active?.name || profile.name || "-",
                    employeeId: active?.employeeId || profile.employeeId || "",
                    device: active?.device || active?.ip || "",
                    role: active?.role || profile.role || "employee",
                    location:
                      active?.locationName ||
                      active?.location ||
                      profile.location ||
                      "",
                    loginTime: active?.loginTime || null,
                    logoutTime: active?.logoutTime || null,
                    totalDuration:
                      typeof active?.totalDuration !== "undefined"
                        ? active.totalDuration
                        : null,
                    status: active?.status || "offline",
                  };

                  const formatDuration = (secs) => {
                    if (secs == null) return "-";
                    const s = Math.floor(secs);
                    return `${Math.floor(s / 3600)}h ${Math.floor(
                      (s % 3600) / 60
                    )}m ${s % 60}s`;
                  };

                  return (
                    <tr key={id}>
                      <td>
                        {row.name}{" "}
                        <div className="text-muted small">{row.employeeId}</div>
                      </td>
                      <td>{row.device || "-"}</td>
                      <td>{row.role}</td>
                      <td>{row.location || "-"}</td>
                      <td>
                        {row.loginTime
                          ? new Date(row.loginTime).toLocaleString()
                          : "-"}
                      </td>
                      <td>
                        {row.logoutTime
                          ? new Date(row.logoutTime).toLocaleString()
                          : "-"}
                      </td>
                      <td>
                        {row.totalDuration != null
                          ? formatDuration(row.totalDuration)
                          : row.status === "online" && row.loginTime
                          ? formatDuration(
                              (Date.now() - new Date(row.loginTime)) / 1000
                            )
                          : "-"}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            row.status === "online"
                              ? "bg-success"
                              : row.status === "disconnected"
                              ? "bg-warning"
                              : "bg-secondary"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

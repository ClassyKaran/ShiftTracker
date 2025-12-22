import React, { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as teamleadApi from "../api/teamleadApi";
import * as authApi from "../api/authApi";
import * as sessionApi from "../api/sessionApi";
import { connectSocket, disconnectSocket } from "../context/socket";
import { toast } from "react-toastify";
import Timer from "../components/Timer";

export default function TrackTeam() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");

  const [trackedDocs, setTrackedDocs] = useState([]); // tracked user profiles
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [_recent, set_Recent] = useState([]);
  const [alerts, setAlerts] = useState({ lateJoin: [], extendedShift: [] });
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupTitle, setPopupTitle] = useState("");
  const [popupRows, setPopupRows] = useState([]);
  const socketRef = useRef(null);

  const fetchTracked = async () => {
    if (!token) return;
    try {
      const resp = await teamleadApi.getTracked(token);
      const tracked = resp.tracked || [];
      // merge active session info so initial render has up-to-date statuses
      const merged = await mergeActiveInfo(tracked);
      setTrackedDocs(merged);
    } catch (e) {
      console.error("Failed to fetch tracked", e);
    }
  };

  const mergeActiveInfo = async (profiles) => {
    if (!token) return profiles;
    try {
      const active = await sessionApi.getActive(token);
      const activeMap = new Map(
        (active.users || []).map((u) => [String(u._id), u])
      );
      return profiles.map((p) => ({
        ...p,
        ...(activeMap.get(String(p._id)) || {}),
      }));
    } catch {
      return profiles;
    }
  };

  useEffect(() => {
    (async () => {
      await fetchTracked();
      try {
        const a = await sessionApi.getAlerts(token).catch(() => null);
        if (a) setAlerts(a);
      } catch (err) {
        void err;
      }
      try {
        const logs = await sessionApi
          .getLogs(token)
          .catch(() => ({ sessions: [] }));
        set_Recent(logs.sessions || []);
      } catch (e) {
        console.error(e);
      }

      // connect socket for realtime updates
      try {
        const socket = connectSocket(token);
        socketRef.current = socket;
        socket.on("users_list_update", async (data) => {
          try {
            const users = data?.users || [];
            const userMap = new Map((users || []).map((u) => [String(u._id), u]));
            // also map by 'id' if present (some tracked entries use 'id' key)
            users.forEach(u => { if (u.id) userMap.set(String(u.id), u); });

            // If we have an existing trackedDocs list in state, update it in-place for immediate UX
            setTrackedDocs((prevTracked) => {
              if (!prevTracked || prevTracked.length === 0) {
                // no prior data - fetch tracked list from server and apply payload
                (async () => {
                  try {
                    const trackedResp = await teamleadApi.getTracked(token).catch(() => ({ tracked: [] }));
                    const tracked = trackedResp.tracked || [];
                    const merged = tracked.map((p) => {
                      const key = String(p._id || p.id || "");
                      const upd = userMap.get(key);
                      if (upd) return { ...p, ...upd };
                      return { ...p, status: p.status || "offline", lastActivity: p.lastActivity || null, isIdle: !!p.isIdle };
                    });
                    setTrackedDocs(merged);
                    try { console.info('users_list_update: fetched+merged tracked', merged.length, 'from payload users', users.length); } catch(e){ void e; }
                  } catch (e) {
                    console.error('users_list_update fetch merge failed', e);
                  }
                })();
                return prevTracked;
              }

              // update existing tracked entries using server payload where available
              const updated = prevTracked.map((p) => {
                const key = String(p._id || p.id || "");
                const upd = userMap.get(key);
                if (upd) return { ...p, ...upd };
                // if server payload doesn't include this user, and previously it was online/disconnected,
                // mark as offline to ensure counts reflect latest state after refresh
                if (p.status === 'online' || p.status === 'disconnected') {
                  return { ...p, status: 'offline', lastActivity: p.lastActivity || null };
                }
                return p;
              });

              try { console.info('users_list_update: updated tracked in-place', updated.length, 'with payload users', users.length); } catch(e){ void e; }
              return updated;
            });

          } catch (err) {
            console.error('users_list_update handler failed', err);
          }
        });

        const pushRecent = (r) => {
          set_Recent((prev) => [r, ...prev].slice(0, 50));
        };

        const matches = (p, u) => {
          const pid = String(p._id || p.id || "");
          const uid = String(u._id || u.id || "");
          return pid && uid && pid === uid;
        };

        // debug connection state (helps understand deployed vs local differences)
        try {
          socket.on('connect', async () => {
            console.info('TrackTeam socket connected', socket.id, 'connected=', socket.connected);
            try {
              // fetch latest active sessions and merge so initial UI immediately shows correct status
              const active = await sessionApi.getActive(token).catch(() => null);
              const users = active?.users || [];
              const userMap = new Map((users || []).map((u) => [String(u._id), u]));
              users.forEach(u => { if (u.id) userMap.set(String(u.id), u); });
              setTrackedDocs((prev) => {
                if (!prev || prev.length === 0) return prev;
                return prev.map((p) => {
                  const key = String(p._id || p.id || "");
                  const upd = userMap.get(key);
                  if (upd) return { ...p, ...upd };
                  if (p.status === 'online' || p.status === 'disconnected') return { ...p, status: 'offline' };
                  return p;
                });
              });
            } catch (e) {
              console.warn('TrackTeam: failed to merge active sessions on connect', e && e.message);
            }
          });
          socket.on('connect_error', (err) => console.warn('TrackTeam socket connect_error', err && err.message));
          socket.on('reconnect_attempt', (n) => console.info('TrackTeam socket reconnect_attempt', n));
        } catch(e){ void e; }

        socket.on("user_online", (u) => {
          pushRecent({
            sessionId: (u._id || u.id) + "-on",
            user: u,
            status: "online",
            createdAt: new Date().toISOString(),
            device: u.device,
          });
          setTrackedDocs((prev) =>
            prev.map((p) => (matches(p, u) ? { ...p, ...u, status: "online" } : p))
          );
        });
        socket.on("user_offline", (u) => {
          pushRecent({
            sessionId: (u._id || u.id) + "-off",
            user: u,
            status: "offline",
            createdAt: new Date().toISOString(),
            device: u.device,
          });
          setTrackedDocs((prev) =>
            prev.map((p) => (matches(p, u) ? { ...p, ...u, status: "offline" } : p))
          );
        });
        socket.on("user_disconnected", (u) => {
          pushRecent({
            sessionId: (u._id || u.id) + "-disc",
            user: u,
            status: "disconnected",
            createdAt: new Date().toISOString(),
            device: u.device,
          });
          setTrackedDocs((prev) =>
            prev.map((p) => (matches(p, u) ? { ...p, ...u, status: "disconnected" } : p))
          );
        });
      } catch (e) {
        console.error("socket connect failed", e);
      }
    })();

    return () => {
      try {
        if (socketRef.current) socketRef.current.off && socketRef.current.off();
      } catch (err) {
        void err;
      }
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleOpenPopup = (type) => {
    const rows = [];
    const pushUser = (u, time) =>
      rows.push({ name: u.name || "-", employeeId: u.employeeId || "", time });

    if (type === "all") {
      trackedDocs.forEach((u) => {
        const t = u.status === "offline" ? u.logoutTime : u.loginTime || u.lastActivity;
        pushUser(u, t);
      });
      setPopupTitle("All tracked users");
    } else if (type === "online") {
      trackedDocs
        .filter((u) => u.status === "online")
        .forEach((u) => pushUser(u, u.loginTime || u.lastActivity));
      setPopupTitle("Online tracked users");
    } else if (type === "disconnected") {
      trackedDocs
        .filter((u) => u.status === "disconnected")
        .forEach((u) => pushUser(u, u.lastActivity || u.loginTime));
      setPopupTitle("Disconnected tracked users");
    } else if (type === "offline") {
      trackedDocs
        .filter((u) => u.status === "offline")
        .forEach((u) => pushUser(u, u.logoutTime));
      setPopupTitle("Offline tracked users");
    } else if (type === "latejoin") {
      (alerts?.lateJoin || []).forEach((a) =>
        rows.push({
          name: a.user?.name || "-",
          employeeId: a.user?.employeeId || "",
          time: a.loginTime,
        })
      );
      setPopupTitle("Late joiners");
    } else if (type === "idle") {
      trackedDocs
        .filter((u) => !!u.isIdle)
        .forEach((u) => pushUser(u, u.lastActivity || u.loginTime));
      setPopupTitle("Idle tracked users");
    }

    setPopupRows(rows);
    setPopupOpen(true);
  };

  const handleAdd = async () => {
    if (!searchId) return toast.warn("Enter employee ID");
    setLoading(true);
    try {
      // use lightweight lookup endpoint so teamleads don't need admin /users permission
      const resp = await authApi
        .findByEmployeeId(searchId, token)
        .catch(() => null);
      const found = resp && resp.user ? resp.user : null;
      if (!found) {
        toast.error("Employee not found");
        return;
      }
      const current = await teamleadApi.getTracked(token);
      const ids = (current.tracked || []).map((t) => String(t._id || t.id));
      if (ids.includes(String(found._id))) {
        toast.info("Employee already tracked");
        return;
      }
      ids.push(String(found._id));
      await teamleadApi.setTracked(token, ids);
      const tracked = (await teamleadApi.getTracked(token)).tracked || [];
      const merged = await mergeActiveInfo(tracked);
      setTrackedDocs(merged);
      toast.success("Employee added to tracked list");
      setSearchId("");
    } catch (e) {
      console.error(e);
      toast.error("Failed to add employee");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id) => {
    setLoading(true);
    try {
      const current = await teamleadApi.getTracked(token);
      const ids = (current.tracked || [])
        .map((t) => String(t._id || t.id))
        .filter((x) => String(x) !== String(id));
      await teamleadApi.setTracked(token, ids);
      const tracked = (await teamleadApi.getTracked(token)).tracked || [];
      const merged = await mergeActiveInfo(tracked);
      setTrackedDocs(merged);
      toast.success("Removed from tracked list");
    } catch (e) {
      console.error(e);
      toast.error("Failed to remove");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-3">
      <h3 className="fw-bold">Track Team</h3>

      {/* tabs / stats */}
      {(() => {
        const stats = {
          total: trackedDocs.length,
          online: trackedDocs.filter((u) => u.status === "online").length,
          disconnected: trackedDocs.filter((u) => u.status === "disconnected")
            .length,
          offline: trackedDocs.filter((u) => u.status === "offline").length,
          idle: trackedDocs.filter((u) => !!u.isIdle).length,
          lateJoin: (alerts?.lateJoin || []).length,
        };

        return (
          <div className="container-fluid py-2">
          

            <div className="row g-2">
              <div className="col-12 col-md-4 col-lg-2">
                <div
                  className="p-3 shadow-sm rounded border border-primary h-100 d-flex justify-content-between align-items-center"
                  role="button"
                  onClick={() => handleOpenPopup("all")}
                >
                  <span className="fw-bold text-primary">All</span>
                  <span
                    className="badge rounded-pill text-white  p-2"
                    style={{ backgroundColor: "#307feeff" }}
                  >
                    {stats.total}
                  </span>
                </div>
              </div>

              {/* Online Filter */}
              <div className="col-12 col-md-4 col-lg-2">
                <div
                  className="p-3 shadow-sm rounded border border-success h-100 d-flex justify-content-between align-items-center"
                  role="button"
                  onClick={() => handleOpenPopup("online")}
                >
                  <span className="fw-bold text-success">Online</span>
                  <span className="badge rounded-pill text-white bg-success p-2">
                    {stats.online}
                  </span>
                </div>
              </div>

              {/* Disconnected Filter */}
              <div className="col-12 col-md-4 col-lg-2">
                <div
                  className="p-3 shadow-sm rounded border border-warning h-100 d-flex justify-content-between align-items-center"
                  role="button"
                  onClick={() => handleOpenPopup("disconnected")}
                >
                  <span className="fw-bold text-warning">Disconnect</span>
                  <span
                    className="badge rounded-pill text-dark bg-warning p-2"
                    style={{ backgroundColor: "#fcce00ff" }}
                  >
                    {stats.disconnected}
                  </span>
                </div>
              </div>

              {/* Offline Filter */}
              <div className="col-12 col-md-4 col-lg-2">
                <div
                  className="p-3 shadow-sm rounded border border-danger h-100 d-flex justify-content-between align-items-center"
                  role="button"
                  onClick={() => handleOpenPopup("offline")}
                >
                  <span className="fw-bold text-danger">Offline</span>
                  <span className="badge rounded-pill text-white bg-danger p-2">
                    {stats.offline}
                  </span>
                </div>
              </div>

              {/* Late Join Filter */}
              <div className="col-12 col-md-4 col-lg-2">
                <div
                  className="p-3 shadow-sm rounded border border-info h-100 d-flex justify-content-between align-items-center"
                  role="button"
                  onClick={() => handleOpenPopup("latejoin")}
                >
                  <span className="fw-bold text-info">Late Join</span>
                  <span
                    className="badge rounded-pill text-white p-2"
                    style={{ backgroundColor: "#44abffff" }}
                  >
                    {stats.lateJoin || "0"}
                  </span>
                </div>
              </div>

              {/* Idle Filter */}
              <div className="col-12 col-md-4 col-lg-2">
                <div
                  className="p-3 shadow-sm rounded border border-secondary h-100 d-flex justify-content-between align-items-center"
                  role="button"
                  onClick={() => handleOpenPopup("idle")}
                >
                  <span className="fw-bold text-secondary">Idle</span>
                  <span className="badge rounded-pill text-white bg-dark p-2">
                    {stats.idle || "0"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="card mb-3">
        <div className="card-body row gx-2 gy-2 align-items-end">
          <div className="col-md-6">
            <label className="form-label">Employee ID</label>
            <input
              className="form-control"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Enter Employee ID"
            />
          </div>
          <div className="col-md-2">
            <button
              className="btn btn-primary w-100"
              onClick={handleAdd}
              disabled={loading}
            >
              <i className="bi bi-person-plus me-2" />
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <h5 className="mb-3 fw-bold">Tracked Users</h5>
          <div className="table-responsive">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Device</th>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Login</th>
                  <th>Logout</th>
                  <th>Active</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {trackedDocs.map((u) => (
                  <tr key={u._id || u.id}>
                    <td>
                      <div className="fw-bold">{u.name || "-"}</div>
                      <div className="text-muted small">
                        {u.employeeId || ""}
                      </div>
                    </td>
                    <td>{u.device || u.ip || "-"}</td>
                    <td className="text-capitalize">{u.role || "employee"}</td>
                    <td>{u.locationName || u.location || "-"}</td>
                    <td>
                      {u.loginTime
                        ? new Date(u.loginTime).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {u.logoutTime
                        ? new Date(u.logoutTime).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {typeof u.totalDuration !== "undefined" &&
                      u.totalDuration !== null ? (
                        `${Math.floor(u.totalDuration / 3600)}h ${Math.floor(
                          (u.totalDuration % 3600) / 60
                        )}m ${u.totalDuration % 60}s`
                      ) : u.loginTime ? (
                        <Timer start={u.loginTime} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          u.status === "online"
                            ? "bg-success"
                            : u.status === "disconnected"
                            ? "bg-warning"
                            : "bg-secondary"
                        }`}
                      >
                        {u.status || "offline"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleRemove(u._id)}
                      >
                        <i className="bi bi-person-dash me-1" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {trackedDocs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted">
                      No tracked employees. Add by Employee ID above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right-side popup for filtered lists */}
      {popupOpen && (
        <div
          style={{
            position: "fixed",
            top: 72,
            right: 16,
            width: 360,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "white",
            zIndex: 9999,
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div
            className="p-3 d-flex justify-content-between align-items-center border-bottom text-white"
            style={{ background: "#84c1ffff" }}
          >
            <div>
              <strong>{popupTitle}</strong>
              <div className=" small">{popupRows.length} employee(s)</div>
            </div>
            <div>
              <button
                className="btn btn-sm btn-outline-light"
                onClick={() => setPopupOpen(false)}
              >
                X
              </button>
            </div>
          </div>
          <div className="p-2">
            {popupRows.length === 0 ? (
              <div className="text-center text-muted p-3">
                No employees match
              </div>
            ) : (
              <ul className="list-group list-group-flush">
                {popupRows.map((r, idx) => (
                  <li
                    key={idx}
                    className="list-group-item d-flex justify-content-between align-items-center"
                  >
                    <div>
                      <div className="fw-semibold">{r.name || "-"}</div>
                      <div className="text-muted small">
                        {r.employeeId || ""}
                      </div>
                    </div>
                    <div className="text-end small text-muted">
                      {r.time ? new Date(r.time).toLocaleString() : "-"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

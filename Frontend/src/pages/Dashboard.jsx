import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket } from "../context/socket";
import UserCard from "../components/UserCard";
import AddUserForm from "../components/AddUserForm";
import * as sessionApi from "../api/sessionApi";
import * as authApi from "../api/authApi";
import { reverseGeocodeIfCoords } from "../utils/geo";

export default function Dashboard() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [_recent, setRecent] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupTitle, setPopupTitle] = useState("");
  const [popupRows, setPopupRows] = useState([]);

  const handleOpenPopup = (type) => {
    const rows = [];
    const pushUser = (u, time) => rows.push({ name: u.name || '-', employeeId: u.employeeId || '', time });

    if (type === "all") {
      users.forEach((u) => {
        const t = u.status === 'offline' ? u.logoutTime : (u.loginTime || u.lastActivity);
        pushUser(u, t);
      });
      setPopupTitle('All users');
    } else if (type === 'online') {
      users.filter(u => u.status === 'online').forEach(u => pushUser(u, u.loginTime || u.lastActivity));
      setPopupTitle('Online users');
    } else if (type === 'disconnected') {
      users.filter(u => u.status === 'disconnected').forEach(u => pushUser(u, u.lastActivity || u.loginTime));
      setPopupTitle('Disconnected users');
    } else if (type === 'offline') {
      users.filter(u => u.status === 'offline').forEach(u => pushUser(u, u.logoutTime));
      setPopupTitle('Offline users');
    } else if (type === 'latejoin') {
      // show unique recent late joiners (dedupe by user id) and sort by most recent
      const late = alerts?.lateJoin || [];
      const map = new Map();
      late.forEach((a) => {
        const uid = a.user?.id || a.user?._id || a.user?.employeeId || a.user?.employeeId;
        const existing = map.get(uid);
        const time = a.loginTime ? new Date(a.loginTime).getTime() : 0;
        if (!existing || (existing.time || 0) < time) {
          map.set(uid, { name: a.user?.name || '-', employeeId: a.user?.employeeId || '', time });
        }
      });
      const uniq = Array.from(map.values()).sort((x, y) => (y.time || 0) - (x.time || 0));
      uniq.forEach((u) => rows.push({ name: u.name, employeeId: u.employeeId, time: u.time ? new Date(u.time).toISOString() : null }));
      setPopupTitle('Late joiners');
    } else if (type === 'idle') {
      users.filter(u => !!u.isIdle).forEach(u => pushUser(u, u.lastActivity || u.loginTime));
      setPopupTitle('Idle users');
    }

    setPopupRows(rows);
    setPopupOpen(true);
  };

// console.log(recent);

  // Device detection
  const detectDevice = () => {
    const ua = navigator.userAgent || "";
    if (/mobile/i.test(ua)) return "Mobile";
    if (/tablet/i.test(ua)) return "Tablet";
    return "Desktop";
  };

  useEffect(() => {
    (async () => {
      // Only start session for admin (who lands here directly)
      let currentUser = qc.getQueryData(["user"]);
      if (!currentUser) {
        try {
          const meResp = await authApi.me(token);
          currentUser = meResp.user;
          qc.setQueryData(["user"], currentUser);
        } catch {
          // ignore
        }
      }
      if (currentUser && currentUser.role === "admin" && !sessionStarted) {
        // Start session with device and geolocation
        let body = { device: detectDevice() };
        try {
          if (navigator.geolocation) {
            body.location = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(""), 3000);
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  clearTimeout(timer);
                  resolve(
                    `${pos.coords.latitude.toFixed(
                      4
                    )},${pos.coords.longitude.toFixed(4)}`
                  );
                },
                () => {
                  clearTimeout(timer);
                  resolve("");
                },
                { timeout: 3000 }
              );
            });
          }
        } catch {
          body.location = "";
        }
        try {
          await sessionApi.startSession(token, body);
          setSessionStarted(true);
        } catch {
          // ignore
        }
      }

      try {
        const resp = await sessionApi.getActive(token);
        // fetch stats, logs, alerts for admin
        sessionApi
          .getStats(token)
          .then((s) => setStats(s))
          .catch(() => {});
        sessionApi
          .getLogs(token)
          .then((r) => setRecent(r.sessions || []))
          .catch(() => {});
        sessionApi
          .getAlerts(token)
          .then((a) => setAlerts(a))
          .catch(() => {});
        // Build a map of active sessions by user id
        const activeMap = new Map(
          (resp.users || []).map((u) => [String(u._id), u])
        );

        // If current user is admin, fetch all users and merge session info so admins see everybody
        if (currentUser && currentUser.role === "admin") {
          try {
            const all = await authApi.getUsers(token);
            const merged = (all.users || []).map((u) => {
              const sid = String(u._id);
              const session = activeMap.get(sid);
              if (session) {
                // merge profile and session but prefer profile role when present
                return { ...u, ...session, role: u.role || session.role };
              }
              return {
                _id: u._id,
                name: u.name,
                employeeId: u.employeeId,
                role: u.role,
                status: "offline",
                device: null,
                location: null,
              };
            });
            // Resolve coordinate-style locations to human-readable names (cached)
            const resolved = await Promise.all(
              merged.map(async (u) => {
                if (u.location) {
                  try {
                    const name = await reverseGeocodeIfCoords(u.location);
                    return { ...u, location: name };
                  } catch {
                    return u;
                  }
                }
                return u;
              })
            );
            setUsers(resolved);
          } catch (e) {
            console.warn(
              "Failed to fetch all users, falling back to active list",
              e
            );
            const uniq = Array.from(activeMap.values());
            setUsers(uniq);
          }
        } else {
          // non-admins see active users only
          const uniq = Array.from(activeMap.values());
          // Resolve coordinate-style locations to human-readable names (cached)
          (async () => {
            const resolved = await Promise.all(
              uniq.map(async (u) => {
                if (u.location) {
                  try {
                    const name = await reverseGeocodeIfCoords(u.location);
                    return { ...u, location: name };
                  } catch {
                    return u;
                  }
                }
                return u;
              })
            );
            setUsers(resolved);
          })();
        }
        const socket = connectSocket(token);
        // update connection status for UI
        try {
          setSocketConnected(!!socket.connected);
        } catch (err) {
          console.warn("socket status check failed", err);
        }
        socket.on("connect", () => setSocketConnected(true));
        socket.on("disconnect", () => setSocketConnected(false));
        // remove previous listeners to avoid duplicate handlers
        try {
          socket.off && socket.off("users_list_update");
        } catch {
          /* ignore */
        }
        try {
          socket.off && socket.off("user_online");
        } catch {
          /* ignore */
        }
        try {
          socket.off && socket.off("user_offline");
        } catch {
          /* ignore */
        }
        try {
          socket.off && socket.off("user_disconnected");
        } catch {
          /* ignore */
        }

        socket.on("users_list_update", (data) => {
          const list = data.users || [];
          (async () => {
            const withNames = await Promise.all(
              list.map(async (u) => ({
                ...(u || {}),
                location: u.location
                  ? await reverseGeocodeIfCoords(u.location)
                  : u.location,
              }))
            );
            // If current user is admin, merge active session fields into the existing full user list
            if (currentUser && currentUser.role === "admin") {
              setUsers((prev) => {
                const map = new Map(prev.map((x) => [String(x._id), x]));
                withNames.forEach((u) => {
                  const key = String(u._id);
                  const existing = map.get(key) || { _id: u._id };
                  // merge session fields onto existing profile but keep profile role when available
                  map.set(key, {
                    ...existing,
                    ...u,
                    role: existing.role || u.role,
                  });
                });
                return Array.from(map.values());
              });
            } else {
              const uniq2 = Array.from(
                new Map(withNames.map((u) => [String(u._id), u])).values()
              );
              setUsers(uniq2);
            }
            if (data.counts) {
              setStats((prev) => ({
                ...prev,
                totalUsers: data.counts.total ?? prev?.totalUsers ?? 0,
                onlineUsers: data.counts.online ?? prev?.onlineUsers ?? 0,
                offlineUsers: data.counts.offline ?? prev?.offlineUsers ?? 0,
                disconnected: data.counts.disconnected ?? prev?.disconnected ?? 0,
                idleUsers: data.counts.idle ?? prev?.idleUsers ?? 0,
                lateJoinUsers: data.counts.lateJoin ?? prev?.lateJoinUsers ?? 0,
              }));
            }
          })();
        });
        socket.on("user_online", (u) =>
          setUsers((prev) => {
            const map = new Map(prev.map((x) => [String(x._id), x]));
            map.set(String(u._id), u);
            return Array.from(map.values());
          })
        );
        socket.on("user_offline", (u) =>
          setUsers((prev) =>
            prev.map((p) => (String(p._id) === String(u._id) ? u : p))
          )
        );
        socket.on("user_disconnected", (u) =>
          setUsers((prev) =>
            prev.map((p) => (String(p._id) === String(u._id) ? u : p))
          )
        );
        // ensure socket is connected; if not, try to reconnect
        if (!socket.connected) {
          try {
            socket.connect();
          } catch {
            console.warn("socket connect attempt failed");
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();

    return () => disconnectSocket();
    // eslint-disable-next-line
  }, [sessionStarted]);

  // derive display counts directly from the `users` array to match popup contents
  const totalCount = users.length;
  const onlineCount = users.filter((u) => u.status === 'online').length;
  const disconnectedCount = users.filter((u) => u.status === 'disconnected').length;
  const offlineCount = users.filter((u) => u.status === 'offline').length;
  const idleCount = users.filter((u) => !!u.isIdle).length;
  // dedupe lateJoin alerts by user id
  const lateJoinCount = (() => {
    const late = alerts?.lateJoin || [];
    const setIds = new Set();
    late.forEach((a) => {
      const id = a.user?.id || a.user?._id || a.user?.employeeId || `${a.user?.employeeId}_${a.loginTime}`;
      if (id) setIds.add(String(id));
    });
    return setIds.size;
  })();

  return (
    <div>
      <div className="container-fluid py-2 ">
          <div className="d-flex align-items-center mb-3">
            <h2 class="mb-0 me-3">Live Employee Tracking</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 12,
                  background: socketConnected ? "#2ecc71" : "#e74c3c",
                  boxShadow: socketConnected
                    ? "0 0 6px rgba(46,204,113,0.5)"
                    : "none",
                }}
              />
              <small className="text-muted">
                {socketConnected
                  ? "Realtime: connected"
                  : "Realtime: disconnected"}
              </small>
            </div>
          </div>

          {/* <!-- Tabs Container --> */}
        
<div className="container-fluid p-3">
    {/* 'row-cols-1' (sm के लिए), 'row-cols-md-2' (md के लिए), 'row-cols-lg-3' (lg और ऊपर के लिए) का उपयोग करके Responsive Grid सेट करें। */}
    {/* 'g-3' ग्रिड के बीच गैप (g-x और g-y) के लिए है। */}
    <div className="row g-3">

        {/* --- All Users Card --- */}
        <div className="col">
            <div
                className="card shadow-sm h-100 border-primary"
                role="button"
                onClick={() => handleOpenPopup('all')}
            >
                <div className="card-body d-flex justify-content-between align-items-center p-3">
                    <h5 className="card-title mb-0 text-primary">All</h5>
                    <span
                        className="badge rounded-pill text-primary p-2"
                        style={{ minWidth: "30px", fontSize: "1rem", backgroundColor: "#b1daf7ff" }}
                    >
                        {totalCount}
                    </span>
                </div>
            </div>
        </div>

        {/* --- Online Users Card --- */}
        <div className="col">
            <div
                className="card shadow-sm h-100 border-success"
               

             // pastel green text contrast


                role="button"
                onClick={() => handleOpenPopup('online')}
            >
                <div className="card-body d-flex justify-content-between align-items-center p-3">
                    <h5 className="card-title mb-0 text-success">Online</h5>
                    <span
                        className="badge rounded-pill text-success p-2"
                        style={{ minWidth: "30px", fontSize: "1rem",backgroundColor: "#d2faa7ff"  }}
                    >
                        {onlineCount}
                    </span>
                </div>
            </div>
        </div>

        {/* --- Disconnected Users Card --- */}
        <div className="col">
            <div
                className="card shadow-sm h-100 border-warning"
                role="button"
                onClick={() => handleOpenPopup('disconnected')}
            >
                <div className="card-body d-flex justify-content-between align-items-center p-3">
                      <h5 className="card-title  mx-2 mb-0 text-warning">Disconnect</h5>
                    <span
                        className="badge rounded-pill text-warning  p-2"
                        style={{ minWidth: "30px", fontSize: "1rem",backgroundColor: "#f8fad0ff"  }}
                    >
                        {disconnectedCount}
                    </span>
                </div>
            </div>
        </div>

        {/* --- Offline Users Card --- */}
        <div className="col">
            <div
                className="card shadow-sm h-100 border-danger"
                role="button"
                onClick={() => handleOpenPopup('offline')}
            >
                <div className="card-body d-flex justify-content-between align-items-center p-3">
                    <h5 className="card-title mb-0 text-danger">Offline</h5>
                    <span
                        className="badge rounded-pill text-danger p-2"
                        style={{ minWidth: "30px", fontSize: "1rem",backgroundColor: "#f7c6aeff"  }}
                    >
                        {offlineCount}
                    </span>
                </div>
            </div>
        </div>

        {/* --- Late Join Users Card --- */}
        <div className="col">
            <div
                className="card shadow-sm h-100 border-info"
                role="button"
                onClick={() => handleOpenPopup('latejoin')}
            >
                <div className="card-body d-flex justify-content-between align-items-center p-3">
                    <h5 className="card-title mb-0 text-info">Late Join</h5>
                    <span
                        className="badge rounded-pill text-info p-2"
                        style={{ minWidth: "30px", fontSize: "1rem",backgroundColor: "#bfeafaff"  }}
                    >
                        {lateJoinCount || "0"}
                    </span>
                </div>
            </div>
        </div>

        {/* --- Idle Users Card --- */}
        <div className="col">
            <div
                className="card shadow-sm h-100 border-secondary"
                role="button"
                onClick={() => handleOpenPopup('idle')}
            >
                <div className="card-body d-flex justify-content-between align-items-center p-3">
                    <h5 className="card-title mb-0 text-secondary">Idle</h5>
                    <span
                        className="badge rounded-pill text-white bg-secondary p-2"
                        style={{ minWidth: "30px", fontSize: "1rem" }}
                    >
                        {idleCount || "0"}
                    </span>
                </div>
            </div>
        </div>

    </div>
</div>

        </div>
      {/* show add-user form only for admins */}
      {(() => {
        const user = qc.getQueryData(["user"]);
        if (user && user.role === "admin")
          return (
            <AddUserForm
              onCreated={async () => {
                try {
                  // fetch full user list (admins should see everyone), then merge any active session info
                  const all = await authApi.getUsers(token);
                  const activeResp = await sessionApi.getActive(token);
                  const activeMap = new Map(
                    (activeResp.users || []).map((u) => [String(u._id), u])
                  );
                  const merged = (all.users || []).map((u) => {
                    const sid = String(u._id);
                    const session = activeMap.get(sid);
                    if (session)
                      return { ...u, ...session, role: u.role || session.role };
                    return {
                      _id: u._id,
                      name: u.name,
                      employeeId: u.employeeId,
                      role: u.role,
                      status: "offline",
                      device: null,
                      location: null,
                    };
                  });
                  setUsers(merged);
                } catch (e) {
                  console.error("Failed to refresh user list after create", e);
                }
              }}
            />
          );
        return null;
      })()}
      <div className=" container-fluid ">

        {/* Right-side popup for filtered lists */}
        {popupOpen && (
          <div
            style={{
              position: 'fixed',
              top: 72,
              right: 16,
              width: 360,
              maxHeight: '70vh',
              overflowY: 'auto',
              background: 'white',
              zIndex: 9999,
              borderRadius: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div className="p-3 d-flex justify-content-between align-items-center border-bottom" style={{ position: 'sticky', top: 0, zIndex: 10002, background: 'white' }}>
              <div>
                <strong>{popupTitle}</strong>
                <div className="text-muted small">{popupRows.length} employee(s)</div>
              </div>
              <div>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setPopupOpen(false)}>Close</button>
              </div>
            </div>
            <div className="p-2">
              {popupRows.length === 0 ? (
                <div className="text-center text-muted p-3">No employees match</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {popupRows.map((r, idx) => (
                    <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-semibold">{r.name || '-'}</div>
                        <div className="text-muted small">{r.employeeId || ''}</div>
                      </div>
                      <div className="text-end small text-muted">
                        {r.time ? new Date(r.time).toLocaleString() : '-'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

          <table className="table table-striped">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Device</th>
                <th>Role</th>
                <th>Location</th>
                <th>Login</th>
                <th>LogOut</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserCard
                  key={u._id}
                  user={u}
                  canEdit={(qc.getQueryData(["user"]) || {}).role === "admin"}
                  onUpdated={(updated) =>
                    setUsers((prev) =>
                      prev.map((p) =>
                        String(p._id) === String(updated.id)
                          ? { ...p, ...updated }
                          : p
                      )
                    )
                  }
                  onDeleted={(id) =>
                    setUsers((prev) =>
                      prev.filter((p) => String(p._id) !== String(id))
                    )
                  }
                />
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
}










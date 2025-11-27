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
  const [recent, setRecent] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

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
                totalUsers: data.counts.total,
                onlineUsers: data.counts.online,
                offlineUsers: data.counts.offline,
                disconnected: data.counts.disconnected,
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

  return (
    <div>
      {stats && (
        <div class="container-fluid py-2 ">
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
          <div class=" bg-white d-flex justify-content-between align-items-center p-2 mb-2 rounded">
            <div class="d-flex gap-3">
              <div class="tab-item active ">
                <span>All </span>
                <span
                  style={{
                    width: "24px",
                    height: "24px",
                    display: "inline-block",
                    textAlign: "center",
                    color: "#fff",
                    borderRadius: "50%",
                    background: "#307feeff",
                  }}
                >
                  {stats.totalUsers}
                </span>
              </div>

              <div class="tab-item">
                <span>Online </span>
                <span 
                
                     style={{
                    width: "24px",
                    height: "24px",
                    display: "inline-block",
                    textAlign: "center",
                    color: "#fff",
                    borderRadius: "50%",
                    background: "#2ecc71",
                  }}
                
                >{stats.onlineUsers}</span>
              </div>

              <div class="tab-item">
                <span>Disconnected </span>
                <span 
                
                 style={{
                    width: "24px",
                    height: "24px",
                    display: "inline-block",
                    textAlign: "center",
                    color: "#ffffffff",
                    borderRadius: "50%",
                    background: "#fcce00ff",}}
                >{stats.inactiveUsers}</span>
              </div>
              <div class="tab-item">
                <span>Offline </span>
                <span 
                style={{
                    width: "24px",
                    height: "24px",
                    display: "inline-block",
                    textAlign: "center",
                    color: "#fff",
                    borderRadius: "50%",
                    background: "#e74c3c",
                  }}
                >{stats.offlineUsers}</span>
              </div>
            </div>
            <div>
              <div class="filter-link">
                <i class="bi bi-funnel"></i> <span>Filter</span>
              </div>
            </div>
          </div>
        </div>
      )}
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


      {/* Alerts */}
      {alerts && (
        <div className="card mt-3 p-4">
          <h6>Late Join</h6>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>

                <ul className="list-unstyled mb-0">
                  {alerts.lateJoin.map((a) => (
                    <li key={a.sessionId}>
                      {a.user?.name || "-"} —{" "}
                      {new Date(a.loginTime).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
          </div>
        </div>
      )}
    </div>
  );
}










  
      {/* <div className=" container bg-white p-3 mt-3">
        <div className="">
          <h5>Recent Activity</h5>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>Time</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              {recent.slice(0, 10).map((r) => (
                <tr key={r.sessionId}>
                  <td>{r.user?.name || "-"}</td>
                  <td>
                    {r.status === "online"
                      ? "Login"
                      : r.status === "offline"
                      ? "Logout"
                      : "Disconnected"}
                  </td>
                  <td>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}
                  </td>
                  <td>{r.device || r.ip || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div> */}
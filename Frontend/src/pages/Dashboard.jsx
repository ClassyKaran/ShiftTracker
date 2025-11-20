import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket } from "../context/socket";
import UserCard from "../components/UserCard";
import AddUserForm from "../components/AddUserForm";
import * as sessionApi from "../api/sessionApi";
import { reverseGeocodeIfCoords } from '../utils/geo';

export default function Dashboard() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    (async () => {
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
        // dedupe by id
        const uniq = Array.from(
          new Map((resp.users || []).map((u) => [String(u._id), u])).values()
        );
        // Resolve coordinate-style locations to human-readable names (cached)
        (async () => {
          const resolved = await Promise.all(uniq.map(async (u) => {
            if (u.location) {
              try {
                const name = await reverseGeocodeIfCoords(u.location);
                return { ...u, location: name };
              } catch (e) {
                return u;
              }
            }
            return u;
          }));
          setUsers(resolved);
        })();
        const socket = connectSocket(token);
        // update connection status for UI
        try { setSocketConnected(!!socket.connected); } catch (err) { console.warn('socket status check failed', err); }
        socket.on('connect', () => setSocketConnected(true));
        socket.on('disconnect', () => setSocketConnected(false));
        // remove previous listeners to avoid duplicate handlers
        try { socket.off && socket.off('users_list_update'); } catch { /* ignore */ }
        try { socket.off && socket.off('user_online'); } catch { /* ignore */ }
        try { socket.off && socket.off('user_offline'); } catch { /* ignore */ }
        try { socket.off && socket.off('user_disconnected'); } catch { /* ignore */ }

        socket.on("users_list_update", (data) => {
          const list = data.users || [];
          (async () => {
            const withNames = await Promise.all(list.map(async (u) => ({ ...(u || {}), location: u.location ? await reverseGeocodeIfCoords(u.location) : u.location })));
            const uniq2 = Array.from(
              new Map(withNames.map((u) => [String(u._id), u])).values()
            );
            setUsers(uniq2);
            if (data.counts) {
              setStats(prev => ({ ...prev, totalUsers: data.counts.total, onlineUsers: data.counts.online, offlineUsers: data.counts.offline, disconnected: data.counts.disconnected }));
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
          try { socket.connect(); } catch (e) { console.warn('socket connect attempt failed', e); }
        }
      } catch (e) {
        console.error(e);
      }
    })();

    return () => disconnectSocket();
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      {stats && (
        <div class="container py-2">
          <div className="d-flex align-items-center mb-3">
            <h2 class="mb-0 me-3">Team Dashboard</h2>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:12,height:12,borderRadius:12,background: socketConnected ? '#2ecc71' : '#e74c3c',display:'inline-block',boxShadow: socketConnected ? '0 0 6px rgba(46,204,113,0.5)' : 'none'}} />
              <small className="text-muted">{socketConnected ? 'Realtime: connected' : 'Realtime: disconnected'}</small>
            </div>
          </div>

          <div class="row ">
            <div class="col-md-3">
              <div class="card text-center border-0 rounded-4 mb-4 shadow">
                <div class="card-body">
                  <h3 class="text-primary">{stats.totalUsers}</h3>
                  <p class="text-muted mb-0">Total Employees</p>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="card text-center border-0 rounded-4 mb-4 shadow">
                <div class="card-body">
                  <h3 class="text-success">{stats.onlineUsers}</h3>
                  <p class="text-muted mb-0">Currently Online</p>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="card text-center border-0 rounded-4 mb-4 shadow">
                <div class="card-body">
                  <h3 class="text-warning">{stats.inactiveUsers}</h3>
                  <p class="text-muted mb-0">Disconnected</p>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="card text-center border-0 rounded-4 mb-4 shadow">
                <div class="card-body">
                  <h3 class="text-danger">{stats.offlineUsers}</h3>
                  <p class="text-muted mb-0">Offline</p>
                </div>
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
              onCreated={() =>
                sessionApi.getActive(token).then((r) => {
                  const uniq = Array.from(
                    new Map(
                      (r.users || []).map((u) => [String(u._id), u])
                    ).values()
                  );
                  setUsers(uniq);
                })
              }
            />
          );
        return null;
      })()}
      <div className="card container">
        <div className="card-body">
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Device</th>
                <th>Location</th>
                <th>Login Time</th>
                <th>LogOut Time</th>
                <th>Active Time</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserCard
                  key={u._id}
                  user={u}
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
      {/* Recent activity */}
      <div className="card container mt-3">
        <div className="card-body">
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
      </div>

      {/* Alerts */}
      {alerts && (
        <div className="card container mt-3">
          <div className="card-body">
            <h5>Shift Alerts</h5>
            <div className="row">
              <div className="col-md-6">
                <h6>Late Join</h6>
                <ul className="list-unstyled small">
                  {alerts.lateJoin.map((a) => (
                    <li key={a.sessionId}>
                      {a.user?.name || "-"} —{" "}
                      {new Date(a.loginTime).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="col-md-6">
                <h6>Extended Shift</h6>
                <ul className="list-unstyled small">
                  {alerts.extendedShift.map((a) => (
                    <li key={a.sessionId}>
                      {a.user?.name || "-"} —{" "}
                      {Math.floor(a.totalDuration / 3600)}h
                    </li>
                  ))}
                </ul>
              </div>
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as teamleadApi from "../api/teamleadApi";
import * as sessionApi from "../api/sessionApi";

export default function TeamSection() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");

  const [teamlists, setTeamlists] = useState([]); // { teamlead, tracked: [] }
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const resp = await teamleadApi.getAllTracked(token);
      const lists = resp.trackedByTeamlead || [];
      // merge active session info for tracked users
      try {
        const activeResp = await sessionApi.getActive(token);
        const activeMap = new Map(
          (activeResp.users || []).map((u) => [String(u._id), u])
        );
        const merged = lists.map((l) => ({
          teamlead: l.teamlead,
          tracked: (l.tracked || []).map((u) => ({
            ...u,
            ...(activeMap.get(String(u._id)) || {}),
          })),
        }));
        setTeamlists(merged);
        if (!selected && merged.length) setSelected(merged[0]);
      } catch (err) {
        // if session merge fails still use raw lists
        console.warn("session active merge failed", err);
        setTeamlists(lists);
        if (!selected && lists.length) setSelected(lists[0]);
      }
    } catch (err) {
      console.error("Failed to load team lists", err);
    } finally {
      setLoading(false);
    }
  };

  // intentionally only run when token changes; fetchAll is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchAll();
  }, [token]);
  const renderRight = () => {
    if (!selected)
      return (
        <div className="text-muted">
          Select a team lead to see their tracked employees
        </div>
      );
    if (loading) return <div className="text-muted">Loading team members…</div>;
    return (
      <div>
        <div className="mb-3">
          Viewing <strong>{selected.teamlead.name}</strong> (
          {selected.teamlead.employeeId}) — {selected.tracked.length} tracked
        </div>
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
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {selected.tracked.map((u) => (
                <tr key={u._id}>
                  <td>
                    <div className="fw-bold">{u.name || "-"}</div>
                    <div className="small text-muted">{u.employeeId || ""}</div>
                  </td>
                  <td>{u.device || u.ip || "-"}</td>
                  <td>{u.role || "employee"}</td>
                  <td>{u.locationName || u.location || "-"}</td>
                  <td>
                    {u.loginTime ? new Date(u.loginTime).toLocaleString() : "-"}
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
                      <span>
                        {Math.floor(
                          (Date.now() - new Date(u.loginTime)) / 1000 / 60
                        )}
                        m
                      </span>
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
                </tr>
              ))}
              {selected.tracked.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted">
                    No employees tracked by this teamlead
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="container py-3">
            <h2 class="mb-4 me-3">Live Teamlead Tracking</h2>

      <div className="row">
        <div className="col-md-3">
          <div className="card mb-3">
            <div className="card-body">
              <h5 className="mb-3">Team Leads</h5>
              {loading && <div className="text-muted mb-2">Loading…</div>}
              {teamlists.length === 0 && !loading && (
                <div className="text-muted">No team leads found</div>
              )}
              {teamlists.map((l) => (
                <div
                  key={l.teamlead._id}
                  className={`p-2 rounded mb-2 ${
                    selected &&
                    String(selected.teamlead._id) === String(l.teamlead._id)
                      ? " text-black"
                      : "bg-light"
    }`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(l)}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-1" >
                       {/* <span className="small text-muted ">
                        {l.teamlead.employeeId || ""}
                      </span> */}
                      <div className="fw-bold">{l.teamlead.name || "—"}</div>
                     
                    </div>
                    <div className="badge bg-secondary rounded-pill">
                      {(l.tracked || []).length}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-md-9">
          <div className="card mb-3">
            <div className="card-body">
              <h5>Team Members</h5>
              {renderRight()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

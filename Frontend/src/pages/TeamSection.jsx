import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as teamleadApi from "../api/teamleadApi";
import * as sessionApi from "../api/sessionApi";

export default function TeamSection() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");

  const [teamlists, setTeamlists] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const resp = await teamleadApi.getAllTracked(token);
      const lists = (resp.trackedByTeamlead || [])
        .map((l) => ({
          teamlead: l.teamlead || {},
          tracked: (l.tracked || []).filter((u) => u && u._id),
        }))
        // remove entries with no teamlead id OR no teamlead name (deleted TLs or incomplete data)
        .filter((l) => l.teamlead && l.teamlead._id && l.teamlead.name);

      try {
        const activeResp = await sessionApi.getActive(token);

        const activeMap = new Map(
          (activeResp.users || [])
            .filter((u) => u && u._id)
            .map((u) => [String(u._id), u])
        );

        const merged = lists.map((l) => ({
          teamlead: l.teamlead || {},
          tracked: l.tracked.map((u) => ({
            ...u,
            ...(activeMap.get(String(u._id)) || {}),
          })),
        }));

        setTeamlists(merged);

        // If current selected TL is gone, update selection
        if (selected) {
          const still = merged.find((m) => String(m.teamlead?._id) === String(selected.teamlead?._id));
          if (!still) setSelected(merged.length ? merged[0] : null);
        } else if (!selected && merged.length) setSelected(merged[0]);
      } catch (err) {
        console.warn("active merge failed", err);
        // filter out entries with no teamlead id
        const filteredLists = (lists || []).filter((l) => l.teamlead && l.teamlead._id && l.teamlead.name);
        setTeamlists(filteredLists);

        if (selected) {
          const still = filteredLists.find((m) => String(m.teamlead?._id) === String(selected.teamlead?._id));
          if (!still) setSelected(filteredLists.length ? filteredLists[0] : null);
        } else if (!selected && filteredLists.length) setSelected(filteredLists[0]);
      }
    } catch (err) {
      console.error("Failed to load team lists", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [token]);

  const renderRight = () => {
    if (!selected)
      return (
        <div className="text-muted fst-italic">
          Select a team lead to see their tracked employees
        </div>
      );

    if (loading) return <div className="text-muted">Loading team members…</div>;

    return (
      <div>
        <div className="mb-3 fw-semibold">
          Viewing <strong>{selected.teamlead?.name || "Unknown"}</strong> (
          {selected.teamlead?.employeeId || "-"}) —{" "}
          <span className="text-primary fw-bold">{selected.tracked.length}</span>{" "}
          tracked
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle shadow-sm rounded">
            <thead
              className="text-dark"
              style={{
                background: "linear-gradient(to right, #c2e9fb, #e0c3fc)",
                borderRadius: "6px",
              }}
            >
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
              {selected.tracked.map((u, index) => (
                <tr key={u?._id || index}>
                  <td>
                    <div className="fw-bold">{u?.name || "-"}</div>
                    <div className="small text-muted">{u?.employeeId || ""}</div>
                  </td>

                  <td>{u?.device || u?.ip || "-"}</td>
                  <td className="text-capitalize">{u?.role || "employee"}</td>
                  <td>{u?.locationName || u?.location || "-"}</td>

                  <td>
                    {u?.loginTime
                      ? new Date(u.loginTime).toLocaleString()
                      : "-"}
                  </td>

                  <td>
                    {u?.logoutTime
                      ? new Date(u.logoutTime).toLocaleString()
                      : "-"}
                  </td>

                  <td>
                    {typeof u?.totalDuration !== "undefined" &&
                    u?.totalDuration !== null ? (
                      `${Math.floor(u.totalDuration / 3600)}h ${Math.floor(
                        (u.totalDuration % 3600) / 60
                      )}m ${u.totalDuration % 60}s`
                    ) : u?.loginTime ? (
                      <span className="text-primary fw-semibold">
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
                      className={`badge px-3 py-2 rounded-pill ${
                        u?.status === "online"
                          ? "bg-success"
                          : u?.status === "disconnected"
                          ? "bg-warning text-dark"
                          : "bg-danger"
                      }`}
                    >
                      {u?.status || "offline"}
                    </span>
                  </td>
                </tr>
              ))}

              {selected.tracked.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-3">
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
      <h2 className="mb-4 fw-bold text-dark">Live Teamlead Tracking</h2>

      <div className="row">
        {/* LEFT SIDE */}
        <div className="col-md-3">
          <div
            className="card shadow-sm border-0 mb-3"
            style={{
              background: "linear-gradient(135deg, #c0f1f5ff, #bfd2f7ff)",
            }}
          >
            <div className="card-body">
              <h5 className="mb-3 fw-bold text-dark">Team Leads</h5>

              {loading && <div className="text-muted mb-2">Loading…</div>}

              {teamlists.length === 0 && !loading && (
                <div className="text-muted">No team leads found</div>
              )}

              {teamlists.map((l, index) => {
                const TL = l.teamlead || {};

                const isActive =
                  selected &&
                  selected.teamlead &&
                  String(selected.teamlead?._id) === String(TL?._id);

                return (
                  <div
                    key={TL?._id || index}
                    className={`p-3 rounded mb-2 shadow-sm teamlead-card ${
                      isActive ? "active" : ""
                    }`}
                    style={{
                      cursor: "pointer",
                      transition: "0.3s",
                      background: isActive
                        ? "linear-gradient(135deg, #d7e8ff, #ecebff)"
                        : "linear-gradient(135deg, #f7faff, #eef4ff)",
                    }}
                    onClick={() => TL?._id && setSelected(l)}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="fw-semibold">
                        {TL?.name || "Unknown TL"}
                      </div>

                      <div
                        className={`badge rounded-pill ${
                          isActive ? "bg-primary text-white" : "bg-secondary"
                        }`}
                      >
                        {(l.tracked || []).length}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="col-md-9">
          <div
            className="card shadow-sm border-0 mb-3"
            style={{
              background: "linear-gradient(135deg, #ffffff, #f4f7ff)",
            }}
          >
            <div className="card-body">{renderRight()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

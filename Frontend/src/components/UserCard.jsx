import React, { useState } from "react";
import Timer from "./Timer";
import { updateUser, deleteUser } from "../api/authApi";
import { useQueryClient } from "@tanstack/react-query";

export default function UserCard({ user, onUpdated, onDeleted, canEdit = true }) {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: user.name,
    employeeId: user.employeeId,
    role: user.role,
  });

  // derive initials and color for avatar
  const initials = (user.name || '')
    .split(' ')
    .map(s => s[0] || '')
    .slice(0,2)
    .join('')
    .toUpperCase() || '?';

  const hash = String(user._id || user.employeeId || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hue = hash % 360;
  const avatarStyle = { width: '32px', height: '32px', backgroundColor: `hsl(${hue} 65% 50%)` };

  const save = async () => {
    try {
      const resp = await updateUser(user._id, form, token);
      setEditing(false);
      if (onUpdated) onUpdated(resp.user);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || "Update failed");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this user?")) return;
    try {
      await deleteUser(user._id, token);
      if (onDeleted) onDeleted(user._id);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || "Delete failed");
    }
  };

  return (
    <tr>
      <td>
        <div className="d-flex align-items-center">
          <div
            className="rounded-circle text-white d-flex align-items-center justify-content-center me-2"
            style={avatarStyle}
          >
            {initials}
          </div>
          <div style={{ minWidth: 140 }}>
            {editing ? (
              <input
                className="form-control mb-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            ) : (
              <div>{user.name}</div>
            )}

            {editing ? (
              <input
                className="form-control"
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              />
            ) : (
              <div className="text-muted">{user.employeeId}</div>
            )}
          </div>
        </div>
      </td>

      <td>{typeof user.device !== 'undefined' && user.device !== null && user.device !== '' ? user.device : '-'}</td>
      <td>{user.role || 'employee'}</td>
      <td>{typeof user.location !== 'undefined' && user.location !== null && user.location !== '' ? user.location : '-'}</td>
      <td>
        {user.loginTime ? new Date(user.loginTime).toLocaleString() : "-"}
      </td>
      <td>
        {user.logoutTime ? new Date(user.logoutTime).toLocaleString() : "-"}
      </td>
      <td>
        {typeof user.totalDuration !== "undefined" ? (
          `${Math.floor(user.totalDuration / 3600)}h ${Math.floor(
            (user.totalDuration % 3600) / 60
          )}m ${user.totalDuration % 60}s`
        ) : (
          <Timer start={user.loginTime} />
        )}
      </td>
      <td>
        <span
          className={`badge ${
            user.status === "online"
              ? "bg-success"
              : user.status === "disconnected"
              ? "bg-warning"
              : "bg-danger"
          }`}
        >
          {user.status}
        </span>
      </td>
      <td>
        {canEdit ? (
          editing ? (
            <>
              <button className="btn btn-sm btn-success me-1" onClick={save}>
                <i className="bi bi-check-circle"/>
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  setEditing(false);
                  setForm({
                    name: user.name,
                    employeeId: user.employeeId,
                    role: user.role,
                  });
                }}
              >
                <i className="bi bi-x-circle"/>
              </button>
            </>
          ) : (
            <div className="d-flex">
              <button
                className="btn btn-sm btn-outline-primary me-1"
                onClick={() => setEditing(true)}
              >
                <i className="bi bi-pencil-square"/>
              </button>
              <button className="btn btn-sm btn-outline-danger" onClick={remove}>
                <i className="bi bi-trash"/>
              </button>
            </div>
          )
        ) : null}
      </td>
    </tr>
  );
}

import React, { useState } from 'react';
import Timer from './Timer';
import { updateUser, deleteUser } from '../api/authApi';
import { useQueryClient } from '@tanstack/react-query';

export default function UserCard({ user, onUpdated, onDeleted }) {
  const qc = useQueryClient();
  const token = qc.getQueryData(['token']) || localStorage.getItem('token');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user.name, employeeId: user.employeeId, role: user.role });

  const save = async () => {
    try {
      const resp = await updateUser(user._id, form, token);
      setEditing(false);
      if (onUpdated) onUpdated(resp.user);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || 'Update failed');
    }
  };

  const remove = async () => {
    if (!confirm('Delete this user?')) return;
    try {
      await deleteUser(user._id, token);
      if (onDeleted) onDeleted(user._id);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <tr>

      {/* {console.log('Rendering UserCard for user:', user)} */}
      <td>
        {editing ? <input className="form-control" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /> : user.name}
      </td>
      <td>
        {editing ? <input className="form-control" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} /> : user.employeeId}
      </td>
      <td>{user.loginTime ? new Date(user.loginTime).toLocaleString() : '-'}</td>
      <td>{user.logoutTime ? new Date(user.logoutTime).toLocaleString() : '-'}</td>
      <td>{typeof user.totalDuration !== 'undefined' ? `${Math.floor(user.totalDuration/3600)}h ${Math.floor((user.totalDuration%3600)/60)}m ${user.totalDuration%60}s` : <Timer start={user.loginTime} />}</td>
      <td>
        <span className={`badge ${user.status === 'online' ? 'bg-success' : user.status === 'disconnected' ? 'bg-warning' : 'bg-secondary'}`}>{user.status}</span>
      </td>
      <td>
        {editing ? (
          <>
            <button className="btn btn-sm btn-success me-1" onClick={save}>Save</button>
            <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(false); setForm({ name: user.name, employeeId: user.employeeId, role: user.role }); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn btn-sm btn-outline-danger" onClick={remove}>Delete</button>
          </>
        )}
      </td>
    </tr>
  );
}

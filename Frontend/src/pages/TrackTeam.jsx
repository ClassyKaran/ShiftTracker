import React, { useEffect, useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as teamleadApi from '../api/teamleadApi'
import * as authApi from '../api/authApi'
import * as sessionApi from '../api/sessionApi'
import { connectSocket, disconnectSocket } from '../context/socket'
import { toast } from 'react-toastify'
import Timer from '../components/Timer'

export default function TrackTeam() {
  const qc = useQueryClient();
  const token = qc.getQueryData(['token']) || localStorage.getItem('token');

  const [trackedDocs, setTrackedDocs] = useState([]); // tracked user profiles
  const [searchId, setSearchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [alerts, setAlerts] = useState({ lateJoin: [], extendedShift: [] });
  const socketRef = useRef(null);

  const fetchTracked = async () => {
    if (!token) return;
    try {
      const resp = await teamleadApi.getTracked(token);
      setTrackedDocs(resp.tracked || []);
    } catch (e) {
      console.error('Failed to fetch tracked', e);
    }
  };

  const mergeActiveInfo = async (profiles) => {
    if (!token) return profiles;
    try {
      const active = await sessionApi.getActive(token);
      const activeMap = new Map((active.users || []).map(u => [String(u._id), u]));
      return profiles.map(p => ({ ...p, ...(activeMap.get(String(p._id)) || {}) }));
    } catch (e) {
      return profiles;
    }
  };

  useEffect(() => {
    (async () => {
      await fetchTracked();
      try {
        const a = await sessionApi.getAlerts(token).catch(() => null);
        if (a) setAlerts(a);
      } catch (err) { void err; }
      try {
        const logs = await sessionApi.getLogs(token).catch(()=>({ sessions: [] }));
        setRecent(logs.sessions || []);
      } catch (e) { console.error(e); }

      // connect socket for realtime updates
      try {
        const socket = connectSocket(token);
        socketRef.current = socket;
        socket.on('users_list_update', async (data) => {
          // if any tracked users in the update, refresh tracked view
          const ids = new Set((data.users || []).map(u => String(u._id)));
          const trackedIds = new Set((await teamleadApi.getTracked(token)).tracked.map(t=>String(t._id || t.id)));
          const intersect = Array.from(trackedIds).some(id => ids.has(id));
          if (intersect) {
            const tracked = (await teamleadApi.getTracked(token)).tracked || [];
            const merged = await mergeActiveInfo(tracked);
            setTrackedDocs(merged);
          }
        });

        const pushRecent = (r) => {
          setRecent(prev => [r, ...prev].slice(0, 50));
        };

        socket.on('user_online', (u) => {
          pushRecent({ sessionId: u._id + '-on', user: u, status: 'online', createdAt: new Date().toISOString(), device: u.device });
          setTrackedDocs(prev => prev.map(p => String(p._id) === String(u._id) ? { ...p, ...u } : p));
        });
        socket.on('user_offline', (u) => {
          pushRecent({ sessionId: u._id + '-off', user: u, status: 'offline', createdAt: new Date().toISOString(), device: u.device });
          setTrackedDocs(prev => prev.map(p => String(p._id) === String(u._id) ? { ...p, ...u } : p));
        });
        socket.on('user_disconnected', (u) => {
          pushRecent({ sessionId: u._id + '-disc', user: u, status: 'disconnected', createdAt: new Date().toISOString(), device: u.device });
          setTrackedDocs(prev => prev.map(p => String(p._id) === String(u._id) ? { ...p, ...u } : p));
        });
      } catch (e) { console.error('socket connect failed', e); }
    })();

    return () => {
      try { if (socketRef.current) socketRef.current.off && socketRef.current.off(); } catch (err) { void err; }
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAdd = async () => {
    if (!searchId) return toast.warn('Enter employee ID');
    setLoading(true);
    try {
      // use lightweight lookup endpoint so teamleads don't need admin /users permission
      const resp = await authApi.findByEmployeeId(searchId, token).catch(() => null);
      const found = resp && resp.user ? resp.user : null;
      if (!found) {
        toast.error('Employee not found');
        return;
      }
      const current = await teamleadApi.getTracked(token);
      const ids = (current.tracked || []).map(t => String(t._id || t.id));
      if (ids.includes(String(found._id))) {
        toast.info('Employee already tracked');
        return;
      }
      ids.push(String(found._id));
      await teamleadApi.setTracked(token, ids);
      const tracked = (await teamleadApi.getTracked(token)).tracked || [];
      const merged = await mergeActiveInfo(tracked);
      setTrackedDocs(merged);
      toast.success('Employee added to tracked list');
      setSearchId('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add employee');
    } finally { setLoading(false); }
  };

  const handleRemove = async (id) => {
    setLoading(true);
    try {
      const current = await teamleadApi.getTracked(token);
      const ids = (current.tracked || []).map(t => String(t._id || t.id)).filter(x => String(x) !== String(id));
      await teamleadApi.setTracked(token, ids);
      const tracked = (await teamleadApi.getTracked(token)).tracked || [];
      const merged = await mergeActiveInfo(tracked);
      setTrackedDocs(merged);
      toast.success('Removed from tracked list');
    } catch (e) {
      console.error(e);
      toast.error('Failed to remove');
    } finally { setLoading(false); }
  };

  return (
    <div className="container py-3">
      <h3>Track Team</h3>
      <p className="text-muted">Add employees by their Employee ID to track their realtime status and history.</p>

      <div className="card mb-3">
        <div className="card-body row gx-2 gy-2 align-items-end">
          <div className="col-md-6">
            <label className="form-label">Employee ID</label>
            <input className="form-control" value={searchId} onChange={e=>setSearchId(e.target.value)} placeholder="Enter Employee ID" />
          </div>
          <div className="col-md-2">
            <button className="btn btn-primary w-100" onClick={handleAdd} disabled={loading}><i className="bi bi-person-plus me-2"/>Add</button>
          </div>
          <div className="col-md-4 text-end text-muted small">You can remove a user from tracked list using Remove action in the table.</div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <h5 className="mb-3">Tracked Users</h5>
          <div className="table-responsive">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Device</th>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Login Time</th>
                  <th>Logout Time</th>
                  <th>Active Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {trackedDocs.map(u => (
                  <tr key={u._id || u.id}>
                    <td>
                      <div className="fw-bold">{u.name || '-'}</div>
                      <div className="text-muted small">{u.employeeId || ''}</div>
                    </td>
                    <td>{u.device || u.ip || '-'}</td>
                    <td>{u.role || 'employee'}</td>
                    <td>{u.locationName || u.location || '-'}</td>
                    <td>{u.loginTime ? new Date(u.loginTime).toLocaleString() : '-'}</td>
                    <td>{u.logoutTime ? new Date(u.logoutTime).toLocaleString() : '-'}</td>
                    <td>{typeof u.totalDuration !== 'undefined' && u.totalDuration !== null ? `${Math.floor(u.totalDuration/3600)}h ${Math.floor((u.totalDuration%3600)/60)}m ${u.totalDuration%60}s` : (u.loginTime ? <Timer start={u.loginTime} /> : '-')}</td>
                    <td><span className={`badge ${u.status==='online' ? 'bg-success' : u.status==='disconnected' ? 'bg-warning' : 'bg-secondary'}`}>{u.status || 'offline'}</span></td>
                    <td>
                      <button className="btn btn-sm btn-outline-danger" onClick={()=>handleRemove(u._id)}><i className="bi bi-person-dash me-1"/>Remove</button>
                    </td>
                  </tr>
                ))}
                {trackedDocs.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted">No tracked employees. Add by Employee ID above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-7">
          <div className="card mb-3">
            <div className="card-body">
              <h5>Recent Activity</h5>
              <table className="table table-sm">
                <thead>
                  <tr><th>User</th><th>Action</th><th>Time</th><th>Device</th></tr>
                </thead>
                <tbody>
                  {recent.slice(0,20).map(r => (
                    <tr key={r.sessionId || r.user?._id || Math.random()}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className={`badge rounded-pill ${r.status==='online' ? 'bg-success' : r.status==='offline' ? 'bg-secondary' : 'bg-warning'}`}>{r.user?.name || '-'}</div>
                        </div>
                      </td>
                      <td>{r.status==='online' ? 'Login' : r.status==='offline' ? 'Logout' : 'Disconnected'}</td>
                      <td>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</td>
                      <td>{r.device || r.ip || '-'}</td>
                    </tr>
                  ))}
                  {recent.length===0 && <tr><td colSpan={4} className="text-center text-muted">No recent activity</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-md-5">
          <div className="card mb-3">
            <div className="card-body">
              <h5>Shift Alerts</h5>
              <h6 className="mt-2">Late Join</h6>
              <ul className="list-unstyled small">
                {(alerts?.lateJoin || []).map(a => (
                  <li key={a.sessionId}>{a.user?.name || '-'} — {a.loginTime ? new Date(a.loginTime).toLocaleTimeString() : '-'}</li>
                ))}
                {(alerts?.lateJoin || []).length === 0 && <li className="text-muted">No late joins</li>}
              </ul>
              <h6 className="mt-3">Recent Disconnects</h6>
              <ul className="list-unstyled small">
                {(alerts?.recentDisconnects || []).map(a => (
                  <li key={a.sessionId}>{a.user?.name || '-'} — {a.reason || 'disconnected'}</li>
                ))}
                {(alerts?.recentDisconnects || []).length === 0 && <li className="text-muted">No recent disconnects</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



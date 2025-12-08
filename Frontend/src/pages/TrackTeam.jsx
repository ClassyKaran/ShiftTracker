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
  const [_recent, set_Recent] = useState([]);
  const [alerts, setAlerts] = useState({ lateJoin: [], extendedShift: [] });
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupTitle, setPopupTitle] = useState('');
  const [popupRows, setPopupRows] = useState([]);
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
      } catch (err) { void err; }
      try {
        const logs = await sessionApi.getLogs(token).catch(()=>({ sessions: [] }));
        set_Recent(logs.sessions || []);
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
          set_Recent(prev => [r, ...prev].slice(0, 50));
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

  const handleOpenPopup = (type) => {
    const rows = [];
    const pushUser = (u, time) => rows.push({ name: u.name || '-', employeeId: u.employeeId || '', time });

    if (type === 'all') {
      trackedDocs.forEach((u) => {
        const t = u.status === 'offline' ? u.logoutTime : (u.loginTime || u.lastActivity);
        pushUser(u, t);
      });
      setPopupTitle('All tracked users');
    } else if (type === 'online') {
      trackedDocs.filter(u => u.status === 'online').forEach(u => pushUser(u, u.loginTime || u.lastActivity));
      setPopupTitle('Online tracked users');
    } else if (type === 'disconnected') {
      trackedDocs.filter(u => u.status === 'disconnected').forEach(u => pushUser(u, u.lastActivity || u.loginTime));
      setPopupTitle('Disconnected tracked users');
    } else if (type === 'offline') {
      trackedDocs.filter(u => u.status === 'offline').forEach(u => pushUser(u, u.logoutTime));
      setPopupTitle('Offline tracked users');
    } else if (type === 'latejoin') {
      (alerts?.lateJoin || []).forEach(a => rows.push({ name: a.user?.name || '-', employeeId: a.user?.employeeId || '', time: a.loginTime }));
      setPopupTitle('Late joiners');
    } else if (type === 'idle') {
      trackedDocs.filter(u => !!u.isIdle).forEach(u => pushUser(u, u.lastActivity || u.loginTime));
      setPopupTitle('Idle tracked users');
    }

    setPopupRows(rows);
    setPopupOpen(true);
  };

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

      {/* tabs / stats */}
      {(() => {
        const stats = {
          total: trackedDocs.length,
          online: trackedDocs.filter(u => u.status === 'online').length,
          disconnected: trackedDocs.filter(u => u.status === 'disconnected').length,
          offline: trackedDocs.filter(u => u.status === 'offline').length,
          idle: trackedDocs.filter(u => !!u.isIdle).length,
          lateJoin: (alerts?.lateJoin || []).length,
        };

        return (
          <div className="container-fluid py-2 ">
            <div className="d-flex align-items-center mb-3">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <small className="text-muted">Track Filters</small>
              </div>
            </div>

            <div className=" bg-white  p-2 mb-2 rounded">
              <div className="d-flex gap-3">
                <div className="tab-item active " role="button" onClick={() => handleOpenPopup('all')}>
                  <span>All </span>
                  <span style={{ width: 24, height: 24, display: 'inline-block', textAlign: 'center', color: '#fff', borderRadius: '50%', background: '#307feeff' }}>{stats.total}</span>
                </div>

                <div className="tab-item" role="button" onClick={() => handleOpenPopup('online')}>
                  <span>Online </span>
                  <span style={{ width: 24, height: 24, display: 'inline-block', textAlign: 'center', color: '#fff', borderRadius: '50%', background: '#2ecc71' }}>{stats.online}</span>
                </div>

                <div className="tab-item" role="button" onClick={() => handleOpenPopup('disconnected')}>
                  <span>Disconnected </span>
                  <span style={{ width: 24, height: 24, display: 'inline-block', textAlign: 'center', color: '#ffffffff', borderRadius: '50%', background: '#fcce00ff' }}>{stats.disconnected}</span>
                </div>

                <div className="tab-item" role="button" onClick={() => handleOpenPopup('offline')}>
                  <span>Offline </span>
                  <span style={{ width: 24, height: 24, display: 'inline-block', textAlign: 'center', color: '#fff', borderRadius: '50%', background: '#e74c3c' }}>{stats.offline}</span>
                </div>

                <div className="tab-item" role="button" onClick={() => handleOpenPopup('latejoin')}>
                  <span>Late Join </span>
                  <span style={{ width: 24, height: 24, display: 'inline-block', textAlign: 'center', color: '#fff', borderRadius: '50%', background: '#ff8000ff' }}>{stats.lateJoin || '0'}</span>
                </div>

                <div className="tab-item" role="button" onClick={() => handleOpenPopup('idle')}>
                  <span>Idle </span>
                  <span style={{ width: 24, height: 24, display: 'inline-block', textAlign: 'center', color: '#fff', borderRadius: '50%', background: '#000000ff' }}>{stats.idle || '0'}</span>
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
            <input className="form-control" value={searchId} onChange={e=>setSearchId(e.target.value)} placeholder="Enter Employee ID" />
          </div>
          <div className="col-md-2">
            <button className="btn btn-primary w-100" onClick={handleAdd} disabled={loading}><i className="bi bi-person-plus me-2"/>Add</button>
          </div>
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
          <div className="p-3 d-flex justify-content-between align-items-center border-bottom">
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

    
    </div>
  )
}



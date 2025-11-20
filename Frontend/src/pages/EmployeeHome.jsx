import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '../context/socket';
import useSession from '../hooks/useSession';
import Timer from '../components/Timer';
import './employeeHome.css';
import createIdleTracker from '../utils/idle';
import { formatTime, durationSeconds } from '../utils/time';

export default function EmployeeHome() {
  const qc = useQueryClient();
  const token = qc.getQueryData(['token']) || localStorage.getItem('token');

  const { start, end } = useSession();
  const [session, setSession] = useState(null);
  const [deviceType, setDeviceType] = useState('Unknown');

// console.log('Current session:', session);


  const detectDevice = () => {
    const ua = navigator.userAgent || '';
    if (/mobile/i.test(ua)) return 'Mobile';
    if (/tablet/i.test(ua)) return 'Tablet';
    return 'Desktop';
  };

  useEffect(() => {
    let socket = null;

    (async () => {
      try {
        // detect device early and pass to start so server stores device type
        const detected = detectDevice();
        setDeviceType(detected);
        const res = await start(token, { device: detected });
        setSession(res.session);


        // connect socket after session start so server-side session exists
        try {
          socket = connectSocket(token);
          socket.on('connect', () => console.log('socket connected'));
          socket.on('disconnect', () => console.log('socket disconnected'));

          // start idle/heartbeat tracker
          const idle = createIdleTracker(socket, { idleMs: 5 * 60 * 1000, heartbeatMs: 30 * 1000 });
          idle.start();
          // store for cleanup
          window.__idleTracker = idle;
        } catch (e) {
          console.warn('socket/idle init failed', e);
        }
      } catch (err) {
        console.error('start session failed', err);
        toast.error('Could not start session');
      }
    })();

    const handleUnload = async () => {
      try {
        const s = qc.getQueryData(['activeSession']) || session;
        if (s && s._id) {
          const payload = JSON.stringify({ sessionId: s._id, token });
          const url = (window.__REACT_APP_API__ || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000') + '/api/session/end-beacon';
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url, payload);
          } else {
            // keepalive fetch as fallback
            try {
              await fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true });
            } catch (e) {
              console.warn('beacon fallback failed', e);
            }
          }
        }
      } catch {
        /* best-effort */
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      try {
        if (window.__idleTracker && typeof window.__idleTracker.stop === 'function') window.__idleTracker.stop();
      } catch {
        /* ignore */
      }
      window.removeEventListener('beforeunload', handleUnload);
      try { disconnectSocket(); } catch (err) { console.warn('disconnect failed', err); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
      await end(token, session?._id);
      disconnectSocket();
      window.location.href = '/login';
    } catch {
      toast.error('Error logging out');
    }
  };

  return (
    <div className="shift-page">
      <div className="shift-card">
        <div className="shift-header">
          <div className="icon-placeholder" />
          <div>
            <h2 className="shift-title">Shift Tracking</h2>
            <p className="shift-sub">Track your working hours</p>
          </div>
        </div>

        <div className="active-card">
          <div className="active-label">Active Duration</div>
          <div className="active-timer">
            <Timer start={session?.loginTime} />
          </div>
          <div className="active-date">
            {session?.loginTime ? new Date(session.loginTime).toLocaleDateString() : '-'}
          </div>
        </div>

        <ul className="info-list">
          <li>
            <span className="info-icon bg-primary" />
            <span className="info-label">Device</span>
            <span className="info-value">{deviceType}</span>
          </li>

          <li>
            <span className="info-iconl bg-warning" />
            <span className="info-label">Location</span>
            <span className="info-value">{session?.locationName || session?.location || '-'}</span>
          </li>
        </ul>

        <div className="card-actions">
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>

        <div className="shift-footer">Session ID: <span className="mono">{session?._id || '-'}</span></div>
      </div>



















      <div className="tablehistory">
        <div className="tablehistoryheader">
          <div className="icon-placeholder"><i className="bi bi-clock-history" /></div>
          <div>
            <h2 className="shift-title">Shift Tracking History</h2>
            <p className="shift-sub">Track your working hours</p>
          </div>
        </div>
        <HistoryTable session={session} token={token} />
      </div>
    </div>
  );
}

function HistoryTable({ session, token }) {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(2);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = { page: p, limit };
      if (from) params.from = new Date(from).toISOString();
      if (to) {
        const d = new Date(to);
        d.setHours(23,59,59,999);
        params.to = d.toISOString();
      }
      const api = await import('../api/sessionApi');
      const res = await api.getLogs(token, params);
      setLogs(res.sessions || []);
      setPage(res.page || p);
      setTotal(res.total || 0);
    } catch (e) {
      console.error('fetchLogs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const applyFilters = () => fetchLogs(1);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div className="card">
        <div className="card-header">Filters</div>
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label">Start Date</label>
              <input value={from} onChange={e => setFrom(e.target.value)} type="date" className="form-control" />
            </div>
            <div className="col-md-4">
              <label className="form-label">End Date</label>
              <input value={to} onChange={e => setTo(e.target.value)} type="date" className="form-control" />
            </div>
            <div className="col-md-4">
              <button className="btn btn-filter w-100 mt-2 text-light" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-3">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Login</th>
                  <th>Logout</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="text-center">Loading...</td></tr>
                )}
                {!loading && logs.length === 0 && (
                  <tr><td colSpan={5} className="text-center">No records</td></tr>
                )}
                {!loading && logs.map(s => (
                  <tr key={s.sessionId}>
                    <td>{new Date(s.loginTime).toLocaleDateString()}</td>
                    <td>{formatTime(s.loginTime)}</td>
                    <td>{s.logoutTime ? formatTime(s.logoutTime) : '--:--:--'}</td>
                    <td>{s.totalDuration ? new Date(s.totalDuration * 1000).toISOString().substr(11,8) : (s.status==='online' ? new Date(durationSeconds(s.loginTime)*1000).toISOString().substr(11,8) : '00:00:00')}</td>
                    <td><span className={`badge ${s.status==='online' ? 'bg-success' : s.status==='offline' ? 'bg-secondary' : 'bg-warning'}`}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-footer d-flex justify-content-between align-items-center">
          <div>Showing page {page} of {totalPages} — {total} records</div>
          <div>
            <button className="btn btn-sm btn-outline-secondary me-2" disabled={page<=1} onClick={() => fetchLogs(page-1)}>Prev</button>
            <button className="btn btn-sm btn-outline-secondary" disabled={page>=totalPages} onClick={() => fetchLogs(page+1)}>Next</button>
          </div>
        </div>
      </div>
    </>
  );
}

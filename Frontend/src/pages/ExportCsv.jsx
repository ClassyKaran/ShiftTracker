import React, { useState } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import * as sessionApi from '../api/sessionApi';

export const ExportCsv = () => {
  const qc = useQueryClient();
  const token = qc.getQueryData(['token']) || localStorage.getItem('token');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [aggregates, setAggregates] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const downloadFile = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    if (!from || !to) return toast.warn('Choose a start and end date');
    setLoading(true);
    try {
      const params = { from, to };
      if (employeeId) params.employeeId = employeeId;
      if (status) params.status = status;

      const blob = await sessionApi.exportLogsCSV(token, params);
      const fileName = `sessions-${from}_${to}.csv`;
      downloadFile(blob, fileName);
      toast.success('CSV download started');
    } catch (err) {
      console.error('export csv failed', err);
      toast.error('Failed to download CSV');
    } finally { setLoading(false); }
  };

  // fetch logs and compute per-employee aggregates for preview
  const fetchRecords = async () => {
    if (!from || !to) return toast.warn('Choose a start and end date');
    setLoadingRecords(true);
    try {
      // fetch up to 1000 records matching range — backend caps at 1000
      const params = { from, to, limit: 1000 };
      if (employeeId) params.employeeId = employeeId;
      if (status) params.status = status;
      const resp = await sessionApi.getLogs(token, params);
      const sessions = resp.sessions || [];
      setRecords(sessions);

      // aggregate per user/employee
      const map = new Map();
      for (const s of sessions) {
        const key = s.user?.employeeId || (s.user?.id || s.user?.name || 'unknown');
        const name = s.user?.name || '';
        const empId = s.user?.employeeId || '';
        const cur = map.get(key) || { name, employeeId: empId, count: 0, totalDuration: 0, firstLogin: null, lastLogout: null };
        cur.count += 1;
        cur.totalDuration += Number(s.totalDuration || 0);
        if (!cur.firstLogin || new Date(s.loginTime) < new Date(cur.firstLogin)) cur.firstLogin = s.loginTime;
        if (!cur.lastLogout || (s.logoutTime && new Date(s.logoutTime) > new Date(cur.lastLogout))) cur.lastLogout = s.logoutTime;
        map.set(key, cur);
      }

      const agg = Array.from(map.values()).map(a => ({
        ...a,
        avgDuration: a.count ? Math.floor(a.totalDuration / a.count) : 0,
      }));
      setAggregates(agg);
    } catch (err) {
      console.error('fetch records failed', err);
      toast.error('Failed to fetch records (preview)');
    } finally { setLoadingRecords(false); }
  };

  const downloadAggregatedCsv = () => {
    if (!aggregates || aggregates.length === 0) return toast.info('No aggregated data to export');
    const header = ['employeeId', 'name', 'sessions', 'totalDurationSeconds', 'totalDurationHHMMSS', 'avgDurationSeconds', 'avgDurationHHMMSS', 'firstLogin', 'lastLogout'];
    const rows = aggregates.map(a => {
      const total = Number(a.totalDuration || 0);
      const avg = Number(a.avgDuration || 0);
      const row = [a.employeeId || '', a.name || '', a.count || 0, total, new Date(total * 1000).toISOString().substr(11,8), avg, new Date(avg * 1000).toISOString().substr(11,8), a.firstLogin ? new Date(a.firstLogin).toISOString() : '', a.lastLogout ? new Date(a.lastLogout).toISOString() : ''];
      return row.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',');
    });
    const csv = header.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `employee_aggregates_${from}_${to}.csv`);
  };

  return (
    <div className="container py-4">
      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h3 className="mb-0">Export Sessions CSV</h3>
              <div className="text-muted small">Select a date range and optional filters to export session logs</div>
            </div>
          </div>

          <div className="row g-3 align-items-end">
            <div className="col-sm-6 col-md-3">
              <label className="form-label">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="form-control" />
            </div>
            <div className="col-sm-6 col-md-3">
              <label className="form-label">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="form-control" />
            </div>

            <div className="col-sm-6 col-md-3">
              <label className="form-label">Employee ID (optional)</label>
              <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="e.g. EMP123" className="form-control" />
            </div>

            <div className="col-sm-6 col-md-3">
              <label className="form-label">Status (optional)</label>
              <select value={status} onChange={e=>setStatus(e.target.value)} className="form-select">
                <option value="">Any</option>
                <option value="online">online</option>
                <option value="disconnected">disconnected</option>
                <option value="offline">offline</option>
              </select>
            </div>

            <div className="col-12 d-flex justify-content-end mt-2">
              <button className="btn btn-outline-secondary me-2" onClick={() => { setFrom(''); setTo(''); setEmployeeId(''); setStatus(''); }} disabled={loading}>Reset</button>
              <button className="btn btn-primary" onClick={handleDownload} disabled={loading}>
                {loading ? (
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden></span>
                ) : null}
                Download CSV
              </button>
            </div>
          </div>

          {/* Employee records / aggregates preview */}
          <div className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Employee Records preview</h5>
              <div>
                <button className="btn btn-outline-secondary me-2" onClick={fetchRecords} disabled={loadingRecords}>Show Records</button>
                <button className="btn btn-sm btn-success" onClick={downloadAggregatedCsv} disabled={!aggregates || aggregates.length===0}>Download Aggregated CSV</button>
              </div>
            </div>

            {loadingRecords ? (
              <div className="text-center py-4"><div className="spinner-border text-primary" role="status"/></div>
            ) : (
              <div>
                <div className="table-responsive">
                  <table className="table table-striped table-sm">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Sessions</th>
                        <th>Total Duration</th>
                        <th>Avg Duration</th>
                        <th>First Login</th>
                        <th>Last Logout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregates.length === 0 && (
                        <tr><td colSpan={6} className="text-center text-muted">No preview data. Click "Show Records"</td></tr>
                      )}
                      {aggregates.map((a, idx) => (
                        <tr key={idx}>
                          <td><div className="fw-bold">{a.name||"-"}</div><div className="text-muted small">{a.employeeId||"-"}</div></td>
                          <td>{a.count}</td>
                          <td>{new Date((a.totalDuration||0)*1000).toISOString().substr(11,8)}</td>
                          <td>{new Date((a.avgDuration||0)*1000).toISOString().substr(11,8)}</td>
                          <td>{a.firstLogin ? new Date(a.firstLogin).toLocaleString() : '-'}</td>
                          <td>{a.lastLogout ? new Date(a.lastLogout).toLocaleString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {records.length > 0 && (
                  <div className="text-muted small mt-2">Showing up to {records.length} session records for preview (backend limits to 1000).</div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ExportCsv;

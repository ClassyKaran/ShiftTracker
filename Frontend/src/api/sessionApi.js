import axios from './authApi';

const authHeaders = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export const startSession = (token, body = {}) => axios.post('/session/start', body, authHeaders(token)).then(r => r.data);
export const endSession = (token, sessionId) => axios.post('/session/end', { sessionId }, authHeaders(token)).then(r => r.data);
export const endBeacon = (body = {}) => axios.post('/session/end-beacon', body).then(r => r.data);
export const getActive = (token) => axios.get('/session/active', authHeaders(token)).then(r => r.data);
export const getLogs = (token, params = {}) => axios.get('/session/logs', { ...authHeaders(token), params }).then(r => r.data);
export const getStats = (token) => axios.get('/session/stats', authHeaders(token)).then(r => r.data);
export const getAlerts = (token) => axios.get('/session/alerts', authHeaders(token)).then(r => r.data);
export const exportLogsCSV = (token, params = {}) => axios.get('/session/export', { ...authHeaders(token), params, responseType: 'blob' }).then(r => r.data);

export const activity = (token, body = {}) => axios.post('/session/activity', body, authHeaders(token)).then(r => r.data);

export default {};

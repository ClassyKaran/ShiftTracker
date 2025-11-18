import axios from './authApi';

export const startSession = (token) => axios.post('/session/start', {}, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);
export const endSession = (token, sessionId) => axios.post('/session/end', { sessionId }, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);
export const getActive = (token) => axios.get('/session/active', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);
export const getLogs = (token) => axios.get('/session/logs', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);

export default {};

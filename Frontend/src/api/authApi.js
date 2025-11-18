import axios from 'axios';

// resolve base url safely without referencing 'import.meta' directly (avoid parser/runtime issues)
const BASE = (typeof window !== 'undefined' && (window.__REACT_APP_API_URL__ || window.__VITE_API_URL__)) || 'http://localhost:5000/api';

const API = axios.create({ baseURL: BASE });

export const login = ({ employeeId, password }) => API.post('/auth/login', { employeeId, password }).then(r => r.data);
export const me = (token) => API.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);
export const addUser = (data, token) => API.post('/auth/add-user', data, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);

export default API;

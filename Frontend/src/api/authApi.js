import axios from "axios";

// default to backend on localhost if env var not provided
const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  withCredentials: true,
});

export const login = ({ employeeId, password }) =>
  API.post("/auth/login", { employeeId, password }).then((r) => r.data);
export const me = (token) =>
  API.get("/auth/me", { headers: { Authorization: `Bearer ${token}` } }).then(
    (r) => r.data
  );
export const addUser = (data, token) =>
  API.post("/auth/add-user", data, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.data);

export const updateUser = (id, data, token) =>
  API.put(`/auth/user/${id}`, data, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);

export const deleteUser = (id, token) =>
  API.delete(`/auth/user/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);

export const getUsers = (token) =>
  API.get('/auth/users', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);

export const findByEmployeeId = (employeeId, token) =>
  API.get(`/auth/user-by-employee?employeeId=${encodeURIComponent(employeeId)}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data);

export default API;

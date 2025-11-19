import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
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

export default API;

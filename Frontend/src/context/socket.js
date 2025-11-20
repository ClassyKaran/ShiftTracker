import { io } from 'socket.io-client';

let socket = null;
let _lastToken = null;

export const connectSocket = (token) => {
  const BASE = (typeof window !== 'undefined' && (window.__REACT_APP_SOCKET_URL__ || window.__VITE_SOCKET_URL__)) || 'http://localhost:5000';
  // if we already have a socket but token changed, recreate connection
  if (socket && _lastToken && token && String(_lastToken) !== String(token)) {
    try { socket.disconnect(); } catch (e) {}
    socket = null;
    _lastToken = null;
  }

  if (socket) {
    // ensure connected
    try { if (!socket.connected) socket.connect(); } catch (e) {}
    return socket;
  }

  _lastToken = token;
  socket = io(BASE, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });

  // defensive listeners for debugging
  socket.on('connect_error', (err) => console.warn('socket connect_error', err && err.message));
  socket.on('reconnect_error', (err) => console.warn('socket reconnect_error', err && err.message));
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};

export default { connectSocket, getSocket, disconnectSocket };

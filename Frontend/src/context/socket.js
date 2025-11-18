import { io } from 'socket.io-client';

let socket = null;

export const connectSocket = (token) => {
  if (socket) return socket;
  const BASE = (typeof window !== 'undefined' && (window.__REACT_APP_SOCKET_URL__ || window.__VITE_SOCKET_URL__)) || 'http://localhost:5000';
  socket = io(BASE, {
    auth: { token },
    transports: ['websocket'],
  });
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};

export default { connectSocket, getSocket, disconnectSocket };

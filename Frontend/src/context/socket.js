import { io } from "socket.io-client";

let socket = null;
let _lastToken = null;

export const connectSocket = (token) => {
  // Connect to backend server explicitly
  const BASE = "http://localhost:5000";
  
  // if we already have a socket but token changed, recreate connection
  if (socket && _lastToken && token && String(_lastToken) !== String(token)) {
    try {
      socket.disconnect();
    } catch {
      // ignore
    }
    socket = null;
    _lastToken = null;
  }

  if (socket) {
    // ensure connected
    try {
      if (!socket.connected) socket.connect();
    } catch{
      // ignore
    }
    return socket;
  }

  _lastToken = token;
  socket = io(BASE, {
    auth: { token },
    autoConnect: true,
  });

  // defensive listeners for debugging
  socket.on("connect", () =>
    console.info("[Socket] Connected", socket.id, "to", BASE)
  );
  socket.on("connect_error", (err) =>
    console.warn("[Socket] connect_error", err && err.message)
  );
  socket.on("reconnect_error", (err) =>
    console.warn("[Socket] reconnect_error", err && err.message)
  );
  socket.on("disconnect", (reason) =>
    console.warn("[Socket] Disconnected:", reason)
  );
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};

export default { connectSocket, getSocket, disconnectSocket };

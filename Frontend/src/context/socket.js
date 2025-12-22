import { io } from "socket.io-client";

let socket = null;
let _lastToken = null;

export const connectSocket = (token) => {
  // Prefer configured socket URL, otherwise connect to same origin where the app is served
  const BASE =
    (typeof window !== "undefined" &&
      (window.__REACT_APP_SOCKET_URL__ ||
        window.__VITE_SOCKET_URL__ ||
        window.location.origin)) ||
    "";
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
    console.info("socket connected", socket.id, "->", BASE)
  );
  socket.on("connect_error", (err) =>
    console.warn("socket connect_error", err && err.message)
  );
  socket.on("reconnect_error", (err) =>
    console.warn("socket reconnect_error", err && err.message)
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

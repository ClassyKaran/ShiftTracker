// Minimal idle detector + heartbeat sender
export default function createIdleTracker(socket, options = {}) {
  const idleMs = options.idleMs || 5 * 60 * 1000; // 5 minutes default
  const heartbeatMs = options.heartbeatMs || 30 * 1000; // heartbeat every 30s
  let lastActivity = Date.now();
  let isIdle = false;
  let heartbeatTimer = null;

  function onActivity() {
    lastActivity = Date.now();
    if (isIdle) {
      isIdle = false;
      sendHeartbeat();
    }
  }

  function checkIdle() {
    const now = Date.now();
    const shouldIdle = now - lastActivity > idleMs;
    if (shouldIdle && !isIdle) {
      isIdle = true;
      sendHeartbeat();
    }
  }

  function sendHeartbeat() {
    try {
      if (socket && socket.connected) {
        socket.emit('heartbeat', { ts: Date.now(), isIdle });
      }
    } catch (e) {}
  }

  function start() {
    ['mousemove','keydown','scroll','touchstart'].forEach(ev => window.addEventListener(ev, onActivity, { passive:true }));
    heartbeatTimer = setInterval(() => { checkIdle(); sendHeartbeat(); }, heartbeatMs);
  }

  function stop() {
    ['mousemove','keydown','scroll','touchstart'].forEach(ev => window.removeEventListener(ev, onActivity));
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  return { start, stop, isIdle: () => isIdle, sendHeartbeat };
}

// heartbeat.js
export function setupHeartbeat(wss, interval = 30000) {
  function noop() {}

  function heartbeat() {
    this.isAlive = true;
  }

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", heartbeat);
  });

  const timer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping(noop);
    });
  }, interval);

  return () => clearInterval(timer);
}
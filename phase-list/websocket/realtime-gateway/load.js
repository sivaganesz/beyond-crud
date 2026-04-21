// load.js
import WebSocket from "ws";
import jwt from "jsonwebtoken";

const SECRET = "phase1secret";
const TOTAL_CLIENTS = 6000; // increase gradually

function token(id) {
  return jwt.sign({ username: "user" + id }, SECRET);
}

for (let i = 0; i < TOTAL_CLIENTS; i++) {
  const ws = new WebSocket(
    `ws://localhost:8080?token=${token(i)}`
  );

  ws.on("open", () => {
    ws.send(JSON.stringify({ type: "join", room: "load" }));

    setInterval(() => {
      ws.send(
        JSON.stringify({
          type: "chat",
          room: "load",
          text: "ping " + i,
        })
      );
    }, 10000);
  });
}
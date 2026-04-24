process.on("uncaughtException", console.error);
let isShuttingDown = false;
const DRAIN_TIMEOUT = 2000; // 15s to drain

let connections = 0;

setInterval(() => {
    const mem = process.memoryUsage();
    console.log({
        connections,
        rssMB: (mem.rss / 1024 / 1024).toFixed(1),
        heapMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
    });
}, 5000);

// server.js
import http from "http";
import { WebSocketServer } from "ws";
import { verifyToken, createToken } from "./auth.js";
import { joinRoom, leaveAllRooms, broadcast, sendDirectMessage, userSockets, initMessenger, syncDMHistory } from "./rooms.js";
import { setupHeartbeat } from "./heartbeat.js";
import { setUserOnline, setUserOffline, getAllOnlineUsers } from "./presence.js";
import { register, Gauge, Counter } from "prom-client";

// ---- Phase 8: Metrics Setup ----
const activeConnections = new Gauge({
    name: "ws_active_connections",
    help: "Number of active WebSocket connections",
    labelNames: ["server_id"]
});

const messagesReceived = new Counter({
    name: "ws_messages_received_total",
    help: "Total number of messages received",
    labelNames: ["server_id", "type"]
});

const PORT = process.env.PORT || 8080;
const SERVER_ID = `server:${PORT}`;

// Initialize the DM/Room transport for this server
initMessenger(SERVER_ID);

const server = http.createServer(async (req, res) => {
    // Expose Prometheus metrics
    if (req.url === "/metrics") {
        res.setHeader("Content-Type", register.contentType);
        res.end(await register.metrics());
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocketServer({ noServer: true });
setupHeartbeat(wss);

// ---- Upgrade with JWT auth ----
server.on("upgrade", (req, socket, head) => {
    if (isShuttingDown) {
        socket.destroy();
        return;
    }
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    try {
        const user = verifyToken(token);

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req, user);
        });
    } catch {
        socket.destroy();
    }
});

// ---- Connection lifecycle ----
wss.on("connection", async (ws, req, user) => {
    ws.user = user;           // per-socket user state
    ws.rooms = new Set();     // rooms this socket joined
    ws.msgCount = 0;          // simple rate limit counter

    connections++; // Increment connection count
    activeConnections.inc({ server_id: SERVER_ID });

    // Track user socket locally for DMs
    userSockets.set(user.username, ws);

    await setUserOnline(user.username, SERVER_ID);
    ws.send(`Welcome ${user.username} to ${SERVER_ID}`);

    ws.on("message", async (buf) => {
        messagesReceived.inc({ server_id: SERVER_ID, type: "total" });
        // ---- Basic rate limit ----
        ws.msgCount++;
        if (ws.msgCount > 100) {
            ws.send("Rate limit exceeded");
            return;
        }

        const msg = buf.toString();
        let data;
        try {
            data = JSON.parse(msg);
            if (data.type) {
                messagesReceived.inc({ server_id: SERVER_ID, type: data.type });
            }
        } catch {
            return;
        }

        if (data.type === "join") {
            // Support passing lastMsgId for history sync
            await joinRoom(data.room, ws, data.lastMsgId);
            ws.send(`Joined room ${data.room}`);
        }

        if (data.type === "who-is-online") {
            const users = await getAllOnlineUsers();
            ws.send(JSON.stringify({ type: "online-list", users }));
        }

        // ---- NEW: DM Handling ----
        if (data.type === "dm") {
            const success = await sendDirectMessage(data.to, ws.user.username, data.text, data.lastMsgId);
            if (!success) {
                ws.send(JSON.stringify({ type: "error", message: `User ${data.to} is offline` }));
            }
        }

        if (data.type === "chat") {
            // New signature: roomId, fromUser, text
            await broadcast(data.room, ws.user.username, data.text);
        }
        if (data.type === "dm-sync") {
            await syncDMHistory(ws.user.username, ws, data.lastMsgId);
            return;
        }
    });

    ws.on("close", async () => {
        connections--;
        activeConnections.dec({ server_id: SERVER_ID });
        userSockets.delete(user.username);
        leaveAllRooms(ws);
        await setUserOffline(user.username);
    });
});

server.listen(PORT, () => {
    console.log("WS Gateway running on ws://localhost:" + PORT);
    console.log(
        "Demo token for testing:",
        createToken("venkat")
    );
});

function gracefulShutdown() {
    console.log("⚠️  SIGTERM received. Draining connections...");
    isShuttingDown = true;

    // Stop accepting new TCP connections
    server.close(() => {
        console.log("HTTP server closed");
    });

    // Politely ask clients to close
    wss.clients.forEach((ws) => {
        if (ws.readyState === 1) {
            ws.send("Server shutting down. Please reconnect.");
            ws.close();
        }
    });

    // Force kill after timeout
    setTimeout(() => {
        console.log("Force closing remaining sockets");
        wss.clients.forEach((ws) => ws.terminate());
        process.exit(0);
    }, DRAIN_TIMEOUT);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown); // Ctrl+C
# Realtime Gateway Documentation

This document provides a detailed breakdown of the files and functions within the `realtime-gateway` project.

## `server.js`
The entry point of the application. It initializes the HTTP server, handles WebSocket upgrades with authentication, and manages the connection lifecycle.

*   **`wss.on("connection", ...)`** — Handles new WebSocket connections. It initializes per-socket state (user, rooms, message count), sets up message listeners for joining rooms and chatting, and handles socket closure.
*   **`gracefulShutdown()`** — Initiates a controlled shutdown process. It stops accepting new connections, notifies existing clients to reconnect, and terminates remaining sockets after a 15-second drain timeout.
*   **`setInterval (Monitoring)`** — Logs system metrics (total connections, RSS memory, and Heap usage) every 5 seconds to console.

## `auth.js`
Handles JSON Web Token (JWT) operations for secure client authentication.

*   **`createToken(username)`** — Generates a new JWT for a given username, signed with a secret key and set to expire in 2 hours.
*   **`verifyToken(token)`** — Validates a provided JWT against the secret key and returns the decoded payload if successful.

## `heartbeat.js`
Implements a "keep-alive" mechanism to detect and prune "zombie" connections.

*   **`setupHeartbeat(wss, interval)`** — Sets up a global interval (defaulting to 30 seconds) that pings all connected clients. If a client fails to respond with a 'pong' before the next check, it is terminated.
*   **`heartbeat()`** — A callback function attached to the 'pong' event that marks a socket as alive.

## `rooms.js`
Manages the logic for grouping connections into rooms and broadcasting messages efficiently.

*   **`safeSend(ws, message)`** — Sends a message to a specific client while checking for backpressure. If the client's buffer exceeds 1MB, the connection is terminated to prevent memory exhaustion.
*   **`joinRoom(roomId, ws)`** — Adds a WebSocket client to a specific room's set and tracks the room within the client's own room list.
*   **`leaveAllRooms(ws)`** — Removes a client from all rooms they have joined; typically called on disconnection.
*   **`broadcast(roomId, message)`** — Iterates through all clients in a specific room and sends them the provided message using `safeSend`.

## `load.js`
A performance testing script used to simulate high concurrency.

*   **`token(id)`** — A helper function to generate unique JWTs for simulated users.
*   **`for loop (Client Simulation)`** — Spawns 1000 (configurable) WebSocket clients that connect, join a "load" room, and send periodic "chat" messages to stress test the gateway.

## `client/` (React Dashboard)
A modern "Systems Architect Dashboard" built with React, TypeScript, and Tailwind CSS. It visualizes the entire distributed system.

### Features
*   **Presence Tracking:** See who is online across the entire cluster with "Green Dot" status.
*   **Cross-Server Messaging:** Send DMs that are routed between different gateway nodes via Redis.
*   **Room Synchronization:** Chat in rooms with automatic history catch-up on join.
*   **Observability:** Real-time feedback on connection status and which specific server node you are connected to.

### Running the Full System
1.  **Start Redis** (Standard 6379 port).
2.  **Start Worker:** `node worker.js`
3.  **Start Gateways:**
    *   Node 1: `$env:PORT=8080; node server.js`
    *   Node 2: `$env:PORT=8081; node server.js`
4.  **Start UI:**
    ```bash
    cd client
    npm install
    npm run dev
    ```
5.  **Open Browser:** Open `http://localhost:5173`. You can open multiple tabs and connect to different ports to see the distributed system in action.

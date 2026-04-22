// rooms.js
import Redis from "ioredis";
import { getUserLocation } from "./presence.js";

const MAX_BUFFER = 1 * 1024 * 1024; // 1MB safety
const CHUNK_SIZE = 200; // Send to 200 users, then yield to Event Loop

const redisPub = new Redis();
const redisSub = new Redis();

const rooms = new Map(); // Local sockets: Map<roomId, Set<socket>>
export const userSockets = new Map(); // Local sockets: Map<username, socket>

let currentServerId = null;

export function initMessenger(serverId) {
  currentServerId = serverId;
  redisSub.subscribe(`${serverId}:dm`);
}

// ---- Optimized Message Handling ----
redisSub.on("message", async (channel, message) => {
  if (channel.startsWith("room:")) {
    const roomId = channel.replace("room:", "");
    const localClients = Array.from(rooms.get(roomId) || []);
    
    // MASTER MOVE: Chunked Broadcasting
    // We process the list in small batches to keep the Event Loop free.
    await chunkedBroadcast(localClients, message);
  }

  if (channel === `${currentServerId}:dm`) {
    const data = JSON.parse(message);
    const targetSocket = userSockets.get(data.to);
    if (targetSocket) {
      safeSend(targetSocket, JSON.stringify({
        type: "dm",
        from: data.from,
        text: data.text
      }));
    }
  }
});

/**
 * Sends a message to a large list of clients without blocking the Event Loop.
 */
async function chunkedBroadcast(clients, payload) {
  for (let i = 0; i < clients.length; i += CHUNK_SIZE) {
    const chunk = clients.slice(i, i + CHUNK_SIZE);
    
    // Send to this chunk
    for (const client of chunk) {
      safeSend(client, payload);
    }

    // YIELD: Allow other tasks (like new connections) to run
    if (i + CHUNK_SIZE < clients.length) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}

export function safeSend(ws, message) {
  if (ws.readyState !== 1) return;
  
  // High-Performance Backpressure: 
  // If the client's buffer is too full, we skip THIS message instead of killing them.
  // This is how Discord handles "laggy" users in big rooms.
  if (ws.bufferedAmount > MAX_BUFFER) {
    return; 
  }

  ws.send(message);
}

// ... (joinRoom, leaveAllRooms, broadcast, sendDirectMessage remain same)

export function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
    redisSub.subscribe(`room:${roomId}`);
  }
  rooms.get(roomId).add(ws);
  ws.rooms.add(roomId);
}

export function leaveAllRooms(ws) {
  for (const roomId of ws.rooms) {
    const roomSet = rooms.get(roomId);
    if (roomSet) {
      roomSet.delete(ws);
      if (roomSet.size === 0) {
        rooms.delete(roomId);
        redisSub.unsubscribe(`room:${roomId}`);
      }
    }
  }
}

export function broadcast(roomId, payload) {
  redisPub.publish(`room:${roomId}`, payload);
}

export async function sendDirectMessage(toUser, fromUser, text) {
  const targetServerId = await getUserLocation(toUser);
  if (!targetServerId) return false;
  const payload = JSON.stringify({ to: toUser, from: fromUser, text });
  redisPub.publish(`${targetServerId}:dm`, payload);
  return true;
}

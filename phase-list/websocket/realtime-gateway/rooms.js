// rooms.js
import Redis from "ioredis";

const MAX_BUFFER = 1 * 1024 * 1024; // 1MB safety
const redisPub = new Redis(); // Client for publishing
const redisSub = new Redis(); // Client for subscribing

const rooms = new Map(); // Local sockets in each room

// ---- 1. Subscribe to Redis for all messages ----
redisSub.subscribe("room_messages");

redisSub.on("message", (channel, message) => {
  if (channel === "room_messages") {
    const { roomId, payload } = JSON.parse(message);

    // Broadcast to LOCAL clients who are in this room
    const localClients = rooms.get(roomId) || [];
    for (const client of localClients) {
      safeSend(client, payload);
    }
  }
});

export function safeSend(ws, message) {
  if (ws.readyState !== 1) return;

  // Backpressure check
  if (ws.bufferedAmount > MAX_BUFFER) {
    ws.terminate(); // kill slow consumer
    return;
  }
  ws.send(message);
}

export function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws.rooms.add(roomId);
}

export function leaveAllRooms(ws) {
  for (const roomId of ws.rooms) {
    rooms.get(roomId)?.delete(ws);
  }
}

// ---- 2. Broadcast now publishes to Redis ----
export function broadcast(roomId, payload) {
  
  //   for (const client of rooms.get(roomId) || []) {
  //     safeSend(client, payload);
  // }

  // We publish to the "bus" instead of sending directly.
  // Redis will then send this to ALL server nodes (including this one).
  redisPub.publish("room_messages", JSON.stringify({ roomId, payload }));
}

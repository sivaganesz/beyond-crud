// rooms.js
import Redis from "ioredis";
import { getUserLocation } from "./presence.js";
import { Queue } from "bullmq";

const MAX_BUFFER = 1 * 1024 * 1024;
const CHUNK_SIZE = 200;

const redisConn = new Redis({ maxRetriesPerRequest: null }); // Required for BullMQ
const redisPub = new Redis();
const redisSub = new Redis();

// ---- Phase 10: The Message Queue ----
const messageQueue = new Queue("messages", { connection: redisConn });

const rooms = new Map(); 
export const userSockets = new Map(); 
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
    await chunkedBroadcast(localClients, message);
  }

  if (channel === `${currentServerId}:dm`) {
    const data = JSON.parse(message);
    const targetSocket = userSockets.get(data.to);
    if (targetSocket) {
      safeSend(targetSocket, JSON.stringify({
        type: "dm",
        from: data.from,
        text: data.text,
        msgId: data.msgId
      }));
    }
  }
});

async function chunkedBroadcast(clients, payload) {
  for (let i = 0; i < clients.length; i += CHUNK_SIZE) {
    const chunk = clients.slice(i, i + CHUNK_SIZE);
    for (const client of chunk) {
      safeSend(client, payload);
    }
    if (i + CHUNK_SIZE < clients.length) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}

export function safeSend(ws, message) {
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > MAX_BUFFER) return; 
  ws.send(message);
}

// ---- DUMB GATEWAY LOGIC ----
/**
 * In Phase 10, the Gateway NO LONGER does logic.
 * It just puts a job in the queue and returns immediately.
 */
export async function broadcast(roomId, fromUser, text) {
  await messageQueue.add("process-broadcast", {
    roomId,
    fromUser,
    text
  });
  console.log(`[Gateway] Message from ${fromUser} added to queue for room ${roomId}`);
}

export async function sendDirectMessage(toUser, fromUser, text) {
  await messageQueue.add("process-dm", {
    toUser,
    fromUser,
    text
  });
  return true; 
}

// ---- Room/Socket Management ----
export async function joinRoom(roomId, ws, lastMsgId = null) {
  // Sync logic still happens locally for speed, or could be moved to worker
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

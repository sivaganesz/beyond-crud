// rooms.js
import Redis from "ioredis";
import { getUserLocation } from "./presence.js";

const MAX_BUFFER = 1 * 1024 * 1024;
const CHUNK_SIZE = 200;
const HISTORY_LIMIT = 100; // Store last 100 messages per room

const redisPub = new Redis();
const redisSub = new Redis();
const redisStore = new Redis(); // Third client for history storage

const rooms = new Map();
export const userSockets = new Map();

let currentServerId = null;

export function initMessenger(serverId) {
  currentServerId = serverId;
  redisSub.subscribe(`${serverId}:dm`);
}

// ---- Message ID Generator ----
function generateMsgId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

// ---- Room Logic with History Sync ----
export async function joinRoom(roomId, ws, lastMsgId = null) {
  // 1. If user provided a lastMsgId, send them what they missed
  if (lastMsgId) {
    const history = await redisStore.lrange(`history:${roomId}`, 0, -1);
    const missing = [];
    let found = false;

    // History is [newest...oldest]. We reverse or search to find messages after lastMsgId.
    for (const msgStr of history.reverse()) {
      const msg = JSON.parse(msgStr);
      if (found) {
        missing.push(msgStr);
      } else if (msg.msgId === lastMsgId) {
        found = true;
      }
    }

    // Send catch-up messages
    for (const m of missing) {
      safeSend(ws, m);
    }
  }

  // 2. Normal Join
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

export async function broadcast(roomId, fromUser, text) {
  const msgId = generateMsgId();
  const payload = JSON.stringify({
    type: "chat",
    from: fromUser,
    room: roomId,
    text: text,
    msgId: msgId
  });

  // 1. Store in history (List)
  await redisStore.lpush(`history:${roomId}`, payload);
  // 2. Trim history to keep it fast
  await redisStore.ltrim(`history:${roomId}`, 0, HISTORY_LIMIT - 1);

  // 3. Publish to live stream
  redisPub.publish(`room:${roomId}`, payload);
}

// ---- DM Logic with IDs ----
export async function sendDirectMessage(toUser, fromUser, text, lastMsgId = null) {
  const targetServerId = await getUserLocation(toUser);
  if (!targetServerId) return false;

  const msgId = generateMsgId();
  const payload = JSON.stringify({ to, from, text, msgId });

  // STORE FIRST (truth)
  await redisStore.lpush(`dm:${toUser}`, payload);
  await redisStore.ltrim(`dm:${toUser}`, 0, HISTORY_LIMIT - 1);

  // THEN publish
  redisPub.publish(`${targetServerId}:dm`, payload);
  return true;
}

export async function syncDMHistory(username, ws, lastMsgId) {
  const history = await redisStore.lrange(`dm:${username}`, 0, -1);

  let found = false;
  const missing = [];

  for (const msgStr of history.reverse()) {
    const msg = JSON.parse(msgStr);
    if (found) missing.push(msgStr);
    else if (msg.msgId === lastMsgId) found = true;
  }

  for (const m of missing) {
    safeSend(ws, m);
  }
}
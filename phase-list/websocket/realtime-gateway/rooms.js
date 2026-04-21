// rooms.js

const MAX_BUFFER = 1 * 1024 * 1024; // 1MB per socket safety

export function safeSend(ws, message) {
  if (ws.readyState !== 1) return;

  // Backpressure check
  if (ws.bufferedAmount > MAX_BUFFER) {
    ws.terminate(); // kill slow consumer
    return;
  }

  ws.send(message);
}

const rooms = new Map();

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

export function broadcast(roomId, message) {
  for (const client of rooms.get(roomId) || []) {
    safeSend(client, message);
  }
}
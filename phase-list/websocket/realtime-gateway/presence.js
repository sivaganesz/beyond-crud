// presence.js
import Redis from "ioredis";

const redis = new Redis();
const PRESENCE_PREFIX = "presence:";
const TTL = 30; // Seconds until a user is considered offline

/**
 * Marks a user as online with a TTL.
 */
export async function setUserOnline(username, serverId) {
  // Key: presence:white, Value: server:8080, Expiry: 30s
  await redis.set(`${PRESENCE_PREFIX}${username}`, serverId, "EX", TTL);
}

/**
 * Refreshes the TTL for a list of users (The Heartbeat).
 * We use a Pipeline for high performance.
 */
export async function refreshPresence(usernames) {
  if (usernames.length === 0) return;
  
  const pipeline = redis.pipeline();
  for (const name of usernames) {
    pipeline.expire(`${PRESENCE_PREFIX}${name}`, TTL);
  }
  await pipeline.exec();
}

/**
 * Marks a user as offline immediately.
 */
export async function setUserOffline(username) {
  await redis.del(`${PRESENCE_PREFIX}${username}`);
}

/**
 * Finds which server a user is connected to.
 */
export async function getUserLocation(username) {
  return await redis.get(`${PRESENCE_PREFIX}${username}`);
}

/**
 * Gets all online users by scanning for the prefix.
 */
export async function getAllOnlineUsers() {
  let keys = [];
  let cursor = "0";
  
  // SCAN is safer than KEYS * in production
  do {
    const [newCursor, foundKeys] = await redis.scan(cursor, "MATCH", `${PRESENCE_PREFIX}*`, "COUNT", 100);
    cursor = newCursor;
    keys.push(...foundKeys);
  } while (cursor !== "0");

  return keys.map(k => k.replace(PRESENCE_PREFIX, ""));
}

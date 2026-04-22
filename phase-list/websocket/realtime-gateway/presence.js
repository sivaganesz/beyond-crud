// presence.js
import Redis from "ioredis";

const redis = new Redis();
const PRESENCE_KEY = "presence";

/**
 * Marks a user as online on a specific server.
 */
export async function setUserOnline(username, serverId) {
  // We store: User -> ServerID
  await redis.hset(PRESENCE_KEY, username, serverId);
  console.log(`Presence: ${username} is online on ${serverId}`);
}

/**
 * Marks a user as offline.
 */
export async function setUserOffline(username) {
  await redis.hdel(PRESENCE_KEY, username);
  console.log(`Presence: ${username} went offline`);
}

/**
 * Finds which server a user is connected to.
 * Returns null if they are offline.
 */
export async function getUserLocation(username) {
  return await redis.hget(PRESENCE_KEY, username);
}

/**
 * Gets a list of all online users. (The "Green Dot" list)
 */
export async function getAllOnlineUsers() {
  return await redis.hkeys(PRESENCE_KEY);
}

// worker.js
import { Worker } from "bullmq";
import Redis from "ioredis";

const redisConn = new Redis({ maxRetriesPerRequest: null });
const redisPub = new Redis();
const redisStore = new Redis();

const HISTORY_LIMIT = 100;
const PRESENCE_PREFIX = "presence:";

function generateMsgId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

console.log("🚀 Background Worker started. Waiting for jobs...");

const worker = new Worker("messages", async (job) => {
  const { name, data } = job;

  if (name === "process-broadcast") {
    const { roomId, fromUser, text } = data;
    const msgId = generateMsgId();
    const payload = JSON.stringify({
      type: "chat",
      from: fromUser,
      room: roomId,
      text: text,
      msgId: msgId
    });

    // 1. Heavy Work: Persistence
    await redisStore.lpush(`history:${roomId}`, payload);
    await redisStore.ltrim(`history:${roomId}`, 0, HISTORY_LIMIT - 1);
    
    // 2. Heavy Work: Distributed Fan-out (Publish to Redis)
    await redisPub.publish(`room:${roomId}`, payload);
    
    console.log(`[Worker] Processed broadcast for room ${roomId} from ${fromUser}`);
  }

  if (name === "process-dm") {
    const { toUser, fromUser, text } = data;
    const msgId = generateMsgId();
    
    // 1. Heavy Work: Lookup location
    const targetServerId = await redisStore.get(`${PRESENCE_PREFIX}${toUser}`);
    
    if (targetServerId) {
      const payload = JSON.stringify({ to: toUser, from: fromUser, text, msgId });
      // 2. Heavy Work: Target routing
      await redisPub.publish(`${targetServerId}:dm`, payload);
      console.log(`[Worker] Processed DM for ${toUser} from ${fromUser}`);
    }
  }
}, { connection: redisConn });

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

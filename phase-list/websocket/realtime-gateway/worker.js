// worker.js
import { Worker } from "bullmq";
import Redis from "ioredis";
import { MongoClient } from "mongodb";

// ---- Configuration ----
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
const DB_NAME = "realtime_gateway";

// ---- Connections ----
const redisConn = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const redisPub = new Redis(REDIS_URL);
const redisStore = new Redis(REDIS_URL); // Still used for fast recent history

const mongoClient = new MongoClient(MONGO_URL);
let db;

async function connectMongo() {
  try {
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    console.log("🍃 Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  }
}

const HISTORY_LIMIT = 100;
const PRESENCE_PREFIX = "presence:";

function generateMsgId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

await connectMongo();

console.log("🚀 Background Worker started. Waiting for jobs...");

const worker = new Worker("messages", async (job) => {
  const { name, data } = job;

  if (name === "process-broadcast") {
    const { roomId, fromUser, text } = data;
    const msgId = generateMsgId();
    const timestamp = new Date();

    const messageObj = {
      type: "chat",
      from: fromUser,
      room: roomId,
      text: text,
      msgId: msgId,
      timestamp: timestamp
    };

    const payload = JSON.stringify(messageObj);

    // 1. FAST WORK: Recent History (Redis)
    await redisStore.lpush(`history:${roomId}`, payload);
    await redisStore.ltrim(`history:${roomId}`, 0, HISTORY_LIMIT - 1);
    
    // 2. LIVE WORK: Pub/Sub
    await redisPub.publish(`room:${roomId}`, payload);

    // 3. DURABLE WORK: MongoDB (Permanent Storage)
    await db.collection("messages").insertOne(messageObj);
    
    console.log(`[Worker] Persisted and Broadcasted message to ${roomId}`);
  }

  if (name === "process-dm") {
    const { toUser, fromUser, text } = data;
    const msgId = generateMsgId();
    const timestamp = new Date();

    const dmObj = {
      to: toUser,
      from: fromUser,
      text: text,
      msgId: msgId,
      timestamp: timestamp
    };

    // 1. Durable Storage for DMs
    await db.collection("direct_messages").insertOne(dmObj);

    // 2. Target routing via Presence
    const targetServerId = await redisStore.get(`${PRESENCE_PREFIX}${toUser}`);
    
    if (targetServerId) {
      const payload = JSON.stringify({ ...dmObj, type: "dm" });
      await redisPub.publish(`${targetServerId}:dm`, payload);
      console.log(`[Worker] Delivered DM to ${toUser} from ${fromUser}`);
    }
  }
}, { connection: redisConn });

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

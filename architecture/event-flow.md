# 🗓️ Day 2 

## 🎯 Goal: Understand how data moves (most important skill)

## Scenario

> **What happens when a user sends a message in a distributed realtime chat system?**

We’ll trace the message from **click → storage → event → realtime delivery → background processing**.

---

## 🧩 High-Level Flow

![Image](https://substackcdn.com/image/fetch/%24s_%21Zgn9%21%2Cf_auto%2Cq_auto%3Agood%2Cfl_progressive%3Asteep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F1ffbdbb0-1511-49e9-b43f-4b95469a4bec_2144x1742.png)

![Image](https://miro.medium.com/v2/resize%3Afit%3A832/1%2AMSkqj_gFTkVHiG_ntx8H9w.png)

![Image](https://i.sstatic.net/Oi3YS.png)

![Image](https://imgopt.infoq.com/fit-in/3000x4000/filters%3Aquality%2885%29/filters%3Ano_upscale%28%29/articles/serverless-websockets-realtime-messaging/en/resources/93-1669754025734.jpeg)

```text
Client → API → Database → Redis (Event)
                         ↙            ↘
                 WebSocket           Queue
                    ↓                 ↓
           Realtime Delivery   Background Processing
```

---

## 🔄 Step-by-Step Event Flow

### 1️⃣ User Action (Client)

* User types a message and clicks **Send**
* Client (React app) creates payload:

```json
{
  "conversationId": "123",
  "senderId": "A",
  "receiverId": "B",
  "content": "Hello"
}
```

* Sent via:

  * **WebSocket** (preferred for chat)
  * or **HTTP API** (fallback)

---

### 2️⃣ API Layer (Validation + Entry Point)

* Authenticates user via JWT
* Validates payload (schema, permissions)
* Adds metadata:

  * `messageId`
  * `timestamp`
  * `status = SENT`

> At this point, the system **accepts responsibility** for the message.

---

### 3️⃣ Database Write (Source of Truth)

* Message is stored in **PostgreSQL**

Why first?

* Prevent data loss
* Ensure durability
* Enable retries later

```sql
INSERT INTO messages (...) VALUES (...);
```

---

### 4️⃣ Cache Update (Redis - Optional but Critical)

* Store recent message in Redis:

  * `chat:123:recent_messages`

Why?

* Faster reads for active conversations
* Reduce DB load

---

### 5️⃣ Event Creation (Important Step)

System creates an event:

```json
{
  "type": "MESSAGE_CREATED",
  "messageId": "m1",
  "conversationId": "123",
  "senderId": "A",
  "receiverId": "B"
}
```

> This is the **turning point**: from CRUD → event-driven system

---

### 6️⃣ Redis Pub/Sub (Event Broadcast)

* API publishes event to Redis channel:

```bash
PUBLISH chat_events MESSAGE_CREATED
```

Redis:

* Instantly broadcasts to subscribers:

  * WebSocket servers
  * Notification services
  * Analytics services

---

### 7️⃣ WebSocket Server (Realtime Delivery)

* Subscribed to Redis channel
* Receives event immediately

Then:

* Checks if receiver is **online**

  * If yes → push message instantly
  * If no → skip realtime

```text
User B receives message instantly (no refresh)
```

---

### 8️⃣ Queue (BullMQ – Background Jobs)

* API or event consumer pushes job to queue:

```text
Job: deliver_message / send_notification
```

Used for:

* Offline delivery
* Push notifications
* Retry failed sends
* Email/SMS alerts

---

### 9️⃣ Worker Processing (Async)

Workers consume jobs:

* Retry delivery
* Send push notification
* Update message status (`DELIVERED`, `FAILED`)

> This ensures **reliability beyond realtime**

---

### 🔟 Other Clients (Fan-out Delivery)

* If multiple devices logged in:

  * Mobile + Web both receive message
* Done via WebSocket fan-out

---

## 🧠 Flow Summary (Mental Model)

```text
1. Client sends message
2. API validates + stores in DB
3. Cache updated (optional)
4. Event created
5. Redis broadcasts event
6. WebSocket delivers instantly
7. Queue handles background work
8. Workers ensure reliability
```

---

## ⚠️ Important Engineering Insights

### 🔹 1. DB Before Event

> Never publish event before saving data
> Otherwise → ghost messages

---

### 🔹 2. Pub/Sub is Fast, Not Reliable

* If subscriber is down → message lost
* That’s why queue exists

---

### 🔹 3. Queue = Safety Net

* Guarantees retries
* Handles offline users

---

### 🔹 4. WebSocket = Speed Layer

* Only for **live delivery**
* Not for reliability

---

### 🔹 5. System is NOT Linear

It’s actually:

```text
           ┌──────────────┐
           │   Redis      │
           └─────┬────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
 WebSocket           Queue Workers
 (Realtime)          (Async Jobs)
```

---

## 🚫 Why This is NOT CRUD

CRUD thinking:

```text
Save message → Done
```

Your system:

```text
Save → Cache → Emit Event → Broadcast → Deliver →
Retry → Notify → Track → Scale
```

---

## 🔥 Real-World Mapping

* WhatsApp → Same flow with stronger guarantees
* Slack → Heavy event + queue usage
* Instagram DM → Cache-heavy + async
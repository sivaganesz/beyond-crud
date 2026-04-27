# Clubhouse Distributed Architecture Blueprint

This document outlines the high-scale system design for a voice-first social platform, incorporating distributed state, real-time signaling, and media orchestration.

## 1. High-Level Architecture (The Layers)

### A. Signaling Layer (WebSocket + Redis Pub/Sub)
*   **Purpose:** Orchestrates room state, hand-raising, and role changes.
*   **Tech Stack:** Node.js, `ws`, Redis.
*   **Mechanism:** Our current distributed gateway. It handles the "event-driven" part of the app.

### B. Media Layer (LiveKit SFU)
*   **Purpose:** Low-latency WebRTC audio delivery.
*   **Mechanism:** A Selective Forwarding Unit (SFU). Instead of User A sending audio to 1,000 people (P2P), they send it **once** to the SFU, which "fans it out" to the 1,000 listeners.

### C. State & Persistence Layer
*   **Ephemeral (Redis):** Presence (Green Dots), Room Stage (Who is currently speaking), Rate Limits.
*   **Durable (MongoDB):** User Profiles, Social Graph (Followers), Room History/Logs.

### D. Task Layer (BullMQ + Workers)
*   **Background Jobs:** Processing notifications ("Your friend is speaking!"), calculating room recommendations, cleaning up after server crashes.

---

## 2. Terminal-Based Workflow (The Lifecycle)

```text
[CLIENT]                                [GATEWAY]                            [WORKER]                            [MEDIA SERVER]
   |                                        |                                   |                                     |
   |-- 1. Connect (JWT Auth) -------------->|                                   |                                     |
   |                                        |-- 2. Set Online (Redis) --------->|                                     |
   |                                        |                                   |                                     |
   |-- 3. Request Join Room (Tech-Talk) --->|                                   |                                     |
   |                                        |-- 4. Add to BullMQ Job ---------->|                                     |
   |                                        |                                   |-- 5. Verify Permissions (DB)        |
   |                                        |                                   |-- 6. Generate LiveKit Token         |
   |<-- 7. Join Accepted + LK Token --------|                                   |                                     |
   |                                        |                                   |                                     |
   |-- 8. Connect to Voice (WebRTC) --------------------------------------------------------------------------------->|
   |                                        |                                   |                                     |
   |-- 9. Click "Raise Hand" -------------->|                                   |                                     |
   |                                        |-- 10. Notify Moderator (Pub/Sub) ->|                                     |
   |                                        |                                   |-- 11. Trigger Push Notification --->|
```

---

## 3. Advanced Implementation Topics

### 🔐 JWT & Role Management
*   **Roles:** `ADMIN`, `MODERATOR`, `SPEAKER`, `LISTENER`.
*   **Strategy:** Roles are embedded in the JWT but verified against Redis for real-time promotion/demotion (e.g., when a Moderator moves a Listener to the Stage).

### ⚡ Event-Driven Architecture (Idempotency)
*   **Problem:** If a Worker retries a "Follow" job, we don't want to follow twice.
*   **Solution:** Every event has a unique `eventId`. Workers check Redis before processing to ensure `isEventProcessed(eventId)` is false.

### 📊 Monitoring & Observability
*   **Metrics (Prometheus):** 
    *   `ws_active_connections`: Total users online.
    *   `room_fanout_latency`: Time to deliver a signaling message.
    *   `media_packet_loss`: Health of the voice streams.
*   **Dashboards (Grafana):** Real-time heatmaps of server load.

### 🐳 Docker Environment
*   **Infrastructure-as-Code:** A `docker-compose.yml` to spin up:
    *   `gateway-1`, `gateway-2`
    *   `worker-main`
    *   `redis-cluster`
    *   `mongodb-replica-set`
    *   `livekit-sfu`

### 🏗️ Monorepo Architecture (Type-Safety)
*   **oRPC / tRPC:** Sharing TypeScript interfaces between the Backend and Frontend.
*   **Benefit:** If the backend changes the "Message" shape, the Frontend UI will show a compile error immediately. No more runtime crashes!

---

## 4. Next Step: Building the "Clubhouse Core"
We will evolve our system to support:
1.  **Stage Management:** Tracking `speakers` vs `listeners` in Redis Sets.
2.  **Voice Integration:** Using the LiveKit logic from your template to enable the "Stage."
3.  **Role Promotion:** Implementing the "Raise Hand" flow.

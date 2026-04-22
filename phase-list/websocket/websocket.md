# WebSocket — From Scratch to Production

> How realtime communication actually works inside a distributed system like `beyond-crud`.

This document explains WebSocket from:

**TCP → HTTP Upgrade → Persistent Pipe → Auth → Scaling → Redis → Rooms → Observability → Production patterns**

---

## 1) Where WebSocket Lives in the Network Stack

Before WebSocket exists, this already happened:

1. DNS resolved domain to IP
2. TCP 3-way handshake established
3. (Optional) TLS handshake completed
4. HTTP request sent

WebSocket is **not a new protocol**.

It is an **HTTP connection upgraded into a persistent TCP pipe**.

---

## 2) The HTTP Upgrade That Creates the Pipe

Client sends:

```http
GET /ws HTTP/1.1
Host: server.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: xxxxx
Authorization: Bearer <JWT>
```

Server responds:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: xxxxx
```

After this moment:

❌ No more HTTP
✅ Raw, full-duplex TCP frames

---

## 3) Authentication Happens **Only Once**

JWT is verified **during upgrade**.

If valid:

* User ID is attached to the socket
* Socket becomes an authenticated session

After upgrade:

> Messages do NOT pass through Express middleware or JWT verification again.

You now have:

```
userId <-> socketId <-> TCP pipe
```

---

## 4) Why This Is Powerful

Normal HTTP:

```
Request → Auth → Response → Close
```

WebSocket:

```
Auth Once → Infinite messages → No re-auth cost
```

This is why chat apps feel instant.

---

## 5) WebSocket Inside `beyond-crud`

In this project, WebSocket is **not for chat only**.

It is used for:

* Realtime notifications
* Presence updates
* Job progress updates (BullMQ events)
* System events from Redis Pub/Sub

WebSocket becomes the **delivery channel of events**.

---

## 6) The Real Production Problem: Multiple Servers

If you run 3 Node servers:

```
User A → Server 1
User B → Server 2
```

How does A send a message to B?

They are on different processes.

This is where **Redis Pub/Sub** comes in.

---

## 7) Redis Pub/Sub + WebSocket Cluster

Flow:

```
A sends message
→ Server 1 publishes to Redis
→ Server 2 receives from Redis
→ Server 2 pushes to B via WebSocket
```

WebSocket is **local delivery**.
Redis is **cross-node communication**.

---

## 8) Rooms and Presence

You never send to socket IDs directly.

You map:

```
userId -> socketId
roomId -> many socketIds
```

Examples:

* Chat room
* Notification group
* Online users list

---

## 9) Sticky Load Balancing (Very Important)

WebSocket is stateful.

Load balancer must keep user on same server.

This is called **sticky sessions**.

Without this:
Connection breaks on every request.

---

## 10) Message Reliability

WebSocket does **not** guarantee delivery.

So production systems add:

* Message IDs
* ACK from client
* Retry via queue if not acknowledged
* Persist messages in PostgreSQL

---

## 11) Observability You Must Add

Track:

* Active connections count
* Messages per second
* Failed deliveries
* Redis publish/subscribe rate

This is where Prometheus metrics come in.

---

## 12) Why WebSocket API Feels Simple but System Is Complex

API:

```js
socket.send("hi")
```

System reality:

```
TCP
TLS
HTTP Upgrade
JWT Auth
Sticky LB
Redis fanout
Room mapping
ACK handling
DB persistence
Metrics
```

WebSocket is simple.
**Distributed system around it is complex.**

---

## 13) Production Folder Structure Suggestion

Create:

```
architecture/event-flow/websocket/
  clear.md
  phases.md
  practice.md
```

---

## 14) Phases to Implement WebSocket in `beyond-crud`

### Phase 1 — Basic WebSocket server

* Connection
* Send/receive message

### Phase 2 — JWT during upgrade

* Reject unauthenticated sockets

### Phase 3 — userId ↔ socketId mapping

### Phase 4 — Rooms

### Phase 5 — Redis Pub/Sub integration

### Phase 6 — Multi-node simulation (run 2 servers)

### Phase 7 — Message ACK + retry via BullMQ

### Phase 8 — Metrics with Prometheus

---

## 15) Practice Problem (Mini Project)

> Build a realtime notification system for job progress.

Scenario:

1. User uploads file
2. BullMQ processes job
3. Job emits progress events
4. Events go to Redis Pub/Sub
5. Correct server pushes progress to user via WebSocket
6. User sees live progress bar

You just built what real SaaS products do.

---

## 16) What You Should Now Understand

After this document, you should be able to explain:

* Why WebSocket needs Redis in clusters
* Why sticky sessions are mandatory
* Why JWT is only checked once
* Why messages need ACK & persistence
* Why observability is critical

---

## 17) Key Takeaway

> WebSocket is a pipe.
> Redis is the bridge.
> BullMQ is the retry brain.
> PostgreSQL is the memory.
> Prometheus is the eyes.

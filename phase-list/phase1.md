
# Phase 1 — Architecture Thinking

> *"A system built without design is not a system. It is an accident."*
---

## What this phase is

Before a single line of code exists, before a folder is created, before a package is installed — a senior engineer sits down and **thinks**. This phase is that thinking made visible. You are not writing software. You are writing the story of software that does not yet exist.

This phase produces four documents. Each one answers a different question that every interviewer, every tech lead, and every future teammate will ask:

- `system-design.md` — What are we building and why?
- `event-flow.md` — How does data move through the system?
- `folder-structure.md` — How is the codebase organized, and why?
- `decisions.md` — Why these tools and not others?

These documents are not ceremony. They are the **mental model** you carry for the next 44 phases. Every time you write a Redis call, you will remember why Redis exists. Every time you write a WebSocket event, you will remember the flow that led to it. This is the phase that separates engineers who build things from engineers who understand what they built.

---

## Why this phase comes first

Imagine you are hired to build a house. You could pick up a hammer and start nailing wood together. Or you could draw a blueprint.

Without a blueprint, every nail you drive is a guess. You discover halfway through that the bathroom is above the kitchen and the pipes don't reach. You tear it down and rebuild.

Software is identical. The cost of changing architecture after code exists is exponentially higher than changing a document. A word in `system-design.md` costs you 10 seconds. Restructuring a production codebase costs you weeks.

Real companies spend significant time in architecture review before any sprint begins. This phase teaches you to think the way those companies think.

---
```
## Document 1: `system-design.md`

### What it is

A high-level description of the system from 10,000 feet. Not implementation details. Not code. Just components, connections, and purpose.

### The real-world problem it solves

Imagine you join a company and on your first day, someone asks you: "How does our system work?" If no `system-design.md` exists, you spend two weeks reading code trying to understand what took the original team two years to build. With this document, you understand the whole system in 20 minutes.

This document is also your interview answer. When a senior engineer asks "How would you design a realtime chat system?", you are describing exactly what this document contains.

### What it must contain

**1. The problem statement.** What would break if this system did not exist?

> "Users need to send and receive messages instantly, across distributed servers, without the system becoming a bottleneck."

**2. The components.** Every major moving part, named and defined.

| Component | Role |
|---|---|
| Client (React) | Sends messages, receives realtime updates |
| API (Express + oRPC) | Handles HTTP requests, validates, routes |
| WebSocket server | Maintains persistent connections for realtime |
| Redis | Caches data, relays Pub/Sub events between servers |
| BullMQ | Processes jobs that should not block the user |
| PostgreSQL | Stores persistent data |

**3. How they connect.** A simple diagram — even ASCII — showing the flow.


Client ──HTTP──> API ──> PostgreSQL
│                └──> Redis (cache)
│
└──WS──> WebSocket Server ──> Redis Pub/Sub ──> BullMQ Worker


**4. Why this is not CRUD.**

- Messages are delivered in realtime without polling  
- Background jobs process work without blocking the user  
- Events propagate across distributed servers via Pub/Sub  
- The system is observable — metrics tell you what is happening at any moment  

### Narrative for your documentation

> This system is not a CRUD application. A CRUD application reads from a database and writes to a database. This system does that too, but it also maintains persistent WebSocket connections to thousands of clients, distributes events across multiple server instances through Redis Pub/Sub, defers expensive operations to background queues, and measures its own health through Prometheus metrics. The difference between CRUD and this system is the difference between a counter and a distributed machine.

---
```

## Document 2: `event-flow.md`

### What it is

A step-by-step trace of what happens when a user performs an action. Not what the code does — what the *system* does.

### The real-world problem it solves

In a distributed system, a single user action touches many components. A bug in message delivery could be in the API, in Redis Pub/Sub, in the WebSocket server, or in the client. Without a clear event flow document, debugging becomes archaeology — you dig through logs with no map.

With `event-flow.md`, every engineer knows exactly where to look. "Message not delivered? Check step 4 — the Redis Pub/Sub broadcast."

### The flow you must trace

**"What happens when User A sends a message to User B?"**

**Step 1 — Client sends HTTP request**
```

User A types a message and presses Enter.
React calls POST /chat/messages via the oRPC client.
The request includes the JWT access token in the Authorization header.

```

**Step 2 — API validates and stores**
```

Express receives the request.
Auth middleware validates the JWT and attaches the user identity.
oRPC contract validates the request body (message content, room ID).
Handler inserts the message into PostgreSQL.
Handler publishes an event to Redis Pub/Sub channel: "room:{roomId}"

```

**Step 3 — Redis relays the event**
```

Redis receives the Pub/Sub publish.
All WebSocket server instances subscribed to "room:{roomId}" receive the event.
This is how multiple server instances stay in sync — they all see the same message.

```

**Step 4 — WebSocket server broadcasts**
```

The WebSocket server receives the Redis event.
It looks up all connected clients in room {roomId}.
It broadcasts the message to each connected client.
User B's browser receives the WebSocket message instantly.

```

**Step 5 — Background job is queued**
```

The API also pushes a job to the BullMQ notification queue.
The job worker picks it up and sends a push notification to User B's device.
This happens asynchronously — it does not block the message delivery in step 4.

````

### Why sync vs async matters here

Steps 1–4 happen synchronously from the user's perspective — they feel instant. Step 5 happens asynchronously. This is intentional design. The notification does not need to arrive before the message. Separating them means a notification failure cannot block message delivery. This is **resilience through decoupling**.

### Syntax: Redis Pub/Sub in one minute

```typescript
// Publisher (inside API handler)
await redis.publish(`room:${roomId}`, JSON.stringify({
  type: 'NEW_MESSAGE',
  payload: { messageId, content, senderId }
}));

// Subscriber (inside WebSocket server)
await redis.subscribe(`room:${roomId}`, (message) => {
  const event = JSON.parse(message);
  broadcastToRoom(roomId, event);
});
````

The publisher and subscriber do not know about each other. They only know about the channel name. This is the power of Pub/Sub — loose coupling at the infrastructure level.

---

## Document 3: `folder-structure.md`

### What it is

A justified explanation of why the repository is structured the way it is. Not just a list of folders — the *reasoning* behind every separation.

### The real-world problem it solves

Imagine a codebase where your API business logic is mixed with database queries, which are mixed with types, which are mixed with utility functions. This is the codebase of a project that started small and grew without structure. It is called a "big ball of mud" and it is the most common source of slow delivery in engineering teams.

The structure of this repository is an answer to that problem. Every folder has one responsibility. Every developer knows exactly where to look for any piece of code.

### The structure and its justification

```
beyond-crud/
├── apps/           # Things that run — deployable applications
│   ├── api/        # The HTTP API server
│   └── web/        # The React frontend
├── packages/       # Things that are shared — libraries
│   └── contracts/  # Shared types between frontend and backend
├── services/       # Infrastructure-level concerns
│   ├── redis/      # Redis client, cache helpers, Pub/Sub
│   ├── queue/      # BullMQ workers and job definitions
│   └── websocket/  # WebSocket server
├── observability/  # Metrics, logging, dashboards
├── devops/         # Docker, CI/CD, environment configs
└── architecture/   # This phase — design documents
```

**Why `apps` vs `packages` vs `services`?**

* `apps` produce deployable artifacts. You run them.
* `packages` produce shared libraries. You import them.
* `services` are infrastructure integrations.

**Why Turborepo?**

Turborepo understands dependency graphs and rebuilds only what changed. At scale, this turns a 10-minute rebuild into a 30-second one.

### What a junior engineer gets wrong

A junior engineer puts everything in one folder and starts with a monolithic `server.ts`. It works for 3 days. On day 4, the file is 800 lines. On day 10, it is 3000 lines. No one can find anything.

---

## Document 4: `decisions.md`

### What it is

A record of every significant technology choice, the problem it solves, and why the alternative was not chosen.

### The real-world problem it solves

Six months later, a new engineer asks "why are we using BullMQ instead of a simple `setInterval`?" No one remembers. The codebase carries the decision but not the reasoning.

`decisions.md` is an Architecture Decision Record (ADR). It is used by mature engineering teams and is extremely valuable in interviews.

### The decision table

| Problem                                   | Choice         | Why not the alternative                          |
| ----------------------------------------- | -------------- | ------------------------------------------------ |
| Shared types between frontend and backend | oRPC contracts | REST has no built-in type sharing                |
| Realtime message delivery                 | WebSocket      | Polling wastes bandwidth; SSE is one-directional |
| Cross-server event relay                  | Redis Pub/Sub  | Enables distributed event propagation            |
| Deferred background work                  | BullMQ         | Persistent jobs with retries                     |
| Identity and authorization                | JWT            | Stateless and horizontally scalable              |
| Monorepo tooling                          | Turborepo      | Caching and incremental builds                   |

### Decision narrative example

> When a user sends a message, the API server handling their request must deliver it to the recipient. But in production, servers are distributed. Redis Pub/Sub solves this by acting as a message bus across instances.

---

## Phase 1 — What you should be able to say after completing it

You should be able to answer:

* “Walk me through the architecture.”
* “Why WebSockets instead of polling?”
* “How do servers sync real-time events?”
* “Why use a monorepo?”

If you can answer all four fluently, Phase 1 is internalized.

---

## Phase 1 output checklist

```
architecture/
  1.system-design.md       ✓
  2.event-flow.md          ✓
  3.folder-structure.md    ✓
  4.decisions.md           ✓
  5.system-clarity.md      ✓
```

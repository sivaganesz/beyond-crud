



\# Phase 1 — Architecture Thinking



> \*"A system built without design is not a system. It is an accident."\*



\---



\## What this phase is



Before a single line of code exists, before a folder is created, before a package is installed — a senior engineer sits down and \*\*thinks\*\*. This phase is that thinking made visible. You are not writing software. You are writing the story of software that does not yet exist.



This phase produces four documents. Each one answers a different question that every interviewer, every tech lead, and every future teammate will ask:



\- `system-design.md` — What are we building and why?

\- `event-flow.md` — How does data move through the system?

\- `folder-structure.md` — How is the codebase organized, and why?

\- `decisions.md` — Why these tools and not others?



These documents are not ceremony. They are the \*\*mental model\*\* you carry for the next 44 phases. Every time you write a Redis call, you will remember why Redis exists. Every time you write a WebSocket event, you will remember the flow that led to it. This is the phase that separates engineers who build things from engineers who understand what they built.



\---



\## Why this phase comes first



Imagine you are hired to build a house. You could pick up a hammer and start nailing wood together. Or you could draw a blueprint.



Without a blueprint, every nail you drive is a guess. You discover halfway through that the bathroom is above the kitchen and the pipes don't reach. You tear it down and rebuild.



Software is identical. The cost of changing architecture after code exists is exponentially higher than changing a document. A word in `system-design.md` costs you 10 seconds. Restructuring a production codebase costs you weeks.



Real companies spend significant time in architecture review before any sprint begins. This phase teaches you to think the way those companies think.



\---



\## Document 1: `system-design.md`



\### What it is



A high-level description of the system from 10,000 feet. Not implementation details. Not code. Just components, connections, and purpose.



\### The real-world problem it solves



Imagine you join a company and on your first day, someone asks you: "How does our system work?" If no `system-design.md` exists, you spend two weeks reading code trying to understand what took the original team two years to build. With this document, you understand the whole system in 20 minutes.



This document is also your interview answer. When a senior engineer asks "How would you design a realtime chat system?", you are describing exactly what this document contains.



\### What it must contain



\*\*1. The problem statement.\*\* What would break if this system did not exist?



> \*"Users need to send and receive messages instantly, across distributed servers, without the system becoming a bottleneck."\*



\*\*2. The components.\*\* Every major moving part, named and defined.



| Component | Role |

|---|---|

| Client (React) | Sends messages, receives realtime updates |

| API (Express + oRPC) | Handles HTTP requests, validates, routes |

| WebSocket server | Maintains persistent connections for realtime |

| Redis | Caches data, relays Pub/Sub events between servers |

| BullMQ | Processes jobs that should not block the user |

| PostgreSQL | Stores persistent data |



\*\*3. How they connect.\*\* A simple diagram — even ASCII — showing the flow.



```

Client ──HTTP──> API ──> PostgreSQL

&#x20; │                └──> Redis (cache)

&#x20; │

&#x20; └──WS──> WebSocket Server ──> Redis Pub/Sub ──> BullMQ Worker

```



\*\*4. Why this is not CRUD.\*\* Explicitly name what makes this system beyond basic database operations:

\- Messages are delivered in realtime without polling

\- Background jobs process work without blocking the user

\- Events propagate across distributed servers via Pub/Sub

\- The system is observable — metrics tell you what is happening at any moment



\### Narrative for your documentation



Write this section in your file like this:



> This system is not a CRUD application. A CRUD application reads from a database and writes to a database. This system does that too, but it also maintains persistent WebSocket connections to thousands of clients, distributes events across multiple server instances through Redis Pub/Sub, defers expensive operations to background queues, and measures its own health through Prometheus metrics. The difference between CRUD and this system is the difference between a counter and a distributed machine.



\---



\## Document 2: `event-flow.md`



\### What it is



A step-by-step trace of what happens when a user performs an action. Not what the code does — what the \*system\* does.



\### The real-world problem it solves



In a distributed system, a single user action touches many components. A bug in message delivery could be in the API, in Redis Pub/Sub, in the WebSocket server, or in the client. Without a clear event flow document, debugging becomes archaeology — you dig through logs with no map.



With `event-flow.md`, every engineer knows exactly where to look. "Message not delivered? Check step 4 — the Redis Pub/Sub broadcast."



\### The flow you must trace



Walk through this exact scenario: \*\*"What happens when User A sends a message to User B?"\*\*



\*\*Step 1 — Client sends HTTP request\*\*

```

User A types a message and presses Enter.

React calls POST /chat/messages via the oRPC client.

The request includes the JWT access token in the Authorization header.

```



\*\*Step 2 — API validates and stores\*\*

```

Express receives the request.

Auth middleware validates the JWT and attaches the user identity.

oRPC contract validates the request body (message content, room ID).

Handler inserts the message into PostgreSQL.

Handler publishes an event to Redis Pub/Sub channel: "room:{roomId}"

```



\*\*Step 3 — Redis relays the event\*\*

```

Redis receives the Pub/Sub publish.

All WebSocket server instances subscribed to "room:{roomId}" receive the event.

This is how multiple server instances stay in sync — they all see the same message.

```



\*\*Step 4 — WebSocket server broadcasts\*\*

```

The WebSocket server receives the Redis event.

It looks up all connected clients in room {roomId}.

It broadcasts the message to each connected client.

User B's browser receives the WebSocket message instantly.

```



\*\*Step 5 — Background job is queued\*\*

```

The API also pushes a job to the BullMQ notification queue.

The job worker picks it up and sends a push notification to User B's device.

This happens asynchronously — it does not block the message delivery in step 4.

```



\### Why sync vs async matters here



Steps 1–4 happen synchronously from the user's perspective — they feel instant. Step 5 happens asynchronously. This is intentional design. The notification does not need to arrive before the message. Separating them means a notification failure cannot block message delivery. This is \*\*resilience through decoupling\*\*.



\### Syntax: Redis Pub/Sub in one minute



```typescript

// Publisher (inside API handler)

await redis.publish(`room:${roomId}`, JSON.stringify({

&#x20; type: 'NEW\_MESSAGE',

&#x20; payload: { messageId, content, senderId }

}));



// Subscriber (inside WebSocket server)

await redis.subscribe(`room:${roomId}`, (message) => {

&#x20; const event = JSON.parse(message);

&#x20; broadcastToRoom(roomId, event);

});

```



The publisher and subscriber do not know about each other. They only know about the channel name. This is the power of Pub/Sub — loose coupling at the infrastructure level.



\---



\## Document 3: `folder-structure.md`



\### What it is



A justified explanation of why the repository is structured the way it is. Not just a list of folders — the \*reasoning\* behind every separation.



\### The real-world problem it solves



Imagine a codebase where your API business logic is mixed with database queries, which are mixed with types, which are mixed with utility functions. This is the codebase of a project that started small and grew without structure. It is called a "big ball of mud" and it is the most common source of slow delivery in engineering teams.



The structure of this repository is an answer to that problem. Every folder has one responsibility. Every developer knows exactly where to look for any piece of code.



\### The structure and its justification



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



\*\*Why `apps` vs `packages` vs `services`?\*\* These are three fundamentally different kinds of code:

\- `apps` produce deployable artifacts. You run them. They have a `main` entry point.

\- `packages` produce shared libraries. You import them. They have no `main` entry point.

\- `services` are infrastructure integrations. They wrap external tools (Redis, queues) in a way every `app` can consume without knowing the details.



\*\*Why Turborepo?\*\* In a standard setup, if you change a shared type in `packages/contracts`, you must manually rebuild and republish it before your API can use the new version. Turborepo makes this automatic — it understands the dependency graph and rebuilds only what changed. At scale, this turns a 10-minute rebuild into a 30-second one.



\### What a junior engineer gets wrong



A junior engineer puts everything in one folder and starts with a monolithic `server.ts`. It works for 3 days. On day 4, the file is 800 lines. On day 10, it is 3000 lines. No one can find anything.



The structure above forces you to ask "where does this belong?" before you write a single line. That question is the habit of every senior engineer.



\---



\## Document 4: `decisions.md`



\### What it is



A record of every significant technology choice, the problem it solves, and why the alternative was not chosen.



\### The real-world problem it solves



Technology decisions made under deadline pressure are rarely revisited. Six months later, a new engineer asks "why are we using BullMQ instead of a simple `setInterval`?" No one remembers. The codebase carries the decision but not the reasoning.



`decisions.md` is an Architecture Decision Record (ADR). It is a practice used by companies like Spotify, Netflix, and every mature engineering team. It is also the single most impressive document you can show in an interview, because it proves you chose your tools, not just used them.



\### The decision table



| Problem | Choice | Why not the alternative |

|---|---|---|

| Shared types between frontend and backend | oRPC contracts | REST has no built-in type sharing. GraphQL adds complexity. oRPC gives full type safety with minimal ceremony. |

| Realtime message delivery | WebSocket | HTTP polling wastes bandwidth and adds latency. SSE is one-directional. WebSocket is full-duplex — both sides can send at any time. |

| Cross-server event relay | Redis Pub/Sub | If two users are on different server instances, HTTP cannot relay between them directly. Redis Pub/Sub routes events across all instances through a shared channel. |

| Deferred background work | BullMQ | `setTimeout` in Node.js loses jobs on server restart. BullMQ persists jobs in Redis, supports retries, and handles failures gracefully. |

| Identity and authorization | JWT | Sessions require server-side state, which breaks horizontal scaling. JWTs are stateless — any server can verify any token without a shared session store. |

| Monorepo tooling | Turborepo | npm workspaces alone have no caching or incremental builds. Turborepo caches task results and rebuilds only affected packages, making CI significantly faster. |



\### How to write a decision narrative



Do not just fill in the table. Write one paragraph per major decision that explains the problem from first principles. Here is an example for Redis Pub/Sub:



> \*"When a user sends a message, the API server handling their request must deliver it to the recipient. But in production, there are multiple API server instances behind a load balancer. The recipient's WebSocket connection might be on a different server instance than the one handling the HTTP request. Without a shared relay mechanism, the two servers cannot communicate. Redis Pub/Sub solves this by acting as a message bus: every server instance subscribes to relevant channels. When any server publishes an event, every other server receives it instantly. This is how production chat systems like Slack and Discord coordinate message delivery across thousands of server instances."\*



That paragraph is worth more than any line of code in an interview.



\---



\## Phase 1 — What you should be able to say after completing it



When this phase is complete, you should be able to answer these questions without thinking:



\*\*"Walk me through the architecture of your system."\*\*

> You describe the client, API, WebSocket server, Redis, BullMQ, and PostgreSQL — their roles and how they connect. You draw the flow on a whiteboard from memory.



\*\*"Why did you use WebSockets instead of polling?"\*\*

> You explain the bandwidth cost of polling, the one-directional limitation of SSE, and why full-duplex communication is necessary for a chat system.



\*\*"How do you handle realtime events across multiple server instances?"\*\*

> You explain Redis Pub/Sub: each instance subscribes to a channel, any instance can publish, all instances receive the event.



\*\*"What is a monorepo and why did you use one?"\*\*

> You explain shared code, single dependency management, Turborepo's incremental builds, and the `apps/packages/services` separation.



If you can answer all four fluently, Phase 1 is not just done — it is internalized.



\---



\## Phase 1 output checklist



```

architecture/

&#x20; 1.system-design.md       ✓ Components, connections, why not CRUD

&#x20; 2.event-flow.md          ✓ Step-by-step trace of user-sends-message

&#x20; 3.folder-structure.md    ✓ Every folder justified, not just listed

&#x20; 4.decisions.md           ✓ Every tool chosen, every alternative rejected

&#x20; 5.system-clarity.md      ✓ Revision — would a stranger understand this?

```




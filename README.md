# beyond-crud

> Designing and building a production-grade, realtime communication system that goes far beyond basic CRUD applications.

---

## 🎯 Objective

This project focuses on learning and implementing real system design concepts by building a distributed, event-driven communication platform using a modern TypeScript monorepo architecture.

The goal is to understand how scalable systems are designed in real companies — including realtime messaging, background processing, caching, and observability.

---

## 🧱 Architecture Highlights

* Monorepo powered by Turborepo
* Type-safe contracts using oRPC
* Realtime communication using WebSockets
* Event-driven flow with Redis Pub/Sub
* Background job processing with BullMQ
* PostgreSQL as the primary database
* Redis for caching and messaging
* Dockerized services
* Metrics and monitoring with Prometheus and Grafana

---

## 🗂️ Monorepo Structure

```text
apps/
  web/            # React dashboard
  server/         # Node backend (oRPC, WebSocket, jobs)

packages/
  contract/       # oRPC contracts (shared types)
  ui/             # shared UI components
  config/         # shared configurations
```

---

## ✨ Core Features

* JWT Authentication & Role Management
* Type-safe APIs via oRPC
* Realtime chat using WebSocket
* Redis Pub/Sub event system
* Background job queue with retries
* Notification service
* Admin dashboard
* Docker environment setup
* Application metrics and monitoring

---

## 🧠 What This Project Demonstrates

* Monorepo architecture understanding
* Event-driven backend design
* Realtime system architecture
* Queue, retry, and idempotency strategies
* Effective caching with Redis
* Clean contract-based API design
* Observability in distributed systems

---

## 🛠️ Tech Stack

**Frontend**
React, Vite, Tailwind CSS, Zustand

**Backend**
Node.js, oRPC, WebSocket, BullMQ

**Database**
PostgreSQL, Redis

**DevOps & Monitoring**
Docker, Prometheus, Grafana

---

## 🧭 Why “Beyond CRUD”?

Most learning projects stop at basic database operations.

This project focuses on:

* Realtime communication
* Event-driven architecture
* Background processing
* Monitoring and metrics
* System design thinking

---

## 👨‍💻 Author

A journey toward becoming a system-design-focused engineer.

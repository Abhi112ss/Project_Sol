# ADR-002: PostgreSQL/PostGIS Truth, Redis Volatile State & Transactional Outbox (Kafka Deferred)

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
Real-time GPS tracking and driver state updates demand low-latency state reads while guaranteeing that critical boarding, no-show, and SOS events never vanish if Redis restarts or loses volatile memory. Apache Kafka is planned for high-volume future scaling but must not block MVP velocity on zero budget.

## Decision
1. **PostgreSQL 16 + PostGIS 3.4** (`transport_dev`) is the single permanent source of truth using `drizzle-kit` SQL migrations.
2. **Redis 7** caches volatile live GPS (`EX 180`), active trip pointers, entity lookups, rate limits, and BullMQ job queues (`7` named queues).
3. **Transactional Outbox (`outbox_events`):** Every critical mutation writes its domain event to `outbox_events` inside the same ACID Drizzle transaction as business tables; a BullMQ relay publishes events asynchronously to WebSockets/notifications today and can bridge to Kafka topics (`transport.*.events`) in Phase 7+ with zero module rewrites.

## Consequences
- Zero dual-write inconsistency between PostgreSQL and Redis/WebSockets.
- Redis restart gracefully falls back to PostgreSQL without data loss.


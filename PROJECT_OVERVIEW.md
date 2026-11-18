# Project Sol (SolTransit) — Project Overview

**Project Overview** provides the high-level executive synthesis tying together the Central Transport Core (`backend/`), Employee App (`apps/employee_app`), Driver App (`apps/driver_app`), Shared Flutter Package (`packages/etms_core`), Admin Web (`web/`), and Docker infrastructure (`infra/`).

---

## 1. Architectural Spine

```text
  [ Employee Flutter App ] ──┐
  [ Driver Flutter App   ] ──┼──► Central Transport Core (NestJS 12 ESM, /api/v1 + WSS)
  [ Admin Next.js Web    ] ──┘         ├──► PostgreSQL 16 + PostGIS 3.4 (Permanent Truth)
                                       ├──► Redis 7 + BullMQ (Live State, TTL Cache, Jobs)
                                       └──► Transactional Outbox (Kafka-extensible)
```

Every client is intentionally thin on business authority:
- **Backend decides** next pickup stops, state transition validity, geofence compliance, waiting window enforcement, delay calculations (in integer seconds), and organization isolation.
- **Driver App guarantees continuity** in dead zones via Drift/SQLite queues and UUID `Idempotency-Key` headers.
- **Employee App eliminates ambiguity** on shift dates, pickup order, GPS staleness, running-late notifications, cancellations, boarding/deboarding OTPs, and SOS.
- **Admin Web maximizes dispatch throughput** with bulk approvals, manual multi-passenger stop sequencing, live fleet monitoring, no-show appeal triage, reports, and vendor billing reconciliation.

---

## 2. Seeded Operational Baseline (Hyderabad, India)

- **Organization:** `Acme Hyderabad Tech Ops` (`timezone: Asia/Kolkata`, `currency: INR`)
- **Campus Office:** `Gachibowli Campus` (`17.4401, 78.3489`)
- **Corridor Exemplars:** `Kukatpally`, `Miyapur`, `Ameerpet`, `Madhapur`, `Gachibowli`
- **Default Org Policies:** `geofence_radius_m = 150`, `no_show_wait_seconds = 300`, `gps_stale_threshold_seconds = 60`, `require_boarding_otp = true`.

---

## 3. Master Deliverables 1–12 Coverage

| Deliverable | Focus | Primary Document |
| :-: | :--- | :--- |
| **1** | Complete Product Requirements Document | [PRD.md](./PRD.md) |
| **2** | System Architecture Diagram | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) |
| **3** | Database Entity Relationship Diagram (26 tables) | [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) |
| **4** | Detailed Backend Module Breakdown (20 domain + 9 infra) | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) |
| **5** | Initial API Endpoint Catalogue (`/api/v1/*` + WSS) | [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) |
| **6** | Flutter Employee Application Screen Map | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| **7** | Flutter Driver Application Screen Map | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| **8** | Next.js Administration Dashboard Screen Map | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| **9** | UI/UX Design System & Visual Reference Analysis | [DESIGN.md](./DESIGN.md) & [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| **10** | Docker Compose Architecture (PostGIS + Redis) | [DOCKER_SETUP.md](./DOCKER_SETUP.md) |
| **11** | AI Agent Responsibility & Git Branching Strategy | [AGENT_WORKFLOW.md](./AGENT_WORKFLOW.md) |
| **12** | Phase-by-Phase Implementation Backlog (Phases 0–8) | [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) |


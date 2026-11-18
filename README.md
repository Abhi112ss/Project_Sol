# Project Sol (SolTransit) — Enterprise Employee Transportation Management System (ETMS)

**Project Category:** Multi-Tenant Enterprise SaaS / Shift Commute Operations Platform  
**Architecture:** Centralized NestJS 12 Modular Monolith (**Central Transport Core**) + 3 Client Applications (`apps/employee_app`, `apps/driver_app`, `web/`) + PostgreSQL 16/PostGIS 3.4 + Redis 7/BullMQ  
**Budget Policy:** ₹0 (100% open-source tooling, local Docker Desktop, universal Google Maps deep links)

---

## Repository Layout

```text
project_sol/
├── backend/                 # Central Transport Core (NestJS 12 ESM, Drizzle, BullMQ, Socket.IO, Vitest)
├── web/                     # Admin Control Panel (Next.js 16 App Router, Tailwind v4, shadcn/Base UI)
├── apps/
│   ├── driver_app/          # Flutter 3.50 Driver App (Offline-first Drift SQLite, 1-tap Google Maps)
│   └── employee_app/        # Flutter 3.50 Employee App (Shift bookings, timeline, OTP, SOS, Safe-Reach)
├── packages/
│   └── etms_core/           # Shared Dart Material 3 design tokens & reusable Flutter UI components
├── infra/                   # Docker Compose (PostGIS + Redis), .env.example, backup scripts
├── ARCHITECTURE_DECISIONS/  # Architectural Decision Records (ADR-001 .. ADR-005)
└── *.md                     # PRD, Architecture, Schema, API, Design System, Roadmap, Security, Testing docs
```

---

## Quickstart (Windows 11 + Docker Desktop)

### 1. Start PostgreSQL (PostGIS) & Redis
```powershell
Copy-Item infra/.env.example infra/.env -ErrorAction SilentlyContinue
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

### 2. Backend Setup, Migrations, Seed & Tests
```powershell
pnpm install
pnpm --filter backend db:migrate
pnpm --filter backend db:seed
pnpm --filter backend test
pnpm --filter backend start:dev
```
- REST API: `http://localhost:3001/api/v1`
- Health Readiness: `http://localhost:3001/api/v1/health/ready`
- Swagger OpenAPI: `http://localhost:3001/api/docs`

### 3. Admin Web & Flutter Apps *(Phases 2–4)*
```powershell
pnpm --filter web dev
flutter test packages/etms_core
flutter test apps/driver_app
flutter test apps/employee_app
```

---

## Documentation Index (`master-prompt.md` §23)

- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) — Executive summary & Deliverables 1–12 registry
- [PRODUCT.md](./PRODUCT.md) — Product truth record (`impeccable`)
- [DESIGN.md](./DESIGN.md) & [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) — Harbor Pilot visual system & all 3 app screen maps
- [PRD.md](./PRD.md) — Product Requirements Document
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) — System topology, Redis/BullMQ, Outbox, 20 domain + 9 infra modules
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — 26-table PostGIS ERD & state machines
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) — `/api/v1/*` REST & Socket.IO contracts
- [DOCKER_SETUP.md](./DOCKER_SETUP.md) — Local Docker operations & backup/restore runbook
- [MOBILE_PERMISSIONS.md](./MOBILE_PERMISSIONS.md) — Android runtime permissions & foreground service policy
- [GOOGLE_MAPS_INTEGRATION.md](./GOOGLE_MAPS_INTEGRATION.md) — External navigation URLs & zero-budget map architecture
- [AGENT_WORKFLOW.md](./AGENT_WORKFLOW.md) — AI agent ownership, CodeGraph MCP, Git branching
- [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) — Phase 0–8 execution backlog
- [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) — Backend, Web, Flutter & 20-step E2E verification plan
- [SECURITY_REQUIREMENTS.md](./SECURITY_REQUIREMENTS.md) — Multi-tenant isolation, 8 RBAC roles, Phase 8 auth plan
- [ARCHITECTURE_DECISIONS/](./ARCHITECTURE_DECISIONS/) — ADRs resolving codebase & stack decisions


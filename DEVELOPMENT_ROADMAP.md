# Project Sol (SolTransit) — Phase-by-Phase Implementation Roadmap & Deliverable Verification Matrix

**Deliverable:** Deliverable 12 (Phase-by-Phase Implementation Backlog)  
**Compliance Standard:** Every phase must pass its exit verification tests before starting the next phase (`master-prompt.md` §§21, 24, 25).

---

## Deliverable 12 Metadata

- **What will be built:** The sequential, milestone-gated Phase 0 through Phase 8 backlog across Infrastructure, NestJS Backend, Next.js Admin Web, Flutter Driver App, and Flutter Employee App, plus the verification table for all 12 Phase-0 deliverables.
- **Why it is required:** Prevents premature coding across hundreds of files before validating core contracts, tracks dependencies across teams/agents, and guarantees verifiable incremental progress.
- **Dependencies:** Deliverables 1–11.
- **Technologies:** Full Project Sol stack (Docker/PostGIS/Redis, NestJS 12, Drizzle, BullMQ, Next.js 16, Flutter 3.50).
- **Expected output:** Actionable backlog with clear scope, dependencies, acceptance criteria, and automated test targets per phase.
- **Acceptance criteria:** Every requirement in `PRD.md` maps to a concrete phase, the 20-step End-to-End MVP scenario passes by Phase 4/5 closure, and Phase 8 gates public deployment behind full auth & tenant isolation audits.
- **Relevant tests:** Per-phase unit, API E2E, DB spatial/idempotency, Flutter widget/offline, and Web dispatch verification suites.

---

## 1. Phase-by-Phase Implementation Backlog

### Phase 0 — Product & Architecture Planning *(Current Gate)*
- **Scope:** Produce `PRODUCT.md`, `DESIGN.md` (seed), Deliverables 1–12 (`PRD.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `DESIGN_SYSTEM.md`, `DOCKER_SETUP.md`, `AGENT_WORKFLOW.md`, `DEVELOPMENT_ROADMAP.md`, `PROJECT_OVERVIEW.md`), supporting §23 docs (`MOBILE_PERMISSIONS.md`, `GOOGLE_MAPS_INTEGRATION.md`, `TESTING_STRATEGY.md`, `SECURITY_REQUIREMENTS.md`, `ARCHITECTURE_DECISIONS/`), and align `pnpm-workspace.yaml` / `package.json`.
- **Exit Criteria:** All architectural contradictions resolved, visual world approved, all 12 deliverables documented with 7 required metadata fields.

### Phase 1 — Infrastructure & Central Transport Core *(Immediate Next Execution)*
- **Scope:**
  - `infra/docker-compose.yml` + root `docker-compose.yml` + `infra/.env.example` (PostgreSQL 16 + PostGIS 3.4 `transport_dev`, Redis 7 with password auth, named volumes, localhost port bindings, healthchecks).
  - Clean `pnpm-workspace.yaml` & `backend/package.json` dependency structure (NestJS 12 ESM, Drizzle ORM, `pg`, `ioredis`, BullMQ, `@nestjs/swagger`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `zod`, `vitest`, `oxlint`).
  - `backend/src/infrastructure/` (`config`, `database` with full 26-table Drizzle schema + initial SQL migration + synthetic Hyderabad seed script, `redis`, `queue`, `websocket`, `event-management` outbox, `common` envelope/error filter/`StandardSchemaValidationPipe`/`IdempotencyInterceptor`/`RequestContextGuard`, `shared` state machines & delay/Maps utilities, `health` endpoints).
  - Scaffold all 20 modular `backend/src/modules/*` folders cleanly + wire initial MVP core endpoints (`/health`, `/meta/enums`, `/admin/organizations`, initial `/admin/employees`, `/admin/drivers`, `/admin/vehicles`, `/admin/shifts`).
- **Acceptance Criteria & Tests:** Docker containers healthy; Drizzle migrations apply cleanly to `transport_dev`; seed populates Hyderabad org/offices/shifts/employees/driver/vehicle; `/api/v1/health/ready` returns Postgres + PostGIS + Redis `OK`; `/api/docs` serves OpenAPI JSON; Vitest unit + Supertest E2E suite passes.

### Phase 2 — Administrative Operations & Web Control Shell
- **Scope:**
  - Backend complete CRUD & workflows for `organizations`, `offices`, `shifts`, `vendors`, `employees` (including CSV/Excel import & `saved_locations`), `drivers`, `vehicles`, `approvals` (bulk approve/reject), `dispatch` (manual multi-employee trip allocation, stop ordering, scheduled ETAs, last-minute edits), `audit-logs`.
  - Next.js `web/` design system alignment (replace starter `base-sera`/`Playfair_Display` with `Harbor Pilot` `Figtree` + `Fira Code` tokens, build `AppShell` sidebar + top context bar, reusable DataTable, Bulk Dispatch Workbench, Employee/Driver/Vehicle/Approval pages).
  - Visual verification loop (`impeccable` `visualize` comps + `detect.mjs` + desktop/mobile screenshots + scan-mode `DESIGN.md` & `.impeccable/design.json`).
- **Acceptance Criteria & Tests:** Admin can create 3 employees, 1 driver, 1 vehicle, 1 shift, approve 3 bookings, and publish 1 ordered trip; Vitest multi-tenant isolation tests + Web component/workflow tests pass.

### Phase 3 — Driver Mobile Application (`apps/driver_app`)
- **Scope:**
  - Shared `packages/etms_core` Material 3 theme, tokens, and all 16 reusable components (`TripCard`, `PassengerCard`, `StatusBadge`, `GPSStatusIndicator`, `OfflineBanner`, etc.).
  - Backend driver trip execution engine: `Start Trip`, `Arrive` (PostGIS `ST_DWithin` check), `Picked Up` (optional OTP), `No-Show` (wait-timer + geofence + reason gate), **Automatic Next Pending Stop progression**, `Complete Trip`, `events` batch offline sync, and `no-show` appeal admin endpoints.
  - Driver Flutter app: Permission onboarding, Today's Duty dashboard, Active Trip Console with oversized stationary buttons, Google Maps 1-tap `url_launcher`, live countdown timer, Drift SQLite offline queue + `connectivity_plus` auto-sync.
- **Acceptance Criteria & Tests:** Driver executes full 3-passenger trip (2 Picked Up, 1 verified No-Show, reach office) both online and with simulated offline-reconnect without duplicate records; Flutter widget + Drift sync tests + Backend state/idempotency tests pass.

### Phase 4 — Employee Mobile Application (`apps/employee_app`)
- **Scope:**
  - Backend employee endpoints: bookings, `Running Late`, `Cannot Board` cancellation, upcoming trip timeline, boarding/deboarding OTP, Safe-Reach, SOS trigger.
  - Employee Flutter app: Permission onboarding, Home next-trip card, unambiguous shift booking form, saved pickup location picker, full pickup timeline + ETA + driver/vehicle card + `GPSStatusIndicator`, `Running Late` & `Cannot Board` actions, Safety SOS & Safe-Reach.
- **Acceptance Criteria & Tests:** 20-step End-to-End MVP scenario verified across Next.js Admin + NestJS Core + Driver Flutter + Employee Flutter; Flutter widget/navigation/state tests pass.

### Phase 5 — Real-Time Fleet Telemetry & Live Map
- **Scope:** Android foreground location service (`geolocator`) during active trips, Redis live GPS TTL state + accuracy/freshness tracking, Socket.IO real-time streaming to Next.js `react-leaflet` Live Fleet Map & Employee ETA timeline, BullMQ `location-processing` batch persistence to `gps_locations`, Redis restart recovery tests.
- **Acceptance Criteria & Tests:** Map updates live with explicit GPS age (`LIVE` vs `STALE >60s`), zero background tracking after `COMPLETED`/`ABORTED`, Redis restart recovery verified.

### Phase 6 — Notifications, Safety Escalations & Operational Improvements
- **Scope:** `flutter_local_notifications` + FCM adapter via BullMQ `notifications` & `trip-reminders` queues, pre-arrival & cab-approaching alerts, late/no-show/cancellation push fan-out, route deviation & stoppage detectors, no-show appeal workbench.
- **Acceptance Criteria & Tests:** Idempotent BullMQ job delivery, push/local reminder tests, SOS end-to-end escalation latency verified.

### Phase 7 — Operational Intelligence, Reports & Billing
- **Scope:** Recharts analytics & CSV export reports (attendance, decomposed punctuality, utilization, wait time, vendor SLA, cost per employee), vendor invoice generation & reconciliation (`invoices`), Phase 7 dispatch recommendation strategy (OR-Tools VRPTW evaluation), guarded read-only AI transport query assistant.
- **Acceptance Criteria & Tests:** Reconciled invoice totals match completed trips in Paise/INR; delay attribution separates driver vs employee wait accurately.

### Phase 8 — Authentication, Security Hardening & Production Readiness
- **Scope:** Full JWT/SSO authentication replacing dev identity headers, strict RBAC & cross-tenant penetration tests, rate limiting, PII encryption/retention purge jobs, backup/restore drills, load testing, containerized NestJS + Next.js deployment specs & observability.
- **Acceptance Criteria & Tests:** Zero unauthenticated access to `/api/v1/*` (except `/health` and auth login), 100% tenant isolation test pass, security audit sign-off.

---

## 2. Phase 0 Deliverables 1–12 Verification Matrix

| # | Deliverable | Artifact File(s) | Status |
| :-: | :--- | :--- | :--- |
| 1 | Complete Product Requirements Document | [PRD.md](./PRD.md) | Complete |
| 2 | System Architecture Diagram | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | Complete |
| 3 | Database Entity Relationship Diagram | [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Complete |
| 4 | Detailed Backend Module Breakdown | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | Complete |
| 5 | Initial API Endpoint Catalogue | [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Complete |
| 6 | Flutter Employee App Screen Map | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Complete |
| 7 | Flutter Driver App Screen Map | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Complete |
| 8 | Next.js Admin Dashboard Screen Map | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Complete |
| 9 | UI/UX Design System & Reference Analysis | [DESIGN.md](./DESIGN.md), [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Complete |
| 10 | Docker Compose Architecture | [DOCKER_SETUP.md](./DOCKER_SETUP.md) | Complete |
| 11 | AI Agent Responsibility & Git Strategy | [AGENT_WORKFLOW.md](./AGENT_WORKFLOW.md) | Complete |
| 12 | Phase-by-Phase Implementation Backlog | [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) | Complete |


# Project Sol (SolTransit) — AI Agent Collaboration & Git Branching Strategy

**Deliverable:** Deliverable 11 (AI Agent Responsibility & Git Branching Strategy)  
**Governance Authority:** `master-prompt.md` §19 + `root_agents.md` + `backend/AGENTS.md` + `web/AGENTS.md`

---

## Deliverable 11 Metadata

- **What will be built:** Specialist agent ownership boundaries, file-locking/non-overlap rules, mandatory CodeGraph MCP context & blast-radius verification protocol, and Git branch/merge conventions.
- **Why it is required:** Prevents multiple AI agents from inventing competing architectures, modifying overlapping files simultaneously, or breaking cross-client API/schema contracts.
- **Dependencies:** `SYSTEM_ARCHITECTURE.md`, `root_agents.md`, `.codegraph/` index.
- **Technologies:** Git, CodeGraph MCP (`codegraph_explore`), Vitest, TypeScript, `oxlint`, Flutter `flutter test` / `flutter analyze`, Impeccable `detect.mjs`.
- **Expected output:** Specialist roster matrix, CodeGraph before/after blast-radius protocol, branch naming rules, and merge checklists.
- **Acceptance criteria:** Every directory in `project_sol` has exactly one primary specialist owner per task, zero simultaneous edits on shared contracts without Master Architect approval, and every merge passes module + contract tests.
- **Relevant tests:** Workspace CI/verification script execution (`tsc`, `vitest`, `oxlint`, `next lint/build`, `flutter analyze/test`).

---

## 1. Specialist Agent Ownership Matrix

| Agent Role | Owned Directories | Primary Responsibilities | Forbidden Actions |
| :--- | :--- | :--- | :--- |
| **Master Architect (Coordinator)** | Root docs, `PRD.md`, `DESIGN.md`, `API_DOCUMENTATION.md`, `ARCHITECTURE_DECISIONS/`, shared DTO contracts | Maintains architecture, approves schema/API contract changes, resolves conflicts, assigns isolated branches, reviews merges | Never delegates schema changes without updating `DATABASE_SCHEMA.md` & `API_DOCUMENTATION.md` |
| **Infrastructure Specialist** | `infra/`, root `docker-compose.yml`, `pnpm-workspace.yaml`, `.env.example`, backup/migration scripts | Docker Compose (PostGIS + Redis), health probes, volume safety, Windows 11 dev scripts, CI pipelines | Never commits real secrets/credentials or modifies domain business services |
| **Backend Specialist** | `backend/src/**`, `backend/test/**`, `backend/drizzle/**` | NestJS 12 ESM modules, Drizzle migrations, PostGIS queries, Redis live cache, BullMQ workers, Socket.IO gateway, Vitest specs | Never installs paid services or couples controllers directly to Drizzle queries |
| **Web Specialist** | `web/app/**`, `web/components/**`, `web/lib/**`, `web/hooks/**` | Next.js 16 App Router dashboard, Harbor Pilot design tokens, TanStack Table dispatch workbench, React Leaflet live fleet map, Recharts analytics | Never re-implements backend business validation or connects directly to Postgres/Redis |
| **Flutter Specialist** | `apps/employee_app/**`, `apps/driver_app/**`, `packages/etms_core/**` | Shared `etms_core` Material 3 UI kit, GoRouter shells, Riverpod providers, Drift offline DB & replay queue, `geolocator`, `url_launcher`, `flutter_map`, FCM/local notifications | Never embeds business state transitions or computes next pickup stop on-device |
| **QA & Security Specialist** | `**/test/**`, `**/*.spec.ts`, `TESTING_STRATEGY.md`, `SECURITY_REQUIREMENTS.md` | Unit/E2E tests, idempotency & offline replay tests, multi-tenant isolation penetration checks, `impeccable detect.mjs` + finish review | Never relaxes assertions or mocks away persistence checks for integration gates |

---

## 2. Mandatory CodeGraph & Blast-Radius Protocol (`root_agents.md`)

Whenever `.codegraph/` is present at repo root:
1. **Before Reading/Editing:** Query `codegraph_explore` first with target symbol/file names to read verbatim source AND inspect callers + tests ("blast radius") in one round-trip.
2. **After Editing:** Run `codegraph_explore` on modified public exports/contracts (e.g., DTOs, Drizzle tables, `etms_core` widgets, Socket event types) to verify all dependent callers across `backend/`, `web/`, and `apps/` remain consistent, and run the affected test suites (`vitest`, `tsc`, `flutter test`).

---

## 3. Git Branching & Merge Discipline

*Note: Initialize `.git` cleanly before branching parallel work.*

```text
main (protected stable milestones — every phase verified end-to-end)
 └── develop (integration branch)
      ├── phase-0/architecture-and-docs
      ├── phase-1/infra-docker-and-core-backend
      ├── phase-2/admin-ops-and-web-dispatch
      ├── phase-3/driver-offline-execution
      ├── phase-4/employee-commute-app
      ├── phase-5/realtime-gps-and-fleet-map
      ├── phase-6/notifications-and-appeals
      ├── phase-7/dispatch-intelligence-and-billing
      └── phase-8/auth-security-and-hardening
```

### Parallel Task Isolation Rules
1. Never let two agents modify the same file simultaneously; split by vertical domain module or client workspace (`backend/` vs `web/` vs `apps/driver_app/` vs `apps/employee_app/`).
2. Any change to `API_DOCUMENTATION.md` or `backend/src/infrastructure/database/schema/` is **contract-first**: Master Architect locks the contract before Web/Flutter branches consume it.
3. **Merge Gate:** `tsc --noEmit` + `oxlint` + `vitest run` (Backend); `next typegen && eslint && build` (Web); `flutter analyze && flutter test` (Flutter).


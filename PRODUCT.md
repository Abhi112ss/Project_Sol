# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Enterprise Employees** (Primary Mobile Rider — `apps/employee_app`, Android-first Flutter): Shift-based corporate staff commuting between home pickup zones and office campuses across 24/7 login and logout shifts; need unmistakable booking dates, live pickup order, GPS freshness, delay/cancellation communication (`Running late`, `Cannot board`), OTP boarding/deboarding, and safety escalation (SOS, safe-reach).
2. **Fleet Drivers** (Primary Mobile Operator — `apps/driver_app`, Android-first Flutter): Contracted or vendor drivers executing multi-stop shift pickups and drops; operate under patchy mobile connectivity and strict stationary-interaction safety; need one-tap external Google Maps navigation, automatic backend-governed stop progression, geofenced arrival + waiting timer + reason-coded no-show verification, and offline-first SQLite/Drift event queuing.
3. **Transport Operations & Administration** (Primary Web Operator — `web/`, Next.js desktop-first dashboard): Platform Super Administrators, Organization Administrators, Transport Managers, Duty Approvers, Vendor Supervisors, and Auditors; coordinate multi-tenant employee transport, bulk duty approvals, manual vehicle/driver dispatch and stop sequencing, live fleet monitoring, no-show audits, compliance, reports, and vendor invoice reconciliation.

## Product Purpose

**Project Sol (SolTransit)** is a multi-tenant Enterprise Employee Transportation Management System (ETMS) modeled around MoveInSync-grade corporate commute operations. It unifies employee self-service, stationary-safe driver trip execution, and high-density administrative dispatch under one centralized backend brain (**Central Transport Core**) so every client reflects authoritative state transitions, audit history, and safety accountability.

Success means:
- Zero ambiguity on travel date, shift, and login/logout direction during employee booking.
- Zero silent data loss for drivers operating in low-connectivity corridors through idempotent offline sync.
- End-to-end verifiable trip execution: bulk duty approval -> manual dispatch -> driver start -> external Google Maps navigation -> pickup / geofenced no-show verification -> office arrival -> auditable history and billing reconciliation.
- Zero additional software/infrastructure spend during buildout (₹0 budget policy using local Docker, open-source tooling, OSM/Leaflet/flutter_map, and universal Google Maps URL intents).

## Positioning

Unlike consumer ride-hailing or generic fleet trackers, SolTransit is an enterprise shift-transport operations core built around four structural guarantees:
1. **Single Centralized Brain:** Only the NestJS Central Transport Core computes stop progression, state transitions, delay decomposition (driver arrival vs. employee boarding/waiting), and multi-tenant authorization boundaries (`organization_id`).
2. **Staleness-Honest Telemetry:** Every live GPS coordinate carries capture timestamp and accuracy; stale Redis cache entries never masquerade as live tracking.
3. **Auditable No-Show Governance:** Drivers cannot unilaterally mark a passenger no-show on arrival; the backend enforces trip assignment, PostGIS geofence proximity (when GPS is available), arrival timestamp, configurable wait timer, mandatory reason code, evidence trail, notifications, and admin appeal correction.
4. **Offline-First Driver Continuity:** Drivers queue arrival, boarding, no-show, and GPS telemetry locally in SQLite/Drift with client-generated unique event IDs and replay idempotently on reconnect without duplicating records.

## Operating Context

- **Primary Seeded Locale:** Hyderabad, India (IST `Asia/Kolkata`, ₹ INR billing/costing, 24/7 IT/BPO login and logout shift cycles, corridor exemplars including Kukatpally, Miyapur, Ameerpet, Madhapur, and Gachibowli).
- **Multi-Tenancy:** Every organization-owned record isolates by `organization_id` with per-organization policies (`organization_settings` for geofence radius, wait duration, cancellation cutoffs, OTP rules, and retention).
- **Navigation Hand-off:** Turn-by-turn driving directions launch externally into Google Maps using stored latitude/longitude coordinates (`saved_locations` as source of truth, never Google Maps links alone).
- **Development Environment:** Local Windows 11 + Docker Desktop running PostgreSQL + PostGIS (`transport_dev`) and Redis, with NestJS 12 ESM (`Vitest` + `oxlint`), Next.js 16 App Router, and Flutter 3.50 (`Dart 3.14`, `material_ui`, `etms_core`).

## Capabilities and Constraints

- **Three Interfaces, One Core:** Exactly two Flutter apps (`apps/employee_app`, `apps/driver_app`) and one Next.js web control panel (`web/`), all talking to `/api/v1/*` and Socket.IO gateways on `backend/`.
- **PostgreSQL + PostGIS is Permanent Truth:** Redis stores volatile live locations, active trip pointers, cache, and BullMQ job queues; critical trip and passenger events persist to PostgreSQL before acknowledgment.
- **Routing Sequence:** MVP dispatch uses manual/approver-configured pickup sequences; automated route optimization (OR-Tools VRPTW) and AI transport insights belong to Phase 7.
- **Authentication Sequencing:** Full auth/SSO enforcement is deferred to Phase 8, while role definitions (8 RBAC roles), `organization_id` scoping, and guarded request context abstractions ship from Day 1. Development builds must never be exposed publicly without auth.
- **Zero-Budget & Compliance Guardrails:** No paid APIs (Google Directions/Places billing APIs, commercial map tiles, paid hosting, paid AI APIs) without explicit approval. Synthetic seeded employee/trip fixtures only during development; employee home addresses and GPS trails are treated as sensitive personal data.
- **External Service Replaceability:** Notification delivery (FCM/local), map tile layers, and future Kafka event streaming (`transactional outbox` pattern) sit behind backend abstractions.

## Brand Commitments

- **Working Product Name:** Project Sol / SolTransit (custom corporate identity; no MoveInSync branding, proprietary assets, or copied code).
- **Domain Tone:** Calm, verifiable, operational clarity over consumer-taxi novelty.

## Evidence on Hand

- `master-prompt.md` — Authoritative 25-section product, architecture, database, API, UI/UX, roadmap, and verification specification.
- `backend/` — NestJS 12 ESM scaffold (`vitest`, `oxlint`, `backend/AGENTS.md` defining Drizzle/idempotency/outbox/StandardSchema conventions).
- `web/` — Next.js 16.4.6 + React 19 + Tailwind CSS v4 + shadcn/Base UI + TanStack Table/Query + Recharts + React Leaflet + Socket.IO client scaffold (`web/AGENTS.md`).
- `apps/driver_app/`, `apps/employee_app/`, `packages/etms_core/` — Flutter 3.50 / Dart 3.14 scaffolds with `flutter_riverpod`, `go_router`, `dio`, `drift`, `geolocator`, `flutter_map`, `url_launcher`, `flutter_local_notifications`, `firebase_messaging`.
- `infra/` — Pending Docker Compose setup (`docker-compose.yml` and `.env` currently empty).
- **Absences not to fabricate:** Live production telemetry, real employee PII/addresses, paid routing travel-time SLAs, or real vendor billing histories do not exist yet; all demonstration/seed fixtures must be clearly labeled synthetic.

## Product Principles

1. **Central Core Owns State:** Clients render and queue intent; only the NestJS backend validates transitions, computes next stops, and commits permanent PostgreSQL truth.
2. **Staleness and Connectivity Are Explicit:** Never show stale GPS as live or offline queues as server-verified; surface timestamp, accuracy, and sync state plainly.
3. **Stationary-First Driver Safety:** Driver interactions minimize cognitive load and require minimal taps; heavy turn-by-turn navigation belongs to external Google Maps.
4. **High-Density Dispatch Speed:** Administrative tools prioritize scanability, bulk actions, keyboard efficiency, and explicit status badges over decorative chrome.
5. **Policy Configurable, Tenant Isolated:** Never hardcode single-company transport rules; bind policies to `organization_settings` and isolate every record by `organization_id`.

## Accessibility & Inclusion

- Web admin dashboard targets WCAG AA contrast (>= 4.5:1 body text), full keyboard navigation, visible focus rings, tabular numerals for times/delays/counts, and `prefers-reduced-motion` support.
- Flutter mobile apps adhere to Android Material 3 accessibility: >= 48x48 dp touch targets (even larger primary driver CTAs for stationary cab use), system font-size (`sp`) scaling, and edge-to-edge window insets / predictive back compliance.


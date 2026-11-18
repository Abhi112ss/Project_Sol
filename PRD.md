# Project Sol (SolTransit) — Product Requirements Document (PRD)

**Deliverable:** Deliverable 1 (Complete Product Requirements Document)  
**Version:** 1.0 (Phase 0 Baseline)  
**Product Identity:** Project Sol / SolTransit  
**Primary Seeded Locale:** Hyderabad, India (`Asia/Kolkata`, ₹ INR, 24/7 IT/BPO login & logout shifts)  
**Budget Constraint:** ₹0 additional spend (100% open-source, local Docker, free-tier/external universal Maps URLs)

---

## Deliverable 1 Metadata

- **What will be built:** The authoritative functional, non-functional, operational, multi-tenant, and safety requirements specification for Project Sol across all three client apps (`apps/employee_app`, `apps/driver_app`, `web/`) and the centralized NestJS backend (`backend/`).
- **Why it is required:** Prevents client apps from inventing conflicting business rules, locks down multi-tenant `organization_id` isolation and zero-budget boundaries before writing code, and aligns all specialist agents around verifiable acceptance criteria.
- **Dependencies:** `master-prompt.md`, `PRODUCT.md`, confirmed stakeholder decisions (Hyderabad locale, NestJS 12 ESM + Vitest, Flutter 3.50 `material_ui`, Harbor Pilot visual direction).
- **Technologies:** Markdown specification + Mermaid state/workflow models validated against NestJS 12, PostgreSQL 16 + PostGIS 3.4, Redis 7 + BullMQ, Flutter 3.50, and Next.js 16.
- **Expected output:** Complete PRD covering personas, 8 RBAC roles, 3 applications, 10 differentiation pillars, domain state/delay/no-show rules, non-functional SLAs, and documented assumptions/contradictions.
- **Acceptance criteria:** Every functional domain in `master-prompt.md` §§1–24 maps to numbered requirements (`REQ-*`), all architectural contradictions are documented and resolved, and every milestone links to verification tests.
- **Relevant tests:** Requirement traceability verification against Phase 1–8 test suites and the 20-step End-to-End MVP Verification Scenario (`TESTING_STRATEGY.md`).

---

## 1. Executive Problem Statement

Corporate shift transportation in 24/7 IT/BPO hubs like Hyderabad coordinates thousands of daily home-to-office (`LOGIN`) and office-to-home (`LOGOUT`) trips across third-party fleet vendors. Existing tools suffer from date/shift booking ambiguity (especially around midnight/early-morning login windows), opaque pickup ordering, stale GPS dots pretending to be live, unverified driver no-shows without geofence or waiting evidence, silent data loss in patchy cellular zones, and cluttered driver interfaces that distract drivers on the road.

**SolTransit** solves this by placing **every authoritative decision inside one Central Transport Core (NestJS + PostgreSQL/PostGIS + Redis/BullMQ)** while giving each user persona a dedicated, purpose-built interface:
1. **Employee Mobile App (`apps/employee_app`):** Simple, transparent commute companion.
2. **Driver Mobile App (`apps/driver_app`):** Stationary-safe, offline-first execution tool with one-tap Google Maps handoff.
3. **Transport Administration Web (`web/`):** High-density desktop operations, dispatch, live fleet monitoring, compliance, and billing desk.

---

## 2. User Personas & 8 RBAC Roles

Authorization boundaries (`organization_id` + role guards) are built into every API contract from Day 1, even while full SSO/JWT login enforcement is staged in Phase 8 (local dev uses seeded test identities with explicit `x-dev-user-id` / `x-dev-org-id` context headers restricted to localhost dev mode).

| Role Key | Display Title | Scope | Primary Interface | Core Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `PLATFORM_SUPER_ADMIN` | Platform Super Administrator | Global cross-org | Web Admin | Provision organizations, default policies, platform health, audit oversight |
| `ORG_ADMIN` | Organization Administrator | Single `organization_id` | Web Admin | Configure `organization_settings`, offices, shifts, users, vendors, billing rules |
| `TRANSPORT_MANAGER` | Transport Manager | Single `organization_id` | Web Admin | Monitor live fleet, resolve SOS/deviations, review no-show appeals, run analytics |
| `DUTY_APPROVER` | Duty Approver / Dispatcher | Single `organization_id` (optionally office-scoped) | Web Admin | Bulk approve shift requests, pair drivers/vehicles, configure stop sequence & ETAs |
| `VENDOR_SUPERVISOR` | Vendor Supervisor | Org + assigned `vendor_id` | Web Admin | Manage vendor fleet vehicles, driver availability, compliance docs, billing reconciliation |
| `DRIVER` | Fleet Driver | Own `driver_id` & assigned trips | Driver Flutter App | View assigned shifts, start trip, external Google Maps nav, arrival/boarded/no-show events, offline sync |
| `EMPLOYEE` | Corporate Employee | Own `employee_id` & bookings | Employee Flutter App | Manage home/pickup addresses, book login/logout shifts, view pickup timeline/ETA, cancel/late, OTP, SOS, safe-reach |
| `AUDITOR` | Compliance Auditor | Read-only scoped `organization_id` | Web Admin | Inspect immutable `audit_logs`, `trip_events`, no-show evidence, SOS resolution records |

---

## 3. Core Product Workflows & Functional Requirements

### 3.1 Multi-Tenant Organization & Policy Engine (`REQ-ORG-*`)
- `REQ-ORG-01`: Every organization-owned entity (`employees`, `drivers`, `vehicles`, `vendors`, `offices`, `shifts`, `bookings`, `trips`, `saved_locations`, `safety_alerts`, `invoices`, `audit_logs`) MUST store `organization_id` and reject cross-tenant queries or mutations.
- `REQ-ORG-02`: `organization_settings` governs per-org rules:
  - `default_geofence_radius_m` (default `150m`, configurable per location override)
  - `no_show_wait_seconds` (default `300s` / 5 min)
  - `booking_cutoff_minutes_before_shift` (e.g., `120m`)
  - `cancellation_cutoff_minutes_before_pickup` (e.g., `45m`)
  - `require_boarding_otp` (`boolean`, default `true`) & `require_deboarding_otp` (`boolean`, default `false` or configurable for night-shift female safety)
  - `gps_stale_threshold_seconds` (default `60s`)
  - `gps_retention_days` (default `90` days) & `gps_ping_interval_seconds` (default `15s` active trip)
  - `currency_code` (`INR`), `timezone` (`Asia/Kolkata`).

### 3.2 Application 1: Employee Mobile App (`REQ-EMP-*`)
- `REQ-EMP-01` **Onboarding & Permissions**: Welcome & permission explanation screen detailing *why* Notifications and Location (only when verifying pickup pin or triggering SOS) are requested. Never demand all Android permissions at startup; handle permanent denial gracefully with Settings guidance.
- `REQ-EMP-02` **Profile & Saved Pickup Locations**: Employees manage multiple saved pickup points (`saved_locations`: e.g., `Home - Kukatpally`, `PG - Madhapur`) backed by authoritative `latitude`/`longitude`, geofence radius, optional `google_place_id`, and optional original Maps URL.
- `REQ-EMP-03` **Unambiguous Shift Booking**: Booking form displays exact calendar date (`Tue, 17 Nov 2026`), shift label + time window (`Shift S1 · 09:00 IST Login`), direction badge (`HOME → OFFICE` vs `OFFICE → HOME`), pickup pin, and destination office (`DLF Cyber City / Gachibowli Campus`). Prevents midnight/next-day shift confusion by explicitly confirming shift anchor date and pickup date/time.
- `REQ-EMP-04` **Home Dashboard & Complete Pickup Visibility**: Above-the-fold next scheduled trip card shows approval status (`PENDING`, `APPROVED`, `DISPATCHED`), assigned driver name/phone/rating/compliance badge, vehicle model & registration (`TS 07 UA 4821`), passenger count (`Stop 2 of 4`), pickup sequence timeline, ETA, and **GPS freshness indicator** (`Updated 9s ago · ±10m · Moving` or `Signal stale: 3m 20s ago`).
- `REQ-EMP-05` **Self-Service Communication**: Two prominent single-tap actions on active/upcoming trips:
  - **Running Late**: Select expected delay (`+5 min`, `+10 min`, `+15 min`, custom note); updates passenger record, notifies driver and dispatcher via WebSocket + push.
  - **Cannot Board (Cancellation)**: Cancels assignment subject to org cutoff rules (`CANCELLED_BY_EMPLOYEE`), stamps card visibly, immediately updates driver's next-stop queue and notifies dispatcher. Silent disappearance is disallowed.
- `REQ-EMP-06` **Boarding & Deboarding OTP + Safe-Reach**: Displays 4-digit per-assignment OTPs (`otp_records`), allows employee to confirm **Safe Reach** on arrival at home/office (critical for late-night logout trips), and report missed pickups or feedback.
- `REQ-EMP-07` **Emergency SOS**: High-visibility Safety tab + active-trip SOS trigger capturing latest coordinates, creating a `CRITICAL` `safety_alerts` record, broadcasting immediately over WebSocket to Admin Dashboard and escalating to emergency contact / transport manager.

### 3.3 Application 2: Driver Mobile App (`REQ-DRV-*`)
- `REQ-DRV-01` **Driver Dashboard**: Shows driver identity, assigned vehicle & registration, connectivity pill (`Online` / `Offline · 2 queued`), GPS tracking pill (`Active · ±8m` / `Paused`), and today's chronological login/logout trip queue with stop & passenger counts.
- `REQ-DRV-02` **One-Tap External Navigation Workflow**:
  1. Driver reviews passenger manifest & taps **Start Trip** (`ASSIGNED`/`DRIVER_ACCEPTED` -> `IN_PROGRESS`).
  2. Backend locks initial stop and returns the first pending stop's authoritative coordinates.
  3. Driver taps **Navigate in Google Maps** -> Flutter `url_launcher` opens `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving&dir_action=navigate` (or universal fallback). Turn-by-turn routing stays in Google Maps.
  4. Driver returns to SolTransit upon arriving stationary at the pickup zone and taps **Arrived at Pickup**.
  5. UI starts an explicit **Waiting Countdown Timer** tied to server-configured `no_show_wait_seconds`.
  6. Driver marks **Picked Up** (with optional/required OTP verification depending on org policy) OR **No-Show** (unlocked only after geofence + wait preconditions or explicit offline-pending flag).
  7. Backend transitions passenger assignment, skips `CANCELLED`/`BOARDED`/`NO_SHOW` stops, and automatically returns the next pending stop (or final office destination when all pickups conclude).
  8. Driver taps **Navigate Next** -> repeats until **Complete Trip** at destination office.
- `REQ-DRV-03` **Verified No-Show Governance**: Driver cannot submit `NO_SHOW` instantly on arrival. System enforces:
  1. Valid active trip & passenger assignment (`ARRIVED` state recorded first).
  2. PostGIS geofence distance check (`<= geofence_radius_m`) when GPS is available (logs distance in meters).
  3. Elapsed waiting duration `>= no_show_wait_seconds`.
  4. Mandatory structured no-show reason (`PASSENGER_UNREACHABLE`, `DID_NOT_EXIT`, `CANCELLED_AT_DOOR`, `WRONG_LOCATION`, `OTHER` + optional note).
  5. Recorded GPS coordinates, accuracy, and client/server timestamps in `no_show_records` + `trip_events`.
  6. Real-time alert to passenger & admin; supports admin investigation & appeal reversal (`NO_SHOW` -> corrected record with audit log) without failing the rest of the trip.
- `REQ-DRV-04` **Delay Decomposition Model**: Backend persists raw timestamps (`scheduled_arrival_at`, `actual_arrival_at`, `boarded_at`, `no_show_at`, `server_received_at`) and computes durations in integer seconds:
  - `arrival_delay_seconds = actual_arrival_at - scheduled_arrival_at` (negative = early, `0` = on time, positive = late).
  - `passenger_wait_seconds = (boarded_at or no_show_at) - actual_arrival_at`.
  - Distinguishes **driver arrival punctuality** from **employee boarding delay** so drivers arriving on time are never penalized when waiting for a late employee.
- `REQ-DRV-05` **Offline-First SQLite (Drift) Sync & Idempotency**: Driver app stores active trip, stops, passenger list, queued `trip_events` (each carrying a UUIDv4 `idempotency_key` / `client_event_id`), and buffered `gps_locations` in SQLite via Drift. While offline, actions display **Saved Locally — Pending Server Sync** (never falsely claiming server verification). On reconnect (`connectivity_plus`), queued events flush chronologically to `POST /api/v1/driver/trips/:tripId/events/sync` with backend idempotency guaranteeing zero duplicate boardings or no-shows even across app restarts or double-taps.
- `REQ-DRV-06` **Foreground Location Service (Privacy-Bounded)**: Android foreground service starts ONLY when driver explicitly starts a trip, pings backend + Redis live key at battery-conscious intervals, continues while Google Maps is in the foreground, and automatically terminates on `COMPLETED` or `ABORTED`. Zero background tracking off-duty.

### 3.4 Application 3: Transport Administration Web (`web/`) (`REQ-ADM-*`)
- `REQ-ADM-01` **Operational Overview Dashboard**: Live KPI counts (`Active Trips`, `Completed`, `Delayed Pickups`, `No-Shows`, `Available Vehicles`, `Active Emergencies`), upcoming shift readiness, alert feed, and quick jump to dispatch/live map.
- `REQ-ADM-02` **Master Data & Bulk Import**: Full CRUD + filtering/sorting/pagination via TanStack Table for Employees (including CSV/Excel import + `saved_locations` verification), Drivers (documents, availability, suspension, vehicle pairing), Vehicles (type, seating capacity, registration, insurance/permit expiry tracking), Offices, Shifts, and Vendors.
- `REQ-ADM-03` **Duty Approval & Manual Dispatch Workbench**:
  1. Select `date` + `direction` (`LOGIN`/`LOGOUT`) + `shift`.
  2. Filter pending employee bookings by department, office, and pickup corridor (`Kukatpally`, `Miyapur`, `Gachibowli`).
  3. Individual or bulk select & approve bookings.
  4. Select available driver + capacity-appropriate vehicle; assign multiple employees to one trip.
  5. Drag/reorder pickup sequence (`1..N`) and set scheduled pickup timestamps.
  6. Publish allocation -> creates `trip`, `trip_stops`, `passenger_assignments`, and notifies driver & employees.
  7. Support authorized last-minute reassignments/cancellations with mandatory audit entries.
  *(Automatic vehicle/driver recommendation engine joins in Phase 7 behind a clean dispatch strategy interface.)*
- `REQ-ADM-04` **Live Fleet Monitoring Map**: Interactive `react-leaflet` (OSM) map + vehicle roster table showing vehicle registration, driver, trip status, next stop, passenger count, ETA, **GPS age & accuracy badge**, delay alerts, and active SOS alerts with one-click trip inspection drawer.
- `REQ-ADM-05` **No-Show Appeals, Safety Console, Reports & Billing**: Admin workflow to review/correct no-show disputes, acknowledge/escalate SOS and route deviation alerts, generate/export daily/monthly attendance, driver punctuality, vehicle utilization, average wait time, vendor performance, cost-per-employee, and vendor invoice reconciliation reports (Recharts + CSV export).

---

## 4. Product Differentiation Matrix (10 Improvements over Legacy ETMS)

| # | Weakness in Legacy Tools | SolTransit Architectural & UX Solution |
| :-: | :--- | :--- |
| 1 | Confusing midnight / next-day shift dates | Explicit shift anchor date + pickup timestamp + `HOME → OFFICE` / `OFFICE → HOME` directional strip |
| 2 | Employees silently ghost cabs | Single-tap `Running Late (+ETA)` & `Cannot Board` with cutoff guard and instant driver/dispatcher sync |
| 3 | Opaque pickup sequence | Full numbered pickup timeline (`Stop 2 of 4`), seat count, driver/vehicle verification card, and live ETA |
| 4 | Stale GPS shown as live | Mandatory `last_updated` relative timer + GPS accuracy (`±10m`) + Redis TTL staleness flag (`>60s` = Stale) |
| 5 | Arbitrary driver no-show flags | PostGIS geofence check + server-tracked wait timer + mandatory reason + GPS evidence + admin appeal audit |
| 6 | Silent drops in dead-zone basements | Drift SQLite queue + UUID `Idempotency-Key` + visible `Pending Sync` banner + replay reconciliation |
| 7 | Cluttered slow admin screens | Desktop-first high-density TanStack dispatch table + keyboard navigation + bulk assign + right-hand inspector |
| 8 | Driver distraction switching apps | Stationary-safe oversized buttons, backend-computed next destination, 1-tap Google Maps URL launch |
| 9 | Weak commuter safety closure | Boarding/deboarding OTPs, Night-shift Safe-Reach confirmation, Route Deviation alerts, SOS live escalation |
| 10 | Raw logs without cost/delay insight | Decomposed `arrival_delay_seconds` vs `passenger_wait_seconds`, vendor SLA scorecards, cost-per-employee |

---

## 5. Non-Functional Requirements

- **Central Authority:** Zero business state logic duplicated in Flutter or Next.js; all transitions validated server-side.
- **Reliability & Durability:** Critical trip/passenger events commit to PostgreSQL in ACID transactions before emitting BullMQ jobs (via transactional outbox table) or acknowledging client sync.
- **API Latency Targets (Local Dev Baseline):** Standard CRUD/dispatch queries `< 150ms` p95; driver event ingestion `< 200ms` p95; live GPS ping to Redis + WS fan-out `< 100ms` p95.
- **Multi-Tenant Isolation:** 100% of organization-scoped database queries include `organization_id` predicate verified by integration tests.
- **Accessibility & Ergonomics:** Web WCAG AA (>=4.5:1 text contrast, keyboard focus rings, `tabular-nums`, `prefers-reduced-motion`); Mobile Android Material 3 (`>=48dp` targets, `sp` text scaling, edge-to-edge insets, predictive back).
- **Zero-Budget Discipline:** No paid map APIs (no Google Directions/Distance Matrix API calls), no commercial telemetry/APM spend, synthetic seeded fixtures only.

---

## 6. Documented Assumptions & Resolved Architectural Contradictions

| # | Contradiction / Ambiguity Identified | Authoritative Resolution |
| :-: | :--- | :--- |
| **C-01** | `master-prompt.md` §5 lists Jest for backend tests, whereas scaffolded `backend/AGENTS.md` + `backend/package.json` configure NestJS 12 ESM (`"type": "module"`, `.js` imports) + **Vitest** (`vi.fn()`) + **oxlint**. | Standardized on **NestJS 12 ESM + Vitest + oxlint** per `backend/AGENTS.md` and confirmed user decision (`ADR-001`). |
| **C-02** | Drizzle ORM, BullMQ, Swagger, Socket.io, ioredis, pg, and Zod were installed in root `package.json`, while `backend/package.json` only contained `@nestjs/common`, `core`, `platform-express`, and `pnpm-workspace.yaml` lacked `packages:`. | Configure `pnpm-workspace.yaml` (`backend`, `web`) and move all NestJS/Drizzle/Redis/BullMQ backend dependencies into `backend/package.json` cleanly (`ADR-001`). |
| **C-03** | `backend/AGENTS.md` mentions `@nestjs/drizzle`, `@nestjs/idempotency`, `@nestjs/outbox`, and `StandardSchemaValidationPipe`. Inspection of `node_modules` confirms `StandardSchemaValidationPipe` is built into `@nestjs/common` v12, whereas `@nestjs/drizzle`/`idempotency`/`outbox` are not installed packages. | Use native `@nestjs/common` `StandardSchemaValidationPipe` + Zod v4 directly, and implement explicit modular `DatabaseModule` (`drizzle-orm/node-postgres` + `pg`), `IdempotencyInterceptor` (`idempotency_keys` table + Redis fast lock), and `OutboxModule` (`outbox_events` table + BullMQ publisher) cleanly within `backend/src/infrastructure/` without adding unverified third-party packages. |
| **C-04** | `apps/driver_app` & `apps/employee_app` use Flutter 3.50 / Dart 3.14 where Material widgets live in `package:material_ui/material_ui.dart` (`pubspec.yaml`: `material_ui: ^1.1.0`). | Keep `material_ui` + `etms_core` on Flutter 3.50 / Dart 3.14; design shared tokens and widgets inside `packages/etms_core` importing `material_ui`. |
| **C-05** | `web/` starter generated with shadcn `base-sera` + `taupe` + `Playfair_Display` serif headings + sharp `rounded-none uppercase` buttons, conflicting with `master-prompt.md` §16 (light enterprise blue/navy operations platform) and `impeccable` `operate.md` (no display serifs in UI labels). | Replace `web/` starter `Playfair_Display`/`taupe`/`rounded-none` configuration with the confirmed **Harbor Pilot Dispatch & Bridge Telemetry** palette (`#F7F9FC`, `#0F2544`, `#2563EB`) and `Figtree` + `Fira Code` typography in Phase 2 (`ADR-005`). |
| **C-06** | `master-prompt.md` §12 mentions `flutter_map`/OSM while warning against assuming unlimited commercial OSM tile usage, and specifies Google Maps URLs for driver navigation. | Use free Google Maps universal URLs (`url_launcher`) for driver turn-by-turn navigation, configurable tile URL env vars (`OSM_TILE_URL`) for local dev `flutter_map`/`react-leaflet` with explicit User-Agent + rate restraint, and coordinate-first `saved_locations` in PostGIS (`ADR-004`). |
| **C-07** | Auth postponed until Phase 8 vs Day-1 multi-tenant safety. | Implement `RequestContext` guard + `RolesGuard` + `TenantIsolation` middleware/decorators from Phase 1 using explicit dev-only header/seeded test identity resolver (`NODE_ENV !== 'production'` lock), so Phase 8 drops in JWT/SSO token verification without rewriting module contracts (`ADR-004`). |


# Project Sol (SolTransit) — API Contract & Endpoint Catalogue

**Deliverable:** Deliverable 5 (Initial API Endpoint Catalogue & Real-Time Contract)  
**API Base Prefix:** `/api/v1`  
**Interactive Docs (Dev):** `/api/docs` (Swagger / OpenAPI via `@nestjs/swagger` v12)  
**Real-Time Transport:** Socket.IO (`@nestjs/websockets` + `@nestjs/platform-socket.io`)

---

## Deliverable 5 Metadata

- **What will be built:** The versioned `/api/v1/` REST contract across Employee, Driver, Admin, and System Health namespaces, unified JSON response envelopes, structured error codes, Zod (`StandardSchemaValidationPipe`) request schemas, `Idempotency-Key` semantics, and Socket.IO live room events.
- **Why it is required:** Ensures Flutter Employee, Flutter Driver, and Next.js Admin talk to one consistent server contract from Phase 1 onward without inventing ad-hoc payload shapes or duplicating business rules.
- **Dependencies:** `PRD.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`.
- **Technologies:** NestJS 12 REST + Swagger (`@nestjs/swagger`), Zod v4 (`StandardSchemaValidationPipe`), Socket.IO v4, PostgreSQL `idempotency_keys`.
- **Expected output:** Complete endpoint catalogue, request/response envelopes, error code table, pagination/filtering conventions, and WebSocket event schema.
- **Acceptance criteria:** Every endpoint uses `/api/v1/` prefix, returns standardized envelopes (`ApiEnvelopeInterceptor`), validates payloads with `StandardSchemaValidationPipe`, enforces `x-dev-org-id` / tenant isolation, and publishes accurate OpenAPI schema at `/api/docs`.
- **Relevant tests:** Supertest E2E contract tests, Zod validation failure `400` tests, `Idempotency-Key` replay deduplication tests, pagination envelope tests, and WebSocket room broadcast tests.

---

## 1. Global HTTP Conventions

### 1.1 Standard Response Envelope

Every JSON response from `/api/v1/*` follows one predictable envelope:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_01J...",
    "serverTime": "2026-11-16T16:15:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 142,
      "totalPages": 6
    }
  },
  "error": null
}
```

Error envelope (`4xx` / `5xx`):

```json
{
  "success": false,
  "data": null,
  "meta": {
    "requestId": "req_01J...",
    "serverTime": "2026-11-16T16:15:00.000Z"
  },
  "error": {
    "code": "NO_SHOW_WAIT_TIMER_NOT_ELAPSED",
    "message": "Wait timer requires 142 more seconds before marking No-Show.",
    "details": {
      "requiredWaitSeconds": 300,
      "elapsedSeconds": 158
    }
  }
}
```

### 1.2 Standard Headers & Dev Identity Context (Pre-Phase 8)

- `X-Idempotency-Key`: **Required** (`UUIDv4`) on all state-mutating driver actions, offline event syncs, booking creations, bulk dispatch publications, and SOS triggers. Replaying the same key with the same payload returns the stored status & body without re-executing mutations; reusing the same key with a different payload returns `409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.
- `X-Correlation-Id`: Optional trace ID propagated into `audit_logs` and structured logs.
- **Local Development Identity Headers** *(strictly disabled when `NODE_ENV=production`; replaced by JWT Bearer validation in Phase 8)*:
  - `X-Dev-User-Id`: Seeded test user UUID
  - `X-Dev-Org-Id`: Seeded organization UUID
  - `X-Dev-Role`: Role override from the 8 RBAC roles (validated against user's `memberships` row).

### 1.3 Standard Error Codes

| HTTP Status | `error.code` | Meaning / Recovery |
| :-: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Zod schema validation failed (`details.issues[]`) |
| `401` | `UNAUTHORIZED` | Missing/invalid identity context or JWT (Phase 8) |
| `403` | `TENANT_FORBIDDEN` / `ROLE_FORBIDDEN` | Cross-organization access or insufficient RBAC role |
| `404` | `RESOURCE_NOT_FOUND` | Entity not found inside caller's `organization_id` |
| `409` | `INVALID_STATE_TRANSITION` | Trip or passenger state cannot transition as requested |
| `409` | `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` | Same `X-Idempotency-Key` reused with altered payload |
| `409` | `BOOKING_SERIES_OVERLAP` | Recurring dates overlap existing active reservations for same direction |
| `409` | `DRIVER_OR_VEHICLE_INTERVAL_CONFLICT` | Driver or vehicle is already scheduled inside overlapping interval + turnaround buffer |
| `422` | `NO_SHOW_GEOFENCE_OUT_OF_RANGE` | Driver GPS outside `geofence_radius_m` |
| `422` | `NO_SHOW_WAIT_TIMER_NOT_ELAPSED` | Mandatory waiting window still counting down |
| `422` | `BOOKING_CUTOFF_PASSED` | Booking or cancellation violates org cutoff minutes |
| `422` | `VEHICLE_CAPACITY_EXCEEDED` | Assigned passengers exceed `vehicles.seating_capacity` (Sedan `<=4`, SUV `<=6` excl. driver) |
| `429` | `RATE_LIMIT_EXCEEDED` | Redis sliding-window rate limit exceeded |

### 1.4 Pagination & Filtering Query Params

`GET` collection endpoints accept: `?page=1&limit=25&sortBy=createdAt&sortOrder=desc&search=...&status=...` (default `limit=25`, max `100`).

---

## 2. REST API Endpoint Catalogue

### 2.1 System & Health Endpoints

| Method | Path | Purpose | Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Combined liveness + PostgreSQL + PostGIS + Redis status summary | Phase 1 |
| `GET` | `/api/v1/health/live` | Fast process liveness probe | Phase 1 |
| `GET` | `/api/v1/health/ready` | Strict readiness probe verifying `SELECT PostGIS_Version()` and Redis `PING` | Phase 1 |
| `GET` | `/api/v1/meta/enums` | Canonical state enums, no-show reason codes, Hyderabad seeded shifts (shared UI alignment) | Phase 1 |

### 2.2 Employee Endpoints (`/api/v1/employee/*`)

| Method | Path | Purpose | Idempotent | Target Phase |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/employee/profile` | Fetch employee profile, assigned office, default shift, emergency contact | — | Phase 4 |
| `PATCH` | `/api/v1/employee/profile` | Update emergency contact or notification preferences | — | Phase 4 |
| `GET` | `/api/v1/employee/locations` | List saved pickup locations (`saved_locations`) | — | Phase 4 |
| `POST` | `/api/v1/employee/locations` | Add pickup point with authoritative `lat`, `lng`, `location_name`, optional `google_place_id` | Yes | Phase 4 |
| `PATCH` | `/api/v1/employee/locations/:locationId` | Update pickup label/coordinates or mark default | — | Phase 4 |
| `GET` | `/api/v1/employee/bookings` | List bookings filtered by date range & status | — | Phase 4 |
| `POST` | `/api/v1/employee/bookings` | Create single shift booking supporting `timePreference` (`PICKUP_AT` / `ARRIVE_BY`) & `requestedTimeLocal` | Yes | Phase 4 / Impr |
| `POST` | `/api/v1/employee/bookings/series/preview` | Preview calendar expansion (`ONE_DAY`/`WEEKLY`/`MONTHLY`/`CUSTOM`), backward `ARRIVE_BY` feasibility, and overlaps | — | Improvements |
| `GET` | `/api/v1/employee/bookings/series` | List active, expired, and cancelled recurring booking series with occurrence status counts | — | Improvements |
| `POST` | `/api/v1/employee/bookings/series` | Create time-bounded recurring booking series and generated booking rows | Yes | Improvements |
| `POST` | `/api/v1/employee/bookings/series/:seriesId/skip-dates` | Skip individual future dates from a series while keeping other days intact | Yes | Improvements |
| `POST` | `/api/v1/employee/bookings/series/:seriesId/extend` | Extend active series or renew after expiry | Yes | Improvements |
| `POST` | `/api/v1/employee/bookings/series/:seriesId/cancel` | Cancel remaining future rides in series (preserving completed trips/audit/billing) | Yes | Improvements |
| `PATCH` | `/api/v1/employee/bookings/:bookingId` | Modify future pickup pin or `PICKUP_AT`/`ARRIVE_BY` time; emits dispatcher alert if trip already published | Yes | Improvements |
| `POST` | `/api/v1/employee/bookings/:bookingId/cancel` | `Cannot Board` cancellation with reason; updates active trip assignment if dispatched | Yes | Phase 4 |
| `GET` | `/api/v1/employee/trips/upcoming` | Fetch next scheduled/active trip summary for home card | — | Phase 4 |
| `GET` | `/api/v1/employee/trips` | Paginated historical trips | — | Phase 4 |
| `GET` | `/api/v1/employee/trips/:tripId` | Complete pickup timeline, stop sequence, driver/vehicle details, OTPs, live GPS freshness (`last_updated`, `accuracy_m`, `isStale`) | — | Phase 4 |
| `POST` | `/api/v1/employee/trips/:tripId/running-late` | Report `Running Late` with expected delay minutes + note; alerts driver & dispatcher | Yes | Phase 4 |
| `POST` | `/api/v1/employee/trips/:tripId/safe-reach` | Confirm employee reached home/office safely | Yes | Phase 4 |
| `POST` | `/api/v1/employee/trips/:tripId/appeal-no-show` | Submit appeal note contesting a `NO_SHOW` record | Yes | Phase 6 |
| `GET` | `/api/v1/employee/notifications` | Paginated in-app notifications | — | Phase 6 |
| `PATCH` | `/api/v1/employee/notifications/:id/read` | Mark notification read | — | Phase 6 |
| `POST` | `/api/v1/employee/safety/sos` | Trigger high-priority SOS alert with coordinates & trip context | Yes | Phase 4 |

### 2.3 Driver Endpoints (`/api/v1/driver/*`)

| Method | Path | Purpose | Idempotent | Target Phase |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/driver/profile` | Driver identity, compliance status, assigned vehicle & registration | — | Phase 3 |
| `GET` | `/api/v1/driver/commutes/overview` | Driver `Today's Target` trips plus 1 compact grouped card per assigned commute | — | Commute Redesign |
| `GET` | `/api/v1/driver/commutes/:commuteId/calendar` | Monthly calendar (`?month=YYYY-MM`) highlighting published dates assigned to this driver | — | Commute Redesign |
| `GET` | `/api/v1/driver/commutes/:commuteId/dates/:date` | Ordered trip manifest(s) (`stops`, `passengers`, `vehicle`) for an assigned calendar date | — | Commute Redesign |
| `GET` | `/api/v1/driver/trips` | Today's assigned trips (`LOGIN` & `LOGOUT`), upcoming queue, stop & passenger counts | — | Phase 3 |
| `GET` | `/api/v1/driver/trips/:tripId` | Full offline-cacheable trip manifest: ordered stops, passenger details, org wait/geofence policy | — | Phase 3 |
| `POST` | `/api/v1/driver/trips/:tripId/accept` | Acknowledge trip (`ASSIGNED -> DRIVER_ACCEPTED`) | Yes | Phase 3 |
| `POST` | `/api/v1/driver/trips/:tripId/start` | Start trip (`-> IN_PROGRESS`); backend returns `currentStop` + Google Maps nav URL | Yes | Phase 3 |
| `POST` | `/api/v1/driver/trips/:tripId/location` | Ingest live GPS ping or batch pings; updates Redis live key + queues PG persistence | Yes (`client_ping_id`) | Phase 5 |
| `GET` | `/api/v1/driver/trips/:tripId/stops` | Fetch ordered stops + backend-computed `nextPendingStop` | — | Phase 3 |
| `POST` | `/api/v1/driver/trips/:tripId/stops/:stopId/arrive` | Record driver arrival; triggers PostGIS distance check & starts org wait countdown | Yes | Phase 3 |
| `POST` | `/api/v1/driver/trips/:tripId/stops/:stopId/passengers/:assignmentId/pickup` | Mark `BOARDED` (+ OTP check if enabled); backend computes & returns `nextPendingStop` | Yes | Phase 3 |
| `POST` | `/api/v1/driver/trips/:tripId/stops/:stopId/passengers/:assignmentId/no-show` | Mark `NO_SHOW` with mandatory reason code, GPS evidence, wait check; returns `nextPendingStop` | Yes | Phase 3 |
| `POST` | `/api/v1/driver/trips/:tripId/events` | Batch chronological offline sync (`events[]` with `client_event_id`, `occurred_at_client`, coordinates) | Yes (`client_event_id`) | Phase 3/5 |
| `POST` | `/api/v1/driver/trips/:tripId/complete` | Complete trip at final office/drop destination (`IN_PROGRESS -> COMPLETED`) | Yes | Phase 3 |

### 2.4 Admin Endpoints (`/api/v1/admin/*`)

| Method | Path | Purpose | Target Phase |
| :--- | :--- | :--- | :--- |
| `GET/POST/PATCH` | `/api/v1/admin/organizations`, `/api/v1/admin/organizations/:orgId/settings` | Organization & `organization_settings` policy + locality/detour/buffer configuration | Phase 1 / 2 |
| `GET/POST/PATCH` | `/api/v1/admin/localities` | Manage canonical localities, spelling aliases, and PostGIS center proximity radius | Improvements |
| `GET/POST/PATCH` | `/api/v1/admin/offices`, `/api/v1/admin/vendors`, `/api/v1/admin/shifts` | Office campus geofences, fleet vendors, shift windows | Phase 2 |
| `GET/POST/PATCH` | `/api/v1/admin/employees`, `/api/v1/admin/employees/import` | Employee CRUD, saved pickup management (auto canonical locality normalization), CSV/Excel bulk import | Phase 2 |
| `GET/POST/PATCH` | `/api/v1/admin/drivers`, `/api/v1/admin/drivers/:id/suspend` | Driver records, protected `baseLocalityId`/zone, document expiry, availability, suspension | Phase 2 |
| `GET/POST/PATCH` | `/api/v1/admin/vehicles`, `/api/v1/admin/vehicles/:id/assign-driver` | Vehicle registry, Sedan (`<=4`) / SUV (`<=6`) passenger capacity rules, compliance, driver pairing | Phase 2 |
| `GET` | `/api/v1/admin/bookings/series`, `POST /api/v1/admin/bookings/series/process-expiries` | Inspect recurring series & transition expired series/stale assignments cleanly | Improvements |
| `GET` | `/api/v1/admin/commutes`, `/api/v1/admin/commutes/:commuteKey` | Server-paginated grouped commute plans & isolated commute detail workspace (roster, peak cab count, driver matches, dates & audit history) | Commute Redesign |
| `POST` | `/api/v1/admin/commutes/:commuteKey/approve-dates`, `.../allocate-dates` | Scoped bulk/date approval & interval-aware locality auto-allocation (`preview` / `publish`) for one commute with consolidated notifications (`@Idempotent`) | Commute Redesign |
| `GET` | `/api/v1/admin/approvals/queue` | Filterable booking queue (date, shift, direction, department, office, corridor, locality) | Phase 2 |
| `POST` | `/api/v1/admin/approvals/bulk-decide` | Bulk approve or reject selected employee bookings | Phase 2 |
| `POST` | `/api/v1/admin/dispatch/auto-allocate`, `.../publish`, `GET .../allocation-runs` | Generate location-first interval-aware allocation plans & concurrency-safe publish (`pg_advisory_xact_lock`) | Improvements |
| `POST` | `/api/v1/admin/dispatch/manual` | Assign approved bookings to driver + vehicle, configure stop sequence & scheduled ETAs, publish trip | Phase 2 |
| `PATCH` | `/api/v1/admin/dispatch/:tripId/modify` | Last-minute stop reorder, passenger add/remove, driver/vehicle swap (with audit reason) | Phase 2 |
| `GET` | `/api/v1/admin/trips`, `/api/v1/admin/trips/:tripId` | Full trip history, timeline inspection, delay decomposition, `trip_events` log | Phase 2 |
| `GET` | `/api/v1/admin/tracking/live` | Active vehicles snapshot with Redis location, `last_updated`, `accuracy_m`, `isStale`, active stop & alerts | Phase 5 |
| `GET/POST` | `/api/v1/admin/safety/alerts`, `/api/v1/admin/safety/alerts/:id/resolve` | Live SOS / deviation alert triage and resolution | Phase 5 / 6 |
| `GET/POST` | `/api/v1/admin/no-shows`, `/api/v1/admin/no-shows/:id/resolve-appeal` | Audit and overturn/uphold contested no-show records | Phase 3 / 6 |
| `GET` | `/api/v1/admin/routing/recommendations` | Draft capacitated VRPTW clusters & 2-opt stop ordering for `APPROVED` bookings | Phase 7 |
| `GET` | `/api/v1/admin/reports/summary`, `/api/v1/admin/reports/:reportType` | Operational analytics summary, decomposed delay patterns, and 10 typed reports (JSON & `?format=csv`) | Phase 7 |
| `POST` | `/api/v1/admin/reports/assistant/query` | Guarded read-only operational query assistant (`403` on mutation prompts, audit-logged) | Phase 7 |
| `GET/POST/PATCH` | `/api/v1/admin/billing/summary`, `/invoices`, `/invoices/preview`, `/invoices/generate`, `/invoices/:id/status`, `/invoices/:id/export` | Vendor tariff preview, invoice generation (`@Idempotent`), reconciliation state machine, and CSV statement export | Phase 7 |
| `GET` | `/api/v1/admin/audit-logs` | Filterable immutable audit log stream | Phase 2 |

---

## 3. WebSocket Gateway Contract (`Socket.IO` Namespace: `/ws/transport`)

### 3.1 Rooms & Authorization Scopes

Clients authenticate handshake via dev context (Phase 1–7) or JWT (Phase 8) and are auto-joined only to rooms matching their `organization_id` and role:
- `org:{organizationId}:ops` — Admin/Transport Manager/Duty Approver live fleet & SOS room
- `trip:{tripId}` — Assigned Driver + Assigned Employees + Org Ops
- `driver:{driverId}` — Assigned Driver updates (cancellations, late notices, reassignments)
- `employee:{employeeId}` — Employee booking & trip status pushes

### 3.2 Server -> Client Events

| Event Name | Rooms | Payload Summary |
| :--- | :--- | :--- |
| `trip.status.changed` | `org:{orgId}:ops`, `trip:{tripId}` | `{ tripId, status, currentStopSequence, serverTime }` |
| `stop.progressed` | `trip:{tripId}`, `org:{orgId}:ops` | `{ tripId, completedStopId, nextStop, passengerUpdates }` |
| `passenger.status.changed` | `trip:{tripId}`, `employee:{empId}`, `driver:{drvId}` | `{ assignmentId, employeeId, status, arrivalDelaySeconds, passengerWaitSeconds, reason }` |
| `driver.location.updated` | `org:{orgId}:ops`, `trip:{tripId}` | `{ tripId, driverId, lat, lng, accuracyM, speedMps, recordedAt, serverReceivedAt }` |
| `safety.alert.created` | `org:{orgId}:ops` | `{ alertId, alertType, severity, tripId, employeeId, lat, lng, createdAt }` |
| `notification.created` | `employee:{empId}`, `driver:{drvId}`, `org:{orgId}:ops` | `{ notificationId, category, title, body, metadata }` |


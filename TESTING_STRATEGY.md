# Project Sol (SolTransit) — Testing & Verification Strategy

**Rule (`master-prompt.md` §§22, 24):** Never mark any phase or feature complete without executing its automated tests and verifying live behavior.

---

## 1. Test Pyramid by Layer

| Layer | Framework & Tools | Mandatory Coverage Areas |
| :--- | :--- | :--- |
| **Backend Unit** (`backend/src/**/*.spec.ts`) | Vitest 4 (`vi.fn()`, ESM) | State machine transitions (`Trip` & `Passenger`), delay seconds math (`actual - scheduled`), Google Maps URL builder, Zod DTO schemas, RBAC guard rules, Outbox serialization |
| **Backend API & DB Integration** (`backend/test/**/*.e2e-spec.ts`) | Vitest + Supertest + Docker PostGIS/Redis | Real SQL migrations against `transport_dev`, PostGIS `ST_DWithin` geofence verification (`<=150m` vs `>150m`), `X-Idempotency-Key` duplicate prevention & conflict `409`, multi-tenant `organization_id` isolation, BullMQ + Redis restart recovery |
| **Flutter Shared & Apps** (`packages/etms_core/test`, `apps/*/test`) | `flutter_test` + Riverpod overrides + in-memory Drift SQLite | Design system widgets (`GPSStatusIndicator` live vs stale >60s, `OfflineBanner`), GoRouter navigation, permission denial UX, Drift offline queue write & chronological replay sync, duplicate tap prevention |
| **Web Admin** (`web/`) | Vitest / React Testing Library + Next.js `build` + `impeccable detect.mjs` | TanStack dispatch table filtering/bulk selection, React Hook Form + Zod validation, responsive checks (`375px`, `768px`, `1024px`, `1440px`), WCAG contrast & reduced-motion checks |

---

## 2. Critical 20-Step End-to-End MVP Verification Scenario (`master-prompt.md` §22)

1. Admin creates 3 Hyderabad employees (`Kukatpally`, `Miyapur`, `Ameerpet`) with verified `saved_locations`.
2. Admin registers 1 driver + 1 vehicle (`TS 07 UA 4821`, capacity 4).
3. Admin creates shift (`Shift S1 · 09:00 IST · LOGIN`).
4. Admin bulk-approves 3 employee bookings for the shift.
5. Admin assigns all 3 employees to the driver & vehicle in sequence `1 -> 2 -> 3` and publishes trip.
6. Driver opens Driver Flutter App and sees the assigned trip + 3 stops.
7. Driver taps **Start Trip** -> trip moves to `IN_PROGRESS`; foreground tracking starts.
8. Backend supplies Stop 1 (`Kukatpally`) automatically.
9. Driver taps **Navigate in Google Maps** -> opens exact coordinates URL.
10. Driver arrives at Stop 1 -> taps **Arrived** (`actual_arrival_at` + PostGIS geofence recorded).
11. Driver marks Employee 1 **Picked Up** (+ OTP if enabled).
12. Backend updates Employee 1 `passenger_assignments` to `BOARDED` and computes `arrival_delay_seconds` & `passenger_wait_seconds`.
13. Backend automatically supplies Stop 2 (`Miyapur`).
14. Driver navigates & picks up Employee 2 (`BOARDED`).
15. At Stop 3 (`Ameerpet`), driver waits `no_show_wait_seconds`, selects mandatory reason, and records verified `NO_SHOW` (geofence + GPS evidence saved; trip remains `IN_PROGRESS`).
16. Backend supplies final destination (`Gachibowli Campus`).
17. Driver arrives at office & taps **Complete Trip** -> boarded employees transition to `DROPPED`; trip becomes `COMPLETED`; tracking stops.
18. Admin opens Web `/trips/[tripId]` and inspects full chronological `trip_events`, decomposed delays, and no-show evidence.
19. All mutations exist durably in PostgreSQL + `outbox_events` + `audit_logs`.
20. Employee App, Driver App, and Admin Web show 100% consistent final statuses.

---

## 3. Resilience & Chaos Verification Checklist

- [ ] **No internet connection:** Driver queues `ARRIVED`, `BOARDED`, `NO_SHOW`, and GPS batches in Drift SQLite; UI displays `Offline — Pending Sync`; auto-sync replays in order on reconnect.
- [ ] **App restart mid-trip:** Reopening Driver App restores active trip & pending queue from Drift SQLite without losing progress.
- [ ] **Duplicate button submissions:** Rapid double-tap on `Picked Up` / `No-Show` / `Start Trip` shares one `X-Idempotency-Key` -> exactly 1 DB mutation.
- [ ] **Delayed / stale GPS:** Last GPS `>60s` old switches UI beacons to `STALE` everywhere; never shows stale cache as live.
- [ ] **Clock skew on device:** Server records `server_received_at` alongside `occurred_at_client` and anchors wait/delay validation safely.
- [ ] **Redis restart:** Redis loses volatile keys; PostgreSQL still holds all trips & `trip_events`; backend lazily rehydrates active trip cache.
- [ ] **PostgreSQL temporary outage & recovery:** Critical actions fail explicitly (never silently succeed in Redis alone) and queue cleanly on client for retry.
- [ ] **Multiple simultaneous trips:** Multi-driver / multi-org trips execute concurrently with zero room cross-talk or cross-tenant leakage.


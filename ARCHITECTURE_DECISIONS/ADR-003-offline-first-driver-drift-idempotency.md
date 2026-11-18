# ADR-003: Offline-First Driver Execution via Drift SQLite & Backend Idempotency

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
Drivers regularly enter corporate basements, outer ring road dead zones, and congested corridors with intermittent cellular data. Double-taps or retries during poor connectivity risk duplicate boardings, skipped stops, or false no-show records.

## Decision
1. **Flutter Driver App (`apps/driver_app`)** persists active trip manifests, stops, passenger states, queued `trip_events`, and buffered `gps_locations` locally in SQLite using **Drift**.
2. Every driver mutation generates a deterministic client UUIDv4 `client_event_id` sent via `X-Idempotency-Key` (and inside batch `/events` payloads).
3. The backend checks `idempotency_keys` + `trip_events(organization_id, client_event_id)` inside the database transaction, returning cached results on safe retries and rejecting mismatched payload reuse with `409`.
4. The driver UI visually separates `Saved Locally — Pending Sync` from `Verified by Server`.

## Consequences
- Drivers never lose trip continuity offline or after app restarts.
- Server remains sole authority over next stop computation (`stops` service) and no-show verification.


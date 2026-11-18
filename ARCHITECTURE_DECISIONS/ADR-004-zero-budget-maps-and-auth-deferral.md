# ADR-004: Zero-Budget Maps Strategy & Day-1 Auth Boundary Abstraction

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
Operating under a strict ₹0 external spend policy prohibits commercial Google Directions/Distance Matrix APIs or paid map providers, while `master-prompt.md` §20 postpones full user login/SSO to Phase 8 without sacrificing multi-tenant `organization_id` isolation.

## Decision
1. **Maps & Navigation:** Store authoritative coordinates (`latitude`, `longitude`, PostGIS `GEOGRAPHY(Point, 4326)`) in `employee_locations` / `offices`. Launch driver turn-by-turn navigation externally via free Google Maps universal URLs (`url_launcher`), and use configurable OSM tile endpoints (`OSM_TILE_URL`) for local-dev `flutter_map` & `react-leaflet` previews without claiming commercial OSM SLA.
2. **Auth Boundary:** Build `RequestContextGuard`, `@Roles(...)`, `RolesGuard`, and mandatory `organizationId` scoping into every repository and controller from Phase 1 using explicit localhost dev identity headers (`X-Dev-User-Id`, `X-Dev-Org-Id`, `X-Dev-Role`) locked off (`401`) whenever `NODE_ENV === 'production'`.

## Consequences
- ₹0 external billing risk across development and testing.
- Phase 8 plugs in JWT/SSO token verification into `RequestContextGuard` without touching any domain service or repository signature.


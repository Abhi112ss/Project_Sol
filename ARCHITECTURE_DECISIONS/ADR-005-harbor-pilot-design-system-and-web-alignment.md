# ADR-005: Harbor Pilot Dispatch Design System & Web Starter Realignment

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
The scaffolded Next.js `web/` app shipped with shadcn `base-sera` style, `taupe` neutral palette, `Playfair_Display` serif display headings, and sharp `rounded-none uppercase` buttons, conflicting with `master-prompt.md` §16 (light enterprise blue/navy SaaS operations) and `impeccable` Operate-mode UI rules. Meanwhile, `apps/driver_app` and `apps/employee_app` use Flutter 3.50's extracted `package:material_ui/material_ui.dart`.

## Decision
1. Adopt the confirmed **Harbor Pilot Dispatch & Bridge Telemetry** visual world (`DESIGN.md`, seed `ccf01b2b`) across all three clients: Mineral Bridge Paper (`#F7F9FC`), White manifests (`#FFFFFF`), Prussian Navy ink (`#0F2544`), Harbor Cobalt primary (`#2563EB`), semantic Emerald/Amber/Crimson beacons, and `Figtree` + `Fira Code` (`tabular-nums`) on web paired with Android Material 3 (`Roboto` + `etms_core` tokens) on Flutter.
2. Replace `web/`'s starter `Playfair_Display`, `taupe`, and `rounded-none` configuration cleanly in Phase 2 while retaining `@base-ui/react`, Tailwind v4, TanStack Table/Query, React Leaflet, and Recharts.
3. Enforce **Staleness-Honest Telemetry Beacons** (`LIVE` vs `STALE >60s` vs `OFFLINE`) and **Stamped Non-Destructive Leg States** consistently across web and mobile.

## Consequences
- Unifies desktop dispatch speed, employee glanceability, and stationary-safe driver controls under one high-contrast enterprise grammar.
- Keeps `impeccable` design audit (`detect.mjs`) and `DESIGN.md` scan-mode carbonization ready for Phase 2.


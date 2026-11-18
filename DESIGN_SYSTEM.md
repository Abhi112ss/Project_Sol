# Project Sol (SolTransit) — UI/UX Design System & Application Screen Maps

**Deliverables Covered:**
- **Deliverable 6:** Flutter Employee Application Screen Map
- **Deliverable 7:** Flutter Driver Application Screen Map
- **Deliverable 8:** Next.js Administration Dashboard Screen Map
- **Deliverable 9:** UI/UX Design System & Visual Reference Analysis

**Visual World:** *Harbor Pilot Dispatch & Bridge Telemetry* (Seeded in `DESIGN.md`, seed key `ccf01b2b`)  
**Design Skills Applied:** `impeccable` (Operate mode + Android Material 3 + Craft floor), `uiux-designer` (Real-Time Monitoring + DataTable + Shadcn/Flutter/Next.js standards), `frontend-design` (Thesis + Swap test), `apple-design` (Velocity/interruptible gestures, optical type tracking, reduced motion/transparency, 4 feedback classes), `emil-design-eng` (150–250ms `ease-out`, `:active scale(0.97)`, no `scale(0)`, origin-aware popovers, tabular stability), `3d-web-experience` (deliberate 2D/GIS vector restraint — no decorative WebGL on operational dispatch).

---

## Deliverables 6–9 Metadata

| Deliverable | What Will Be Built | Why Required | Dependencies | Technologies | Expected Output | Acceptance Criteria | Relevant Tests |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **D6 (Employee Screen Map)** | GoRouter route tree, 5-tab Material 3 shell, permission onboarding, unambiguous booking, home next-trip card, live pickup timeline, SOS & Safe-Reach | Eliminates booking date confusion and lets employees verify cab order & GPS freshness in one glance | `PRD.md`, D9 tokens, `API_DOCUMENTATION.md` | Flutter 3.50, `material_ui`, `go_router`, `flutter_riverpod`, `flutter_map`, `etms_core` | Screen inventory, navigation tree, state matrix | Every employee workflow in `master-prompt.md` §3.1 reachable in <=2 taps | GoRouter navigation tests, Widget tests, Riverpod state tests |
| **D7 (Driver Screen Map)** | Stationary-safe trip dashboard, 1-tap external Google Maps workflow, arrival/wait timer, Picked Up / No-Show verification, offline Drift sync indicator | Protects driver attention on road and prevents silent data loss in zero-connectivity zones | `PRD.md`, D9 tokens, Drift offline DB | Flutter 3.50, `material_ui`, `geolocator`, `url_launcher`, `drift`, `connectivity_plus`, `etms_core` | Screen inventory, stationary workflow, offline queue UX | >=56dp primary driver CTAs, clear Pending Sync banner, automatic next-stop display | Offline queue replay widget tests, wait-timer gate tests |
| **D8 (Admin Web Screen Map)** | Desktop-first App Router information architecture (12 left-rail modules, context topbar, bulk dispatch workbench, live Leaflet fleet map) | Delivers high-density dispatch speed & real-time safety triage for transport teams | `PRD.md`, D9 tokens, `web/AGENTS.md` | Next.js 16.4, React 19, Tailwind v4, shadcn/Base UI, TanStack Table v9, Recharts v3, React Leaflet v5 | Route tree, layout wireframes, table & drawer specs | 100% keyboard navigable, responsive at `375/768/1024/1440px`, zero horizontal overflow | Component tests, responsive Playwright/DOM checks, `impeccable detect.mjs` |
| **D9 (Design System & Visual Reference Analysis)** | Shared tokens (`DESIGN.md` + CSS/Dart tokens), Dribbble/Figma visual critique, starter conflict replacement, `etms_core` + shadcn component specs | Unifies all 3 apps under one crisp operational identity without copying third-party branding | `PRODUCT.md`, `DESIGN.md`, `master-prompt.md` §16 | Tailwind v4 `@theme`, CSS variables, Flutter `ThemeData` (`material_ui`) | Token tables, reference analysis, component inventory | WCAG AA >=4.5:1 contrast, zero `scale(0)`/emoji icons/serif chrome, `prefers-reduced-motion` | Contrast checks, Impeccable `detect.mjs`, visual screenshot audit |

---

## 1. Visual Reference Analysis (Deliverable 9 — Part A)

We audited the visual references specified in `master-prompt.md` §16 alongside `uiux-designer` real-time monitoring patterns and `impeccable` Operate-mode discipline:

| Reference | Observed Strengths Worth Adopting | Rejected Patterns (Why Excluded) |
| :--- | :--- | :--- |
| **Dribbble 27644788** (*Modern Logistics Driver Management UI*, Deepak Kumar) | Clear split between driver queue list and route stop breakdown; explicit vehicle plate + status tags; strong spatial grouping of driver card vs active load. | Over-stylized card drop shadows and consumer-freight earnings cards that add noise to salaried/contracted shift cab execution. |
| **Dribbble 27150427** (*Logistics Mobile App Design*, Ashar Waseem) | Clean step-by-step vertical timeline showing completed vs upcoming stops and crisp card hierarchy for active trip summary. | Multi-color decorative gradients and small tap-target pills unsuitable for stationary cab driver hands. |
| **Dribbble 26424245 / Logistics Dashboard & Figma Fleet Kits (`1544712762137660699`)** | GIS map occupying ~60% of live monitoring workspace paired with compact vehicle roster rows, top telemetry KPI strip, and side-drawer trip inspector. | Dark charcoal neon-glow map themes (harder to read in brightly lit enterprise transport desks and fails `master-prompt.md` §16 "Light enterprise design"). |
| **Starter Repo `web/` Scaffold (`base-sera` + `taupe` + `Playfair_Display` + `rounded-none`)** | Clean Base UI + CVA + Tailwind v4 CSS variable architecture (`@theme inline`). | **Rejected visual world:** Editorial serif headings (`Playfair_Display`), warm taupe neutrals, and sharp `0px` uppercase buttons clash directly with `master-prompt.md` §16 and `impeccable/operate.md`. Replaced cleanly in Phase 2 (`ADR-005`). |

---

## 2. Shared Design Tokens & Visual Language (Deliverable 9 — Part B)

### 2.1 Color System (Light Enterprise "Harbor Pilot" Palette)

| Token Role | CSS Variable / Dart Token | Hex Value | Usage Rule |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `--bg-canvas` / `ColorTokens.canvas` | `#F7F9FC` | Primary page & app scaffold ground (mineral bridge paper) |
| **Surface Elevated** | `--bg-surface` / `ColorTokens.surface` | `#FFFFFF` | Dispatch tables, trip cards, inspector drawers |
| **Surface Muted / Sidebar** | `--bg-rail` / `ColorTokens.surfaceSubtle` | `#EEF2F7` | Left navigation rail, table headers, secondary chip fills |
| **Primary Ink** | `--ink-primary` / `ColorTokens.inkPrimary` | `#0F2544` | Deep Prussian navy headings, primary body copy (`>12:1` contrast on `#FFFFFF`) |
| **Secondary Ink** | `--ink-secondary` / `ColorTokens.inkSecondary` | `#475569` | Captions, metadata labels, helper text (`>=6.4:1` contrast on `#FFFFFF`) |
| **Hairline Border** | `--border-hairline` / `ColorTokens.border` | `#DCE3EC` | Crisp `1px` panel and table cell boundaries |
| **Primary Action (Harbor Cobalt)** | `--action-primary` / `ColorTokens.cobalt` | `#2563EB` | Primary buttons (`Start Trip`, `Approve & Dispatch`, `Navigate Next`), active rail border, focus ring (`#1D4ED8` hover) |
| **Verified / On-Time / Boarded** | `--status-success` / `ColorTokens.emerald` | `#059669` (tint `#ECFDF5`, text `#065F46`) | Live GPS pulse, `BOARDED`, `APPROVED`, `COMPLETED`, `SAFE_REACH` |
| **Delay / Waiting / Stale GPS** | `--status-warning` / `ColorTokens.amber` | `#D97706` (tint `#FFFBEB`, text `#92400E`) | Late pickup delta, waiting countdown, stale GPS (`>60s`), pending sync |
| **SOS / No-Show Breach / Aborted** | `--status-danger` / `ColorTokens.crimson` | `#DC2626` (tint `#FEF2F2`, text `#991B1B`) | Active SOS emergency banner, route deviation, `NO_SHOW`, destructive confirmation |
| **Cancelled / Offline** | `--status-neutral` / `ColorTokens.slate` | `#64748B` (tint `#F1F5F9`, text `#334155`) | Non-destructive stamped `CANCELLED` leg, offline mode indicator |

### 2.2 Typography Scale & Tabular Discipline

- **Web Sans (`--font-sans`):** `Figtree` (`next/font/google`), weights `400`, `500`, `600`, `700`. Fixed `rem` scale (ratio `1.15–1.2`), never fluid `clamp` on operational controls.
  - Page H1: `1.5rem` (`24px`), `600`, `line-height: 1.2`, `letter-spacing: -0.02em`.
  - Section H2: `1.125rem` (`18px`), `600`, `line-height: 1.3`, `letter-spacing: -0.015em`.
  - Body / Table Cell: `0.875rem` (`14px`), `400/500`, `line-height: 1.45` (`65–75ch` max on prose).
  - Compact Status Label: `0.75rem` (`12px`), `600`, `letter-spacing: +0.03em`.
- **Web Mono (`--font-mono`):** `Fira Code` (`next/font/google`), strictly with `font-variant-numeric: tabular-nums` for `+04m 12s`, `17.4849, 78.4138`, `±10m`, `TS 07 UA 4821`, and 4-digit OTPs.
- **Flutter Android:** Material 3 `Typography` scale (`Roboto` system default for native legibility + `sp` user scaling, `FontFeature.tabularFigures()` on all timers/coordinates/OTPs).

### 2.3 Motion, Feedback & Accessibility Rules

1. **Instant Response (`apple-design` + `emil-design-eng`):** Web buttons apply `active:scale-[0.97]` over `120ms cubic-bezier(0.23, 1, 0.32, 1)`. Never use `transition: all`, never use `ease-in` on UI entrances, never animate from `scale(0)` (start from `scale(0.96); opacity: 0`).
2. **Frequency Restraint:** Zero animation on high-frequency table row filtering, keyboard shortcuts, or command toggles. `150–250ms` `ease-out` only on drawers, toasts, and state chips.
3. **Origin-Aware Overlays:** Popovers/menus bind `transform-origin` to trigger; centered dialogs keep `transform-origin: center` and are reserved only for destructive/irreversible decisions (SOS confirm, abort trip, bulk reject).
4. **Reduced Motion & Transparency:** `@media (prefers-reduced-motion: reduce)` degrades slides/springs to `150ms` opacity crossfades; `@media (prefers-reduced-transparency: reduce)` replaces translucent map/sticky bar blurs with solid `#FFFFFF` + `1px` border.
5. **Iconography:** Single-weight SVG icons only (`lucide-react` 20px/16px on Web; Material Symbols on Flutter). **Zero emoji icons anywhere.**

### 2.4 Signature UI Patterns Across All Three Apps

1. **Staleness-Honest Telemetry Beacon (`GPSStatusIndicator`):**
   - `< 30s` & accurate -> Emerald dot + `LIVE · 8s ago · ±9m`
   - `30–60s` -> Cobalt/Slate dot + `RECENT · 44s ago · ±15m`
   - `> 60s` -> Amber badge + `STALE · 3m 12s ago (last known)` — **never disguised as live**.
   - Offline driver -> Slate/Amber pill + `OFFLINE · 2 events queued locally`.
2. **Stamped Non-Destructive Leg States (`StatusBadge`):** Cancelled or no-show stops stay visible in the sequence timeline with an uppercase bordered stamp + reason code so neither employee nor dispatcher loses operational context.

### 2.5 Shared Flutter UI Architecture (`packages/etms_core`)

All required components from `master-prompt.md` §16 live in `packages/etms_core/lib/src/`:
- `theme/`: `AppTheme`, `ColorTokens`, `TypographyTokens`
- `widgets/buttons/`: `PrimaryButton` (min height `48dp`, `56dp` driver variant), `SecondaryButton`
- `widgets/badges/`: `StatusBadge`, `GPSStatusIndicator`, `OfflineBanner`
- `widgets/cards/`: `TripCard`, `PassengerCard`, `VehicleCard`, `DriverCard`, `NotificationTile`
- `widgets/states/`: `EmptyState`, `LoadingState` (shimmer/skeleton, not centered spinner), `ErrorState` (names problem + retry action).

---

## 3. Deliverable 6 — Flutter Employee Application Screen Map (`apps/employee_app`)

### 3.1 Navigation Shell (`GoRouter` + Material 3 `NavigationBar`)

Bottom tabs (5 destinations, adaptive `NavigationRail` on >=600dp tablets):
1. **`/home`** (`Home`): Unmistakable next-trip card above fold + 1-tap `Running Late` / `Cannot Board` + quick `Book Shift` CTA + GPS freshness indicator.
2. **`/rides`** (`My Rides`): Upcoming bookings segmented from Historical trips + `Book New Ride` flow (`/rides/book`) + Trip Detail & Pickup Timeline (`/rides/:tripId`).
3. **`/notifications`** (`Notifications`): Categorized operational alerts (dispatch published, cab approaching, delay notice, no-show alert with appeal link).
4. **`/safety`** (`Safety`): Emergency SOS hold-to-trigger / confirm sheet, emergency contacts, Safe-Reach check-in, incident report.
5. **`/profile`** (`Profile`): Employee info, office/shift defaults, Saved Pickup Locations manager (`/profile/locations`, `/profile/locations/new`), Permission status settings (`/profile/permissions`).

### 3.2 First-Run & Core Screen Tree

- `/onboarding/permissions`: Friendly permission explanation screen (Notifications first; Location deferred until pickup pin verification or SOS).
- `/home` -> `/rides/:tripId`:
  - Top banner: `Tue, 17 Nov 2026 · Shift S1 (09:00 IST) · HOME → OFFICE`
  - Driver & Vehicle verification card (`Ramesh K. · TS 07 UA 4821 · White Dzire`)
  - Boarding OTP pill (`OTP 4829`) + Safe-Reach toggle
  - `GPSStatusIndicator` + embedded `flutter_map` (OSM) showing cab pin + pickup stop
  - Full passenger stop timeline (`Stop 1 Done` -> **`Stop 2 YOU (ETA 08:22)`** -> `Stop 3` -> `Gachibowli Office`)
  - Bottom action bar: `Running Late` (delay selector sheet) | `Cannot Board` (cutoff-checked cancellation confirm).

---

## 4. Deliverable 7 — Flutter Driver Application Screen Map (`apps/driver_app`)

### 4.1 Stationary-Safe Navigation Philosophy

Drivers DO NOT navigate a 5-tab dashboard. They have a clean 2-destination duty interface (`/today`, `/history`) plus a dedicated **Full-Focus Active Trip Console (`/trip/:tripId`)** with oversized `>=56dp` tap targets, persistent connectivity/GPS header, and zero distracting clutter.

### 4.2 Screen Map (`GoRouter`)

1. `/onboarding/permissions`: Explains Notifications, Precise Location, and Android Foreground Location Service (requested only when starting duty, never blindly on launch).
2. `/today` (`Today's Duty`):
   - Top status bar: Driver name + Vehicle plate (`TS 07 UA 4821`) + `GPSStatusIndicator` + `OfflineBanner` (shows queued count if disconnected).
   - Chronological Login / Logout trip cards (`Shift S1 · 4 stops · 4 passengers`) with `Review & Start` CTA.
3. `/trip/:tripId/preview`: Pre-trip stop manifest (`1. Kukatpally`, `2. Miyapur`, `3. Ameerpet`, `4. Madhapur` -> `Gachibowli Campus`), `Accept Duty` / `Start Trip` large primary button (`56dp`).
4. `/trip/:tripId/active` (**Active Trip Execution Console**):
   - **Persistent Top Telemetry Strip:** `Trip IN PROGRESS · Stop 2 of 4 · GPS Active (±8m) · Online / Synced` (or `Offline · 1 event queued`).
   - **Hero Current Stop Card:** Passenger name, phone call button, pickup address, scheduled time + live early/late delta, special note (e.g., `"Employee reported +10m late"`).
   - **Stage-Driven Bottom Primary Dock:**
     - *Stage A (En Route):* Full-width Cobalt button **`Navigate in Google Maps`** (launches `url_launcher` coordinates URL) + secondary **`I Have Arrived`**.
     - *Stage B (Arrived — Waiting):* Prominent live **Waiting Countdown Timer** (`02:45 / 05:00 min required` + geofence verification tag `Inside 150m zone` or `GPS unavailable — pending server reconcile`), large Emerald **`Picked Up`** (triggers 4-digit OTP pad if org policy requires) + outlined Crimson **`Mark No-Show`** (enabled with clear countdown explanation until wait timer completes, opens mandatory reason sheet).
     - *Stage C (All Pickups Terminal):* **`Navigate to Office Campus`** -> **`Complete Trip`** at campus.
5. `/history` & `/settings/permissions`: Completed shift summaries + offline sync diagnostics log (`last synced`, `pending events`, manual `Sync Now` button).

---

## 5. Deliverable 8 — Next.js Administration Dashboard Screen Map (`web/`)

### 5.1 App Router Layout & Navigation Topology

- **Left Sidebar (`240px` desktop, collapsible rail `64px`, slide-over drawer `<1024px`):**
  1. `/overview` — Operational KPIs, shift readiness strip, active emergencies banner, delay summary
  2. `/approvals` — Duty Approvals queue (bulk approve/reject)
  3. `/dispatch` — **Primary Workbench:** split pane (approved employee demand + corridor filters on left; vehicle/driver pairing + drag-order stop sequence on right)
  4. `/live-tracking` — `~65%` interactive `react-leaflet` fleet map + `~35%` vehicle telemetry list + right-hand trip inspector drawer
  5. `/trips` — Trip history & `/trips/[tripId]` full stop/delay/event timeline inspector
  6. `/employees` — Employee directory + CSV/Excel bulk import + pickup location verification
  7. `/drivers` — Driver roster, availability, compliance expiry, vehicle pairing
  8. `/vehicles` — Fleet registry, capacity, insurance/permit tracker
  9. `/vendors` — Fleet vendors & SLA scorecards
  10. `/reports` — Attendance, punctuality (driver vs employee delay), utilization, wait time, no-show analytics (Recharts + CSV export)
  11. `/billing` — Vendor monthly invoice calculation & reconciliation
  12. `/settings` — `organization_settings` policy editor (geofence radius, wait timer, cutoffs, OTP toggles, retention), offices & shifts.
- **Persistent Top Context Bar (`56px` sticky translucent hairline header):**
  - Organization switcher (`Acme Hyderabad IT SEZ`)
  - Office Campus selector (`All Offices` / `Gachibowli Campus`)
  - Date + Shift + Direction filter (`17 Nov 2026 · Shift S1 · LOGIN`)
  - Active Alert / SOS bell counter (pulses crimson only when `OPEN` critical SOS exists)
  - Operator Role Badge (`Duty Approver` / `Transport Manager` — Dev Identity Switcher in non-prod).

### 5.2 Standard High-Density Dispatch Table Specification

All administrative tables (`TanStack Table v9`) MUST provide:
- Instant search (`employee`, `corridor`, `plate`, `trip code`)
- Multi-facet filter chips (`department`, `shift`, `corridor`, `status`)
- Multi-column sorting + `tabular-nums` alignment on numeric/time columns
- Explicit pagination footer (`25 / 50 / 100` rows per page)
- Bulk checkbox column with sticky bottom action bar (`Approve Selected (14)` / `Create Trip Assignment`)
- Horizontal overflow container + pinned key column on `<1024px` viewports.


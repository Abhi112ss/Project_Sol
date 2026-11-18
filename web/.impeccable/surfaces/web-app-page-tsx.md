---
version: 1
slug: "web-app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/layout.tsx","app/globals.css","app/dispatch/page.tsx","app/approvals/page.tsx","app/live-tracking/page.tsx"]
---

# Surface Brief — SolTransit Web Control Panel (`web/app/page.tsx`)

- **Seed Key:** `2dfe97bc` (Concept Seed Index 7: **Harbor Bridge Telemetry Ledger + Slide-Over Inspector**)
- **Inherited World:** Harbor Pilot Dispatch & Bridge Telemetry (`DESIGN.md`, seed `ccf01b2b`)
- **Canvas & Ink:** `#F7F9FC` cool bridge daylight paper canvas, `#FFFFFF` crisp operational manifests, `#0F2544` Prussian navy ink, `#2563EB` Harbor Cobalt primary, `#D9E2EC` 1px hairline ledger dividers, semantic signal beacons (`#0D9488` Emerald On-Time, `#D97706` Amber Hold/Delayed, `#E11D48` Crimson SOS/Incident).
- **Typography & Data Rhythm:** `Figtree` geometric sans UI paired with `Fira Code` monospace (`font-variant-numeric: tabular-nums`) for trip IDs, cab plates, shift timestamps, seat counts (`3 / 4 seats`), and delay metrics (`+180s`). Zero eyebrows/kickers above titles, max 4 metrics per KPI card row (`4` per row, `8` total metrics across compact 2x4 grid), strict sentence-case labels.
- **Spatial Architecture (`Harbor Bridge Telemetry Ledger + Slide-Over Inspector`):**
  - Persistent `224px` collapsible left bridge sidebar covering all 12 operational domains (`/overview`, `/approvals`, `/dispatch`, `/live-tracking`, `/trips`, `/employees`, `/drivers`, `/vehicles`, `/vendors`, `/reports`, `/billing`, `/settings`) with active pill indicator and mobile drawer `< 1024px`.
  - Sticky `52px` translucent command bar (`backdrop-filter: blur(12px)`) carrying Organization (`Acme Tech Park Hyderabad`), Active Office filter, Shift/Date context, live Dev Identity & Role Switcher (`ORG_ADMIN`, `DUTY_APPROVER`, `TRANSPORT_MANAGER`, `VENDOR_SUPERVISOR`, `AUDITOR`), and active emergency alert badge.
  - Primary workspaces use dense, hairline-ruled ledgers paired with non-blocking `440px` slide-over inspection/mutation drawers (e.g., Employee profile/locations/trips, Dispatch split-pane queue & seat capacity builder, Approvals sticky multi-select decision bar, Trip full stop/passenger/event breakdown).
- **Motion & Tactility:** Springless `cubic-bezier(0.23, 1, 0.32, 1)` (`150ms–250ms`), strict `active:scale-[0.97]` tactile button press, GPU-composited `transform`/`opacity`/`colors` only, full `prefers-reduced-motion` and `prefers-reduced-transparency` respect.

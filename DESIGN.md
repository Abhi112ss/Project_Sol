---
name: Project Sol (SolTransit)
description: Harbor Pilot Dispatch & Bridge Telemetry — Daylight enterprise transit operations system across Next.js admin dispatch and Android-first Flutter driver and employee apps.
colors:
  primary: "#2563EB"
  primary-hover: "#1D4ED8"
  paper: "#F7F9FC"
  surface: "#FFFFFF"
  ink-prussian: "#0F2544"
  ink-slate: "#5B6E84"
  control-well: "#EFF3F8"
  muted: "#F0F4F8"
  accent-wash: "#EAF0F8"
  hairline: "#D9E2EC"
  input-border: "#CBD5E1"
  emerald-dot: "#0D9488"
  amber-dot: "#D97706"
  crimson-dot: "#E11D48"
typography:
  display:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "8px"
  lg: "10px"
  xl: "12px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  card-manifest:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-prussian}"
    rounded: "{rounded.lg}"
    padding: "16px"
---
<!-- Carbonized against implemented Web Control Panel tokens and components (`web/`, Phase 2). Flutter/Android Material 3 tokens (`packages/etms_core`, `apps/*`) remain target specs until Phases 3-4 ship. -->

# Design System: Project Sol (SolTransit)

## Overview

**Creative North Star: "Harbor Pilot Dispatch & Bridge Telemetry"**

SolTransit operates like a daylight maritime harbor pilot's bridge rather than a consumer ride-hailing app. Every surface—from a transport manager's multi-shift dispatch desk to an employee's pickup pass and a driver's stationary cab console—speaks one disciplined visual grammar: daylight mineral-white paper, Prussian navy typographic authority, restrained Harbor Cobalt primary actions, and strict semantic signal beacons.

Two domain signatures govern clarity across every workflow:
1. **Staleness-Honest Telemetry Beacons:** Semantic dots paired with exact tabular timestamps, delay seconds (`arrivalDelaySeconds`), and server-verified status pills rather than glowing decorative indicators.
2. **Non-Destructive Stamped States:** Operational states (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `DISPATCHED`, `CANCELLED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`) remain auditable rather than silently vanishing.

## Colors

Verified CSS variables implemented in [`web/app/globals.css`](file:///d:/prac/project_sol/web/app/globals.css) and status badge palettes in [`web/components/ui/badge.tsx`](file:///d:/prac/project_sol/web/components/ui/badge.tsx):

### Primary
- **Harbor Cobalt** (`--primary: #2563EB`, hover `#1D4ED8`, `--primary-foreground: #FFFFFF`, `--ring: #2563EB`): Primary action buttons, focus rings, sidebar active ink (`--sidebar-accent-foreground: #1D4ED8`), and seat-capacity progress fill (`#2563EB`).

### Secondary & Ink
- **Prussian Navy Ink** (`--foreground: #0F2544`, `--card-foreground: #0F2544`, `--sidebar-foreground: #0F2544`): Structural headings, body text, and table values.
- **Slate Secondary Ink** (`--muted-foreground: #5B6E84`): Subtitles, table column headers, and secondary telemetry (`>= 4.70:1` WCAG AA contrast on `#FFFFFF`, `#F7F9FC`, `#F8FAFC`, and `#EFF3F8`).

### Neutral Surfaces & Hairlines
- **Bridge Daylight Paper** (`--background: #F7F9FC`): Primary app canvas and header translucent fallback (`prefers-reduced-transparency: reduce`).
- **Operational Manifest** (`--card: #FFFFFF`, `--sidebar: #FFFFFF`, `--popover: #FFFFFF`): Table cards, KPI tiles, drawers, and navigation rail.
- **Muted / Control Wells** (`--secondary: #EFF3F8`, `--muted: #F0F4F8`, `--accent: #EAF0F8`, ledger header row `#F8FAFC`).
- **Hairlines** (`--border: #D9E2EC`, `--input: #CBD5E1`, `--sidebar-border: #D9E2EC`).

### Semantic Signal Quartet
- **Emerald Verified / Active (`AVAILABLE`, `APPROVED`, `COMPLETED`, `ACTIVE`)**: Text `#0F766E`, Surface `#F0FDFA`, Border `#99F6E4`, Dot `#0D9488`.
- **Cobalt In-Flight (`ASSIGNED`, `DRIVER_ACCEPTED`, `IN_PROGRESS`, `DISPATCHED`, `LOGIN`)**: Text `#1D4ED8`, Surface `#EFF6FF`, Border `#BFDBFE`, Dot `#2563EB`.
- **Amber Pending / Hold (`PENDING_APPROVAL`, `HOLD`, `MAINTENANCE`, `LOGOUT`)**: Text `#B45309`, Surface `#FFFBEB`, Border `#FDE68A`, Dot `#D97706`.
- **Crimson Escalation / Breach (`--destructive: #E11D48` fill / `#BE123C` WCAG AA text)**: Text `#BE123C`, Surface `#FFF1F2`, Border `#FECDD3`, Dot `#E11D48`. (Seat capacity over-allocation uses `#BE123C` for AA legibility on `#F8FAFC`.)
- **Slate Offline / Archived (`CANCELLED`, `OFF_DUTY`)**: Text `#5B6E84`, Surface `#F0F4F8`, Border `#D9E2EC`, Dot `#94A3B8`.

### Named Rules
- **The Signal Scarcity Rule.** Inactive cards and neutral icons stay monochrome `#0F2544` / `#5B6E84` so emerald, amber, cobalt, and crimson signal badges read cleanly on first scan.

## Typography

Self-hosted in [`web/app/layout.tsx`](file:///d:/prac/project_sol/web/app/layout.tsx) via `next/font/google`:
- **Display & UI Sans:** `Figtree` (`400`, `500`, `600`, `700`; `--font-figtree`, mapped to `--font-sans` and `--font-heading`, `display: "swap"`).
- **Telemetry & Data Mono:** `Fira_Code` (`400`, `500`, `600`, `700`; `--font-fira-code`, mapped to `--font-mono`, paired with `.tabular-nums { font-variant-numeric: tabular-nums }`).

### Named Rules
- **The No-Kicker Rule.** Page `<h1>` titles (`AdminShell`) and section `<h2>` headings (`ManifestHeader`, roadmap banners) appear cleanly without uppercase eyebrow kickers stacked above them.
- **The Tabular Telemetry Rule.** All KPI counts, trip codes, timestamps (`Asia/Kolkata`), GPS coordinates (`±4–5` decimal places), rupee currency (`en-IN` INR), vehicle capacities (`2 / 4 seats`), and delay durations enforce `font-mono tabular-nums`.

## Layout & Surface Pattern

Chosen operational surface pattern (`seed 2dfe97bc`, [`web/.impeccable/surfaces/web-app-page-tsx.md`](file:///d:/prac/project_sol/web/.impeccable/surfaces/web-app-page-tsx.md)): **Harbor Bridge Telemetry Ledger + Slide-Over Inspector**.

- **Web Admin (`web/`):**
  - Persistent `224px` collapsible left bridge rail (`AdminShell` in [`admin-shell.tsx`](file:///d:/prac/project_sol/web/components/layout/admin-shell.tsx)) across all 12 operational domains, collapsing cleanly into an accessible modal dialog drawer (`role="dialog"`, `aria-modal="true"`, Escape & focus restoration) below `1024px`.
  - Sticky `54px` translucent header (`harbor-header-glass`) containing title, optional subtitle, primary link/button actions, campus office filter, Dev RBAC Role Switcher (`useId()`-scoped controls), and live emergency alert pill. Zero horizontal overflow verified across `1440px` and `375px`.
  - High-density hairline-ruled TanStack Table ledgers (`DataLedger` in [`data-ledger.tsx`](file:///d:/prac/project_sol/web/components/ui/data-ledger.tsx)) with explicit keyboard-focusable `<button>` triggers paired with focus-trapped slide-over inspector drawers (`SlideOverDrawer` in [`drawer.tsx`](file:///d:/prac/project_sol/web/components/ui/drawer.tsx), `max-w-md`/`lg`/`2xl`).
  - Asymmetric split-pane Dispatch Workbench (`xl:grid-cols-12`, 7/5 split in [`dispatch-view.tsx`](file:///d:/prac/project_sol/web/components/dispatch/dispatch-view.tsx)) pairing the approved rider queue with a live sticky cab manifest and GPU-composited `scaleX` capacity meter.
- **Flutter Employee & Driver (`apps/employee_app`, `apps/driver_app` — Planned Phases 3–4):** Mobile Material 3 adaptations (`etms_core` shared theme tokens matching Harbor Pilot contrast & semantic quartet).

## Elevation, Motion & Shapes

- **Single-Elevation Declaration Rule:** Rest-state cards (`ManifestCard`, overview KPI links) separate solely via `1px` `--border: #D9E2EC` with zero drop shadows. Floating overlays (`SlideOverDrawer` using `--shadow-drawer: -8px 0 32px rgba(15, 37, 68, 0.12)` and the Approvals floating decision bar `.harbor-floating-glass` using directional shadow without competing border) declare depth solely via shadow.
- **Radii:** Cards `--radius-lg` (`10px`), Floating drawers/bars `rounded-xl` (`12px`), Buttons/Inputs/Selects `--radius-md` (`8px`), Badges `rounded-md` (`6px`).
- **Motion:** Springless `--ease-harbor: cubic-bezier(0.23, 1, 0.32, 1)` (`150ms–220ms`), GPU-composited properties only (`transform`, `opacity`, `background-color`, `border-color`, `color` — zero `transition-all`, zero layout `width` transitions), tactile button press `active:scale-[0.97]`, full `@media (prefers-reduced-motion: reduce)` and `@media (prefers-reduced-transparency: reduce)` support.

## Do's and Don'ts

### Do:
- **Do** associate every form `<Input>` / `<Select>` / checkbox with unique IDs (`useId()` for shared shell controls) and explicit `<FieldLabel>` or `aria-label`.
- **Do** give table rows explicit keyboard-accessible `<button>` or `<Link>` triggers rather than relying solely on `<tr onClick>`.
- **Do** use Lucide SVG icons (`aria-hidden="true"` when decorative) and real domain fixtures (Hyderabad corridors, IST timestamps, INR paise formatting).

### Don't:
- **Don't** nest interactive elements (`<Link><Button>` — use `buttonVariants(...)` on `<Link>` instead).
- **Don't** animate CSS layout properties (`width`, `height`, `top`) when `transform: scaleX()` suffices.
- **Don't** place standalone uppercase badge kickers directly above `<h1>`/`<h2>` headings or show raw enum underscores (`PENDING_APPROVAL`) in visible prose headings.

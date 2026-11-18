---
name: impeccable
description: Frontend art direction and improvement. Use when designing or redesigning a website or product UI; shaping a new surface; critiquing, auditing, polishing, or hardening an interface; improving hierarchy, layout, type, color, motion, responsive behavior, accessibility, UX copy, or performance; extracting a design system; or running live visual iteration.
version: 4.0.4
license: Apache-2.0
metadata:
  original-author: Paul Bakaus
  canonical-upstream: https://github.com/pbakaus/impeccable
  upstream-version: skill-v4.0.4
---

The governing idea is **art direction**: turn the brief and incumbent evidence into one deliberate visual world, then carry it through production-grade implementation and bounded verification. Commit to a point of view while preserving product truth and the visitor's job.

Core principles:
- Finish the requested surface. Deliver every in-scope state and call out only the assets the user must provide.
- Match ambition to the surface mode. Distinction may be bold, quiet, editorial, utilitarian, or immersive; the brief decides.
- Verify in bounded passes. The ceiling covers screenshots, defect scans, micro-edits, and rebuilds alike. Build fully, inspect desktop and mobile together, fix one batch, confirm once if needed, then hand off any remaining defect and stop.

## Setup

1. **Load context.** Run `node .agents/skills/impeccable/scripts/context.mjs` once per session (if the runtime shows this skill's loaded base directory, run `node <skill-base-dir>/scripts/context.mjs`; keep cwd at the user's project). Pass a named source file or route as `--target <path>`. It loads PRODUCT.md, DESIGN.md, the matching surface brief, and native-platform guidance when applicable. **Complete when:** the script has succeeded once and its directives are in hand.
2. **Choose one branch.** Load the playbook that owns the request: the Commands table's reference for an explicit or clearly implied sub-command, or [reference/new-work.md](reference/new-work.md) for a new surface or replacement visual world. Then inspect the target and at least one representative source of incumbent visual truth (tokens, theme, CSS, component, or asset). **Complete when:** one playbook owns the request and both the target and its visual authority have been inspected.
3. **Load the craft floor before editing.** After analysis and direction are resolved, load [reference/craft-floor.md](reference/craft-floor.md). It carries the quality floor, the absolute bans, and the reflexes no detector catches; planning-only work ends without it. **Complete when:** an editing run has both its owning playbook and the craft floor in context.

## How to design

- **The brief wins.** Honor pinned aesthetics, eras, materials, fonts, and palettes even when they conflict with a saturated-pattern warning. A clear brief is the visual authority.
- **Refinement preserves; redesign replaces.** Refinement keeps the incumbent identity, behavior, copy, and everything outside scope. Ask before replacing factual copy or adding claims. Redesign keeps product truth, content, function, native affordances, and constraints, but treats the old look as evidence and anti-reference; choose a replacement world in new-work and replace DESIGN.md. Commit to the world being kept.
- **Visual authority is evidence, not a filename.** Missing DESIGN.md alone does not make a project greenfield; new-work decides whether to preserve, expand, or replace the incumbent world.

## Modes

The mode names what the visitor's success looks like on this surface.

- **Persuade:** the visitor decides and acts; design is the product. Landing pages, marketing, campaigns, pricing. Earn attention and action. Ship real imagery when the brief needs it; follow the committed world, not category habit.
- **Operate:** the visitor completes a task. App UI, dashboards, editors, admin, settings, tools. Scanability, consistency, native expectations, and the real usage scene outrank expression. Brand lives in precise details.
- **Read:** the visitor understands something. Docs, articles, guides, help, changelogs. Structure for comprehension, then make the reading experience worth staying in.
- **Experience:** the visitor is inside the work itself. Portfolios, galleries, showcases. Let the artifact lead from the first viewport; the interface recedes.

Choose the mode from the requested surface, not the product, and persist it only in that surface brief. A tool's landing page is still Persuade; a fashion house's documentation is still Read; a docs index is Read, not Persuade. See [new-work.md](reference/new-work.md) for new surfaces and [operate.md](reference/operate.md) for deeper Operate/Read guidance.

## Commands

| Command | Category | Description | Reference |
|---|---|---|---|
| `craft [feature]` | Build | Deprecated alias for an ordinary new-work request | [reference/craft.md](reference/craft.md) |
| `shape [feature]` | Build | Plan UX/UI before writing code | [reference/shape.md](reference/shape.md) |
| `init` | Build | Capture durable product context in PRODUCT.md | [reference/init.md](reference/init.md) |
| `document` | Build | Generate DESIGN.md from existing project code | [reference/document.md](reference/document.md) |
| `extract [target]` | Build | Pull reusable tokens and components into design system | [reference/extract.md](reference/extract.md) |
| `critique [target]` | Evaluate | UX design review with heuristic scoring | [reference/critique.md](reference/critique.md) |
| `audit [target]` | Evaluate | Technical quality checks (a11y, perf, responsive) | [reference/audit.md](reference/audit.md) · native: [reference/audit.native.md](reference/audit.native.md) |
| `polish [target]` | Refine | Final quality pass before shipping | [reference/polish.md](reference/polish.md) |
| `bolder [target]` | Refine | Amplify safe or bland designs | [reference/bolder.md](reference/bolder.md) |
| `quieter [target]` | Refine | Tone down aggressive or overstimulating designs | [reference/quieter.md](reference/quieter.md) |
| `distill [target]` | Refine | Strip to essence, remove complexity | [reference/distill.md](reference/distill.md) |
| `harden [target]` | Refine | Production-ready: errors, i18n, edge cases | [reference/harden.md](reference/harden.md) |
| `onboard [target]` | Refine | Design first-run flows, empty states, activation | [reference/onboard.md](reference/onboard.md) |
| `animate [target]` | Enhance | Add purposeful animations and motion | [reference/animate.md](reference/animate.md) |
| `colorize [target]` | Enhance | Add strategic color to monochromatic UIs | [reference/colorize.md](reference/colorize.md) |
| `typeset [target]` | Enhance | Improve typography hierarchy and fonts | [reference/typeset.md](reference/typeset.md) |
| `layout [target]` | Enhance | Fix spacing, rhythm, and visual hierarchy | [reference/layout.md](reference/layout.md) |
| `delight [target]` | Enhance | Add personality and memorable touches | [reference/delight.md](reference/delight.md) |
| `overdrive [target]` | Enhance | Push past conventional limits | [reference/overdrive.md](reference/overdrive.md) |
| `clarify [target]` | Fix | Improve UX copy, labels, and error messages | [reference/clarify.md](reference/clarify.md) |
| `adapt [target]` | Fix | Adapt for different devices and screen sizes | [reference/adapt.md](reference/adapt.md) · native: [reference/adapt.native.md](reference/adapt.native.md) |
| `optimize [target]` | Fix | Diagnose and fix UI performance | [reference/optimize.md](reference/optimize.md) |
| `live` | Iterate | Visual variant mode: pick elements in the browser, generate alternatives | [reference/live.md](reference/live.md) |

Routing:

- **No argument:** read [routing.md](reference/routing.md), present its context-aware menu, and wait for the user's choice.
- **Explicit or clearly implied command:** load its reference (native variant on native platforms) and follow it. Ask once if two commands fit.
- **Otherwise:** treat the request as general design work. Missing PRODUCT.md routes a new surface or replacement world through init, then new-work; a narrow refinement of existing code proceeds on the incumbent implementation as context.mjs directs, offering init afterward rather than blocking on it.
- `teach` aliases `init`. `shape` owns task discovery, then enters new-work only for visual-world and surface-concept decisions.

After init writes PRODUCT.md, resume without rerunning `context.mjs`; init loads the native platform reference itself when the platform it recorded is `ios`, `android`, or `adaptive`.

**Pin / Unpin:** `node .agents/skills/impeccable/scripts/pin.mjs <pin|unpin> <command>` creates or removes a standalone `$<command>` shortcut. Report the script's result concisely; relay stderr verbatim on error.

**Hooks:** `$impeccable hooks <on|off|status|ignore-rule|ignore-file|ignore-value|reset>` manages the design detector hook for this project (auto-runs the detector after UI file edits and surfaces findings). Load [reference/hooks.md](reference/hooks.md) when the user invokes it with any argument.

**Doctor:** `$impeccable doctor` reports and repairs drift between this project's Impeccable artifacts (PRODUCT.md, DESIGN.md and its sidecar, config, surface briefs, the hook) and what this version reads. Load [reference/doctor.md](reference/doctor.md) when the user invokes it, or when they ask what is out of date, stale, or needs refreshing. A `CONTEXT_STALE` directive in Setup's output is the cheap subset of the same report; act on it there per its own instructions rather than running doctor unasked.

**Treat drift repair as its own request.** Report a `CONTEXT_STALE` finding during design work and leave it in place until the user asks for repair. A finding marked `auto` is fulfilled by the next write to that file.

## Modification notice

Antigravity Skills revised this `SKILL.md` from Paul Bakaus's Impeccable `skill-v4.0.4` (Apache-2.0) on 2026-07-30. The package's references, agents, and scripts are unchanged.

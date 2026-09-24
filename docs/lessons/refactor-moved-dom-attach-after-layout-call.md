---
id: refactor-moved-dom-attach-after-layout-call
type: lesson
status: active
date: 2026-09-24
summary: A shared reorder pass attached new tiles after their first refit, a silent no-op on a detached node; the only symptom was a 1-in-60 E2E flake.
features: [tiles]
tags: [testing, ux]
roles: [web-impl, review-maintainability, orchestrator]
files: [web/src/features/tiles.ts, web/src/render/keyedreorder.ts]
tests: []
refs: [plan:maintainability-cleanup, plans/maintainability-cleanup/findings.md]
---
**What happened.** A behaviour-preserving refactor moved the grid's `insertBefore` into a shared reorder routine that runs after the tile bodies render. A new tile's `refit()` now ran before the tile was in the document, and `FitAddon.fit()` does nothing on a detached node. Terminals kept a stale size until the next render. The only symptom was one tile-drag E2E failing about once in sixty runs under load. Unit tests, which have no DOM, could not see it.

**Cost.** About 1.5 h of soaks and bisecting. Three soaks at the guilty commit happened to pass, so the first attribution blamed a later daemon commit.

**What changed.** When a refactor moves where DOM is attached, check every layout-dependent call (fit, measure, scroll) still runs after attachment. A rare geometry flake gets an `isConnected` trace, and an injected delay to widen the window, before any soak-based bisect.

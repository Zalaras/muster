---
id: shared-class-css-hid-resume-button
type: lesson
status: active
date: 2026-08-27
summary: A Minor fix gave .acts-row opacity 0 until hover; the dead surface reused the class, Resume vanished, and toBeVisible() passed over a Critical.
features: [actions]
tags: [ux, testing]
roles: [web-impl, e2e-specs, review]
files: []
tests: []
refs: [plan:m4-reconcile, plans/m4-reconcile/review.cycle3.md, .claude/agents/web-impl.md, .claude/agents/e2e-specs.md]
---
**What happened.** A cycle-2 Minor fix gave `.acts-row` `opacity: 0` until card hover. The class was not card-only: the dead surface's "session ended" cap reused it, so its Resume button became invisible on every dead surface. Playwright treats `opacity: 0` as visible, so `toBeVisible()` passed over a Critical.

**Cost.** A full Opus review cycle, from a one-line CSS change made for a cosmetic Minor.

**What changed.** Before editing anything shared, `rg` every consumer and paste the list; after editing, re-measure each consumer surface in a real browser, not just the one the issue named. Visibility of a control a requirement says the user must see is asserted by computed style, `toHaveCSS("opacity", "1")`, with `0` at rest and `1` on hover for a reveal, never `toBeVisible()` alone.

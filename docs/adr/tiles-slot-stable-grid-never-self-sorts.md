---
id: tiles-slot-stable-grid-never-self-sorts
type: decision
status: accepted
date: 2026-08-29
summary: The Tiles grid never re-sorts itself by attention: a promoted session takes the demoted tile's slot, survivors keep their order, only the user reorders.
features: [tiles]
tags: [ux, user-decision]
files: [web/src/features/tiles.ts, web/src/sessions/live.ts, web/src/render/tiles.ts]
tests: [web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, plan:move-tiles, docs/design/ux-flows.md, kb:adr/tiles-sticky-live-membership]
supersedes: []
---
**Context.** Membership of the live grid was already sticky, but the grid still re-sorted its tiles by attention priority on every promotion and density change, so tiles jumped around as states changed and the user had no say in where a tile sat.

**Options.** (A) Keep the attention comparator as the grid's order, accepting the churn. (B) Slot-stable: a promoted session lands in the demoted tile's slot, a departed tile's slot closes and the rest shift left, growth and backfill append at the end, and no automatic re-sort ever runs.

**Decision.** B, decided with Damian at planning; membership rules are unchanged.

**Consequences.** The rule "live tiles in the attention order" in the interface design is amended: attention still chooses who enters the grid, never where they sit. Shrinking drops the lowest-priority tiles wherever they are. Ordering is client state alongside membership; a separate record covers how the user reorders and another covers persistence.

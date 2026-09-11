---
id: tiles-order-ephemeral-per-window
type: decision
status: accepted
date: 2026-08-29
summary: Tile order is per-window and ephemeral, held with grid membership in client state; nothing is persisted and the protocol is untouched.
features: [tiles]
tags: [ux]
files: [web/src/sessions/live.ts, web/src/features/tiles.ts]
tests: [web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, plan:move-tiles, kb:adr/tiles-sticky-live-membership, kb:adr/rail-order-daemon-owned-per-session-fields]
supersedes: []
---
**Context.** A user-arranged grid raises the question of whether the arrangement should survive a reload or appear in a second window.

**Options.** (A) Persist the order as a preference or as per-session fields on the daemon. (B) Keep it per-window and ephemeral, exactly like the grid's membership, which is already rebuilt from attention order on view entry.

**Decision.** B. Grid membership was already client state that a reload recomputes, and an order without its membership has nothing to attach to.

**Consequences.** No preference, schema or wire change. Two windows may show different arrangements. The rail took the opposite decision for its order, because rail cards are long-lived and the whole point there is muscle memory; the two records together mark where the line falls.

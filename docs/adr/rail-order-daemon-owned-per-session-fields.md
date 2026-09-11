---
id: rail-order-daemon-owned-per-session-fields
type: decision
status: accepted
date: 2026-08-30
summary: Rail order and pinned state are daemon-owned per-session fields with daemon-held invariants; the daemon persists and broadcasts, the client sorts.
features: [rail, lifecycle]
tags: [store, ux]
files: [internal/session/railorder.go, internal/server/sessions.go, internal/store/migrations/**, web/src/sessions/railorder.ts]
tests: [TestApplyPin_InvariantsHoldFromEveryStartingConfiguration, TestApplyOrder_InvariantsHoldFromEveryStartingConfiguration, TestApplyOrder_OnlyChangedSessionsAreReturned, web/e2e/rail-order.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:order-sidebar, kb:anchor/sessions.pin, kb:anchor/sessions.order, kb:anchor/ws.session, kb:adr/connection-whole-object-session-upserts, kb:adr/tiles-order-ephemeral-per-window]
supersedes: []
---
**Context.** The manual rail order had to live somewhere. The Tiles grid had just chosen per-window ephemeral order; the rail's purpose is the opposite, an arrangement that survives reloads, restarts and a second window.

**Options.** (A) Client state, as in Tiles. (B) A preference blob holding an ordered id list. (C) Two fields on each session, a pinned flag and a position, owned by the daemon, with two mutations: pin or unpin one session, and set the whole order with a pinned count.

**Decision.** C. The daemon owns the invariants, every pinned session before every unpinned one and positions unique, re-derives positions on each mutation, persists, and broadcasts only the sessions whose fields changed. A newly opened session takes the bottom of the unpinned block.

**Consequences.** The order rides the ordinary whole-object upsert, so windows stay in sync for free. The daemon never sorts for display; the client orders from the fields. A preference blob would have drifted from the session set on every remove.

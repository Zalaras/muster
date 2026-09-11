---
id: connection-whole-object-session-upserts
type: decision
status: accepted
date: 2026-08-20
summary: The state stream sends whole session objects on every change; the client replaces by id and sorts for display itself.
features: [connection, lifecycle]
tags: [envelope, ux]
files: [internal/server/ws.go, internal/server/sessionwire.go, web/src/sessions/store.ts]
tests: [TestApply_RebindThenApplyPersistsAndBroadcastsExactlyOnce, TestSessionWire_JSONShapeHasNoUnexpectedNulls]
refs: [docs/history/spec-changelog.md, kb:anchor/ws.session-upsert, kb:anchor/ws.session, kb:anchor/ws.snapshot]
supersedes: []
---
**Context.** A session object is small and changes often. Field-level patches would save bytes but require the client to merge and would make a missed message corrupting rather than merely stale.

**Options.** (A) Field patches with a version counter. (B) Whole-object upserts, one per change, with the client replacing the entry by id. For ordering: (C) the daemon sends sessions pre-sorted, or (D) the client sorts.

**Decision.** B and D. A snapshot on connect plus whole objects afterwards means any single message is enough to be correct about that session.

**Consequences.** Every change to a session's shape is a wire-object change reviewed against the protocol. Sorting is a pure client function, so the daemon holds order invariants but never an order for display. One change produces exactly one broadcast, which tests assert.

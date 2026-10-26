---
id: rail-unread-also-marked-by-hand
type: decision
status: accepted
date: 2026-10-26
summary: Unread stays inferred from the live terminal client and cleared on attach; the developer can also mark a session read or unread through one per-session route.
features: [rail, lifecycle]
tags: [ux, store, user-decision]
files: [internal/session/manager_rail.go, internal/server/rail.go, web/src/api/sessions.ts, web/src/features/actions.ts]
tests: [TestSetUnread_FromEveryReachableState, TestSetUnread_AttachStillClearsAHandSetFlag, web/e2e/rail-menu.spec.ts]
refs: [plan:remove-unread-right-click-1, "#103", plans/remove-unread-right-click/research/e1.md, kb:anchor/sessions.unread]
supersedes: [rail-unread-inferred-from-live-terminal-client]
---
**Context.** The superseded decision made `unread` a daemon-owned flag set at turn close when no
terminal client was attached and cleared by an attach, and added no endpoint. #103 asks for a way to
mark a session read or unread by hand from the card menu, which that decision left no route for.

**Options.** (A) Keep inference only and close #103. (B) Keep inference as the default and add one
per-session route that sets or clears the flag on request. (C) Switch to the client owning "seen"
through an explicit seen call.

**Decision.** B (the developer, 2026-10-26). The flag still rides the session row and the ordinary
upsert, still survives restarts, is still set at turn close with no client attached and still
cleared by attaching either surface and by any transition out of idle. `PUT
/api/sessions/{id}/unread` (kb:anchor/sessions.unread) adds the hand mark: `unread:true` sets it
only on an idle session, `unread:false` clears it in any state, and a request that changes nothing —
or `true` on a non-idle session — is a 204 with no write and no broadcast, so unread still implies
idle. There is no batch route: marking several selected sessions calls the per-session route once
per id.

**Consequences.** A hand-set unread on the session shown in Focus stays until that session's next
attach, since marking does not detach. The route is additive and does not bump `protocolVersion`
(kb:adr/connection-protocol-bumps-only-on-shape-change). The registry's watched query and the
manager's watcher port stay as they were.

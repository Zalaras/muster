---
id: update-manual-check-is-a-synchronous-post
type: decision
status: accepted
date: 2026-09-22
summary: A user-initiated update check is a synchronous POST returning the result or an error, not a 202 plus a new check phase on the update broadcast.
features: [update]
tags: [ux]
files: [internal/server/update.go, web/src/api/update.ts, web/src/features/update.ts]
tests: []
refs: [plan:rail-card-improvements-2, "#48", kb:anchor/update.check, kb:anchor/update.apply, kb:anchor/ws.update, kb:adr/update-check-pref-governs-automatic-checking-only]
supersedes: []
---
**Context.** The daemon already holds what a manual check needs: `checkAvailability` performs it and `LatestTag` bounds itself with a 10 s timeout. But a failed periodic check deliberately changes nothing on the wire and logs at debug, so a fire-and-forget trigger would leave a pressed button unable to learn that the check failed.

**Options.** (A) 202 plus `Refresh`, relying on `checkedAt` changing; failure is silent. (B) 202 plus a `check` object on the update broadcast mirroring `apply`'s phase and error. (C) A synchronous request performing the check and returning the resulting update object, or an error naming why it could not complete.

**Decision.** C, and POST rather than GET or PUT. Failure rides a status code instead of a new wire field, so the delta is one endpoint rather than an endpoint plus a broadcast shape. Only the window that pressed the button needs an in-flight state, and an open request expresses that locally — B would broadcast a spinner to windows that did not ask for one. POST because the client supplies no representation and the outcome comes from GitHub, making this an action with a server-determined result rather than the idempotent replacement PUT names; it also matches `kb:anchor/update.apply`. A GET would work, but the call reaches an external host, mutates `available` and `checkedAt`, and broadcasts, where this document's other GET changes nothing.

**Consequences.** `checkAvailability` gains an error return and a flag for whether the caller is the schedule or a user, so one code path serves both rather than a second fetch drifting from the first. The periodic path keeps its silence on failure. A request now waits on a round trip bounded by the existing timeout, inside the E2E expect timeout. Two racing checks stay unserialised: field writes are already under the manager's mutex.

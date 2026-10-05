---
id: actions-bulk-stop-remove-are-daemon-batches
type: decision
status: accepted
date: 2026-10-05
summary: Bulk Stop and Remove are daemon batches over a list of ids, each under its per-session lock, reporting done, skipped and failed; the dashboard never loops.
features: [actions, rail]
tags: [tmux, ux]
files: [internal/session/actions.go, internal/server/sessions.go, web/src/features/actions.ts]
tests: []
refs: [plan:groups, kb:spec/rail]
supersedes: []
---
**Context.** Select mode, a header's Stop all and Delete group's "stop and remove" act on several sessions at once. The spec asks that a session vanishing mid-batch be skipped and that the batch report how many it actually did.

**Options.** (A) The dashboard loops `POST /api/sessions/{id}/end` / `DELETE /api/sessions/{id}` and tallies. (B) `POST /api/sessions/end` and `POST /api/sessions/remove` taking `{ids}`, each id processed in order under its own lock exactly as the single endpoint does, returning `{done, skipped, failed}` with 200 whatever the mix.

**Decision.** B. The daemon already owns the per-id lock and the kill-is-idempotent rule (kb:adr/actions-serialized-per-session, kb:adr/actions-kill-is-idempotent); one request keeps the report honest and lets `DELETE /api/groups/{id}` with `remove` reuse the same batch and delete the group only when no member remains.

**Consequences.** `skipped` is a session unknown at its turn or, for Stop, not alive; `failed` is a genuine kill failure with the row kept. A partial result is shown in the dashboard's action-error line with a fixed phrase; a complete one shows nothing. Sessions outside the ids are never touched.

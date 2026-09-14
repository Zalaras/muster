---
id: lifecycle-session-ids-monotonic-never-reused
type: decision
status: accepted
date: 2026-09-14
summary: Session ids are allocated monotonically from a kv watermark and floored above every muster-N on the socket, so an id is never reissued.
features: [lifecycle, launch, ingest]
tags: [store, tmux]
files: [internal/store/session.go, internal/store/store.go, internal/server/sessions.go, internal/tmux/tmux.go]
tests: [TestCreateSession_AfterRemovingTheHighestIDTheNextIDIsStrictlyGreater, TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch]
refs: [plan:session-lifecycle, "#26", kb:adr/surfaces-one-tmux-session-per-session, kb:adr/ingest-envelope-authoritative-binding, kb:adr/stack-db-database-sql-hand-sql, kb:fact/hook-delivery-best-effort]
supersedes: []
---
**Context.** `session.id` was `INTEGER PRIMARY KEY` without `AUTOINCREMENT`, so SQLite reissued the highest id once its row was deleted — and rows are hard-deleted by launch rollback, Remove and reconcile's sweep. That integer is not just a key: it is the tmux session name (`muster-<id>`, `muster-<id>-shell`) **and** the bearer credential the pane carries as `MUSTER_SESSION`, which ingest trusts on bare map membership.

Reuse produced three failures. Issue "#26" is the loud one: an orphaned `muster-1` plus a freed id 1 fails every launch with `duplicate session: muster-1`, and the rollback re-frees the id, so the next attempt fails identically — permanently. The quiet ones are worse: a stale pane's enveloped hooks bind to and drive a *new* session that reused its id, and `EventSummary` re-attaches a deleted session's `event` rows. Hooks carry no timestamps (kb:fact/hook-delivery-best-effort), so a late event cannot be age-checked; non-reuse is the only defence.

**Options.** (A) Adopt or kill an unknown `muster-N` — contradicts kb:adr/lifecycle-reconcile-before-first-snapshot and destroys a running pane. (B) `AUTOINCREMENT` alone — a fresh or moved data dir still starts at 1 against a live socket. (C) A `tmux_name` column — needless plumbing, and the credential stays recyclable. (D) Allocate monotonically from a watermark, floored above every Muster-shaped name on the socket.

**Decision.** D. `InsertSession` allocates `max(MAX(id), watermark, MinID) + 1` in one transaction and writes the watermark back, as a `kv` key — no migration, no backfill. The launcher supplies `MinID` from a `tmux.MaxSessionID` probe; a probe failure degrades to floor 0 and never fails a launch, because the watermark alone still prevents reuse.

**Consequences.** Ids become sparse; they were always opaque to the UI. An orphan is harmless rather than killed — still reported, never adopted, unable to collide. Pane corroboration at ingest stays unimplemented, now a smaller separate question.

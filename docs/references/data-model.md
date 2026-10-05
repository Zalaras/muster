---
id: data-model
type: reference
status: active
date: 2026-10-05
summary: The SQLite tables musterd owns, what each is for and which feature writes it; the migrations are the truth.
features: [lifecycle, usage, rail]
tags: [store]
files: [internal/store/migrations/**]
refs: [kb:adr/rail-groups-daemon-rows-whole-list-broadcast, kb:adr/rail-ungrouped-is-section-zero-on-the-wire, kb:adr/stack-storage-sqlite-pure-go, kb:adr/stack-db-database-sql-hand-sql, kb:adr/lifecycle-migrations-add-tables-when-written, kb:adr/lifecycle-session-identity-is-tmux-target, kb:adr/ingest-seq-assigned-at-ingest]
---
One SQLite database in the data directory: pure-Go driver, WAL mode, strict tables, UTC RFC3339
times (kb:adr/stack-storage-sqlite-pure-go, kb:adr/stack-db-database-sql-hand-sql).
Forward-only migrations under `internal/store/migrations/` are the schema, applied at startup;
each ships only its milestone's tables (kb:adr/lifecycle-migrations-add-tables-when-written).
Live state is in memory; the database is for restart and reconcile.

- **kv** — the two auth tokens, the prefs blob and the Ungrouped section's layout under
  `rail_ungrouped` (kb:adr/rail-ungrouped-is-section-zero-on-the-wire). Owned by connection, settings, rail.
- **event** — append-only log of every hook and status post: Claude session id, the per-session
  `seq` assigned at ingest (kb:adr/ingest-seq-assigned-at-ingest), type, `prompt_id`, `tool_use_id`,
  the envelope's Muster session and pane, the verbatim payload, receipt time and, once routed,
  the Muster `session_id`. Written by ingest, read by the state machine.
- **repo** — one row per launch directory: path, name, git flag, pin, launch count and time,
  last model and permission mode. Owned by launch.
- **session** — the state machine's row, identified by `tmux_target`
  (kb:adr/lifecycle-session-identity-is-tmux-target): the mutable Claude session id, directory,
  branch, worktree flag, launch title, state and its start time, the permission latch and its
  source, model and display name, compactions, attention and failure fields, activity,
  `alive`, `ended_at`, the first-launch flag, context figures, the last pane snapshot and time, `pinned`, `rail_pos`, `title_override`, `pending_resume_claude_session_id` and `group_id`
  (NULL = Ungrouped; `ON DELETE SET NULL` is a guard, members move first). Owned by lifecycle;
  display-only columns are written by rail, rename and actions, never read by the machine.
- **rail_group** — one row per rail group: name, `pos` among every section, `collapsed`; membership
  is the session's `group_id` (kb:adr/rail-groups-daemon-rows-whole-list-broadcast). Owned by rail.
- **usage_sample** — account five-hour and seven-day readings with model, receipt time and
  source, one row per change. **usage_model_sample** — per-model weekly windows from the daemon's
  poll. Both owned by usage, persist-only.

No worktree table: worktrees are recognised, never created.

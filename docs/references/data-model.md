---
id: data-model
type: reference
status: active
date: 2026-09-12
summary: The SQLite tables musterd owns, what each is for and which feature writes it; the migrations are the truth.
features: [lifecycle, usage]
tags: [store]
files: [internal/store/migrations/**]
refs: [kb:adr/stack-storage-sqlite-pure-go, kb:adr/stack-db-database-sql-hand-sql, kb:adr/lifecycle-migrations-add-tables-when-written, kb:adr/lifecycle-session-identity-is-tmux-target, kb:adr/ingest-seq-assigned-at-ingest]
---
One SQLite database in the data directory: pure-Go driver, WAL mode, strict tables, UTC
RFC3339 times (kb:adr/stack-storage-sqlite-pure-go,
kb:adr/stack-db-database-sql-hand-sql). Numbered forward-only migrations under
`internal/store/migrations/` are applied at startup and are the authoritative schema; a
migration ships only the tables its milestone writes (kb:adr/lifecycle-migrations-add-tables-when-written).
The daemon holds live state in memory; the database is the system of record for restart
and reconcile.

- **kv** — the two auth tokens and the prefs JSON blob. Owned by connection and settings.
- **event** — append-only log of every ingested hook and status post: the Claude session id,
  the daemon-assigned per-session `seq` (kb:adr/ingest-seq-assigned-at-ingest), the event
  type, `prompt_id` and `tool_use_id` as first-class columns, the envelope's Muster session
  and pane, the verbatim payload, the receipt time and, once routed, the Muster `session_id`.
  Written by ingest; read by the state machine; the audit trail.
- **repo** — one row per directory launched into: path, name, git flag, pin, launch count
  and time, last model and permission mode used there. Owned by launch.
- **session** — the state machine's persisted row, identified by `tmux_target`
  (kb:adr/lifecycle-session-identity-is-tmux-target), with the mutable Claude session id,
  directory, branch, worktree flag, launch title, state and its start time, the permission
  latch and its source, model and display name, compaction count, attention and failure
  fields, last activity, `alive` and `ended_at`, the first-launch flag, context figures,
  the last pane snapshot and its time, `pinned` and `rail_pos`, and `title_override`. Owned
  by lifecycle; the display-only columns are written by rail, rename and actions and never
  read by the state machine.
- **usage_sample** — account-level five-hour and seven-day readings with model, receipt
  time and source, one row per changed value. **usage_model_sample** — per-model weekly
  windows from the daemon's own poll. Both owned by usage, persist-only.

There is no worktree table: worktrees are recognised, not created.

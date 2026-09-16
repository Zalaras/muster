---
id: store-schema
type: diagram
status: active
date: 2026-09-15
kind: er
summary: Every SQLite table at its final shape after migrations 0001-0008, with the schema's single foreign key.
features: []
tags: [store]
files: [internal/store/migrations/*.sql, internal/store/*.go]
tests: [TestMigrate_AppliesInitSchema, TestMigrate_CreatesSchemaMigrationsTableIfAbsent]
refs: [kb:ref/data-model, kb:adr/lifecycle-session-identity-is-tmux-target, kb:adr/ingest-seq-assigned-at-ingest, kb:adr/ingest-envelope-binds-never-cwd, plans/_audit/diagrams-from-code.md]
---
Final shape, with the additive `ALTER TABLE`s of 0003-0008 folded into `session`. Migrations are
forward-only and purely additive: no migration has ever changed or dropped a column, and the one
data statement is 0006's `rail_pos` backfill.

The schema has exactly **one** foreign key — `session.repo_id REFERENCES repo(id)`, with no
`ON DELETE` clause, so `NO ACTION`. It is genuinely enforced: `PRAGMA foreign_keys = ON` is set
at connection time. `event.session_id` is deliberately *not* a foreign key and carries no
relationship line here: it is NULL while an event is unrouted, and an envelope that names an
unknown Muster session is persisted unrouted rather than guessed at
(kb:adr/ingest-envelope-binds-never-cwd).

Two non-constraints are decisions. `session.tmux_target` is the identity key yet has no UNIQUE,
because tmux window ids restart with the tmux server, so a dead session's target can be re-minted
— uniqueness among *alive* sessions is the code's job
(kb:adr/lifecycle-session-identity-is-tmux-target). `event`'s uniqueness is
`(claude_session_id, seq)`, the per-session counter a single worker assigns at ingest
(kb:adr/ingest-seq-assigned-at-ingest).

All six tables a migration creates are declared `STRICT`, so SQLite enforces the column types
shown rather than applying its usual affinity rules. `schema_migrations` is the exception on both
counts: it is created in Go rather than in a `.sql` file, so it has no migration of its own and
is not `STRICT`. The only explicit index is `idx_event_session_id`.

```mermaid
erDiagram
    repo ||--o{ session : "launched into"

    kv {
        TEXT key PK
        TEXT value "NOT NULL"
    }

    schema_migrations {
        INTEGER version PK "created in Go, not a migration"
        TEXT applied_at "NOT NULL"
    }

    repo {
        INTEGER id PK
        TEXT path UK "NOT NULL, absolute directory"
        TEXT name "NOT NULL, basename(path)"
        INTEGER is_git "NOT NULL DEFAULT 0"
        INTEGER pinned "NOT NULL DEFAULT 0"
        TEXT last_launched_at "NOT NULL"
        INTEGER launch_count "NOT NULL DEFAULT 0"
        TEXT last_model "per-directory launch default"
        TEXT last_permission_mode "per-directory launch default"
        TEXT created_at "NOT NULL"
    }

    session {
        INTEGER id PK
        TEXT tmux_target "NOT NULL, identity key, deliberately not UNIQUE"
        TEXT tmux_pane "pane id at spawn"
        TEXT claude_session_id "mutable attribute, never identity"
        INTEGER repo_id FK "NOT NULL REFERENCES repo(id), no ON DELETE"
        TEXT directory "NOT NULL"
        TEXT branch "null when not git"
        INTEGER is_worktree "NOT NULL DEFAULT 0"
        TEXT title "launch --name value"
        TEXT state "NOT NULL, one of six displayed states"
        TEXT state_since "NOT NULL"
        TEXT permission_mode "NOT NULL, the latch value"
        TEXT permission_mode_source "NOT NULL, seed or hook"
        TEXT model "launch value, replaced by SessionStart"
        INTEGER compactions "NOT NULL DEFAULT 0"
        TEXT attention_reason "non-null iff needs_input"
        TEXT attention_since "non-null iff needs_input"
        TEXT failure_error "non-null iff failed"
        TEXT failure_message "non-null iff failed"
        TEXT last_activity "last turn summary"
        INTEGER alive "NOT NULL DEFAULT 1, orthogonal to state"
        TEXT ended_at "set when the pane dies"
        INTEGER first_launch_here "NOT NULL DEFAULT 0, trust-prompt cue"
        TEXT created_at "NOT NULL"
        REAL context_used_pct "0003, NULL = unknown"
        INTEGER context_total_input_tokens "0003"
        INTEGER context_window_size "0003"
        TEXT model_display_name "0003"
        TEXT last_snapshot "0004, display only"
        TEXT last_snapshot_at "0004"
        INTEGER pinned "0006, NOT NULL DEFAULT 0"
        INTEGER rail_pos "0006, NOT NULL DEFAULT 0, backfilled from id"
        TEXT title_override "0007, the user's rename"
        TEXT transcript_file "0008, display only"
        TEXT plan_path "0008"
        INTEGER plan_exists "0008, NOT NULL DEFAULT 0"
    }

    event {
        INTEGER id PK "global arrival order"
        TEXT claude_session_id "NOT NULL, UNIQUE with seq"
        INTEGER seq "NOT NULL, per claude_session_id, assigned at ingest"
        TEXT type "NOT NULL, hook event name or status_line"
        TEXT prompt_id "turn identity"
        TEXT tool_use_id "tool call identity"
        INTEGER muster_session "envelope field, NULL on raw posts"
        TEXT tmux_pane "envelope field"
        TEXT payload "NOT NULL, verbatim inner JSON"
        TEXT received_at "NOT NULL, daemon clock"
        INTEGER session_id "0002, indexed, NOT a foreign key, NULL = unrouted"
    }

    usage_sample {
        INTEGER id PK
        TEXT at "NOT NULL, daemon receipt time"
        TEXT model_id "NOT NULL"
        TEXT model_display_name "NOT NULL"
        REAL five_hour_pct "NOT NULL"
        TEXT five_hour_resets_at "NOT NULL"
        REAL seven_day_pct "NOT NULL"
        TEXT seven_day_resets_at "NOT NULL"
        TEXT source "NOT NULL, subscription in v1"
    }

    usage_model_sample {
        INTEGER id PK
        TEXT at "NOT NULL, daemon fetch time"
        TEXT display_name "NOT NULL"
        REAL pct "NOT NULL"
        TEXT resets_at "NOT NULL"
        TEXT source "NOT NULL, subscription-api"
    }
```

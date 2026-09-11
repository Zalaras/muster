-- M1: repo (MRU picker + per-directory launch defaults), session (the kb:anchor/state state
-- machine's persisted row), and event.session_id (routing an ingested event to the
-- Muster session it belongs to). See plans/m1-sessions/plan.md > Schema Changes.

CREATE TABLE repo (
  id                   INTEGER PRIMARY KEY,
  path                 TEXT    NOT NULL UNIQUE,  -- absolute directory launched into
  name                 TEXT    NOT NULL,          -- basename(path)
  is_git               INTEGER NOT NULL DEFAULT 0,
  pinned               INTEGER NOT NULL DEFAULT 0, -- no UI yet; ordering honors it
  last_launched_at     TEXT    NOT NULL,
  launch_count         INTEGER NOT NULL DEFAULT 0,
  last_model           TEXT,                      -- per-directory launch defaults
  last_permission_mode TEXT,
  created_at           TEXT    NOT NULL
) STRICT;

CREATE TABLE session (
  id                     INTEGER PRIMARY KEY,
  tmux_target            TEXT    NOT NULL,  -- the identity key (no UNIQUE: tmux window
                                            -- ids restart with the tmux server, so a
                                            -- dead session's target can be re-minted;
                                            -- uniqueness among alive sessions is code's)
  tmux_pane              TEXT,              -- pane id at spawn; envelope corroboration
  claude_session_id      TEXT,              -- mutable attribute, never identity
  repo_id                INTEGER NOT NULL REFERENCES repo(id),
  directory              TEXT    NOT NULL,
  branch                 TEXT,              -- captured at launch; null when not git
  is_worktree            INTEGER NOT NULL DEFAULT 0, -- linked-worktree recognition
  title                  TEXT,              -- launch --name value; null otherwise (M3
                                            -- takes over from the status line)
  state                  TEXT    NOT NULL,  -- started|planning|working|needs_input|failed|idle
  state_since            TEXT    NOT NULL,
  permission_mode        TEXT    NOT NULL,  -- the latch value
  permission_mode_source TEXT    NOT NULL,  -- 'seed' | 'hook'
  model                  TEXT,              -- launch value, replaced by SessionStart's
  compactions            INTEGER NOT NULL DEFAULT 0,
  attention_reason       TEXT,              -- 'permission'|'idle'; non-null iff needs_input
  attention_since        TEXT,
  failure_error          TEXT,              -- raw token; non-null iff failed
  failure_message        TEXT,
  last_activity          TEXT,
  alive                  INTEGER NOT NULL DEFAULT 1,
  ended_at               TEXT,
  first_launch_here      INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT    NOT NULL
) STRICT;

ALTER TABLE event ADD COLUMN session_id INTEGER;  -- Muster session id once routed;
                                                  -- NULL = unrouted (or pre-M1 rows)
CREATE INDEX idx_event_session_id ON event(session_id);

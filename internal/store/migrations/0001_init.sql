CREATE TABLE kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE event (
  id                INTEGER PRIMARY KEY,  -- global arrival order across all sessions
  claude_session_id TEXT    NOT NULL,
  seq               INTEGER NOT NULL,     -- per-claude_session_id, assigned at ingest
  type              TEXT    NOT NULL,     -- the hook's event-name field verbatim, or 'status_line'
  prompt_id         TEXT,
  tool_use_id       TEXT,
  muster_session    INTEGER,              -- envelope field; NULL on raw posts / unset env
  tmux_pane         TEXT,                 -- envelope field; NULL likewise
  payload           TEXT    NOT NULL,     -- verbatim inner payload JSON
  received_at       TEXT    NOT NULL,     -- RFC3339Nano UTC, daemon clock (hooks carry none)
  UNIQUE (claude_session_id, seq)
) STRICT;

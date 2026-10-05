-- Plan groups (2026-10-05): named rail sections (kb:spec/rail). A group is a label with a place
-- and a collapsed flag; membership is the session's own column. Display-only — never read by the
-- state machine. The table is rail_group because group is a SQL keyword.
CREATE TABLE rail_group (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  pos        INTEGER NOT NULL,
  collapsed  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
) STRICT;
ALTER TABLE session ADD COLUMN group_id INTEGER REFERENCES rail_group(id) ON DELETE SET NULL;

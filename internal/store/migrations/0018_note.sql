-- Session notes (2026-10-20): the developer's own text about a session. Display-only;
-- never read by the state machine. Deleted with the row.
ALTER TABLE session ADD COLUMN note TEXT;  -- NULL = no note; never an empty or whitespace-only string

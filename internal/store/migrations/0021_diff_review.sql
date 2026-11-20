-- Diff review (2026-11-19): a session's comments and ticks on its checkout's diff, one JSON
-- document per session. Muster-owned, display-only; deleted with the row.
ALTER TABLE session ADD COLUMN diff_review TEXT;  -- NULL = no comments and no ticks

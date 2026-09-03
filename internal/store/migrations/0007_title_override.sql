-- Pre-v1 (plan ui-text-and-focus, 2026-09-03): the user's rename. Display-only; wins over
-- the status line's session_name in the wire title. Never read by the state machine.
ALTER TABLE session ADD COLUMN title_override TEXT;

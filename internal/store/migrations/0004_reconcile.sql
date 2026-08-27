-- M4 (m4-reconcile): last captured pane screen, served to the UI for ended sessions.
-- Display source only — never read by the state machine.
ALTER TABLE session ADD COLUMN last_snapshot    TEXT;
ALTER TABLE session ADD COLUMN last_snapshot_at TEXT;

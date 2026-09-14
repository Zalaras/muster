-- Pre-v1 (plan markdown-viewing, 2026-09-13): the latest transcript path a routed hook
-- named and the plan derived from it. Display-only; never read by the state machine.
ALTER TABLE session ADD COLUMN transcript_file TEXT;
ALTER TABLE session ADD COLUMN plan_path       TEXT;
ALTER TABLE session ADD COLUMN plan_exists     INTEGER NOT NULL DEFAULT 0;

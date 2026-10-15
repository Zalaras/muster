-- Effort (2026-10-15): the status line's effort level, the level a launch asked for until its
-- first report is checked, the launch-mismatch warning that check can raise, and the level a
-- directory was last launched at. Display-only — never read by the state machine.
ALTER TABLE session ADD COLUMN effort_known INTEGER NOT NULL DEFAULT 0;   -- 1 once a level (or no level) has been reported or seeded
ALTER TABLE session ADD COLUMN effort_level TEXT;                         -- NULL with effort_known = 1 is "reported, no effort setting"
ALTER TABLE session ADD COLUMN effort_requested TEXT;                     -- the launch's --effort level while its first report is pending; NULL when none is
ALTER TABLE session ADD COLUMN effort_warning_requested TEXT;             -- non-NULL iff the warning is set
ALTER TABLE session ADD COLUMN effort_warning_actual TEXT;                -- NULL = the first report showed no effort setting
ALTER TABLE session ADD COLUMN effort_warning_model TEXT;                 -- the model's display name after the first report
ALTER TABLE repo ADD COLUMN last_effort TEXT;                             -- the effort of the last launch here; NULL before any and after default

-- Restart onto the latest Claude Code (2026-11-04): the Claude Code version a live session's
-- status line last reported, and a confirmed restart waiting for the session to be free.
ALTER TABLE session ADD COLUMN claude_version TEXT;                         -- NULL = none reported since the last launch/resume; NULL on every death
ALTER TABLE session ADD COLUMN restart_pending INTEGER NOT NULL DEFAULT 0;   -- 0/1

-- Plan resume-followups (2026-09-29): the pending-resume hold survives a daemon restart
-- (kb:adr/launch-resume-pending-hold-persisted). The Claude session id a resume-from-list
-- row was launched to resume, until its SessionStart(source:"resume") bind clears it or the
-- row ends. NULL for an ordinary launch.
ALTER TABLE session ADD COLUMN pending_resume_claude_session_id TEXT;

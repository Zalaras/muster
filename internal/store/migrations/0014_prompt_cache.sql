-- Prompt-cache warmth (2026-10-14): the status line's prompt_cache expiry and lifetime, kept on
-- the session row so a restart, Stop and Resume leave it as it was. Display-only — never read by
-- the state machine. The two columns are written together; NULL = unknown.
ALTER TABLE session ADD COLUMN cache_expires_at TEXT;       -- RFC3339 UTC
ALTER TABLE session ADD COLUMN cache_ttl_seconds INTEGER;   -- NULL iff cache_expires_at is NULL

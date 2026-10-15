-- Cache keep-alive prediction (2026-10-15): the last adopted request count and the last status-line
-- expiry, kept beside the cache columns so a restart still tells a keep-alive post from a new request
-- and an ended session can drop its warmth to the expiry Claude Code last reported. Display-only;
-- cleared with the cache by /clear. NULL = none seen.
ALTER TABLE session ADD COLUMN cache_requests INTEGER;
ALTER TABLE session ADD COLUMN cache_reported_expires_at TEXT;   -- RFC3339 UTC

-- Plan rail-card-improvements (2026-09-22): unread idle (REQ-7) and the turn-aware
-- activity line's stored prompt (REQ-12). Both display-only; never read by the state
-- machine.
ALTER TABLE session ADD COLUMN unread      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN last_prompt TEXT;

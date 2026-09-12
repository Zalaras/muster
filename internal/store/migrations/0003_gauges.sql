-- M3: usage_sample (account-level rate-limit history, persist-only in v1) and the
-- session columns the status line's context gauge and model display name land in. See
-- plans/m3-gauges/plan.md > Schema Changes.

CREATE TABLE usage_sample (
  id                   INTEGER PRIMARY KEY,
  at                   TEXT    NOT NULL,  -- RFC3339Nano UTC, daemon receipt time
  model_id             TEXT    NOT NULL,
  model_display_name   TEXT    NOT NULL,
  five_hour_pct        REAL    NOT NULL,
  five_hour_resets_at  TEXT    NOT NULL,  -- RFC3339 UTC (converted from wire epoch)
  seven_day_pct        REAL    NOT NULL,
  seven_day_resets_at  TEXT    NOT NULL,
  source               TEXT    NOT NULL   -- "subscription" in v1 (the kb:adr/usage-no-source-interface seam)
) STRICT;

ALTER TABLE session ADD COLUMN context_used_pct REAL;             -- NULL = unknown
ALTER TABLE session ADD COLUMN context_total_input_tokens INTEGER;
ALTER TABLE session ADD COLUMN context_window_size INTEGER;
ALTER TABLE session ADD COLUMN model_display_name TEXT;           -- NULL = derive from model id

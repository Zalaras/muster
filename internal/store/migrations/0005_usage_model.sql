-- Pre-v1 (plan usage-model-bar, 2026-08-30): per-model weekly usage windows fetched by
-- musterd's own poll of Claude Code's per-model usage endpoint (internal/claudecode).
-- Persist-only (no history UI), one row per window on a list change. See
-- plans/usage-model-bar/plan.md > Schema Changes.

CREATE TABLE usage_model_sample (
  id            INTEGER PRIMARY KEY,
  at            TEXT NOT NULL,   -- RFC3339Nano UTC, daemon fetch time
  display_name  TEXT NOT NULL,
  pct           REAL NOT NULL,
  resets_at     TEXT NOT NULL,   -- RFC3339 UTC
  source        TEXT NOT NULL    -- "subscription-api"
) STRICT;

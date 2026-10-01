-- Plan status-inconsistencies (2026-09-30): background work a Stop reported still running
-- (kb:adr/lifecycle-background-tasks-count-not-state), and which agent raised the current
-- permission wait (kb:adr/lifecycle-attention-owned-by-raising-agent).
ALTER TABLE session ADD COLUMN background_tasks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN attention_agent  TEXT;  -- NULL = main agent; non-null only while attention_reason is

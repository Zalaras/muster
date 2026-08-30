-- Pre-v1 (plan order-sidebar, 2026-08-30): user-owned rail order. Display-only fields;
-- never read by the state machine. pinned rows always have a smaller rail_pos than
-- unpinned rows (invariant enforced in internal/session, not by the schema).
ALTER TABLE session ADD COLUMN pinned   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN rail_pos INTEGER NOT NULL DEFAULT 0;
UPDATE session SET rail_pos = id;   -- backfill: opened order

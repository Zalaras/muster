-- See-added-dirs (2026-10-19): the directories an alive session works in beyond its launch
-- directory, as the status line last reported them. Display-only; emptied on every death.
ALTER TABLE session ADD COLUMN added_dirs TEXT;  -- JSON array of normalised directory paths; NULL = none

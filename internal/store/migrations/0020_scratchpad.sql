-- Scratchpad folder in the reader nav (2026-11-12): the scratchpad_dir the latest hook of the session's current Claude session id named.
ALTER TABLE session ADD COLUMN scratchpad_dir TEXT;  -- NULL until a well-formed scratchpad_dir hook; never cleared

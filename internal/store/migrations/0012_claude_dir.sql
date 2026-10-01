-- Plan stale-dirs-models-branches (2026-10-01): the working directory Claude last reported,
-- display-only (kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere).
-- NULL = nothing reported since the last launch or resume.
ALTER TABLE session ADD COLUMN claude_dir TEXT;

---
id: resume-does-not-restore-effort
type: fact
status: active
date: 2026-10-15
summary: --resume without --effort starts at the configured default, not the transcript's effort; --effort on resume applies; assistant lines record effort.
features: [past-sessions, actions]
tags: [claude-code-format]
files: [internal/claudecode/launchtranscripts.go]
tests: []
refs: [kb:fact/resume-restores-model-and-mode-except-plan, kb:fact/effort-default-saved-per-model]
verified: 2.1.300..2.1.300
guard: none
---
Unlike model and mode (kb:fact/resume-restores-model-and-mode-except-plan), effort does not come
back from the transcript.

- A Haiku 5.5 session whose last turn ran at `high` (set session-only), resumed with
  `--resume <id>` and no `--effort`, posted `effort.level` `medium`: the model's default, with no
  saved effort for it (kb:fact/effort-default-saved-per-model).
- The same session resumed with `--resume <id> --effort low` posted `low`.
- In the transcript, every `assistant` line carries a top-level `"effort": "<level>"` (beside
  `perTurnEffort`), and the `api-request` lines carry `params.output_config.effort`. No other
  line type records it; a session with no completed turn has no effort recorded.

Evidence: probe instance 3, 2026-10-15, session `be474ab5` (two resumes); 2.1.300.

Raw probe capture (local only, not in git): `capture-3.jsonl`.

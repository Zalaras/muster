---
id: resume-with-plan-flag-keeps-plan
type: fact
status: active
date: 2026-11-04
summary: claude --resume <id> --permission-mode plan comes back in plan mode; only a resume with no mode flag drops plan to the default.
features: [actions, launch]
tags: [claude-code-format]
files: [internal/claudecode/launch.go]
tests: []
refs: [kb:fact/resume-restores-model-and-mode-except-plan]
verified: 2.1.317..2.1.317
guard: none
---
`claude --resume <id> --model <m> --permission-mode plan` started with the TUI footer reading
"plan mode on (shift+tab to cycle)" before any prompt. With no mode flag, a session whose last
mode was plan comes back in the default instead (kb:fact/resume-restores-model-and-mode-except-plan),
so the explicit flag is what carries plan across a resume. Neither the resume `SessionStart` nor
the status line carried a `permission_mode`.

Evidence: probe instance 3, 2026-11-04, one resume of session `7f223f32`, footer read with
capture-pane as the oracle; the run was on 2.1.318, so `verified` stops at the canary ceiling
2.1.317 until 2.1.318 is recorded. Raw capture (local only, not in git): `capture-3.jsonl`.

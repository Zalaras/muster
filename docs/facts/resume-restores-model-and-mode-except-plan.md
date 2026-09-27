---
id: resume-restores-model-and-mode-except-plan
type: fact
status: active
date: 2026-09-27
summary: --resume <id> with no model or mode flag keeps the transcript's model and mode, except plan, which becomes the default; unknown ids exit 1.
features: [launch, actions]
tags: [claude-code-format]
files: []
tests: []
refs: [plan:resume-and-dangerously-allow, kb:fact/resume-keeps-session-identity, kb:fact/permission-mode-no-flag-follows-configured-default]
verified: 2.1.283..2.1.283
guard: none
---
`claude --resume <id>` with neither `--model` nor `--permission-mode`:

- **Model** comes from the transcript. A haiku session resumed with the project's `model` setting
  changed to `sonnet` reported `model.id` `claude-haiku-4-5-20251001` on its first status-line
  post, before any prompt.
- **Mode** comes from the transcript for `acceptEdits` (footer "accept edits on"), but a session
  whose last `permission-mode` line was `plan` came back in manual, the same mode a fresh session
  with no flag started in on that machine. A `-p` session writes no `permission-mode` line and
  also came back in manual. Auto and bypass were not resumed.
- **Title** comes back: status-line `session_name` was the original `--name`.
- `SessionStart{source:"resume"}` carried the original `session_id`, as before.

An id with no transcript prints `No conversation found with session ID: <id>` and exits 1
before any hook fires.

Evidence: probe runs A, B and the acceptEdits run (capture-3, 2026-09-27); mode read from the
TUI footer (capture-pane as oracle) and the hooks.

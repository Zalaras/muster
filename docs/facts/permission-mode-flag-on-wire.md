---
id: permission-mode-flag-on-wire
type: fact
status: active
date: 2026-09-11
summary: --permission-mode is reflected verbatim on UserPromptSubmit.permission_mode; the CLI's manual choice is spelled default on the wire.
features: [launch]
tags: [claude-code-format]
files: [internal/claudecode/launch.go]
tests: [TestBuildArgv]
refs: [spikes/FINDINGS.md, plan:fix-auto-mode-select]
verified: 2.1.259..canary
guard: TestLaunchFlags
---
The `--permission-mode` value reaches `UserPromptSubmit.permission_mode` (and `Stop`) unchanged:
no flag → `"default"`, `plan` → `"plan"`, `acceptEdits` → `"acceptEdits"`, `auto` → `"auto"` on
a model that allows it. The CLI lists the choices `acceptEdits | auto | bypassPermissions |
manual | dontAsk | plan`; `default` is unlisted but still accepted, and `manual`, `default` and
no flag all report `"default"` (TUI footer `⏸ manual mode on`). Headless `-p` honours the flag.
The flag is reflected before authentication: the four unauthenticated canary runs each report
their mode on `UserPromptSubmit` ahead of the auth failure.

Evidence: 2.1.259 probe 2026-09-03 (3/3 headless sessions for the `default` spellings, 1/1
interactive `auto`, 1/1 headless `acceptEdits`); asserted on 2.1.267 by run C ×4 and the
authenticated run D reporting `"plan"`.

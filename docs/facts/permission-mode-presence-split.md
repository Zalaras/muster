---
id: permission-mode-presence-split
type: fact
status: active
date: 2026-09-11
summary: permission_mode is not universal: six hook events always carry it, five never do; values seen are default, plan, acceptEdits, auto.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/session.go]
tests: [TestLatchPermissionMode_SeedThenHookInvariant]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestHookFields
---
`permission_mode` is not a common hook field, whatever the documentation says. Across 134
payloads the split is clean — every event either always or never carries it.

- Always present: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`,
  `PermissionRequest`.
- Never present: `SessionStart`, `SessionEnd`, `Notification`, `StopFailure`, `PreCompact`.

Observed values: `"default"`, `"plan"`, `"acceptEdits"` (2.1.233) and `"auto"` (2.1.259 probe,
2026-09-03). The CLI's `manual` choice is spelled `"default"` on the wire
(kb:fact/permission-mode-flag-on-wire). `StopFailure` carries none, so a session failing in
plan mode keeps its latched mode. The status line never carries it (kb:fact/status-line-keys).

Evidence: capture-1 and capture-3; the guard asserts presence or absence per event on nine
events every canary run (`SubagentStop` and `PreCompact` are not driven).

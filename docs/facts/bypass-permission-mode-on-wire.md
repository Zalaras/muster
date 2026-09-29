---
id: bypass-permission-mode-on-wire
type: fact
status: active
date: 2026-09-27
summary: Under --permission-mode bypassPermissions, hooks that carry permission_mode report "bypassPermissions" verbatim.
features: [lifecycle]
tags: [claude-code-format]
files: []
tests: [TestBypassPermissionModeOnWire]
refs: [plan:resume-and-dangerously-allow, kb:fact/permission-mode-presence-split, kb:fact/permission-mode-flag-on-wire]
verified: 2.1.283..canary
guard: TestBypassPermissionModeOnWire
---
A session started with `--permission-mode bypassPermissions` reports
`permission_mode: "bypassPermissions"` on `UserPromptSubmit` and `Stop`, the flag value
verbatim. `SessionStart` and `SessionEnd` carry no `permission_mode`, matching
kb:fact/permission-mode-presence-split, whose observed values this extends.

Evidence: one headless `-p` run on haiku (capture-3, 2026-09-27, session `51e8097b…`). Not yet
seen from an interactive session, which needs the warning in kb:fact/bypass-acceptance-blocks-startup
accepted.

The guard drives the zero-token unauthenticated path, which ends in `StopFailure`, so it pins
`UserPromptSubmit` and the absent keys; the `Stop` half is not re-measured by it.

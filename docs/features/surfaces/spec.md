---
id: surfaces
type: spec
status: draft
date: 2026-09-11
summary: PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target.
features: [surfaces]
tags: [tmux]
go: [internal/server/terminal*.go, internal/server/shells*.go, internal/server/plainshell_test.go, internal/server/settings_shell_test.go, internal/termbridge/**, internal/tmux/**]
web: [web/src/features/surfaces.ts, web/src/terminal/**]
e2e: [web/e2e/terminal.spec.ts, web/e2e/shell.spec.ts, web/e2e/plain-shell.spec.ts, web/e2e/helpers/terminal.ts, web/e2e/helpers/shell.ts]
protocol: [terminal.ws, terminal.shell-ws, sessions.shell]
---
TODO (Track 3 batch 7): current behaviour of the surfaces feature, present tense, no dates, no rationale.

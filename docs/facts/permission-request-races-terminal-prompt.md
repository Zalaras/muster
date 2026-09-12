---
id: permission-request-races-terminal-prompt
type: fact
status: active
date: 2026-09-12
summary: A PermissionRequest hook races the in-terminal prompt; whoever answers first wins, and a timeout, error or empty reply falls back to the stock prompt.
features: [lifecycle]
tags: [claude-code-format]
files: [internal/session/machine.go]
tests: []
refs: [spikes/FINDINGS.md, SPEC.md, kb:fact/plan-mode-hook-sequence, kb:fact/notification-types-observed]
verified: 2.1.233..2.1.267
guard: none
---
A `PermissionRequest` hook does not block the permission prompt; it runs alongside it. The tool
call is held until something decides, the in-terminal prompt appears immediately and
concurrently, and whichever answers first wins — the user at the keyboard or the hook's HTTP
response. A hook `allow` that arrives after the prompt is showing retracts it without a
keystroke.

The per-hook `timeout` is honoured and is in seconds; a timed-out, erroring or empty hook reply
falls back to the stock in-terminal prompt, so there is never a window where the user is locked
out. Any dashboard-side approval built on this hook must therefore handle losing the race.

Evidence: the step-1 spikes against 2.1.233 (FINDINGS "Remote plan approval is mechanically
available" and "The per-hook timeout is honored"): a hook returning `allow` at about ten
seconds made the on-screen prompt vanish; a three-second timeout against a fifteen-second server
sleep aborted at exactly three seconds. Not asserted by the canary.

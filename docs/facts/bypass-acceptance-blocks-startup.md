---
id: bypass-acceptance-blocks-startup
type: fact
status: active
date: 2026-09-27
summary: An interactive bypassPermissions launch shows a warning, No-exit preselected; no hook or status line until answered. -p skips it.
features: [launch]
tags: [claude-code-format]
files: []
tests: [TestBypassAcceptanceBlocksStartup]
refs: [plan:resume-and-dangerously-allow, kb:fact/trust-prompt-preselects-exit, kb:adr/launch-trust-prompt-never-auto-answered]
verified: 2.1.283..canary
guard: TestBypassAcceptanceBlocksStartup
---
Launching interactively with `--permission-mode bypassPermissions` shows, before the prompt box:

```
WARNING: Claude Code running in Bypass Permissions mode
…
❯ No, exit
  Yes, I accept
```

"No, exit" is preselected, as on the trust prompt. For the ~15 s it was left up, the capture
server got zero hooks and zero status-line posts, so like the trust prompt it is visible to
Muster only as an absence of signal. Enter on "No, exit" quits `claude`.

A `-p` run with the same flag shows nothing and proceeds.

Not measured: whether accepting is remembered, and whether per machine or per directory. The
probe declined every time, since accepting writes to the developer's user-level Claude Code state,
which no probe may change. On a machine that already accepted, the warning may never appear.

Evidence: probe run C (capture-3, 2026-09-27); screen read by capture-pane as oracle.

---
id: permission-mode-no-flag-follows-configured-default
type: fact
status: active
date: 2026-09-23
summary: With no --permission-mode flag a session starts in the machine's configured default mode, which can be auto; --permission-mode default or manual forces manual.
features: [launch]
tags: [claude-code-format]
files: [internal/claudecode/launch.go]
tests: [TestLaunchFlags]
refs: [test/rig/captures/capture-3.jsonl, kb:fact/permission-mode-flag-on-wire, plan:new-session-improvement]
verified: 2.1.280..2.1.280
guard: TestLaunchFlags
---
On the developer's machine (2.1.280, Team account), a session launched with no
`--permission-mode` flag showed `⏵⏵ auto mode on`, and `UserPromptSubmit.permission_mode` was
`"auto"`. The rig's scratch repo sets no `permissions.defaultMode`. The user-level settings file
was not read (a hard rule), so where the auto default comes from is unmeasured. The consequence
is what matters: "no flag" means "Claude Code's configured default", and that is not always
`default`. `--permission-mode default` and `--permission-mode manual` each forced `⏸ manual
mode on` and reported `"default"` (1 of 1 each). This narrows the no-flag clause of
kb:fact/permission-mode-flag-on-wire, which was measured where the configured default was
manual. Its other claims were not re-tested.

Evidence: interface probe 2026-09-23, instance 3. There were 3 no-flag interactive sessions
(footer showed auto, 2 carried a `UserPromptSubmit` reporting `"auto"`) and 1 session each with
`default` and `manual`, all through the fail-proxy.

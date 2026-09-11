---
id: hook-commands-are-shell-lines
type: fact
status: active
date: 2026-09-11
summary: Command-hook command and statusLine.command are /bin/sh -c command lines, not argv paths; an unquoted space-bearing path breaks both.
features: [ingest, launch]
tags: [claude-code-format]
files: [internal/claudecode/settings.go]
tests: [TestMergeSettings_CommandFieldIsShellQuotedForSpaceBearingPath, TestShellQuote]
refs: [spikes/FINDINGS.md, plan:m4-hook-quoting]
verified: 2.1.245..canary
guard: TestCommandHookPathQuoting
---
A `type:"command"` hook's `command` and `statusLine.command` are shell command lines run via
`/bin/sh -c`, not argv paths. A bare script path containing a space is word-split: the
`SessionStart` hook surfaces `Failed with non-blocking status code: /bin/sh: /tmp/muster: No
such file or directory` in the TUI (headless `-p`: no output), and the status line fails
silently — no render, no post, no error. Both `'…'` and `"…"` quoting deliver on a
space-bearing path; quoting a space-free path is harmless.

Evidence: 2.1.245 probe 2026-08-25, captures 4 and 5 (3 headless + 2 interactive sessions
quoted; 3 + 1 control). The guard runs the harness from a data dir containing a space and
asserts the generated settings single-quote both commands, `SessionStart` is delivered and the
status line posts.

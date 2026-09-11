---
id: hooks-not-awaited-on-failure-exit
type: fact
status: active
date: 2026-09-11
summary: On the authentication-failure exit Claude Code does not wait for hook children: StopFailure is at risk and SessionEnd is usually lost.
features: [lifecycle, canary]
tags: [claude-code-format, testing]
files: [internal/session/machine.go, test/canary/canary_test.go]
tests: []
refs: [spikes/FINDINGS.md]
verified: 2.1.246..2.1.267
guard: none
---
Headless `-p` with an unauthenticated `CLAUDE_CONFIG_DIR` fires `SessionStart`,
`UserPromptSubmit`, `StopFailure`, `SessionEnd`. A `cat >>` command hook records all four; the
same hook behind `sleep 0.05` records only the first two; Muster's ~48 ms curl wrapper
delivered `StopFailure` 2/2 runs and `SessionEnd` 0/2. The process exits about 100 ms after
the failure (`duration_ms: 107`) without waiting for hook children. The success path delivers
`SessionEnd` through the same wrapper every time.

Evidence: 2.1.246 canary, 2026-08-29. Not asserted: `TestStopFailureReplacesStop` logs a
missing `SessionEnd` on the unauthenticated runs instead of failing. Ritual-only — an
assertion on a race is a flake generator.

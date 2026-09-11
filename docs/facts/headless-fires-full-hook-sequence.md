---
id: headless-fires-full-hook-sequence
type: fact
status: active
date: 2026-09-11
summary: Headless claude -p fires the full hook sequence, including the command-wrapped SessionStart, so hook probes need no tmux.
features: [canary, ingest]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go]
tests: []
refs: [spikes/FINDINGS.md]
verified: 2.1.233..2.1.267
guard: none
---
Headless `claude -p` fires the full hook sequence, including the command-wrapped
`SessionStart`. Probes and tests that do not need the TUI need no tmux.

Evidence: 2.1.233 spikes; canary runs A–C are headless and their hook sequences are asserted
by `TestHookTransport` and `TestStopFailureReplacesStop`, which is why this carries no guard
of its own.

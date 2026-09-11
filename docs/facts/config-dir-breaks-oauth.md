---
id: config-dir-breaks-oauth
type: fact
status: active
date: 2026-09-11
summary: CLAUDE_CONFIG_DIR isolates settings, hooks and transcripts but breaks subscription OAuth ("Not logged in · Please run /login").
features: [canary, launch]
tags: [claude-code-format, auth, testing]
files: [test/canary/harness_test.go]
tests: []
refs: [spikes/FINDINGS.md]
verified: 2.1.233..2.1.267
guard: none
---
`CLAUDE_CONFIG_DIR` isolates settings, hooks and transcripts but breaks subscription OAuth:
the session reports `Not logged in · Please run /login`. It is not usable for managed sessions;
the canary harness relies on exactly this to run its zero-token unauthenticated sweep (run C).

Evidence: 2.1.233 spikes (FINDINGS §8); every canary run since 2.1.246 depends on it. Not
asserted as such — automatable only in the sense that run C's `authentication_failed` already
proves it each run.

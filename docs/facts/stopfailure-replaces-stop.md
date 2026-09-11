---
id: stopfailure-replaces-stop
type: fact
status: active
date: 2026-09-11
summary: A failed turn emits StopFailure instead of Stop, never both; a successful turn emits Stop only.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/session/machine.go, internal/claudecode/interpret.go]
tests: [TestApplyInput_TurnFailed, TestInterpret_StopFailure]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestStopFailureReplacesStop
---
A turn that fails emits `StopFailure` and no `Stop`; a turn that succeeds emits `Stop` and no
`StopFailure`. The two are alternatives for the same turn end.

Evidence: H2 probe against 2.1.233 verified startup, first-API-call and mid-turn failures
(FINDINGS §3). Every canary run: the headless managed run emits `Stop` only; each of the four
unauthenticated runs (no flag, `plan`, `acceptEdits`, `auto`) emits `UserPromptSubmit` then
`StopFailure` with `error:"authentication_failed"` and never `Stop`.

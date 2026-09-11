---
id: hook-delivery-best-effort
type: fact
status: active
date: 2026-09-11
summary: Hooks are at-most-once with no timestamps or sequence numbers; kill -9 emits nothing and a SIGTERM emits SessionEnd but no Stop-family event.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: [internal/server/ingest.go, internal/session/machine.go]
tests: []
refs: [spikes/FINDINGS.md]
verified: 2.1.233..2.1.267
guard: none
---
Hook delivery is best-effort, at-most-once: no retry, no replay, permanent drop on a dead
receiver, and `PreToolUse` fails open. No hook payload carries a timestamp or sequence number;
`prompt_id` and `tool_use_id` are the only correlation keys. `SessionEnd` does not fire on
`kill -9`. A session SIGTERM'd while retrying a failed API call emits `SessionEnd` but neither
`Stop` nor `StopFailure`, so turn closure by a Stop-family event is not guaranteed. HTTP 500s
are retried with backoff (~4 attempts / 90 s observed) before any Stop-family event; induce
test failures with a non-retryable 400.

Evidence: 2.1.233 spikes (FINDINGS §5c, §5d). Ritual-only — each clause needs a killed or
SIGTERM'd session or an injected server failure.

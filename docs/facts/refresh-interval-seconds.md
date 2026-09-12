---
id: refresh-interval-seconds
type: fact
status: active
date: 2026-09-11
summary: statusLine.refreshInterval is in seconds, not milliseconds, and ticks while idle; without it an idle session posts nothing.
features: [usage, ingest]
tags: [claude-code-format]
files: [internal/claudecode/settings.go]
tests: []
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestRefreshIntervalIsSeconds
---
`statusLine.refreshInterval` is in seconds and ticks while idle. With `refreshInterval: 1000`
(2.1.233) idle gaps of 127 s / 83 s / 58 s produced no posts — `1000` meant about 16.7
minutes. With `refreshInterval: 5` (2.1.245) an interactive session posted every 5.00 s ±
0.02 for a 60 s idle stretch (12 consecutive ticks, 2/2 sessions), interleaved with the
event-driven posts. Without it an idle session emits nothing and usage figures go stale
between turns. The key is accepted and honoured at project scope.

Evidence: 2.1.233 spikes (FINDINGS §5b) and the 2026-08-25 quoting probe (capture-4).
Guarded since 2026-09-12 by `TestRefreshIntervalIsSeconds`, which counts the posts in run D's
~60 s wait for `idle_prompt` (2.1.269: 13 posts, mean gap 4.63 s, widest 5.021 s). The key is
one production never writes, so the canary writes it itself
(kb:adr/canary-refresh-interval-key-canary-only); the test asserts a seconds-scale cadence, not
a gap, since a gap assertion on a shared machine is a flake generator.

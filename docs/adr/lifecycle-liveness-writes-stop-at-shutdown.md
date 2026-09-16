---
id: lifecycle-liveness-writes-stop-at-shutdown
type: decision
status: accepted
date: 2026-09-16
summary: Once Stop has begun, opportunistic liveness writes stop persisting; shutdown's own on-exit policy or the next boot's reconcile decides the final alive state.
features: [lifecycle, surfaces]
tags: [state-machine, tmux]
files: [internal/session/manager.go, cmd/musterd/main.go, internal/server/server.go]
tests: [TestCheckOneLiveness_StoppedGuard_PeriodicPollAndNudgeSkipPersistAfterStop, TestEnd_StillMarksEndedAfterStop]
refs: [plan:general-cleanup, kb:adr/lifecycle-reconcile-converges-with-the-socket, kb:adr/lifecycle-alive-flag-not-a-state, kb:anchor/terminal.ws]
supersedes: []
---
**Context.** Two writers flip `alive` without being asked to: the periodic 5 s liveness poll, and the PTY-EOF nudge, which `internal/server/terminal.go` deliberately runs under `context.WithoutCancel` so it outlives its own connection's teardown. Neither stopped when the daemon began shutting down. A pane dying just before a restart could therefore have `alive=false` persisted by the dying process, so the next boot's reconcile saw a row that was *already* not alive and swept it — deleting the user's resume chance — instead of marking it ended and keeping it.

This was latent until REQ-13 added an unconditional `ShellCount` tmux round trip to `shutdownGracefully`, real synchronous work on the path to process exit, giving the in-flight nudge the runway to land first. Measured by bisect with `make e2e-soak SPEC=reconcile.spec.ts N=10`: 50/50 before this plan, 8/10 failing once the daemon change landed.

**Options.** (A) Give reconcile a recency exception on `endedAt`. (B) Stop opportunistic liveness writes once shutdown has begun.

**Decision.** B. A is a timestamp heuristic inside `classifySessionsByOwnership`, which `kb:adr/lifecycle-reconcile-converges-with-the-socket` rules out by name — classification is by ownership and `alive`, nothing else — and it narrows the race rather than removing it. `Manager.stopped` is set as the first statement of `Stop()`, and `checkOneLiveness` declines to persist when `!endOnCheckError && stopped`. `End` passes `endOnCheckError=true`, so `-on-exit=kill`'s `EndAllSessions → End` chain still marks ended.

**Consequences.** Once shutdown begins, exactly one authority decides a session's final `alive` state: the on-exit policy, else the next boot's reconcile. A pane dying during shutdown is no longer recorded by the dying process; the row stays `alive=true` on disk and reconcile converges it, the branch it exists to handle. The guard is inert while running.

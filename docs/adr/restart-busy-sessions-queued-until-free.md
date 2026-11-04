---
id: restart-busy-sessions-queued-until-free
type: decision
status: accepted
date: 2026-11-04
summary: A confirmed restart runs at once only for a free session (idle with no background tasks, or failed); busy ones queue daemon-side until free.
features: [actions]
tags: []
files: []
tests: []
refs: [plan:restart-latest-claude, kb:adr/lifecycle-background-tasks-count-not-state]
supersedes: []
---
**Context.** Restarting kills the Claude process. A session that is working, planning, waiting on a permission prompt, or idle with background tasks still running would lose that work. Idle is shown while background tasks run (kb:adr/lifecycle-background-tasks-count-not-state), so idle alone is not safe.

**Options.** (A) Skip busy sessions and let the developer click again later. (B) Queue them and restart each when it becomes free. (C) Restart everything after a warning.

**Decision.** B (the developer, 2026-11-04). Free is `idle` with `backgroundTasks == 0`, or `failed`. The pending mark is a session column, fired by the transition to free and, after a daemon start, swept on the daemon's first installed-version result, the reloaded mark held off the wire until then (kb:adr/restart-pending-marks-held-until-installed-known); it is cleared by the restart, death, Remove, or the session no longer being behind. There is no cancel.

**Consequences.** A queued restart can fire minutes later with nobody watching; its failure is logged at warn and leaves the session resumable by hand.

---
id: lifecycle-shutdown-leaves-sessions-running
type: decision
status: accepted
date: 2026-08-27
summary: Sessions survive daemon shutdown by policy; the on-exit flag offers ask, leave and kill, with ask defaulting to leave without a terminal.
features: [lifecycle]
tags: [tmux, user-decision]
files: [cmd/musterd/main.go, internal/session/manager.go]
tests: [TestOnExit_Leave_LiveSessionSurvivesShutdown, TestOnExit_Kill_LiveSessionIsKilledAndRowMarkedDead, TestResolveOnExit_AskWithNonTTYStdinIsLeave, web/e2e/reconcile.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m4-reconcile, kb:anchor/state.liveness]
supersedes: []
---
**Context.** Sessions already outlived the daemon by accident because tmux owns them, but shutdown never looked at tmux, and an orphaned session had once kept burning usage unnoticed. The behaviour needed to be a policy the user could see and script.

**Options.** (A) Kill every session on shutdown. (B) Always leave them. (C) A flag with three values: ask once on a terminal with a short timeout defaulting to no, leave, or kill with a final snapshot and the row marked ended; ask behaves as leave when there is no terminal.

**Decision.** C, settled with Damian in planning.

**Consequences.** A crash or a non-interactive stop never kills work. Restarting the daemon for an update leaves Claude sessions running and re-adopts them. The kill path is the one used by tests and by an explicit operator choice; an invalid flag value is rejected at startup.

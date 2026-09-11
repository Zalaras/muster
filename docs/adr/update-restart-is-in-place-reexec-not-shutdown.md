---
id: update-restart-is-in-place-reexec-not-shutdown
type: decision
status: accepted
date: 2026-09-10
summary: Restart after an update stops listeners and store gracefully, never consults the on-exit policy or kills a session, then execs the new binary in place.
features: [update]
tags: [tmux, state-machine]
files: [cmd/musterd/update.go, internal/server/update.go, web/src/features/update.ts]
tests: [TestReexec_PassesArgvAndEnvVerbatim, TestHandleApplyUpdate_RestartTrueBroadcastsRestartingAndSignalsExactlyOnce, TestHandleRestartImpact_ListsEachShellWithItsSessionTitle, web/e2e/update.spec.ts]
refs: [docs/history/spec-changelog.md, plan:auto-update, kb:anchor/update.apply, kb:anchor/update.restart-impact, kb:adr/lifecycle-shutdown-leaves-sessions-running, kb:adr/lifecycle-reconcile-before-first-snapshot, kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile]
supersedes: []
---
**Context.** Sessions survive a daemon restart by policy and reconcile re-adopts them, so an update restart was possible in principle. But the normal shutdown path consults an on-exit flag that may prompt on a terminal or kill sessions, and a restart that went through it could do either.

**Options.** (A) Shut down normally and rely on the user or a supervisor to start the new binary. (B) A restart path distinct from shutdown: stop the listeners and store gracefully, skip the on-exit policy entirely, never touch a session, and replace the process image in place so the PID, arguments and environment carry over, plus one marker variable that suppresses the browser auto-open.

**Decision.** B. A restart is not a shutdown; the user asked for the same daemon, newer.

**Consequences.** Every Claude session is re-adopted by reconcile on the way back up. Plain-terminal shells do not survive, so the confirm step lists them by session title through a dedicated endpoint before the user commits. The dashboard is told it is restarting exactly once and reconnects through the ordinary banner path.

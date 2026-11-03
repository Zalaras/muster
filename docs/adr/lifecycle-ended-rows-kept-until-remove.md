---
id: lifecycle-ended-rows-kept-until-remove
type: decision
status: accepted
date: 2026-11-03
summary: A daemon start never deletes a session row; every ended row, however it ended, stays a resumable card until the developer removes it.
features: [lifecycle, actions, notes]
tags: [store, tmux, user-decision]
files: [internal/session/reconcile.go, internal/session/manager.go]
tests: [TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded, TestReconcile_ARowEndedBeforeShutdownComesBackEndedAtTheNextStart, TestReconcile_KeepsEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical, web/e2e/reconcile.spec.ts]
refs: [plan:sweep-2026-11-03-1, kb:adr/lifecycle-shutdown-leaves-sessions-running, kb:adr/lifecycle-reconcile-before-first-snapshot]
supersedes: [lifecycle-reconcile-converges-with-the-socket, lifecycle-ended-rows-swept-next-start, notes-ended-row-sweep-takes-its-note]
---
**Context.** kb:adr/lifecycle-reconcile-converges-with-the-socket kept the sweep rule of
kb:adr/lifecycle-ended-rows-swept-next-start: a start deletes a row whose `muster-<id>` is absent
and which was already ended, so "every death gets one resume chance". In use that clears the rail:
after a reboot, sessions come back ended once and the next start (a second `make run`, or an
Update & restart re-exec) deletes them. A row ended by `-on-exit kill` is already ended at exit, so
the first start deletes it and it never comes back (#47). No end cause is persisted.

**Options.** (A) Never delete at a start: keep every ended row until Remove. (B) Persist an end
cause and sweep only rows the developer ended (a migration; `/exit` is indistinguishable from a
crash, kb:fact/sessionend-reason-ambiguous). (C) Sweep ended rows older than N days.

**Decision.** A, chosen by the developer. Ownership classification and repair stay as the
superseded record decided: a row whose `muster-<id>` is on the socket is revived; an absent row
that was alive is marked ended, `endedAt` the start time. An absent row already ended is left
exactly as it is, `endedAt` unchanged. Reconcile deletes no row.

**Consequences.** Ended cards accumulate until removed by hand (bulk Remove through select mode);
automatic clean-up belongs to the Archive backlog item (#39). A session killed by `-on-exit kill`
comes back ended and resumable. A note still lives and dies with its row, as
kb:adr/notes-ended-row-sweep-takes-its-note decided, so it now lasts until Remove. The only unannounced
deletion left is a launch rollback. Unknown `muster-<n>` names and shells are treated as before
(kb:adr/lifecycle-reconcile-before-first-snapshot).

---
id: lifecycle-ended-rows-swept-next-start
type: decision
status: accepted
date: 2026-08-27
summary: On start, rows already ended are deleted and live rows whose pane is gone are marked ended and kept, so every death gets one resume chance.
features: [lifecycle, actions]
tags: [store, tmux, user-decision]
files: [internal/session/manager.go, internal/store/session.go]
tests: [TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical, web/e2e/reconcile.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m4-reconcile, kb:anchor/state.liveness, kb:anchor/sessions.resume]
supersedes: []
---
**Context.** A dead session's card previously stayed forever with no way to end, remove or resume it. Keeping every dead row makes the rail fill with history; deleting every dead row on start loses the chance to resume a session that died while the daemon was down.

**Options.** (A) Keep all rows until removed by hand. (B) Delete all dead rows at start. (C) Delete rows that were already ended in an earlier daemon lifetime, and mark as ended, with the startup time, rows that were alive but whose pane is now gone; the following start sweeps those.

**Decision.** C, settled with Damian in planning: a fresh start keeps the UI clean, and the user had their resume chance in the previous lifetime.

**Consequences.** The recorded end time of a session that died while the daemon was down is the startup time, because the true time is unknown. Ended sessions sort to the bottom of the rail and leave only on Remove or the next start. Event rows are kept when a session row is deleted.

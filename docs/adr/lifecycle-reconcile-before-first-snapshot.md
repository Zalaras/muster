---
id: lifecycle-reconcile-before-first-snapshot
type: decision
status: accepted
date: 2026-08-27
summary: Reconcile on start runs synchronously before the first snapshot is served; unknown Muster-shaped tmux sessions are logged and never adopted.
features: [lifecycle]
tags: [tmux, state-machine]
files: [internal/session/manager.go, internal/server/server.go]
tests: [TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows, web/e2e/reconcile.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m4-reconcile, kb:anchor/state.liveness, kb:adr/lifecycle-liveness-from-pane-existence]
supersedes: []
---
**Context.** Before this, the first snapshot after a restart could carry a stale alive flag for up to one liveness poll, and sessions on Muster's socket with no row were invisible.

**Options.** (A) Serve immediately and let the poll correct the picture. (B) Walk every loaded row against tmux before the state socket or the snapshot endpoint can answer, and report unknown sessions of Muster's naming shape at warn level without creating rows for them.

**Decision.** B. Alive is set from pane existence only, and review removed the one code path that had set it from a hook payload.

**Consequences.** Startup takes as long as one tmux listing. The first snapshot a client sees is already true. Adoption of an unknown session is never automatic; the user sees a log line and decides. Shell sessions of Muster's shape are killed at this point rather than reported.

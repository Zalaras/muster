---
id: lifecycle-liveness-from-pane-existence
type: decision
status: accepted
date: 2026-08-16
summary: Whether a session is alive is decided by tmux pane existence alone; SessionEnd is a hint and never sets or clears alive.
features: [lifecycle]
tags: [tmux, state-machine]
files: [internal/session/manager.go, internal/tmux/tmux.go]
tests: [TestCheckLiveness_FlipsAliveFalseOnMissingPaneAndBroadcasts, TestPaneExists_TrueForALiveWindowFalseAfterKill]
refs: [docs/history/spec-changelog.md, kb:fact/sessionend-reason-ambiguous, kb:fact/hook-delivery-best-effort, kb:anchor/state.liveness]
supersedes: []
---
**Context.** A killed process emits nothing, a terminated one emits an end event whose reason does not distinguish a crash from a clean exit, and delivery is best-effort. Reconcile after a daemon restart needed an authority that does not depend on having seen the last event.

**Options.** (A) Treat SessionEnd as the end of life and infer everything else. (B) Poll tmux for the pane and treat hook events as enrichment only.

**Decision.** B. The pane is checked on a periodic tick and on demand, and the alive flag is set only from that check.

**Consequences.** A pane that dies while the daemon is down is discovered at the next start. A reordered or lost end event costs nothing. Any code path that would set alive from a payload is a boundary violation and has been removed once already under review.

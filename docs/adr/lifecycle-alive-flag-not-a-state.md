---
id: lifecycle-alive-flag-not-a-state
type: decision
status: accepted
date: 2026-08-20
summary: Liveness is an orthogonal alive flag, not a seventh state; a resumed session re-enters idle and a clear resets gauges but not identity.
features: [lifecycle]
tags: [state-machine]
files: [internal/session/session.go, internal/server/sessionwire.go]
tests: [TestToWireSession_EndedAtFormatsAsRFC3339WhenSet, TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared, web/e2e/reconcile.spec.ts]
refs: [docs/history/spec-changelog.md, kb:anchor/state.displayed, kb:anchor/state.liveness, kb:adr/lifecycle-liveness-from-pane-existence]
supersedes: []
---
**Context.** The six displayed states describe what the conversation is doing. A session whose pane has died still has a last state worth showing, and modelling death as a state would force every transition table to handle entering and leaving it.

**Options.** (A) Add a Dead or Ended state. (B) Keep the six states and carry liveness as a separate boolean with an ended-at time, set only from pane existence.

**Decision.** B. A dead session keeps its last state dimmed under the ended marker; a resume lands it in idle; a clear rebinds to the new Claude id and resets the context gauge and compaction counter but leaves the row, title and history alone.

**Consequences.** Sorting and rendering treat alive as a first partition and state as the second. No transition ever writes alive, and no liveness check ever writes state. The wire object carries both, and an ended-at value is present exactly when alive is false.

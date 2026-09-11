---
id: ingest-monotonic-rebind
type: decision
status: accepted
date: 2026-08-27
summary: An enveloped event never rebinds a session backwards onto a Claude session_id it has already left; reordered stragglers apply without rebinding.
features: [ingest, lifecycle]
tags: [envelope, state-machine, user-decision]
files: [internal/session/manager.go]
tests: [TestApply_MonotonicRebindGuard_ReorderedStragglerNeverRebindsBackwards, TestApply_EnvelopedSameBoundIDNeverRebindsEvenForClearDeathHint]
refs: [docs/history/spec-changelog.md, plan:m4-hook-lifetime, plans/m4-hook-lifetime/decisions/monotonic-rebind/decision.md, kb:fact/clear-mints-new-session-id, kb:anchor/ingest.envelope, kb:anchor/state.transitions]
supersedes: []
---
**Context.** Delivery is unordered. Once every event carried the envelope, a clear's own end event for the old Claude id could arrive after the start event for the new one; the manager read it as a forward clear, rebound to the old id and reset a working session's context and compaction count.

**Options.** (A) Accept the window as a residual of unordered delivery. (B) Never rebind backwards: when the incoming id is one this session has already left, which the Claude-id map still records, route and apply the event without rebinding or resetting.

**Decision.** B, Damian's decision from the review's critical finding; not debated, because it touches the protocol contract.

**Consequences.** A genuinely re-used id after a clear is impossible by construction, so nothing is lost. The remaining residual is a lost resume start event, which leaves the binding on the newer id until the next bind while events still route. The guard costs a few lines and one protocol sentence.

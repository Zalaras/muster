# Decision brief: compact-sessionstart-left-id

**Question**: When a `SessionStart{source:"compact"}` carries a `session_id` this session has already left (reordered after a `/clear`), should it clear-rebind backwards (REQ-9 literal) or be applied as a monotonic straggler with no rebind?
**Source**: plans/state-issues/review.md, cycle 1: correctness Decisions item 1 `[orchestrator:user-decision]`, and maintainability Major 1 `[daemon-impl]`. The developer is asleep and directed that this be settled by debate, not by asking them.
**Option A**: Keep it (REQ-9 as written). No code change; the protocol's previous-id row gains an "except a `SessionStart`" qualifier.
**Option B**: Monotonic for compaction ends. `applyCompactionEnded` does nothing on an already-left id: it routes and applies with no rebind, as the straggler row says. This needs `byClaude` (the Manager's map) consulted, e.g. by not treating `KindCompactionEnded` as a binder for a left id. A few lines plus a REQ-9 and protocol-row qualifier; the ADR then holds without exception for this kind.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/state-issues/review.md: correctness § Decisions item 1 (quoted below) and maintainability Major 1 and Note 2
- plans/state-issues/plan.md: REQ-8, REQ-9, REQ-10, Edge Cases 3, 12 and 14, INV-C (amended)
- docs/adr/ingest-monotonic-rebind.md (accepted), docs/adr/ingest-envelope-authoritative-binding.md
- docs/protocol.md § kb:anchor/state.transitions: the `SessionStart` rows and the "previous id … reordered straggler" row
- docs/facts/compact-hook-sequence.md, docs/facts/hook-delivery-best-effort.md, docs/facts/clear-mints-new-session-id.md
- internal/session/apply.go (Apply's envelope branch, isBindKind), internal/session/machine.go (applyCompactionEnded, applyBind, bindIdentity)
- docs/conventions.md § Design ("One owner per concept")
- plans/state-issues/daemon-tests.md (the observation about a compact SessionStart with an old id)

## The issue, verbatim
Correctness Decision 1: A compact `SessionStart` whose `session_id` this session has already left now rebinds **backwards**. `applyCompactionEnded` sends any id that differs from the bound one to `applyBind` as a clear-rebind. That resets context, compactions, `lastActivity` and `backgroundTasks` and lands `started`. It also skips `Apply`'s monotonic guard, because `isBindKind` now includes `KindCompactionEnded`. This follows REQ-9 to the letter, but is in tension with accepted `kb:adr/ingest-monotonic-rebind` ("An enveloped event never rebinds a session backwards") and with the protocol's previous-id straggler row; the two rows now contradict each other for this input.

Maintainability Major 1: a second home for the rebind decision, without the original's monotonic guard. A fix must make the forward-rebind-or-straggler decision in one place for every enveloped kind, including the compact SessionStart, and a compact SessionStart naming an id this session already left must not rebind backwards. Otherwise Decisions must state, with a source, why compact is exempt, and that exemption must be visible at the one place the decision lives.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).

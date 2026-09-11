---
id: lifecycle-prompt-ordering-guards
type: decision
status: accepted
date: 2026-08-20
summary: Events apply in seq order; Stop-family events close their prompt_id, a closed prompt never reopens, and an unseen prompt_id starts a turn.
features: [lifecycle]
tags: [state-machine, envelope]
files: [internal/session/machine.go]
tests: [TestClosePrompt_IdempotentForAnAlreadyClosedID, TestApplyInput_TurnClosed, TestApplyInput_NeedsInputIdle_FromFailedViaUnseenFreshPromptClearsFailure]
refs: [docs/history/spec-changelog.md, kb:anchor/state.ordering, kb:fact/hook-delivery-best-effort, kb:adr/ingest-seq-assigned-at-ingest]
supersedes: []
---
**Context.** Delivery is unordered and lossy. Without guards, a late tool event after a turn's Stop would flip an idle session back to working, and a lost prompt-submit would leave a working session shown as idle for the whole turn.

**Options.** (A) Apply events as they arrive and accept flicker and stuck states. (B) A small set of ordering guards keyed on the prompt id: apply in ingest sequence, let a Stop or StopFailure close its prompt, ignore activity on a closed prompt, and treat activity on a never-seen prompt as the start of a turn.

**Decision.** B.

**Consequences.** The set of closed prompt ids is a bounded ring, so memory does not grow with session age. A subagent's late activity on a closed prompt is recognised and marked rather than reopening the turn. The guards are the reason the state machine can be tested with synthesized, deliberately reordered posts.

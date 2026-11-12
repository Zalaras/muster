---
id: lifecycle-awaited-main-event-reopens-closed-prompt
type: decision
status: accepted
date: 2026-11-12
summary: A main-agent tool start or permission request on a closed prompt reopens it as the current turn; other unmarked events on it stay stragglers.
features: [lifecycle, ingest]
tags: [state-machine, envelope]
files: [internal/session/machine.go, internal/session/session.go, internal/session/interrupt.go, internal/claudecode/interpret.go, internal/claudecode/interpret_transcript.go]
tests: [TestClosePrompt_IdempotentForAnAlreadyClosedID, TestApplyInput_TurnClosed, TestApplyInput_IdleNotice_FromFailedViaUnseenFreshPromptKeepsFailure, TestApplyInput_TeammateReinvocationOnClosedPrompt, TestApplyInput_TeammateReinvocationAskUserQuestionReadsNeedsInput, TestApplyInput_CrossStateInvariants, TestInterpret_ReopensClosedPromptFlag, TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt, TestPromptInterruptedAt]
refs: [plan:sweep-2026-11-12-1, kb:fact/teammate-reinvocation-reuses-closed-prompt-id, kb:fact/hook-await-per-event, kb:adr/lifecycle-attention-owned-by-raising-agent, kb:anchor/state.ordering, "#122", "#123"]
supersedes: [lifecycle-prompt-ordering-guards]
---
**Context.** The ordering guards also said a closed prompt never reopens. But when a teammate
finishes, Claude Code re-invokes the main agent with no UserPromptSubmit, under the prompt id its
own Stop closed (kb:fact/teammate-reinvocation-reuses-closed-prompt-id). That turn's main-agent
events were all dropped, so the card read idle while the agent worked (#122), or working while it
waited on an AskUserQuestion (#123).

**Options.** (A) Keep "never reopens". (B) Reopen on any unmarked event — but a PostToolUse is not
awaited and really does straggle. (C) Reopen only on the main-agent events that start work,
PreToolUse and PermissionRequest.

**Decision.** C. The interpreter flags a PreToolUse or PermissionRequest without `agent_id`
(`ReopensClosedPrompt`); on a closed prompt it leaves the closed ring, becomes the current turn and
transitions as on an open prompt. Other unmarked events on a closed prompt change nothing. Basis:
PreToolUse is awaited (kb:fact/hook-await-per-event) and returns only after ingest enqueues it,
and a PermissionRequest follows its tool's PreToolUse, so both are sequenced before their turn's
Stop. The other guards stand.

**Consequences.**
- Any closer can be reopened: Stop, StopFailure, idle_prompt, transcript interrupt, compaction end.
  An interrupt the sweep already acted on never closes the reopened prompt again.
- A reopening main PreToolUse while a subagent owns a permission wait keeps `needs_input` with the
  subagent as owner (kb:adr/lifecycle-attention-owned-by-raising-agent).
- Accepted, not guarded: if curl's 2 s `--max-time` fires, a late PreToolUse can reopen a finished
  turn, which reads working until the next Stop or idle_prompt.

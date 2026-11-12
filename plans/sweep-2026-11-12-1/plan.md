# Plan: sweep-2026-11-12-1

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Render fixtures**: none
**Features**: lifecycle, ingest
**Touches**: connection, past-sessions
**Description**: A main-agent PreToolUse or PermissionRequest on a closed prompt (a teammate re-invocation) reopens that prompt as the current turn, so the card reads working / needs_input instead of idle / working; a `<agent-message` prompt is never a last prompt.

## Symptom

### e1 — IDLE while WORKING

> - [ ] **IDLE while WORKING** ([#122](https://github.com/Zalaras/muster/issues/122)) — A session
>   shows as idle on the dashboard while the main session is still working through a turn, possibly
>   after switching to the docs tab. Expected: A session that is actively working in a turn should
>   show a working state rather than idle.
>   Filed 2026-11-10 from musterd 0.29.1 / Claude Code 2.1.322, focus view, session idle.
>   Labels: bug, lifecycle.

### e2 — Says Working but is actually Needs Input

> - [ ] **Says Working but is actually Needs Input** ([#123](https://github.com/Zalaras/muster/issues/123)) — A
>   session is shown as Working in the dashboard while it is actually waiting for the user, which is
>   the Needs Input state. Expected: A session that is waiting on the user should be shown as Needs
>   Input rather than Working.
>   Filed 2026-11-10 from musterd 0.29.1 / Claude Code 2.1.322, focus view, session working; 1 image attached.
>   Labels: bug, lifecycle.

## Findings

Both entries share one root cause, kb:fact/teammate-reinvocation-reuses-closed-prompt-id: when a
teammate finishes, Claude Code 2.1.322 re-invokes the main agent with no UserPromptSubmit, under
the `prompt_id` its own Stop already closed.

- **Reproduced (e1)**: a scratch replay through the real `claudecode.Interpret` → `applyInput`
  (UPS, PreToolUse(Agent), PostToolUse, Stop, agent-marked SubagentStart/SubagentStop/TeammateIdle,
  then main PreToolUse(Read) on the closed id) gave `state = idle, want working`; the later main
  PermissionRequest(AskUserQuestion) gave `state = idle, want needs_input`.
- **Reproduced (e2)**: the same replay with a teammate `t1` sending agent-marked hooks gave
  `state=working` after the main PermissionRequest(AskUserQuestion) — should be `needs_input`. A
  replay that took p1 out of `closedPromptIDs` before the main PreToolUse/PermissionRequest read
  `needs_input`, held it through t1's marked hooks (INV-B, `permissionWaitOwnedByOther`), went
  `working` on the answer's PostToolUse and `idle` on the final Stop with p1 closed again.
- **Cause**: `internal/session/machine.go:33-36` (KindTurnActivity) and `machine.go:67-68`
  (KindNeedsInputPermission) return early for every unmarked event on a closed prompt
  (kb:adr/lifecycle-prompt-ordering-guards, "a closed prompt never reopens").
  `internal/claudecode/interpret.go:142-148` maps PreToolUse, PostToolUse and PostToolBatch to one
  identical `StateInput`, so the machine cannot tell an awaited PreToolUse from a straggling
  PostToolUse. Marked teammate hooks on the closed id pass the guard and set `working` (e2).
- **What does not hold**: setting `currentPromptID` alone is not enough — the id must leave the
  `closedPromptIDs` ring, otherwise the answer's PostToolUse stays inert and the second Stop's
  `closePrompt` returns early and leaves `currentPromptID` set.
- **Developer's decision (research ## Answers)**: a main-agent (no agent_id) PreToolUse or
  PermissionRequest on a closed prompt reopens that prompt as the current turn. Every other
  main-agent event on a closed prompt stays inert (PostToolUse, PostToolBatch, Notification
  included). Basis: PreToolUse and PermissionRequest are awaited (kb:fact/hook-await-per-event).
  Write a superseding ADR for the "never reopens" part of kb:adr/lifecycle-prompt-ordering-guards,
  recording the accepted edge case (curl's 2 s `--max-time` fires → a late PreToolUse can reopen a
  finished turn and read working until the next Stop or idle_prompt; not guarded). Stop answers:
  any closer is reopenable (Stop, StopFailure, idle_prompt, transcript interrupt, compaction end);
  doc-reconcile may rewrite the protocol/spec prose (no wire change); the ADR states that a main
  PreToolUse reopening a closed prompt while a subagent owns a permission wait keeps needs_input.
  Same batch: a UserPromptSubmit whose prompt begins `<agent-message` is never a last prompt, as
  `<task-notification>` already is.

## Requirements

### Must Have
- **REQ-1**: After a closed prompt's id is re-used by a main-agent (no agent_id) PreToolUse, the
  session reads `working`, the id is the current prompt and no longer closed; a later Stop lands
  `idle` with no current prompt and the id closed again. (e1)
- **REQ-2**: A main-agent PermissionRequest on a closed prompt reopens it and the session reads
  `needs_input` with `AttentionAgent == ""`; agent-marked teammate hooks arriving afterwards keep
  it `needs_input`; the main answer's PostToolUse lands `working`. (e2)
- **REQ-3**: A main-agent PostToolUse, PostToolBatch, Notification or UserPromptSubmit-free
  activity without the reopen flag on a closed prompt still changes nothing (state, current
  prompt, closed ring). (e1, e2)
- **REQ-4**: A UserPromptSubmit whose prompt begins `<agent-message` yields `StateInput.Prompt ==
  nil`, so it never becomes `LastPrompt`. (e1)
- **REQ-5**: `claudecode.StateInput` gains a neutral `ReopensClosedPrompt bool`, true exactly for a
  PreToolUse or PermissionRequest without agent_id; false for PostToolUse, PostToolBatch, marked
  events and every other event. No Claude Code vocabulary enters `internal/session`. (e1, e2)
- **REQ-6**: A prompt the interrupt sweep closed, then reopened by a main-agent PreToolUse, is not
  closed again by the sweep on the interrupt it already acted on; a later new interrupt of that
  prompt still lands idle. (e1 — review cycle 1 decision item, settled by the developer's stop
  answer 1: "any closer (…transcript interrupt…)" → "Agreed")

## Affected Files
### Daemon (daemon-impl)
- `internal/claudecode/interpret.go` — REQ-4, REQ-5: the `ReopensClosedPrompt` field and its doc
  comment; set it for unmarked PreToolUse and PermissionRequest (split PreToolUse out of the shared
  case); an `<agent-message` prefix constant beside `backgroundCompletionTag`, skipped the same way.
- `internal/session/session.go` — REQ-1, REQ-2: `reopenPrompt(id)` beside `promptClosed`/`closePrompt`,
  removing the id from `closedPromptIDs`.
- `internal/session/machine.go` — REQ-1..3: both guards become
  `closed && !input.FromSubagent && !input.ReopensClosedPrompt`; with the flag set, reopen the id and
  adopt it as current, then fall through to the normal transition (the permission-wait-owned-by-other
  check still applies after adoption). Narrow the "never reopened" comments and the `applyInput`
  doc comment's ADR reference to the new ADR.
- `internal/session/CLAUDE.md` — the "stragglers past a Stop persist without transitioning"
  invariant gains the reopen qualifier and names the new ADR.
### Docs (orchestrator, step 4)
- `docs/adr/lifecycle-awaited-main-event-reopens-closed-prompt.md` (new, `status: proposed`,
  `supersedes: [lifecycle-prompt-ordering-guards]`, `refs: [plan:sweep-2026-11-12-1]`) and
  `docs/adr/lifecycle-prompt-ordering-guards.md` frontmatter `status: superseded` (body untouched).
- `docs/facts/teammate-reinvocation-reuses-closed-prompt-id.md` — `tests:` and `guard:` name the
  Proof tests.
### Existing tests this breaks
- none (tests that build a bare `StateInput{Kind: KindTurnActivity}` / `KindNeedsInputPermission`
  on a closed prompt carry no flag and stay inert; their INV-P comments are narrowed by daemon-tests).

## Proof

Written by **daemon-tests**, red first:

1. `internal/session/machine_turnstate_test.go`, `TestApplyInput_TeammateReinvocationOnClosedPrompt`
   (e1): replays through `claudecode.Interpret` → `applyInput` UPS, main PreToolUse(Agent),
   PostToolUse, Stop, agent-marked SubagentStart/SubagentStop/TeammateIdle, main PreToolUse(Read)
   on the closed id, PostToolUse, PostToolBatch, Stop, main PreToolUse(AskUserQuestion),
   PermissionRequest. Asserts `StateWorking` after the reopening PreToolUse (red today: `idle`),
   `idle` + empty `currentPromptID` + `promptClosed` after the second Stop, `StateNeedsInput` after
   the PermissionRequest (red today: `idle`).
2. `internal/session/machine_turnstate_test.go`,
   `TestApplyInput_TeammateReinvocationAskUserQuestionReadsNeedsInput` (e2): UPS, main
   PreToolUse(Agent), marked t1 PreToolUse, main Stop, marked t1 PreToolUse, main
   PreToolUse(AskUserQuestion), main PermissionRequest, marked t1 PreToolUse/PostToolUse/PostToolBatch,
   Notification(permission_prompt), main PostToolUse(AskUserQuestion), main Stop. Asserts
   `StateNeedsInput` after the PermissionRequest (red today: `working`), still `needs_input` with
   `AttentionAgent == ""` through every later t1 hook, `working` after the answer's PostToolUse,
   final `idle` with empty `currentPromptID` and p1 closed.
3. `internal/session/machine_test.go`, `TestApplyInput_CrossStateInvariants`: new rows — from
   every source state, a closed prompt with an unmarked `ReopensClosedPrompt` activity/permission
   reopens (state working/needs_input, id current and not closed, except needs_input held by
   another agent's wait stays needs_input); unflagged rows stay inert (REQ-3). Red today: does not
   compile until the field exists — it is the field's red.
4. `internal/claudecode/interpret_rail_test.go`, `TestInterpret_UserPromptSubmit_Prompt`: a case
   with prompt `<agent-message from="alice">…` gives `Prompt == nil` (red today: non-nil), and
   `TestInterpret_ReopensClosedPromptFlag`: true for unmarked PreToolUse and PermissionRequest,
   false for PostToolUse, PostToolBatch, marked PreToolUse/PermissionRequest, UserPromptSubmit.
5. Review cycle 1 wave, written by **daemon-tests**: `internal/session/interrupt_test.go`,
   `TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt` — open turn p1, the sweep's
   checker reports p1 interrupted → idle; a main PreToolUse with `ReopensClosedPrompt` on p1 →
   working; the next sweep ticks with the same transcript still holding the old interrupt line →
   stays working; a new interrupt of p1 appended → idle. (REQ-6)

## Edge Cases
1. Main PreToolUse reopens a closed prompt while a subagent owns a permission wait → id adopted,
   state stays needs_input with the subagent's AttentionAgent → D3.
2. Reopen after a non-Stop closer (StopFailure, idle_prompt, interrupt, compaction end) → reopens
   like Stop, failed → working clears Failure → D3 (shared with edge case 1).
3. Late PreToolUse past curl's timeout reopens a finished turn → untested: accepted in the ADR, no
   guard by decision.

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestApplyInput_TeammateReinvocationOnClosedPrompt' ./internal/session/
D2 go test -count=1 -run 'TestApplyInput_TeammateReinvocationAskUserQuestionReadsNeedsInput' ./internal/session/
D3 go test -count=1 -run 'TestApplyInput_CrossStateInvariants' ./internal/session/
D4 go test -count=1 -run 'TestInterpret_UserPromptSubmit_Prompt|TestInterpret_ReopensClosedPromptFlag' ./internal/claudecode/
D5 go test -count=1 ./internal/session/ ./internal/claudecode/
D6 make lint
D7 go test -count=1 -run 'TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt' ./internal/session/ ./internal/claudecode/
```
### Reviewer-Verified
- No Claude Code event name or payload key appears in `internal/session` (the flag is neutral).
- The new ADR states the decision, its awaited-hook basis, the curl-timeout edge case, any-closer
  reopen, and the subagent-owned-wait case; the old ADR's body is unedited.

## Doc Delta
**lifecycle** — becomes true: a main-agent tool start (PreToolUse) or permission request on a
closed prompt reopens it as the current turn; every other unmarked event on a closed prompt (tool
end, batch end, notification, idle notice) is a straggler that changes nothing. A prompt reopened
after a transcript interrupt is closed again only by a new interrupt, never by the one that
already closed it. In `docs/protocol.md` the
`kb:anchor/state.transitions` rows for closed-prompt turn activity and PermissionRequest, and
`kb:anchor/state.ordering` rule 2, say so; `docs/features/lifecycle/spec.md` § Ordering and loss
says so. Stops being true: "later-arriving unmarked events for a closed prompt never reopen a turn".
**ingest** — becomes true: a prompt beginning `<agent-message` is, like `<task-notification>`,
never a last prompt (the `lastPrompt` clause in the transitions table). No wire shape change, no
protocol version bump.

## Out of scope
Nothing.

## Cycle 1 wave — interrupt checker seam (orchestrator ruling)

The REQ-6 fix cannot be made behind `session.InterruptChecker func(path, promptID string) (bool, error)`
(daemon-impl, blocked, log `## Handoff`). Approved internal seam change (no daemon↔UI protocol change):
- `claudecode.PromptInterruptedAt(path, promptID string) (int64, error)` returns the absolute file
  offset just past the last interrupt line for `promptID` in the scanned tail, `0` when there is none.
  `PromptInterrupted` stays (`at > 0`) for its existing callers.
- `session.InterruptChecker` becomes `func(path, promptID string) (int64, error)`; the server config and
  `cmd/musterd/main.go` wire `claudecode.PromptInterruptedAt`.
- The sweep closes a prompt only when the offset is greater than the one it last acted on for that
  session and prompt id.
daemon-tests moves the test doubles and wiring to this signature first; daemon-impl then implements.

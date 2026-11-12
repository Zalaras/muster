# Correctness review: sweep-2026-11-12-1

**Plan**: sweep-2026-11-12-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 36952 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `machine.go` KindTurnActivity guard is now `closed && !FromSubagent && !ReopensClosedPrompt`; with the flag set, `reopenPrompt` takes the id out of the ring and makes it current (`session.go:306`), then the normal transition runs | D1 (replay through the real `Interpret`): working after the reopening PreToolUse, then idle with empty `currentPromptID` and p1 closed after the second Stop; D3 reopen rows | pass |
| REQ-2 | Yes. KindNeedsInputPermission arm reopens before it transitions; `AttentionAgent := input.Agent` (`""`) | D2: needs_input after the main PermissionRequest, held through t1 Pre/Post/Batch and permission_prompt with `AttentionAgent == ""`, working after the answer's PostToolUse, final idle with p1 closed; D3 `permission_request` rows | pass |
| REQ-3 | Yes. An unflagged, unmarked event still returns early in both arms | D3 `unflagged_activity` / `unflagged_permission` rows from every source state; the existing INV-G rows; D4 shows PostToolUse/PostToolBatch/Notification/UPS carry no flag | pass |
| REQ-4 | Yes. `teammateMessageTag = "<agent-message"` is skipped beside `backgroundCompletionTag` (`interpret.go:142`) | D4 `a prompt beginning <agent-message yields nil` | pass |
| REQ-5 | Yes. `StateInput.ReopensClosedPrompt` is set in `interpretToolEvent` as `AgentID == nil && event ∉ {PostToolUse, PostToolBatch}` over {Pre, Post, Batch, PermissionRequest}. Every other event leaves it at the zero value. `internal/session` reads only the field | D4 `TestInterpret_ReopensClosedPromptFlag`, 9 rows | pass |
| Edge 1 | Yes. `permissionWaitOwnedByOther` runs after adoption | D3 `reopen/needs_input_subagent_wait/tool_start`: p1 current, needs_input, `agent-a` keeps the wait | pass |
| Edge 2 | Partly. The reopen works after every closer, but a prompt closed by a transcript interrupt is closed again by the next sweep tick (see Decision 1) | D3 seeds the ring directly, so no closer is exercised | see Decision 1 |
| DIAG | `kb:diagram/daemon-components` (all 3 production files): the package imports did not change, only the stdlib `slices` was added. Lifecycle spec inline stateDiagram: `idle/failed/needs_input --> active : turn_activity` and `--> needs_input : needs_input_permission` already cover the reopen edges | — | pass |

## Build & Tests

E2E tests: pass (49, scoped to 5 files: ingest-envelope, ingest, reconcile, state-transitions, subagent-status) · Daemon tests (race): pass (6 packages: cmd/musterd, claudecode, claudecodetest, server, session, tools/versions) · Web tests: pass (3190) · Render tests: pass (463) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web-lint clean). All read from $GATES_LOG_DIR (summary: 27 lines, 0 failed, 2 warn-only).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestApplyInput_TeammateReinvocationOnClosedPrompt' ./internal/session/` | pass |
| D2 | `go test -count=1 -run 'TestApplyInput_TeammateReinvocationAskUserQuestionReadsNeedsInput' ./internal/session/` | pass |
| D3 | `go test -count=1 -run 'TestApplyInput_CrossStateInvariants' ./internal/session/` | pass |
| D4 | `go test -count=1 -run 'TestInterpret_UserPromptSubmit_Prompt\|TestInterpret_ReopensClosedPromptFlag' ./internal/claudecode/` | pass |
| D5 | `go test -count=1 ./internal/session/ ./internal/claudecode/` | pass |
| D6 | `make lint` | pass (deduped to the gates' lint line) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The new ADR is `proposed`, `refs: plan:sweep-2026-11-12-1`, `supersedes: [lifecycle-prompt-ordering-guards]`; the old ADR is flipped to `superseded` with its body untouched; the fact's `tests:`/`guard:` name the Proof tests; no `deviation:`/`doc-delta:` lines in the logs; the #122/#123 TODO ticks are left to the sweep loop. The Doc Delta's lifecycle wording is inaccurate (Major 1, `[orchestrator]`) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No Claude Code event name or payload key appears in `internal/session` (the flag is neutral) | pass | `rg 'PreToolUse\|PermissionRequest\|PostToolUse\|PostToolBatch\|agent_id\|hook_event_name\|agent-message\|prompt_id' internal/session --glob '!*_test.go'` matches only comments that were already there (machine.go:78, :90). The new code reads only `input.ReopensClosedPrompt` / `input.FromSubagent`. The new replay tests feed event names through `claudecode.Interpret`, which `manager_cardstate_test.go` and `machine_turnstate_test.go:118` already did on main |
| RV2 | The new ADR states the decision, its awaited-hook basis, the curl-timeout edge case, any-closer reopen, and the subagent-owned-wait case; the old ADR's body is unedited | pass (all five present; `git diff main -- docs/adr/lifecycle-prompt-ordering-guards.md` is the status line only) | The basis it states partly contradicts kb:fact/hook-await-per-event (Major 1). The "any closer" consequence does not hold for the interrupt closer (Decision 1) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The flag and the `<agent-message` tag live in `internal/claudecode`; `internal/session` sees a neutral bool |
| 2 | No terminal-output state parsing | pass. Untouched |
| 3 | Non-blocking hook handler | pass. Untouched |
| 4 | tmux via `-L muster` / sizing | pass. Untouched |
| 5 | No payload logging | pass. No new logging |
| 6 | Empty-gauge honesty | pass. Not touched |
| 7 | Identity on tmux target | pass. Untouched |
| 8 | No settings trespass | pass |
| 9 | No real `claude` in tests | pass. All replays are synthetic `claudecodetest` payloads |

## Issues

### Critical
None.

### Major
1. **[orchestrator]** The new ADR and the plan's `## Doc Delta` describe the reopen split as awaited vs unawaited, and kb:fact/hook-await-per-event contradicts that. The Doc Delta is promoted verbatim into `docs/protocol.md` (`kb:anchor/state.ordering`).
   - `docs/adr/lifecycle-awaited-main-event-reopens-closed-prompt.md` Options (B) says "PostToolUse and PostToolBatch are not awaited". The fact lists `PostToolBatch` as awaited ("the next API request leaves 67 ms after the delayed hook exits").
   - The ADR's Decision says "Basis: those two hooks are awaited". The fact does not list `PermissionRequest` as awaited: it "runs alongside the terminal prompt" (kb:fact/permission-request-races-terminal-prompt).
   - The Doc Delta says "only unawaited unmarked events (tool end, batch end, notification) are stragglers". Batch end is awaited, and the "only" is false: an unmarked `UserPromptSubmit` (awaited) and `idle_prompt` on a closed prompt also stay inert.

   What shipped is right: Pre/PermissionRequest reopen, everything else is inert. A fix must reword the ADR's Options/Decision and the Doc Delta line so they name the two reopening events and the inert rest without calling them awaited/unawaited. Alternatively they can state the real basis: PreToolUse is awaited, and a PermissionRequest holds its tool until decided. They must not claim PostToolBatch is unawaited.
   id: docs/adr/lifecycle-awaited-main-event-reopens-closed-prompt.md:Options+Decision:awaited-basis | confidence: 90

### Minor
None.

### Decisions
1. **[orchestrator:decision]** A prompt closed by a transcript interrupt reopens, but the next liveness-sweep tick closes it again. The ADR's consequence "Any closer can be reopened: … transcript interrupt" and plan Edge Case 2 therefore do not hold for that closer.
   - `sweepInterrupts` (`internal/session/interrupt.go:30-36`) targets any alive session in an open turn with a non-empty `currentPromptID`.
   - `claudecode.PromptInterrupted` → `scanInterrupt` (`interpret_transcript.go:22-52`) returns true for *any* interrupt line for that prompt id in the last 64 KiB of the transcript.
   - After `reopenPrompt(p1)` the session is working with `currentPromptID == p1`. The old interrupt line for p1 is still in the tail, so the next tick applies `KindTurnInterrupted` and the card goes back to idle while the main agent works: the #122 symptom on this path. Each later main PreToolUse reopens it again, so the card flickers.
   - D3 seeds `closedPromptIDs` directly and never runs the sweep. Nobody has measured whether Claude Code re-invokes the main agent under an interrupted prompt id: the fact only covers a re-invocation after a `Stop`.

   The two options:
   - **Option A — accept and document**: reword the ADR consequence to say an interrupt-closed prompt is not durably reopenable (it reads idle again within one sweep tick), and file the unmeasured case. No code change. Cost: a known gap on an unmeasured path.
   - **Option B — guard the sweep**: the sweep ignores an interrupt line already honoured for a reopened id, for example by remembering the ids reopened since their interrupt, or by honouring only interrupt lines written after the reopen. Cost: new state in `Session` or a transcript-offset comparison, a new test, and a design for a path no probe has shown occurs.

   id: internal/session/interrupt.go:sweepInterrupts:re-closes-reopened-interrupted-prompt | confidence: 70

### Notes
1. **[note]** In the accepted curl-timeout edge, a late main PreToolUse on closed p1 can reopen it while a newer p2 is current. `currentPromptID` becomes p1 and p2's Stop lands idle, but `closePrompt(p2)` leaves `currentPromptID == p1`, now neither current-turn nor closed. Later unmarked p1 stragglers (PostToolUse) then transition to working until the next closer. This falls within the ADR's "reads working until the next Stop or idle_prompt", so no change is requested.
2. **[note]** The whole of kb:adr/lifecycle-prompt-ordering-guards is now `superseded`, including its still-binding seq-order and unseen-prompt-starts-a-turn rules. The new ADR carries them with one sentence, "The other guards stand". doc-reconcile should repoint `docs/protocol.md` rule 2 and the lifecycle spec's `refs:`/§ Ordering and loss, which still cite the superseded record.
3. **[note]** The D3 reopen rows build bare `StateInput`s, so the closer that closed p1 is never exercised. Edge Case 2's "failed → working clears Failure" is asserted by the `failed/tool_start` row, which is sound for every closer except the interrupt one (Decision 1).

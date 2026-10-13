# Correctness review: State Issues

**Plan**: state-issues
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 35418 words (budget 30000)

Scope: this is a full cycle, not a delta, because cycle 1 had a maintainability Major. Cycle 1's requirement findings stand for code this cycle did not touch. `git diff 5d454de3..HEAD` touches these production files: `internal/session/apply.go`, `machine.go`, `session.go` (one comment) and `writeorder.go` (a restored doc block). I re-read all four against the plan, REQ-9 (Amended), `kb:adr/lifecycle-compaction-end-monotonic` and `docs/protocol.md`. I also read the two test files the wave changed.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `applyIdleNotice` never sets `Attention`/`StateNeedsInput` (unchanged since cycle 1 apart from the `endTurnIntoIdle` tail) | Yes: `TestApplyInput_IdleNotice`, D3 INV-B, E2/E3/E4 | pass |
| REQ-2 | Yes: working/planning closes the named and current prompt, then `endTurnIntoIdle` (clear attention, clear failure, `idle`, `turnEnded` → `unread` in `Apply`) | Yes: `TestApplyInput_IdleNotice`, `TestApply_CardStateUnread`, E3, edge 9 | pass |
| REQ-3 | Yes: `endsTurn` only for working/planning/`idleWait()`; otherwise only the named prompt closes | Yes: `TestApplyInput_IdleNotice`, edge 10, E2, E4 | pass |
| REQ-4 | Yes: nil or closed `prompt_id` returns first | Yes: whole-struct equality rows, edges 12/13 | pass |
| REQ-5 | Yes: `permissionWaitOwnedByOther` keys on `attentionPermission` | Yes: `TestApplyInput_LegacyIdleWaitEndsOnAnyAgentsActivity`, edge 11 | pass |
| REQ-6 | Yes: `applyCompactionBegan` outside `inOpenTurn()` → `working`, marker set, latch not consulted | Yes: `TestApplyInput_CompactionBegan`, E1/E1b | pass |
| REQ-7 | Yes: inside a turn only `Compactions++` | Yes: `TestApplyInput_CompactionBegan`, edge 6 | pass |
| REQ-8 | Yes: `compactionOpen` → `closePrompt` → `endTurnIntoIdle` | Yes: `TestApplyInput_CompactionEnded`, `TestApply_CardStateUnread`, E1 | pass |
| REQ-9 (Amended) | Yes. `isBindKind` (`internal/session/apply.go:128`) and the post-`applyInput` `byClaude` write (`apply.go:85`) are main's lists again, so a compact `SessionStart` takes `Apply`'s one guarded envelope branch. If the session was never bound, it binds. A new id is clear-rebound once. An id `byClaude` already maps to this session is a straggler with no rebind and no `byClaude` write. `applyCompactionEnded` (`machine.go:283`) only refreshes identity (model, pending-resume) when the event names the bound id, and never decides a rebind | Yes: `TestApply_CompactionEndedBinding` (never-bound; new id from 6 states with one broadcast), the new `TestApply_CompactionEndedFromALeftIdIsAStraggler` (6 states: binding, compactions, context, state and model unchanged, `assertBindingConsistent`, the left id still resolves here), and the machine-level "a different session id is left to Apply" (whole-struct equality from 8 sources) | pass |
| REQ-10 | Yes: unchanged | Yes: `TestInterpret_SessionStart`, `TestInterpret_SessionStartCompactAndUnknownSource` | pass |
| REQ-11 | Yes: no code change | Yes: `TestSweepInterrupts_CompactionPromptIsInsideTheSweep` | pass |
| REQ-12 | Yes: `latchPermissionMode` returns on `FromSubagent` | Yes: `TestApplyInput_SubagentEventsNeverMoveTheLatch`, edge 15, E5 | pass |
| REQ-13 | Yes: marked `KindTurnFailed` returns first | Yes: `TestApplyInput_SubagentStopFailureChangesNothing`, `TestInterpret_StopFailureSubagentMarker`, edges 16–18, E6 | pass |
| DIAG | `kb:diagram/daemon-components` (from `kb for` on apply.go and machine.go): no import changed, so it is still true. The lifecycle spec's inline machine diagram is the plan's `## Diagrams` delta, which doc-reconcile applies | — | pass |

## Build & Tests

E2E tests: pass (763/763, `17-e2e.log`: `763 passed (6.1m)`) · Daemon tests (race): pass (`02-test.log`, every package `ok`, no `FAIL`) · Web tests: pass (2492/2492, 91 files) · Daemon build: pass (`01-build.log` empty, exit 0) · Web build: pass · Lint: pass (`golangci-lint` `0 issues.`, biome clean, e2e-lint clean, contrast 0 failures, comment-checks clean, comment ledger 1/1 kept). All read from `$GATES_LOG_DIR` (`gates-state-issues-c2`), 0 failed lines. The `16-size.log` WARN lines belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to the baseline `test-race`, `02-test.log`) |
| D5 | `make lint` | pass (deduped to `lint`, `03-lint.log`: `0 issues.`) |
| D6 | `go build ./...` | pass (deduped to `build`, `01-build.log`) |
| K1 | `make check-kb` | pass (deduped to `kb-check`, `11-kb-check.log`: 557 records, 0 problems) |
| E1 | `make e2e` | pass (deduped to `e2e`, `17-e2e.log`: 763 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass, with one `[orchestrator]` gap (Major 1). The six proposed ADRs exist with `status: proposed` and `refs: plan:state-issues`. The new `lifecycle-compaction-end-monotonic` describes what shipped: one guarded branch, a new id forward-rebinds, a left id is a straggler, and the machine arm decides no rebind. The fix log has no `deviation:` line beyond REQ-9's amendment, which the decision records. Cycle 1's Minor 1 (three lines) is folded into `plans/state-issues/doc-delta.md`. Cycle 1's Minor 2 is done: `kb:fact/hook-payload-fields` is qualified for the compact `SessionStart`. The `TODO.md` ticks are still deferred to Completion, as in cycle 1. One gap: the second `doc-delta:` line in the log is not reflected in the delta (Major 1). One protocol row is under-specified (Minor 1). |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D2 | each D2-pinned edge case has its own test | pass | `TestApplyInput_CardStateEdgeCases` covers edges 1, 2+4, 3, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17 and 18 as sequences. Edge 14 used to be machine-level. It now lives at the `Apply` level, where the decision is made: `TestApply_CompactionEndedBinding` "a different session_id rebinds once from <state>" covers all 6 states. Edges 5 and 8 are untested by the plan's own marking |
| D3 | the table crosses every listed input with every listed source state | pass | `TestApplyInput_CardStateInvariants_D3` was not changed this cycle: 9 inputs × 8 sources, with INV-A to INV-D after every row |
| D4 | interpret tests cover all four `SessionStart` sources plus a missing one | pass | unchanged since cycle 1 |
| D7 | `internal/session` branches only on neutral kinds | pass | The new production lines compare only `sess.ClaudeSessionID == claudeSessionID` (Muster's neutral binding id) and the existing `KindBind`/`KindClearRebind`/`KindResumeBind`. No Claude Code event name, `source` or notification type appears |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the cycle-2 diff touches only `internal/session` and adds no payload vocabulary |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass: ingest path untouched |
| 4 | Bare tmux | pass: no tmux invocation added |
| 5 | Payload logging | pass: no log call added |
| 6 | Empty-gauge dishonesty | pass: no gauge path touched. A straggler leaves `Context` as it was, and a forward rebind nulls it (unknown), as on main |
| 7 | Identity on `session_id` | pass: the binding stays keyed on the Muster session. A left id now maps back to the same session (`Resolve("claude-a")` is asserted) and never moves the binding |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass |

## Issues

### Critical
None.

### Major
1. **[orchestrator]** The daemon log's second `doc-delta:` line (`plans/state-issues/daemon-implementation.md:74`, the cycle 1 fix wave) says the lifecycle spec or Doc Delta must state three things: the compact `SessionStart` is not a binder for `Apply`'s envelope check, a new `session_id` forward-rebinds through the same guard, and a left id is a straggler (kb:adr/lifecycle-compaction-end-monotonic). `plans/state-issues/doc-delta.md` folds in the first `doc-delta:` line and cycle 1's Minor 1 but not this one. `docs/protocol.md`'s two compact rows already say it, because the orchestrator landed the decision there directly. What is missing is a lifecycle line, or an explicit "protocol-only, already landed" entry, so that doc-reconcile does not treat the log line as unpromoted.

### Minor
1. **[orchestrator]** The `docs/protocol.md` `kb:anchor/state.transitions` compact `SessionStart` rows now say "Envelope binding as any non-bind event". A non-bind event never records a model. The shipped compaction end does: on the bound id it calls `bindIdentity` (`internal/session/machine.go:284`), so it records the model and graduates a pending resume. `TestApplyInput_CompactionEnded` "the model a compact SessionStart names binds as any SessionStart does" pins that. The row it replaced said "Binds as `SessionStart` does", which covered the model. Add "on the bound id, record model as `SessionStart` does" to the first compact row (and "as the row above" carries it to the second). This text is the decision's own landing in `protocol.md`, so it is the orchestrator's to correct before doc-reconcile, not a code change.

### Notes
1. **[note]** A stale test comment at `internal/session/manager_cardstate_test.go:120`. `TestApply_CompactionEndedBinding`'s doc still says "where the compact SessionStart is a binder". After this cycle's fix it is not one: `isBindKind` excludes it, and the binding comes from `Apply`'s envelope branch.
2. **[note]** If a left-id straggler carried the bound conversation's open compaction prompt id, it would still end that compaction. The machine matches on the prompt id only. The implementer measured this and reported it, and so did the test agent (both logs, "REQ-8 on a straggler"). Prompt ids are unique per conversation and a rebind clears `currentPromptID`, so no real sequence reaches it. The ADR's "routes and applies" wording covers it. No change requested.
3. **[note]** Cycle 1's items, checked against `git diff 5d454de3..HEAD`:
   - correctness Decision 1 and maintainability Major 1 are resolved as Option B. The rebind decision has one home, in `Apply`.
   - maintainability Minor 1 is resolved: `endTurnIntoIdle` is the single idle-landing tail, with four callers.
   - correctness Minors 1 and 2 are resolved, as in the DOC row.
   - maintainability Note 1: the dropped pre-existing doc blocks are back in 660dff46. Cycle 2's comment pass dropped the two the branch had to edit again, which is within its authority.
4. **[note]** Every proposed ADR from this plan has `tests: []`, the new one included. Candidates for the new one are `TestApply_CompactionEndedFromALeftIdIsAStraggler` and `TestApply_CompactionEndedBinding`. They can be filled when the ADRs flip at Completion.
5. **[note]** `kb pack --role review` is still over budget: 35418 words against 30000.

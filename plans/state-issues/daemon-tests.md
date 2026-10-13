# Daemon Tests: State Issues

**Plan**: state-issues
**Verdict**: pass
**Pack**: kb: pack 19909 words (budget 30000)

## Summary

Tests created: 16 new top-level tests (409 passing runs including subtests, across the new files and `interpret_test.go`) | Passing: 409 | Failing: 0

Gates, run from the repo root with `MUSTER_SESSION` and `TMUX` unset (see Notes):
`go build ./...` exits 0; `make test` passes every package (`internal/session` 23.5 s, `internal/claudecode` 10.9 s, `internal/server` 83.5 s); `make lint` prints `0 issues.`; `go vet -tags canary ./test/...` is clean.

Mutation check, in a throwaway `rsync` copy of the tree (`$scratchpad/mut`, never this tree): 19 one-line mutations of the new production code, each run against `./internal/session ./internal/claudecode`:

```
M1  latch accepts subagent events               KILLED (172 fail lines)
M2  subagent StopFailure fails the session      KILLED (48)
M3  idle notice ignores planning                KILLED (5)
M4  compaction reads the latch, not working     KILLED (4)
M5  compactionOpen ignores "still current"      KILLED (4)
M6  permission-wait ownership ignores reason    KILLED (21)
M7  compact SessionStart never escalates rebind KILLED (14)
M8  unread set on any idle landing              KILLED (3)
M9  idle notice keeps the current prompt open   KILLED (4)
M10 idle notice does not close the named prompt KILLED (12)
M11 PreCompact transitions inside a turn        KILLED (13)
M12 interpreter drops the StopFailure marker    KILLED (7)
M13 compact SessionStart interpreted as a bind  KILLED (3)
M14 compact SessionStart not a binder kind      SURVIVED (equivalent mutant, below)
M15 byClaude not updated on a compact bind      KILLED (8)
M16 compaction marker not rolled back           KILLED (3)
M17 compact end closes the prompt, no setState  KILLED (18)
M18 idle notice lands a failed card idle        KILLED (6)
M19 idle notice ends a permission wait          KILLED (9)
```

M14 is equivalent: with the compact `SessionStart` outside `isBindKind`, `Apply`'s envelope check performs the clear-rebind first and `applyBind` then clears `currentPromptID`, so `applyCompactionEnded` sees a same-id, no-longer-current prompt and does nothing more; the end state is identical to the real path (`machine.go` `applyBind` sets `sess.currentPromptID = ""` on a clear-rebind). M8's first attempt was a build failure (unused variable), re-run as `turnEnded || sess.State == StateIdle` and killed.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_IdleNotice` (8 sources x 4 prompt shapes) | REQ-1..4: no-id and closed-id inert; open or unseen id ends a working/planning/legacy-idle turn into idle (current prompt closed too, attention/failure cleared), otherwise only closes the named prompt and a permission wait survives; `lastActivity`/`lastPrompt`/`backgroundTasks` untouched; returned turn-ended flag | pass |
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_CompactionBegan` (8 sources x latch default/plan) | REQ-6/7: outside a turn working (never planning), prompt adopted, attention/failure cleared; inside a turn count only, current prompt and attention unchanged, and the id is not marked as a compaction's (its SessionStart is a no-op) | pass |
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_CompactionEnded` | REQ-8: own prompt lands idle, Stop-owned fields unchanged; duplicate delivery no-op; REQ-9 no-ops (no id, other id, lost PreCompact, closed already, superseded by a new turn, mid-turn compaction); different session_id escalates to clear-rebind from every state (edge 14); never-bound binds; model bind | pass |
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_CardStateEdgeCases` | D2: edges 1, 2+4, 3, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18 as event sequences with the state asserted after every step, plus the measured full compaction sequence | pass |
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_LegacyIdleWaitEndsOnAnyAgentsActivity` | REQ-5: a legacy idle wait ends on main, subagent A or subagent B activity | pass |
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_SubagentEventsNeverMoveTheLatch` (8 sources x 3 latches x 6 modes) | REQ-12: marked events never move the latch or its source; unmarked control still latches | pass |
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_SubagentStopFailureChangesNothing` (8 sources x 4 prompt shapes, marked and unmarked) | REQ-13: marked StopFailure changes no field; unmarked still fails the card from every state | pass |
| `internal/session/machine_cardstate_test.go` | `TestApplyInput_CardStateInvariants_D3` (8 sources x 9 inputs) | D3: idle_prompt (no id / open / closed / unseen), PreCompact, compact SessionStart (own / other prompt), subagent StopFailure, subagent activity carrying `dontAsk`, each from all six states with needs_input split three ways; asserts INV-A, INV-B, INV-C, INV-D after every row | pass |
| `internal/session/manager_cardstate_test.go` | `TestApply_CardStateUnread` | REQ-2/REQ-8 through `Manager.Apply`: unread follows the watcher only when a turn really ended; no-op idle_prompt, stale compact SessionStart, permission wait never set it; one broadcast and a persisted row | pass |
| `internal/session/manager_cardstate_test.go` | `TestApply_CompactionStateThroughTheManager` | measured `PreCompact`/`SessionStart(compact)` payloads through `Interpret` + `Apply`; two sessions compacting under the same prompt id, the survivor unaffected | pass |
| `internal/session/manager_cardstate_test.go` | `TestApply_CompactionEndedBinding` | REQ-9 binding half: never-bound binds without transition; different session_id rebinds once from all six states with the reverse index and one broadcast | pass |
| `internal/session/manager_cardstate_test.go` | `TestApply_CompactionStatePersistFailureRollsBack` | a failed persist restores state, prompts and the compaction marker | pass |
| `internal/session/manager_cardstate_test.go` | `TestApply_SubagentEventsThroughTheManager` | marked StopFailure and marked `dontAsk` PreToolUse from real payloads through `Interpret` + `Apply`, persisted rows checked | pass |
| `internal/session/manager_cardstate_test.go` | `TestSweepInterrupts_CompactionPromptIsInsideTheSweep` | REQ-11: the sweep asks about the compaction prompt and leaves the card working | pass |
| `internal/claudecode/interpret_test.go` | `TestInterpret_SessionStartCompactAndUnknownSource` | D4: `source:"compact"` interprets to `KindCompactionEnded`, distinct from every bind, model still read; missing, null, empty, unknown and wrong-case source bind as startup (REQ-10) | pass |
| `internal/claudecode/interpret_test.go` | `TestInterpret_StopFailureSubagentMarker` | D8: `agent_id` marks FromSubagent and names the agent; absent and `null` are the main agent; error and message still extracted | pass |
| `internal/claudecode/interpret_test.go` | `TestInterpret_Notification` (idle_prompt row), `TestInterpret_PreCompact`, `TestInterpret_SessionStart` | idle_prompt is `KindIdleNotice` and not a needs-input kind; PreCompact is `KindCompactionBegan`; startup/resume/clear unchanged (D4) | pass |

## Handoff Received

- `internal/session/machine_test.go`: renamed the kinds; `TestApplyInput_NeedsInputIdle_FromFailedViaUnseenFreshPromptClearsFailure` became `TestApplyInput_IdleNotice_FromFailedViaUnseenFreshPromptKeepsFailure` (failed stays failed with its failure note, p2 closed, p1 stays closed); the `TestApplyInput_NeedsInput` idle subtest now asserts an idle card stays idle with no attention; the `closed_prompt_unmarked_notification_idle` cross-state row only needed the rename.
- `internal/session/machine_turnstate_test.go`: renamed the kinds; the prompt-carrying `idle_prompt` subtest asserts working lands idle with no attention; `TestApplyInput_WaitOwnership_INVB` expected a subagent's `plan` mode to latch and read planning, now expects the latch and its source untouched and working for a subagent actor (planning only for the main actor), per REQ-12; doc-comment of `TestApplyInput_PromptlessIdlePrompt` cites REQ-4.
- `internal/session/rail_unread_test.go`: the `needs_input_idle_*` rows became `idle_notice_*` and `clears` is now false (an idle_notice that lands idle leaves unread to `Apply`); the `compaction` row was removed because PreCompact now clears unread from started/idle/failed and not from open turns, which a single `clears` flag cannot express; INV-D for both compaction kinds is asserted in `TestApplyInput_CardStateInvariants_D3`.
- `internal/session/interrupt_test.go`: renamed the kinds; the `closesTurn` comment now says "turn-ended guard".
- `internal/session/manager_test.go`: renamed `KindCompaction`; `TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent` used PreCompact as its "no transition" probe, which now moves started to working, so it uses `KindInert` and asserts `Compactions` is zero.
- `internal/claudecode/interpret_test.go`: renamed the kinds, retitled the `idle_prompt` subtest, and moved the stale "StopFailure FromSubagent false" subtest's title to "unmarked".
- `internal/claudecode/claudecodetest/claudecodetest.go` (test helper package, not a `_test.go` file): `StopFailureOpts.AgentID` added so a fixture can build a marked StopFailure through the existing `markSubagent`; `SessionStartOpts.Source` doc names `compact`; `RawPreCompact` doc corrected.
- `test/canary/state_test.go` (not in the Handoff): `make lint` failed at HEAD on this file alone, `goimports` import grouping at line 12 (`File is not properly formatted (goimports)`). It sits on the branch from an earlier commit and `git diff HEAD` was empty for it before my edit, so the defect is not from this plan. I regrouped its imports (testify above the local import, blank line between) so the gate runs green; no other change.

## Implementation Bugs (if verdict = implementation-bug)

None.

## Notes

- **Environment**: this session runs inside Muster session 9 (`MUSTER_SESSION=9`, `TMUX=/private/tmp/tmux-501/muster,…`). With those inherited, `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` and `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession` in `internal/server` fail (`expected: "MUSTER_SESSION=[]"` / `actual: "MUSTER_SESSION=[9]"`). They are ambient-environment failures unrelated to this plan; with both variables unset (`env -u MUSTER_SESSION -u TMUX make test`) the whole suite is green, as pasted below. The orchestrator's gate run from an ordinary shell is unaffected.
- **INV-B wording**: the plan says an `idle_prompt` never results in `needs_input` unless the source already was `needs_input` with reason `permission`. A legacy idle wait (the one a row persisted by an earlier daemon holds) that gets a no-op `idle_prompt` (no id or a closed id) also stays `needs_input`, because nothing was raised. The D3 table asserts the invariant's intent: an `idle_prompt` never enters `needs_input` and never raises or re-stamps a wait (`before.Attention == after.Attention`, same wait kind). A literal reading of INV-B would fail on that row, so the plan's sentence wants "was already `needs_input`".
- **INV-C** is asserted with the amended reading: a compact `SessionStart` carrying the bound `session_id`. The different-`session_id` case is asserted separately as the clear-rebind in `TestApplyInput_CompactionEnded` and `TestApply_CompactionEndedBinding`.
- **Declined edge cases** (the plan marks both untested): edge 5 (interrupted compaction, no event exists to drive) and edge 8 (restart inside the ~10 s compaction window, needs a daemon restart). For 8 the plan names REQ-2's own test as the exit's cover, and `TestApplyInput_CardStateEdgeCases` "edges 2 and 4" drives exactly that exit: `PreCompact`, then `idle_prompt` naming `pc` lands `idle` with the prompt closed; in that sequence the compact `SessionStart` is absent, as it is after a lost marker.
- **REQ-10** (startup, clear, resume and missing source unchanged) is covered by the existing `TestApplyInput_Bind`, `TestApplyInput_ClearRebind` and resume-bind suites, which pass unchanged except for the renamed kinds, and by the new interpreter rows for missing, null, empty and unknown source.
- **Observation, not a bug**: a `PreCompact` carrying no `prompt_id` outside a turn moves the card to `working` with no prompt to adopt, and nothing then ends it but the next prompt (a prompt-less `idle_prompt` is inert by REQ-4). `kb:fact/compact-hook-sequence` measured a `prompt_id` on every `PreCompact`, so this only matters if a payload lacks it; `TestApplyInput_CompactionBegan` pins the current behaviour ("a PreCompact with no prompt id outside a turn still reads working and adopts nothing").
- **Superseded by review cycle 1**: a compact `SessionStart` naming a left `session_id` is a straggler (kb:adr/lifecycle-compaction-end-monotonic); asserted by `TestApply_CompactionEndedFromALeftIdIsAStraggler` (see Fix Attempt 1).
- **Size warnings** naming my files (`size-warn.sh --changed`): `TestApplyInput_CompactionEnded` (124 lines) and `TestApplyInput_CardStateEdgeCases` (143 lines) exceed funlen's 60. Both are tables of named scenarios whose rows are the point, and splitting them would only move rows between functions. No `dupl` warning names a file of mine. The remaining `funlen` hits in `machine_test.go`, `manager_test.go`, `interrupt_test.go` and `machine_turnstate_test.go` predate this step.

## Test Run Output

```
$ go build ./...                      -> exit 0
$ env -u MUSTER_SESSION -u TMUX make test
bin/gatelock run --shared -- go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	60.981s
ok  	github.com/Zalaras/muster/internal/claudecode	10.951s
ok  	github.com/Zalaras/muster/internal/server	83.502s
ok  	github.com/Zalaras/muster/internal/session	23.501s
ok  	github.com/Zalaras/muster/internal/store	9.020s
(every package ok; none FAIL)
$ make lint
golangci-lint run
0 issues.
$ go vet -tags canary ./test/...      -> clean

Ambient-environment failure, with MUSTER_SESSION=9 inherited (not the plan's):
--- FAIL: TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession
    expected: "MUSTER_SESSION=[]"
    actual  : "MUSTER_SESSION=[9]"
--- FAIL: TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession
    expected: "MUSTER_SESSION=[]"
    actual  : "MUSTER_SESSION=[9]"
```

## Fix Attempt 1 (review cycle 1)

Impl's Fix Attempt 1 moved the compact SessionStart's rebind decision back into `Apply`'s monotonic guard and extracted `endTurnIntoIdle`. Pack: `kb: pack 19924 words (budget 30000)`.

**Handoff Received**:
- `internal/session/machine_cardstate_test.go` `TestApplyInput_CompactionEnded`: deleted the subtest "a different session id escalates to the clear-rebind from every state (edge 14)" and "on a never-bound session it binds and changes no state"; both are `Apply`'s behaviour now and already covered by `TestApply_CompactionEndedBinding` ("a different session_id rebinds once from <state>", "a never-bound session binds and keeps its state"). Replaced the first with "a different session id is left to Apply: the machine rebinds nothing and applies no model": from every `cardSources` state, `applyInput` with `c-other` and a differing model returns false, leaves `ClaudeSessionID` (`c1`), `Model` and the whole session unchanged.
- `internal/session/manager_cardstate_test.go`: added `TestApply_CompactionEndedFromALeftIdIsAStraggler`, from each of started/planning/working/needs_input/failed/idle: bind `claude-a`, clear-rebind to `claude-b`, PreCompact, then an enveloped compact SessionStart naming `claude-a` with a different model: `ClaudeSessionID` stays `claude-b`, `Compactions`, `Context`, `State` and `Model` unchanged, `assertBindingConsistent` holds, and `claude-a` still resolves to the session.

**Notes**: the straggler carries its own prompt id (`p-left`). A straggler naming the open compaction prompt id still ends the compaction (impl log, "REQ-8 on a straggler": the machine matches only the prompt id; a left conversation's prompt is never the open compaction prompt in practice because a rebind clears `currentPromptID`). My first draft reused the compaction's prompt id and observed exactly that (`working` became `idle`); I kept the distinct id as the realistic shape rather than pin the corner.

**Gates** (`MUSTER_SESSION` and `TMUX` unset): `go build ./...` exit 0; `make test` every package ok; `make lint` `0 issues.`.

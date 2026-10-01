# Daemon Tests: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: pass
**Pack**: kb: pack 39844 words (budget 20000)

Pre-review fix attempt 1: clear-rebind now keeps `closedPromptIDs`, so D3 passes. Every criterion D1–D16 is covered and green; `go build ./...`, `make test` and `make lint` are clean.

## Summary

Tests created: 322 (subtests included, counted from `go test -v` over the new and touched tests) | Passing: 322 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/machine_turnstate_test.go` | TestApplyInput_PromptlessIdlePrompt | D1: a prompt-less `idle_prompt` from all six states and both wait owners leaves the whole struct equal; a prompt-carrying one still enters needs_input idle; a closed-prompt one is a no-op | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_PostToolBatchLandsActive | D4 machine half: an unmarked `PostToolBatch` from a main-owned needs_input lands planning or working per the latch, with attention cleared | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_WaitOwnership_INVB | D5: 6 source states × prior owner × wait owner (main, A) × activity agent (main, A, B), asserting INV-A and INV-B after each row | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_OtherAgentActivityStillAdoptsAndRecords | Other-agent activity adopts an open prompt and records LastPrompt without transitioning (edges 3 and 6); a closed prompt is not adopted | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_PermissionOwnerRecorded | The raising agent owns the wait (edge 14); a `permission_prompt` Notification keeps an existing owner and otherwise records main | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_SubagentOwnedWaitSurvivesMainStop | D14/REQ-8: a main Stop keeps a subagent-owned wait but still closes the prompt and captures lastActivity, count and latch; D6: StopFailure and interrupt both end it | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_TurnInterrupted | REQ-4 arm from every open state and owner; D8 (non-current prompt, nil prompt, non-open states) and D9 (a straggler, then a new prompt opens a turn) | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_BackgroundTasksCount | D13: Stop sets 2 then 0; a Stop with no list and every other kind from every state leave the count; clear-rebind (explicit and escalated) and resume-bind reset it and the owner; a same-id Bind does not | pass |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_TurnStateInvariantsAcrossEverySourceState | INV-A and failure-iff-failed after 13 input kinds × 6 states × both owners | pass |
| `internal/session/interrupt_test.go` | TestSweepInterrupts_CheckerOnlyAskedForAliveOpenTurns | D11: the checker is asked only for alive working, planning or needs_input sessions that have a transcript path and a current prompt; a nil checker is a no-op | pass |
| `internal/session/interrupt_test.go` | TestSweepInterrupts_LandsIdleLikeStop | REQ-4: lands idle from each open state, watched and unwatched, with unread set as Stop does, one broadcast, persisted, lastActivity and count untouched; a subagent owner is forgotten | pass |
| `internal/session/interrupt_test.go` | TestSweepInterrupts_OnlyTheInterruptedSessionMoves | Two coexisting sessions: only the interrupted one moves or broadcasts | pass |
| `internal/session/interrupt_test.go` | TestSweepInterrupts_FailuresLeaveTheSessionUnchanged | D10: checker error, "no", and a missing file via the real checker leave the session unchanged and are retried | pass |
| `internal/session/interrupt_test.go` | TestSweepInterrupts_RealTranscriptFile | Real checker on real files: both interrupt texts land idle; an older-prompt line and plan feedback do not (edge 7) | pass |
| `internal/session/interrupt_test.go` | TestSweepInterrupts_TurnClosedBetweenCheckAndApply | Race: a Stop lands between the check and the apply and is not disturbed | pass |
| `internal/session/interrupt_test.go` | TestPollLoop_SweepsInterrupts | `pollLoop` runs the sweep, so an interrupt lands idle with no caller | pass |
| `internal/session/interrupt_test.go` | TestApply_TurnStatePersistsAcrossARestart | D12 at the manager: owner and count reload through `LoadAll`, and INV-B holds after the restart | pass |
| `internal/session/interrupt_test.go` | TestApply_StopKeepingASubagentWaitIsNotUnread | A Stop that a subagent wait survives never sets unread; a main-owned one does | pass |
| `internal/session/interrupt_test.go` | TestApply_PromptlessIdlePromptAfterClear (D2 ×3) | D2: an enveloped prompt-less `idle_prompt` on a new claude id rebinds to started and stays there, from every state | pass |
| `internal/session/interrupt_test.go` | TestApply_PromptlessIdlePromptAfterClear/D3_… | D3: after a clear-rebind, an `idle_prompt` with the previous id's closed prompt id changes nothing | pass |
| `internal/claudecode/interpret_transcript_test.go` | TestScanInterrupt (16 rows) | D7/D8 pure layer: both marker texts match under their own promptId only; the rows also cover plan feedback, plain-string content, a mid-line cut tail and garbage lines | pass |
| `internal/claudecode/interpret_transcript_test.go` | TestPromptInterrupted | D7, D8, D10 at the file layer: a missing file is (false, nil), a directory is an error, and only the 64 KB tail is read | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_TurnActivityEvents (+PostToolBatch), TestInterpret_PostToolBatch | D4 interpreter half: `PostToolBatch` is turn activity with the latch and the marker and agent derived | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_AgentIdentity, TestInterpret_IdlePromptWithAndWithoutPromptID | Agent id and `AgentUnknown` derivation; the prompt-less idle_prompt still interprets as needs_input_idle | pass |
| `internal/claudecode/interpret_test.go` | TestInterpret_StopBackgroundTasks | D13 interpreter half: running-only count, nil when there is no list, StopFailure carries none | pass |
| `internal/claudecode/settings_test.go` | TestMergeSettings_FreshFileRegistersCommandEntryOnAllTwelveEvents | D16: twelve events, `PostToolBatch` among them, each with a command entry | pass |
| `internal/store/session_test.go` | TestSession_TurnStateColumnsDefaultAndRoundTrip | D12: defaults 0/NULL, round trip through Get and List, and back to 0/NULL | pass |
| `internal/store/migrate_test.go`, `store_test.go` | TestMigrate_AppliesInitSchema, TestMigrate_SecondCallIsANoOp, TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations | Migration count 11 | pass |
| `internal/server/sessionwire_test.go` | TestSessionWire_BackgroundTasksIsAlwaysPresentAndAttentionAgentNeverOnTheWire | D15: `backgroundTasks` is always present as an integer, 0 included; the owner never reaches the wire | pass |
| `test/canary/static_test.go` | TestInstalledBinaryCarriesInterfaceStrings (+3 needles) | REQ-9: `PostToolBatch` and both interrupt marker texts. Compiles under `-tags=canary` (`go vet -tags=canary ./test/canary` is clean); not run, the orchestrator runs it. | not run |

## Handoff Received

- `internal/store/migrate_test.go` and `internal/store/store_test.go`: the migration count 10 → 11 (and the `0011_turn_state` note in the comment).
- `internal/claudecode/settings_test.go`: eleven → twelve events (test renamed `…OnAllTwelveEvents`, comments updated). It also asserts `PostToolBatch` is registered (D16).
- `internal/session/machine_test.go` `TestApplyInput_ClearRebind/explicit clear-rebind…`: the old `assert.Empty(t, sess.closedPromptIDs)` became `assert.Equal(t, []string{"p0"}, sess.closedPromptIDs)` (closed ids survive a clear-rebind) while `currentPromptID` still asserts empty; comment updated.
- `internal/store/session_test.go`: D12 coverage added, as a new test.

## Implementation Bugs

None (the D3 bug was fixed in `machine.go` `applyBind`; D3 now passes).

## Notes

- Fails-on-old-code was proven in a throwaway copy made with `rsync` into the scratchpad. It was not proven by overwriting files in this tree. I removed the `waitOwnedByOther` guard, the prompt-less `idle_prompt` guard, the Stop keep-wait exception and the `PostToolBatch` interpret case. 55 failures resulted across 8 session tests and 2 claudecode tests, including the D5 table, D1, D4, D14, the restart test and the unread test. The copy was deleted afterwards.
- A needs_input session whose `currentPromptID` is empty is never asked by the sweep. A `PermissionRequest` does not adopt a prompt id, and the id is in-memory only, so after a daemon restart the sweep cannot see an interrupt of a session restored in needs_input, working or planning until its next turn activity. This is by design per the plan ("prompt id current"), so it is not a verdict. A reviewer may want it noted as a residual.
- Declined items: REQ-6, REQ-7, the W criteria and E1–E9 are web and E2E. The daemon's side of REQ-5's wire is D15, covered here.
- `dupl`: the `make lint` run showed no `WARN size` line naming my files.
- `internal/session/interrupt_test.go` is about 540 lines. It holds one fixture, `driveTo`, and its consumers, so I did not split it.
- The `//nolint:exhaustive` in `seededSession` explains itself: only the two states that carry a note have anything to seed.

## Test Run Output

```
go build ./...  -> ok
make lint       -> 0 issues
make test       -> every package ok (internal/session ok; D3 subtest PASS)
```

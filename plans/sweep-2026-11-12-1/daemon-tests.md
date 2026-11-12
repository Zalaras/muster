# Daemon Tests: sweep-2026-11-12-1

**Plan**: sweep-2026-11-12-1
**Verdict**: authored
**Pack**: kb: pack 24846 words (budget 30000)

## Summary

Red-first. Tests created: 5 (2 replays, 1 cross-state group of reopen rows, 1 flag table, 1 `<agent-message` case) | Passing: 0 | Failing: 5 (3 on assertions, 2 on the accepted compile error).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/machine_turnstate_test.go` | TestApplyInput_TeammateReinvocationOnClosedPrompt | e1 replay: main PreToolUse/PermissionRequest on closed p1 reopen it | red (assertion) |
| `internal/session/machine_turnstate_test.go` | TestApplyInput_TeammateReinvocationAskUserQuestionReadsNeedsInput | e2 replay: needs_input held through t1 marked hooks, answer lands working | red (assertion) |
| `internal/session/machine_test.go` | TestApplyInput_CrossStateInvariants/reopen/* | reopen and inert rows from every source state | red (compile: field missing) |
| `internal/claudecode/interpret_rail_test.go` | TestInterpret_UserPromptSubmit_Prompt (`<agent-message` case) | `<agent-message` is never a last prompt | red (assertion) |
| `internal/claudecode/interpret_rail_test.go` | TestInterpret_ReopensClosedPromptFlag | flag true only for unmarked PreToolUse/PermissionRequest | red (compile: field missing) |

## Handoff Received

None (red-first).

## Notes

INV-P comments in `machine_test.go` narrowed to "unflagged/unmarked". The replay and `<agent-message` tests were run red on assertions before the flag-referencing tests were added; with them, both packages fail to compile on `ReopensClosedPrompt` (the accepted red).

## Test Run Output

```
--- FAIL: TestApplyInput_TeammateReinvocationOnClosedPrompt
  a main PreToolUse on the closed id is the re-invoked turn working
  the reopened id is the current prompt
  the reopened id has left the closed ring
  a main PermissionRequest on the closed id reopens it and waits on the developer
--- FAIL: TestApplyInput_TeammateReinvocationAskUserQuestionReadsNeedsInput
  AskUserQuestion in the re-invoked turn is needs_input
  still needs_input after t1 PreToolUse / t1 PostToolUse / t1 PostToolBatch / permission_prompt notification
--- FAIL: TestInterpret_UserPromptSubmit_Prompt/a_prompt_beginning_<agent-message_yields_nil
  Expected nil, but got: (*string)(0xc140cf2cab0)
vet: internal/claudecode/interpret_rail_test.go:116:32: in.ReopensClosedPrompt undefined (type StateInput has no field or method ReopensClosedPrompt)
vet: internal/session/machine_test.go:742:48: unknown field ReopensClosedPrompt in struct literal of type claudecode.StateInput
```

## Review cycle 1 (red-first, REQ-6)

**Verdict**: authored

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/interrupt_test.go` | TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt | interrupt closes p1; main PreToolUse (`ReopensClosedPrompt`) reopens; sweeps with the same transcript stay working; a second interrupt line lands idle | red (assertion) |

Drives the real `claudecode.PromptInterrupted` over a real transcript file (`claudecodetest.InterruptLine`); the "new interrupt" is a second appended line, so the fix must tell old from new by position or count. Compiles and lints clean (`make lint`: 0 issues).

### Handoff
No seam signature change needed: the checker seam stays `func(path, promptID string) (bool, error)`. If the fix needs per-session state (for example a consumed-interrupt count or offset), it must live inside the Manager/checker wiring, since the test uses `withInterruptChecker(claudecode.PromptInterrupted)` unchanged. If the impl changes that signature, this test's one wiring line needs updating.

### Red output
```
--- FAIL: TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt
    interrupt_test.go:368: expected: "working"  actual: "idle"
    Messages: the old interrupt line must not re-close the reopened turn
```

## Cycle 1 wave — interrupt checker seam (red-first)

**Verdict**: authored

Moved every use of the interrupt checker seam to `func(path, promptID string) (int64, error)`:
- `internal/session/interrupt_test.go`: `withInterruptChecker`, `checkerDouble` (default 0), all doubles (true becomes offset 1, false 0, error cases keep their error), REQ-6 and real-file tests wired to `claudecode.PromptInterruptedAt`.
- `internal/session/manager_cardstate_test.go` needed no edit (uses `checkerDouble.check`).
- `test/canary/state_test.go` keeps `PromptInterrupted` (stays, `at > 0`).
- New `TestPromptInterruptedAt` in `internal/claudecode/interpret_transcript_test.go`: 0 for none/plan-rejection/other prompts/missing file; positive offset within file for one line; strictly larger after a second line of the same prompt; unchanged by another prompt's line; absolute offset beyond the tail window; directory is an error.

### Red (compile errors, impl not landed)

```
internal/claudecode/interpret_transcript_test.go:156:17: undefined: PromptInterruptedAt
internal/session/interrupt_test.go:22:48: cannot use f (variable of type func(path string, promptID string) (int64, error)) as InterruptChecker value in assignment
```

## Review cycle 2 — idle sweep before reopen

**Verdict**: pass

`TestSweepInterrupts_ReopenedPromptNotReclosedByOldInterrupt` (`internal/session/interrupt_test.go`) now runs one `sweepInterrupts` after the first interrupt closes the turn and before the reopen, asserting the card stays idle across it. A change that dropped the remembered interrupt offset during the idle stretch would now re-close the reopened prompt and fail the test. Run: the test, `go test -count=1 ./internal/session/` and `make lint` all pass (0 issues).

# Daemon Tests: sweep-2026-11-06-2

**Plan**: sweep-2026-11-06-2
**Verdict**: pass
**Pack**: kb: pack 11020 words (budget 30000)

## Summary

Tests created: 3 proc tests (red-first, now green) + 2 rewritten proc tests + 3 new unit tests (13 subtests) + 2 rewritten unit tests | Passing: all | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `cmd/musterd/port_proc_test.go` | TestPortProc_SavePromptIsAskedBeforeServingAndStaysTheLastLine | REQ-1/2: prompt is last on stderr, no `musterd starting` before the answer; `y` saves, startup follows | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_InterruptAtSavePromptSavesNothingAndExitsZero/{interrupt,terminated} | REQ-3: signal at the prompt: exit 0, no port file, newline after the prompt, nothing served | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered | ingest unanswered while the prompt waits; `n` saves nothing, then serving starts | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt | save answered `y` first, then `y` at kill prompt kills both sessions | pass |
| `cmd/musterd/port_test.go` | TestMaybeOfferSavePort_Guards (6 rows) | blocking call: prompts and saves only when offered, on a tty, not restarted; no output otherwise | pass |
| `cmd/musterd/port_test.go` | TestSavePromptThenKillPrompt_OneTerminalOneReader (4 rows) | answered save prompt first, no reader left on stdin (`pendingRead` nil), kill prompt gets its own line | pass |
| `cmd/musterd/port_test.go` | TestMaybeOfferSavePort_CancelledContextEndsAnUnansweredPrompt | blocked until ctx cancelled; then returns, `[y/N] \n`, nothing saved | pass |
| `cmd/musterd/port_test.go` | TestOfferSavePortUnlessSignalled (7 rows) | SIGINT/SIGTERM at the prompt: signalled=true, newline, nothing saved, `shutting down` log names the signal; y/n answered, restarted, not offered, parent ctx cancelled: signalled=false, signal channel unread, no reader left | pass |

## Handoff Received

`cmd/musterd/port_test.go` (did not compile: `maybeOfferSavePort` no longer returns a stop func):
- `TestMaybeOfferSavePort_Guards`: dropped `stop`; the call runs under a new `callWithin` timeout guard and the assertions read the result directly (the typed `y` is consumed before return).
- `TestSavePromptThenKillPrompt_OneTerminalOneReader`: removed the three unanswered-prompt rows and `stop()`; kept the answered rows, added an empty-line save answer row, and assert `pendingRead(in) == nil` after the save prompt returns (the plan's reviewer-verified "no goroutine left reading stdin").
- `TestMaybeOfferSavePort_StopEndsAnUnansweredPrompt` and `TestMaybeOfferSavePort_ParentContextEndsThePrompt`: replaced by `TestMaybeOfferSavePort_CancelledContextEndsAnUnansweredPrompt` (ctx cancel ends the blocked call, `[y/N] \n`, nothing saved).
- Added `TestOfferSavePortUnlessSignalled` for the new function (REQ-3 at unit level).

## Notes

- `callWithin` is a small timeout helper in `port_test.go`; grep found no existing equivalent in `cmd/musterd`.
- No `dupl` lines name the changed files in the `make test`/`make lint` output.
- REQ-2 (`offerSavePort` unchanged) stays covered by the existing `offerSavePort` tests at `port_test.go` lines ~355-412 (y/yes saves, other answers save nothing, `default` clears).

## Test Run Output

```
$ go test -race -count=1 ./cmd/musterd/
ok  	github.com/Zalaras/muster/cmd/musterd	69.325s

$ make lint
golangci-lint run
0 issues.

$ make test   (cmd/musterd and the rest)
ok  	github.com/Zalaras/muster/cmd/musterd	75.552s
... all packages ok, no FAIL
```

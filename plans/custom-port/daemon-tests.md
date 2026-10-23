# Daemon Tests: Custom Port

**Plan**: custom-port
**Verdict**: pass
**Pack**: kb: pack 11663 words (budget 30000)

## Summary

Tests created: 20 new test functions (about 110 table rows and subtests) in wave 1, plus 11 test functions (about 30 rows) in review cycle 1's fix wave; 6 existing files repaired | Passing: all | Failing: 0

`go build ./...`, `make test` (all packages ok), `make lint` (0 issues) and D15 (`! rg -n -- '"-addr"' cmd/ web/e2e/`) are green.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `cmd/musterd/port_test.go` | TestParsePortFlag | REQ-1 value grammar: 0, 1, 65535, `default`; rejects 65536, 70000, -1, abc, empty, fraction, host:port, `Default`, padded; message names flag and value | pass |
| `cmd/musterd/port_test.go` | TestPortFromArg_AbsentIsNotGiven | absent vs `0` vs `default` vs bad | pass |
| `cmd/musterd/port_test.go` | TestParseFlags_Port | `-port` through the real flag set: both forms, last wins, bad values unwrapped | pass |
| `cmd/musterd/port_test.go` | TestRun_InvalidPortFailsBeforePreflightAndDataDir | D1: PATH without tmux, error names `-port` not tmux, data dir not created | pass |
| `cmd/musterd/port_test.go` | TestLoadSavedPort, TestLoadSavedPort_UnreadableFileIsAnError | saved file grammar: missing, valid forms, empty, 0, negative, too big, text, two lines, directory | pass |
| `cmd/musterd/port_test.go` | TestResolvePort | D2-D7, D13 over every flag x saved combination, including the corrupt-file escape hatches | pass |
| `cmd/musterd/port_test.go` | TestResolvePort_SavedPortIsScopedToTheDataDir | REQ-3: two data dirs keep their own port | pass |
| `cmd/musterd/port_test.go` | TestSavePort, TestSavePort_FailsWhenTheDataDirIsMissing | D14 read-back, REQ-6 clear from every starting state, 0600 mode | pass |
| `cmd/musterd/port_test.go` | TestOfferSavePort (+ NoAnswerNever..., DefaultAnsweredYes..., AFailedSave...) | V1 exact prompt text, D11 answer table, D6 end to end, failed save logged | pass |
| `cmd/musterd/port_test.go` | TestMaybeOfferSavePort_Guards | D5/D7 (not offered), D8 (pipe, nil), D9 (restarted) never prompt or save, with a "y" already typed; terminal+offered prompts and saves | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_YesSavesAndTheNextStartBindsTheSavedPort | real subprocess on a pty: V1, D4, D14, D3 | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_DeclineSavesNothingAndIngestIsServedWhilePromptWaits | D12 (ingest 200 while prompt unanswered), D11 | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_NeverPrompts | D8 real pipe stdin, D9 `MUSTER_RESTARTED=1` on a real pty, D7 `-port 0`, D5 flag equals saved | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_BusyPortExitsNamingThePortAndTheFlag | D10/REQ-8/REQ-9 | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_CorruptSavedPort | D13 fatal naming `-port default`; with `-port` it starts | pass |
| `cmd/musterd/port_proc_test.go` | TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt | Review cycle 1 Major 2: real daemon on a pty, save prompt unanswered, one session plus its shell on a private tmux socket, SIGINT under `-on-exit ask`. `y` kills both and leaves no `port`; `n` leaves both and saves nothing; save `y` typed first then kill `y` saves and kills | pass |
| `cmd/musterd/port_test.go` | TestSavePromptThenKillPrompt_OneTerminalOneReader | In-process pty seam, run's order (`maybeOfferSavePort`, `stop`, `askKillPrompt`): 7 rows crossing save answer (none/y/n) with kill answer (y/yes/n/empty); the kill prompt always gets its own line, the port is saved only by the save prompt's own answer | pass |
| `cmd/musterd/port_test.go` | TestMaybeOfferSavePort_StopEndsAnUnansweredPrompt | `stop` returns with the read blocked, ends the prompt line with a newline, saves nothing | pass |
| `cmd/musterd/port_test.go` | TestMaybeOfferSavePort_ParentContextEndsThePrompt | the prompt goroutine ends with run's context (SIGTERM/serve-error paths) | pass |
| `cmd/musterd/stdin_test.go` | TestLineInput_ReadLine (5 rows), _SuccessiveLinesComeInOrder, _GivesUpOnContextWithoutLosingTheNextLine, _NeverStartsASecondReader, _ReturnsALineAlreadyDeliveredWhenTheContextIsCancelled, _HonoursADeadline, _AfterEOFKeepsAnsweringEmpty | `lineInput.readLine`: trim, EOF, ordering, cancelled read stays in flight and the next prompt adopts it (same channel, no lost or reordered line, race-clean), delivered line beats a cancelled ctx | pass |

## Handoff Received

Wave 2 (review cycle 1), from the impl log's `## Handoff (Fix Attempt 1)`:
- `cmd/musterd/main_test.go`, `onexit_test.go`: `resolveOnExit` / `askKillPrompt` calls take `newLineInput(r, isTerminal(r))` (resolve) or `newLineInput(r, false)` (ask prompt, which does not consult `tty`).
- `cmd/musterd/port_test.go`: `offerSavePort(context.Background(), newLineInput(strings.NewReader(x), true), …)`; `TestMaybeOfferSavePort_Guards` passes `context.Background()` and `newLineInput(stdin, isTerminal(stdin))` and registers the returned `stop` with `t.Cleanup`.
- `cmd/musterd/port_proc_test.go`: `dataDirOf` became a wrapper over a new `flagValue` helper (the new proc test needs `-tmux-socket`).

Wave 1:

- `cmd/musterd/main_test.go` (`TestRun_InvalidOnExitValueIsRejected`), `open_test.go` (`openTestDaemonArgs`), `onexit_test.go` (`spawnDaemon`): `"-addr", "127.0.0.1:0"` became `"-port", "0"`.
- `cmd/musterd/preflight_test.go`: `freeAddr` became `freePort` (returns the port string); `TestRun_FailedPreflightLeavesNoSideEffects` passes `-port` and rechecks the listener on `127.0.0.1:<port>`.
- `cmd/musterd/open_test.go`: `newPTYStdin` now wraps a new `newPTYPair` that also returns the pty master, which the prompt tests write answers into.
- D8 and D9, which the impl log said were checked by reading only, are now exercised both in-process (`TestMaybeOfferSavePort_Guards`) and against a real subprocess with a real pipe / pty stdin (`TestPortProc_NeverPrompts`).

## Notes

- D2 (binds 8765) is covered at `TestResolvePort/D2_nothing_at_all` (resolution only); no test binds 8765 because it may be in use on the developer's machine.
- Negative checks ("never prompts") use `assert.Never` over 250-400 ms, the same bounded watch the existing open tests use as a sleep.
- `size-warn` flags `parseFlags` (53 > 40 statements), `run` (45 > 40) and `main.go` (538 lines), all in impl code and acknowledged in the impl log. No `dupl` line names my files.
- The wave-1 note that an unanswered prompt's goroutine holding stdin is untested is superseded: `TestSavePromptThenKillPrompt_OneTerminalOneReader`, `TestLineInput_*` and the process test cover it.
- Prove-red (review cycle 1): a throwaway `git archive f4c32fc1` (the tree before wave 1) with only the new `port_proc_test.go` copied in. Row 1 (unanswered, `y` at the kill prompt) fails: tmux sessions left `[muster-1 muster-1-shell]`, stderr shows `port saved for future starts` then `leaving live sessions running`, `port` file exists. Row 3 (save `y` first) passes there and is a guard. Row 2 (`n`) passes there too, by coincidence (the save prompt takes `n` and saves nothing, the kill prompt times out into leave); it is a guard for the leave outcome, not a discriminator. The unit seam tests cannot compile against the old tree (`lineInput` does not exist there), so the process test is the one proven red.
- `TestSavePromptThenKillPrompt_OneTerminalOneReader` waits for the save prompt to take its typed answer (`pending` cleared) before `stop()`: a line typed in the same instant as the stop belongs to shutdown by design (impl log path 4), so asserting otherwise would be a flaky test of an undefined case. Verified 30 runs under `-race`.
- The process test runs ~7 s per row (daemon startup, tmux, stub claude), 3 rows.

## Test Run Output

```
ok  	github.com/Zalaras/muster/cmd/musterd	56.964s
... all other packages ok
golangci-lint run
0 issues.
D15: ! rg -n -- '"-addr"' cmd/ web/e2e/  -> no match
```

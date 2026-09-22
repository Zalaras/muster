# Daemon Tests: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Verdict**: pass
**Pack**: `go run ./tools/kb pack --plan terminal-fixes-cleanup --role daemon-tests` — 9997 words
(over the 8000 budget; WARN, not an error), sections rules 841 / features 2088 / decisions 5050 /
facts 251 / lessons 1759 / runbooks 2 — features `surfaces`, `theme`.

## Summary

Tests created: 55 (2 sanctioned-fix edits to frozen assertions, plus 53 new tests across 4 new
files and 2 additions to an existing file) | Passing: all | Failing: 0

## Sanctioned test breakage repaired

Per `daemon-implementation.md`'s Handoff, two frozen tests were broken by the plan's own approved
Protocol Contract / Affected Files and needed assertion updates only (not new coverage):

- `internal/server/server_test.go:18` `TestNew_RegistersLifecycleFeaturesInStartOrder` — updated
  from 4 to 5 lifecycle features, adding `srv.shellActivity` as the fourth (between theme and
  update), matching `server.go`'s actual registration order.
- `internal/server/state_test.go:20` `TestBuildSnapshot_M0Shape` — added `"shellsBusy": []` to the
  pinned JSON literal.

Both reproduced red before the fix (exactly the shape difference daemon-impl described), green
after.

## Tests

| File | Test Name | What It Tests |
|------|-----------|---------------|
| `internal/tty/canonical_test.go` | `TestIsCanonical_TrueForCanonicalFalseForRaw` | D8/D9's discriminator against a real pty, ICANON toggled both ways |
| `internal/tty/canonical_test.go` | `TestIsCanonical_UnknownPathReturnsError` | tty vanished mid-tick never panics |
| `internal/tty/canonical_test.go` | `TestIsCanonical_DoesNotDisturbTheRunningProcess` | D10: repeated ioctl reads don't drop/reorder in-flight bytes |
| `internal/tmux/activity_test.go` | `TestListPaneActivity_ParsesEachFieldOfEveryLine` | field parsing, both `AlternateOn` readings |
| `internal/tmux/activity_test.go` | `TestListPaneActivity_MalformedLineIsSkippedDefensively` | wrong-field-count line dropped, not fatal |
| `internal/tmux/activity_test.go` | `TestListPaneActivity_EmptyOutputReturnsNilNotError` | empty server, no panes |
| `internal/tmux/activity_test.go` | `TestListPaneActivity_NoServerYetIsEmptyNotError` | real tmux, ListSessions' own no-server convention |
| `internal/tmux/activity_test.go` | `TestListPaneActivity_UnreachableSocketReturnsAnError` | isConnectionFailure distinction (D25's class of bug) |
| `internal/tmux/activity_test.go` | `TestListPaneActivity_NonExitErrorIsAlwaysWrapped` | ctx-deadline-shaped error still surfaces |
| `internal/tmux/activity_test.go` | `TestListPaneActivity_RealTmux_OneInvocationCoversEveryPane` | D4: one tmux exec for N panes, real tmux |
| `internal/tmux/activity_test.go` | `TestScrollCopyMode_ZeroLinesIsANoOpNoExecCalls` | lines=0 short-circuit, no tmux call at all |
| `internal/tmux/activity_test.go` | `TestScrollCopyMode_EntersCopyModeWhenNotInModeAndHasHistory` | D1/D2 positive case, call order and `-N` shape |
| `internal/tmux/activity_test.go` | `TestScrollCopyMode_SkipsCopyModeWhenAlreadyInAMode` | D1 negative case |
| `internal/tmux/activity_test.go` | `TestScrollCopyMode_NoHistoryIsANoOp` | REQ-12/edge case 10 no-op |
| `internal/tmux/activity_test.go` | `TestScrollCopyMode_NegativeLinesScrollsDown` | sign convention |
| `internal/tmux/activity_test.go` | `TestScrollCopyMode_DisplayMessageErrorPropagates` / `_CopyModeCommandErrorPropagates` / `_SendKeysErrorPropagates` | error propagation at each of the three tmux calls |
| `internal/tmux/activity_test.go` | `TestCancelCopyMode_IssuesSendKeysCancelWithTarget` / `_ErrorPropagates` | REQ-10's tmux command shape and its failure path |
| `internal/tmux/activity_test.go` | `TestScrollCopyMode_RealTmux_EntersCopyModeAndAdvancesScrollPosition` | D1 against a real tmux-observable effect (`#{pane_in_mode}`, `#{scroll_position}`), composed with a real `CancelCopyMode` |
| `internal/server/shellactivity_test.go` | `TestTick_BusyGating_Table` (8 subtests) | D5/D8/D9 exhaustive cross-state gating: idle shell, vim/nested-claude on alt screen, backgrounded job, silent canonical command, noisy canonical command, REPL in raw mode, raw-tty non-alt program (trust prompt/`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN`) — each asserts both the busy verdict and whether the tty ioctl was even reached |
| `internal/server/shellactivity_test.go` | `TestTick_IgnoresNonShellPanesOnTheSocket` | a Claude pane never reaches the shell-busy gate |
| `internal/server/shellactivity_test.go` | `TestTick_TtyErrorExcludesOnlyThatSessionFromTheTick` | one session's vanished tty doesn't crash the tick or contaminate another session |
| `internal/server/shellactivity_test.go` | `TestTick_SkipsListerEntirelyWhenNoShellsExist` / `_CallsListerWhenShellsExist` | the Gotchas "no tmux exec when no shell exists" gate, both source states |
| `internal/server/shellactivity_test.go` | `TestTick_ListerErrorLeavesThePreviousBusySetUntouchedAndBroadcastsNothing` | a transient tmux failure never spuriously broadcasts idle |
| `internal/server/shellactivity_test.go` | `TestReconcile_BroadcastsOnceOnGoingBusy` / `_BroadcastsOnceOnGoingIdle` / `_NoBroadcastWhenUnchanged` | the diff-broadcast contract, including E7/E8's shared "missing from panes = idle" path |
| `internal/server/shellactivity_test.go` | `TestReconcile_MultipleSessionsIndependentNoCrossTalk` | INV-4/E11 |
| `internal/server/shellactivity_test.go` | `TestCurrent_AlwaysNonNilEvenWhenEmpty` / `_ReturnsSortedAscending` | snapshot.shellsBusy's `[]`-not-null and ordering contract |
| `internal/server/shellactivity_test.go` | `TestPoller_StartStop_ImmediateFirstTickThenPromptStop` | real goroutine loop: immediate first tick, prompt Stop, no leak |
| `internal/server/shellactivity_test.go` | `TestShellActivityFeature_ContributeReflectsCurrentBusySet` | snapshot wiring end to end through the real constructor |
| `internal/server/shellscroll_test.go` | `TestHandleShellTerminal_ScrollFrameClampsPositiveLinesTo200` / `_ClampsNegativeLinesToMinus200` | D3 at the real WS wire shape |
| `internal/server/shellscroll_test.go` | `TestHandleShellTerminal_ScrollFrameZeroLinesNeverCallsScrollCopyMode` | 0 never reaches tmux |
| `internal/server/shellscroll_test.go` | `TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal` | failed scroll doesn't kill the socket |
| `internal/server/shellscroll_test.go` | `TestHandleShellTerminal_TypingWhileInCopyModeCancelsBeforeTheWrite` | REQ-10/E10 positive case |
| `internal/server/shellscroll_test.go` | `TestHandleShellTerminal_TypingNeverCancelsWhenNoScrollHasHappened` | REQ-10 negative source state |
| `internal/server/shellscroll_test.go` | `TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput` | REQ-12/edge case 10's no-op composed with REQ-10 |
| `internal/server/shellscroll_test.go` | `TestHandleShellTerminal_ResizeFrameStillDecodesOnTheShellSocket` | REQ-9: resize still works on the shell route |
| `internal/server/terminal_test.go` | `TestHandleTerminal_ScrollFrameIsIgnoredNotFatalAndNeverParsedAsAResize` | D6 at the real WS wire shape on the Claude socket |
| `internal/server/terminal_test.go` | `TestClampScrollLines_Table` | D3's pure clamp function in isolation |

## Coverage notes for the two items you flagged

- **D5 (alternate_on gating)**: `TestTick_BusyGating_Table` covers it from four source states
  (idle shell, vim, backgrounded job, nested claude — all alt-screen-or-shell-idle) and asserts the
  ioctl is never even reached for them, not just that the busy verdict comes out false.
- **D8 (raw-tty gating)**: same table, two source states (a REPL in raw mode, a raw-tty non-alt
  program standing in for the trust prompt / `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` case) — busy
  false, ioctl reached and its `false` result respected.
- **D9 (silent canonical command IS busy)**: same table, its own row (`sleep`-shaped: canonical
  mode, not alt screen, not the shell's own name) — busy true. `internal/tty`'s own
  `TestIsCanonical_TrueForCanonicalFalseForRaw` additionally proves the ICANON read itself (the
  gate D9 depends on) against a real kernel tty, not just a stubbed result.

## Test Run Output

```
$ go build ./...
(clean)

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	20.169s
ok  	github.com/Zalaras/muster/internal/claudecode	15.200s
ok  	github.com/Zalaras/muster/internal/ghissue	2.045s
ok  	github.com/Zalaras/muster/internal/gitutil	2.535s
ok  	github.com/Zalaras/muster/internal/kb	3.844s
ok  	github.com/Zalaras/muster/internal/locate	2.392s
ok  	github.com/Zalaras/muster/internal/selfupdate	2.777s
ok  	github.com/Zalaras/muster/internal/server	34.993s
ok  	github.com/Zalaras/muster/internal/session	7.659s
ok  	github.com/Zalaras/muster/internal/store	6.188s
ok  	github.com/Zalaras/muster/internal/termbridge	5.453s
ok  	github.com/Zalaras/muster/internal/tmux	16.683s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	4.748s
ok  	github.com/Zalaras/muster/internal/triage	5.011s
ok  	github.com/Zalaras/muster/internal/tty	5.808s
ok  	github.com/Zalaras/muster/internal/usage	5.657s
ok  	github.com/Zalaras/muster/internal/webui	5.020s
ok  	github.com/Zalaras/muster/tools/kb	3.678s
ok  	github.com/Zalaras/muster/tools/triage	3.502s
ok  	github.com/Zalaras/muster/tools/versions	9.050s

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 648 references checked, 0 missing
```

## Notes

- `web/src/**`, `web/e2e/**`, `web/scripts/**` were left entirely untouched (web-impl's tree, per
  instructions) — this run touches only `internal/tty/`, `internal/tmux/` and `internal/server/`.
- `plans/terminal-fixes-cleanup/plan.md` and `orchestration-state.json` are the orchestrator's and
  are not part of this commit.
- No implementation code was modified.

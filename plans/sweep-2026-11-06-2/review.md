# Review: sweep-2026-11-06-2

**Plan**: sweep-2026-11-06-2
**Verdict**: approved
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: sweep-2026-11-06-2

**Plan**: sweep-2026-11-06-2
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 20616 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `run` (`cmd/musterd/main.go:279-285`) calls `offerSavePortUnlessSignalled` after `prepareServing` (bind, tokens, wrapper scripts) and before `server.New`/`srv.Start()`/`Serve`/`logStartup`/`maybeOpenDashboard`. A busy port still fails inside `prepareServing` before any prompt. | Proc: `TestPortProc_SavePromptIsAskedBeforeServingAndStaysTheLastLine` (1.5 s `assert.Never` that stderr ends with the prompt and holds no `musterd starting`, with a 100 ms usage poll against an unreachable URL so any early async WRN would show); `TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered` (ingest POST unanswered while it waits). Busy-port and no-prompt rows: existing `TestPortProc_BusyPortExitsNamingThePortAndTheFlag`, `TestPortProc_NeverPrompts`. | pass |
| REQ-2 | Yes. `offerSavePort` is unchanged; `maybeOfferSavePort` now blocks and returns, then startup continues. | Proc: `y` saves `port\n` and `musterd starting` follows the prompt; `n` saves nothing, then ingest gets 200 and the startup line appears. Unit: `TestMaybeOfferSavePort_Guards`, existing `offerSavePort` tests for y/yes/other/`default`. | pass |
| REQ-3 | Yes. `offerSavePortUnlessSignalled` (`port.go:117-134`) selects on prompt-done and `sigCh`. On a signal it cancels the prompt (`confirm` prints the newline), joins the goroutine and logs `shutting down signal=…`. `run` then closes the listener and returns nil, so the deferred `st.Close()` runs, the exit status is 0 and the `-on-exit` path is never reached. | Proc: `TestPortProc_InterruptAtSavePromptSavesNothingAndExitsZero/{interrupt,terminated}` checks exit 0, `prompt+"\n"`, no `musterd starting` and no port file. Unit: `TestOfferSavePortUnlessSignalled` (7 rows). | pass |
| DIAG | `kb:diagram/containers`, `kb:diagram/daemon-components` (from `kb for` on main.go and port.go). Neither shows startup ordering. No import or data-dir file changed. | — | pass |

## Build & Tests

E2E tests: pass (22, scoped to 5 files: auth, claude-version, embedded, masthead-update-dot, resilience) · Daemon tests (race): pass (27 packages ok, incl. `cmd/musterd`) · Web tests: pass (3190) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`). All read from $GATES_LOG_DIR; the gate run had 0 failed lines.

Other gate lines: render fixtures up to date (110), render-lint clean, render tests 463 passed, web lint clean, contrast 0 failures in all three themes, versions fresh, kb check 0 problems, e2e-lint clean, features-scope clean, comment checks clean, comment ledger clean. The `WARN size` hits (run 48>40, parseFlags 53>40, main.go 542 lines, `TestOfferSavePortUnlessSignalled` 88>60) and the e2e-level census belong to review-maintainability (skipped this cycle; see Notes).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestPortProc' ./cmd/musterd/` | pass (`22-D1.log`: `ok github.com/Zalaras/muster/cmd/musterd 17.105s`) |
| D2 | `make lint` | pass (deduped to the gates' lint line, `03-lint.log`: `0 issues.`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The `deviation:` line names `kb:adr/connection-port-save-prompt-before-serving`, which exists, is `proposed`, has `refs: plan:sweep-2026-11-06-2`, supersedes `connection-port-saved-per-profile-on-prompt` and describes what shipped (bind → prompt → serve, a signal saves nothing and exits 0, busy port fails before the prompt, no fallback). The `cmd/musterd/CLAUDE.md` invariant and Owns order now say "after the bind and before serving starts", which matches `run`. `docs/features/connection/spec.md` § Transport and auth states no order ("on a terminal it offers to save…"), so no sentence there is false. The log's `doc-delta:` line is reflected in the plan's Doc Delta. The TODO.md #120 tick is left to the sweep loop on `main`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No goroutine is left reading stdin for the save prompt after it returns, so the shutdown `-on-exit ask` prompt gets its own line | pass | `lineInput.readLine` (`stdin.go`) starts at most one reader. On the answered path, `take` clears `in.pending` and the reader goroutine has already sent its line into the buffered channel and exited. On the not-offered, restarted and non-tty paths no read starts. Only the signal path leaves a read pending, and that path returns from `run` without reaching `shutdownGracefully`. The unit tests assert `pendingRead(in) == nil` after the prompt returns (`TestSavePromptThenKillPrompt_OneTerminalOneReader`, typed rows of `TestOfferSavePortUnlessSignalled`). Proc `TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt` shows `y` at the kill prompt kills both tmux sessions with the port still saved. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The diff touches only `cmd/musterd` startup wiring; no Claude Code format knowledge was added. |
| 2 | Terminal-output state parsing | pass. None in the diff. |
| 3 | Blocking hook handler | pass. Ingest handling is unchanged. The ingest route is unanswered only while the startup prompt waits, before serving, as the ADR's Consequences state. |
| 4 | Bare tmux | pass. No new tmux invocation; tests use the existing per-test `-tmux-socket` helpers. |
| 5 | Payload logging | pass. The only new log line is `shutting down signal=…`. |
| 6 | Empty-gauge dishonesty | n/a (daemon startup only) |
| 7 | Session identity on `session_id` | pass. Not touched. |
| 8 | Settings trespass | pass. Not touched. |
| 9 | Real `claude` outside canary/probes | pass. Proc tests reuse `openTestDaemonArgs` (fake claude), unchanged. |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** The deviation contradicts the accepted `kb:adr/connection-port-saved-per-profile-on-prompt` ("The daemon serves while the prompt waits"). The developer already decided it (option (b) on #120, recorded in the plan's Findings), and the new proposed ADR supersedes the old one. This is not an open `[orchestrator:user-decision]`. At Completion the old ADR needs its status flipped to `superseded`.
2. **[note]** Comments only, for the comment pass, which the review does not judge: `cmd/musterd/port_test.go:418-419` adds two near-identical lines ("The call blocks while a prompt waits, so … returns … once the typed y is consumed"), and the `cmd/musterd/stdin_test.go:15` comment still cites "the save prompt stopped at shutdown", which no longer exists.
3. **[note]** For review-maintainability (skipped this cycle): the gates' `WARN size` adds `TestOfferSavePortUnlessSignalled` (88 > 60) and keeps `run` (48 > 40) and `main.go` (542 lines). The implementer's reasons for `run` and `main.go` are in `daemon-implementation.md` § Decisions; the test's length has no stated reason.

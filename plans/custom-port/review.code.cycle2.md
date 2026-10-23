# Correctness review: Custom Port

**Plan**: custom-port
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 22437 words (budget 30000)

Full re-review: cycle 1 had a Major and a Critical, so this is not a delta cycle. Cycle 1's three code findings (correctness Major 1/2, maintainability Critical 1) were checked against `git diff cc5e39e3..HEAD` and the files as they stand.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `-addr` removed; `-port` 0–65535 or `default`; bad value exits before preflight naming flag and value | Yes. `parseFlags` → `portFromArg`/`parsePortFlag` right after `Parse` (`main.go:176`, `port.go:45`) | Yes. `TestParsePortFlag`, `TestParseFlags_Port`, `TestRun_InvalidPortFailsBeforePreflightAndDataDir` (D1) | pass |
| REQ-2 flag > saved > 8765, host always 127.0.0.1 | Yes. `resolvePort` (`port.go:76`); `net.JoinHostPort("127.0.0.1", …)` in `prepareServing` | Yes. `TestResolvePort` (D2–D7, D13), `TestPortProc_YesSaves…` (D3, D4) | pass |
| REQ-3 saved port in the data dir, survives restarts | Yes. `<data-dir>/port` written with `atomicfile.Write`, mode 0600 | Yes. `TestResolvePort_SavedPortIsScopedToTheDataDir`, `TestSavePort`, proc test D14 | pass |
| REQ-4 prompt iff flag given, differs, not 0, terminal, not restarted | Yes. `resolvePort.offerSave` plus the guards in `maybeOfferSavePort` (`!serving.offerSavePort \|\| restarted \|\| !in.tty`) | Yes. `TestMaybeOfferSavePort_Guards`, `TestPortProc_NeverPrompts` (D5, D7, D8, D9 on a real pty and pipe) | pass |
| REQ-5 only `y`/`yes` saves; empty/EOF/other saves nothing | Yes. Fixed this cycle: `lineInput` (`stdin.go`) is now the only reader of stdin, and `run` calls `stopSavePrompt()` before `shutdownGracefully`. A line typed at the kill prompt reaches the kill prompt and nothing else | Yes. `TestOfferSavePort` (D11 table), `TestSavePromptThenKillPrompt_OneTerminalOneReader` (7 rows), `TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt` (real daemon, real tmux; the impl log shows it failing on the pre-fix tree) | pass |
| REQ-6 saving `default` clears the saved port | Yes. `savePort` removes the file when the port is 8765 | Yes. `TestOfferSavePort_DefaultAnsweredYesClearsTheSavedPort`, `TestSavePort` | pass |
| REQ-7 daemon serves while the prompt waits | Yes. The prompt runs on its own goroutine, started after `httpServer.Serve` | Yes. `TestPortProc_DeclineSavesNothingAndIngestIsServedWhilePromptWaits` (D12) | pass |
| REQ-8 bind failure exits non-zero, no fallback, nothing saved | Yes. `prepareServing` returns the listen error | Yes. `TestPortProc_BusyPortExitsNamingThePortAndTheFlag` | pass |
| REQ-9 bind message names the port and `-port N` | Yes. `listening on 127.0.0.1:N: …; choose another port with -port N` | Yes. Same proc test | pass |
| E1 harness on `-port` | Yes. `buildArgs` in `web/e2e/helpers/daemon.ts` | E2E sweep, 644 passed | pass |
| DIAG | `kb:diagram/daemon-components`: `Rel(cmd, atomicfile, "saved port")` is now drawn (f4c32fc1). `stdin.go` adds no import edge (bufio/context/io/strings/sync only). `kb:diagram/containers`: the data dir names the saved port, which is true | — | pass |

## Build & Tests

E2E tests: pass (644, full suite: the scope is harness-only, so `make e2e SPECS=''`) · Daemon tests (race): pass (all packages ok; `cmd/musterd` 93.7 s) · Web tests: pass (3032) · Render tests: pass (418) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean). All read from `$GATES_LOG_DIR` (`gates-custom-port-c2`, 0 failed lines). The `WARN size` line (parseFlags 53, run 47, main.go 540 lines, two test funlens) belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (01-build.log) |
| D1 | `make test` | pass (deduped to `go test -race -count=1 ./...`, 02-test.log) |
| D2 | `make lint` | pass (03-lint.log, 0 issues) |
| D15 | `! rg -n -- '"-addr"' cmd/ web/e2e/` | pass (22-D15.log empty) |
| W1 | `make web-build` | pass (04-web-build.log) |
| E1 | `make e2e` | pass (21-e2e.log, 644 passed, 5.6m) |
| K1 | `make check-kb` | pass (14-kb-check.log, 643 records, 0 problems) |
| — | baseline gate lines: web-test, render-fixtures, render-lint, render-test, web-lint, contrast, features inventory, versions, e2e-honest, e2e-lint, features scope, comment checks, comment ledger, e2e-level census | all pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. #107 is moved to `docs/history/todo-done.md`. Both plan ADRs are `proposed` with `refs: plan:custom-port` and describe what shipped. The logs have no `deviation:` lines. Every `doc-delta:` line is reflected in `doc-delta.md` or listed there as already handled. Cycle 1's Minor 1 wording was applied in `doc-delta.md` (see Note 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | Prompt reads exactly `Save port N for future starts? [y/N]` with N the bound port | pass | `port.go:127` uses `"Save port %d for future starts? [y/N] "` with `serving.port`, which is the listener's bound port. Asserted verbatim in `TestOfferSavePort` and in the proc tests on a real pty |
| V2 | Startup still opens the browser on the new port's tokenised URL on a terminal | pass (code read) | `maybeOpenDashboard(ctx, f, stdin, restarted, serving.dashboardURL, log)` has not changed since cycle 1. `dashboardURL` is built from the bound port, and the open path never reads stdin, so the new `lineInput` does not affect it. Not exercised in a browser, because review-browser was skipped (Work Type daemon) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. No Claude-Code-format knowledge was added outside `internal/claudecode/` |
| 2 | No terminal-output state parsing | pass. `lineInput` reads the developer's answers from stdin; it never parses pane output |
| 3 | Non-blocking hook handler | pass. Hook handling is untouched, and D12 proves ingest answers 200 while the prompt waits |
| 4 | tmux via `-L muster` / private socket | pass. The new proc test uses `openTestDaemonArgs`, which goes through `tmuxtest.Socket`, and `tmuxSessionNames(d.tmuxSocket)` |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | n/a (no dashboard change) |
| 7 | Identity on tmux target | pass (untouched) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` in tests | pass. Proc tests launch through the `-claude-bin` sleep stub |

## Delta (delta re-review only)

n/a. This is a full cycle. Cycle 1's code findings, verified here:

| Prior finding | Fix commit | Verified how |
|---------------|------------|--------------|
| cycle 1 correctness Major 1 / maintainability Critical 1 `[daemon-impl]` "an unanswered save prompt steals the answer to the `-on-exit ask` shutdown prompt" | `4bbbe0a0` | Diff read. `stdin.go` `lineInput` keeps at most one read in flight (`pending`, guarded by `mu`), and a cancelled `readLine` leaves that read for the next caller to adopt. `run` calls `stopSavePrompt()` (cancel, then wait for the goroutine) before `shutdownGracefully(…, input, …)`, and `askKillPrompt` reads through the same `input` under a 10 s `WithTimeout`. The SIGTERM path goes through the same `stopSavePrompt`. The serve-error path ends the prompt through `run`'s `defer cancel()`. The restart path execs, and no prompt reads after it |
| cycle 1 correctness Major 2 `[daemon-tests]` "no test covers the interaction" | `0a44f9ce` | `TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt` drives a real daemon on a pty with a session plus a shell on a private socket, sends SIGINT and answers `y` at the kill prompt. It asserts both tmux sessions are gone and no `port` file exists. The test log records it failing on the pre-fix tree. A unit seam test (7 rows) and the `TestLineInput_*` tests cover the reader |
| cycle 1 correctness Major 3 `[orchestrator]` stale daemon-components diagram | `f4c32fc1` | `Rel(cmd, atomicfile, "saved port")` is present at `docs/diagrams/daemon-components.md:88` |
| cycle 1 correctness Minor 1 `[orchestrator]` Doc Delta wording | `f4c32fc1` | `doc-delta.md` now says "a flag-given port that differs from it, and saving `-port default` clears it" |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** In `doc-delta.md`, the "it" in "offers to save a flag-given port that differs from it" (my cycle-1 wording) can be read as the saved port. With nothing saved, `-port 8765` does not prompt (D5), so the code supports only the reading "differs from the port it would otherwise use (saved, else 8765)". doc-reconcile verifies each claim against the code before promoting it and may want that phrasing. This is not a false claim under the intended reading.
2. **[note]** `cmd/musterd/CLAUDE.md`'s startup order still lists "save-port prompt, update check, browser open". In `run`, `maybeOpenDashboard` is called before `maybeOfferSavePort`. Both only start goroutines, so the order you can observe is the same. Carried from cycle 1, no change requested.
3. **[note]** On the update-restart path, `stopSavePrompt` is not called, so an unanswered save prompt line is left without a trailing newline before `syscall.Exec`. The restarted daemon never re-asks (D9), and nothing reads stdin before the exec, so REQ-5 holds.

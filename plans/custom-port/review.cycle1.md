# Review: custom-port

**Plan**: custom-port
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, maintainability | skipped: browser
**Part verdicts**: code needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Custom Port

**Plan**: custom-port
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 22433 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `-addr` removed; `-port` 0–65535 or `default`; bad value exits before preflight naming flag and value | Yes — `parseFlags` → `portFromArg`/`parsePortFlag` right after `Parse` (`main.go:176`, `port.go:47`) | Yes — `TestParsePortFlag`, `TestParseFlags_Port`, `TestRun_InvalidPortFailsBeforePreflightAndDataDir` (D1) | pass |
| REQ-2 flag > saved > 8765, host always 127.0.0.1 | Yes — `resolvePort` (`port.go:77`), `net.JoinHostPort("127.0.0.1", …)` in `prepareServing` | Yes — `TestResolvePort` (D2–D7, D13), `TestPortProc_YesSaves…` (D3, D4) | pass |
| REQ-3 saved port in the data dir, survives restarts | Yes — `<data-dir>/port`, `atomicfile.Write` 0600 | Yes — `TestResolvePort_SavedPortIsScopedToTheDataDir`, `TestSavePort`, proc test D14 | pass |
| REQ-4 prompt iff flag given, differs, not 0, terminal, not restarted | Yes — `resolvePort.offerSave` + `maybeOfferSavePort` guards | Yes — `TestMaybeOfferSavePort_Guards`, `TestPortProc_NeverPrompts` (D5, D7, D8, D9 on a real pty/pipe) | pass |
| REQ-5 only `y`/`yes` saves; empty/EOF/other saves nothing | Partly — the prompt's own answer is parsed correctly, but an answer typed at the later `-on-exit` prompt is read by the save-port reader and saves the port (correctness Major 1) | Yes for the prompt itself (`TestOfferSavePort`, D11 proc test); no test for the shutdown interaction | fail |
| REQ-6 saving `default` clears the saved port | Yes — `savePort` removes the file for 8765 | Yes — `TestOfferSavePort_DefaultAnsweredYesClearsTheSavedPort`, `TestSavePort` | pass |
| REQ-7 daemon serves while the prompt waits | Yes — prompt on its own goroutine after `httpServer.Serve` starts | Yes — `TestPortProc_DeclineSavesNothingAndIngestIsServedWhilePromptWaits` (D12) | pass |
| REQ-8 bind failure exits non-zero, no fallback, nothing saved | Yes — `prepareServing` returns the listen error | Yes — `TestPortProc_BusyPortExitsNamingThePortAndTheFlag` | pass |
| REQ-9 bind message names the port and `-port N` | Yes — `listening on 127.0.0.1:N: …; choose another port with -port N` | Yes — same proc test | pass |
| E1 harness on `-port` | Yes — `web/e2e/helpers/daemon.ts` `buildArgs` | Full suite, 644 passed | pass |
| DIAG | `kb:diagram/containers` (updated: data dir now names the saved port — true), `kb:diagram/daemon-components` (stale: `cmd/musterd` now imports `internal/atomicfile`, no `Rel(cmd, atomicfile)` edge; correctness Major 3) | — | fail |

## Build & Tests

E2E tests: pass (644, full — harness-only scope, `make e2e SPECS=''`) · Daemon tests (race): pass (27 packages ok) · Web tests: pass (3032 in 106 files) · Render tests: pass (418) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, web lint clean) — all read from $GATES_LOG_DIR (`gates-custom-port-c1`, 0 failed lines). `WARN size` (parseFlags 53, run 45, main.go 538 lines, one test funlen) is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass |
| D1 | `make test` | pass (deduped to `make test-race`, 02-test.log) |
| D2 | `make lint` | pass (0 issues) |
| D15 | `! rg -n -- '"-addr"' cmd/ web/e2e/` | pass (22-D15.log empty, ledger PASS) |
| W1 | `make web-build` | pass |
| E1 | `make e2e` | pass (644 passed, 5.6m) |
| K1 | `make check-kb` | pass (643 records, 0 problems) |
| — | baseline gate lines (web-test, render-fixtures, render-lint, render-test, web-lint, contrast, features inventory, versions, e2e-honest, e2e-lint, features scope, comment checks, comment ledger) | all pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — #107 ticked and moved to `docs/history/todo-done.md`; both plan ADRs exist `proposed` with `refs: plan:custom-port` and match what shipped; no `deviation:` lines in the logs; both `doc-delta:` lines handled (dev-loop SKILL.md updated; `<data-dir>/port` stated in the ADR). Doc Delta sentence is imprecise (correctness Minor 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | Prompt reads exactly `Save port N for future starts? [y/N]` with N the bound port | pass | `port.go` `offerSavePort`: `"Save port %d for future starts? [y/N] "` with `serving.port` (the listener's bound port); asserted verbatim in `TestPortProc_YesSaves…` against a real subprocess on a pty |
| V2 | Startup still opens the browser on the new port's tokenised URL on a terminal | pass (code read) | `prepareServing` builds `dashboardURL` from the bound port (`http://127.0.0.1:%d/auth?token=…`); `run` passes `serving.dashboardURL` to `maybeOpenDashboard` unchanged; terminal/restart guards untouched. Not exercised in a browser (review-browser skipped, Work Type daemon) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no new Claude-Code-format knowledge in production code; the D12 test's `{"session_id":…}` body follows existing test precedent (`internal/server/*_test.go`) |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass — untouched; D12 proves ingest answers 200 while the prompt waits |
| 4 | tmux via `-L muster` / private socket | pass — proc tests reuse `openTestDaemonArgs` (`tmuxtest.Socket`) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | n/a (no dashboard change) |
| 7 | Identity on tmux target | pass (untouched) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` in tests | pass — `-claude-bin` sleep stub |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** An unanswered save prompt steals the answer to the `-on-exit ask` shutdown prompt — `cmd/musterd/port.go` `maybeOfferSavePort`/`offerSavePort` (goroutine blocked in `bufio.NewReader(stdin).ReadString('\n')` for the process lifetime) vs `cmd/musterd/onexit.go` `askKillPrompt`. Both read the same `*os.File` (`os.Stdin` from `main`); Go serialises reads on one file through the fd's read lock, so the earlier reader gets the next line. Measured with a scratch probe of the same shape (goroutine A reads stdin, B starts reading 300 ms later, one `y\n` written to the pty master): A received the line 5 of 5 runs. In musterd that means: start `musterd -port 9000` on a terminal, leave the save prompt unanswered, Ctrl-C with live sessions or shells, answer `y` to "kill them? [y/N]" → the port is saved (an answer to a question never asked, against REQ-5) and the kill prompt times out to `leave` after 10 s, so the sessions the developer asked to kill keep running (regresses kb:adr/lifecycle-shutdown-leaves-sessions-running's ask path). The impl log names the timeout half as a "known edge" but not the port being saved. A fix must make true: a line typed at the on-exit prompt is read by that prompt only, `y` there kills, and it never saves the port.
2. **[daemon-tests]** No test covers Major 1's interaction: a daemon on a pty with an unanswered save prompt, shut down with live sessions/shells under `-on-exit ask`, answering `y` — must kill and leave no `<data-dir>/port`. Add it with the fix.
3. **[orchestrator]** `kb:diagram/daemon-components` is stale — `docs/diagrams/daemon-components.md` states "Every edge is a real import, drawn from the import blocks", and `cmd/musterd/port.go` now imports `internal/atomicfile` (no `cmd/musterd` file did on `main`), but the diagram has no `Rel(cmd, atomicfile, …)`. Add the edge (e.g. "saved port").

### Minor

1. **[orchestrator]** The plan's `## Doc Delta` sentence ends "on a terminal it offers to save a flag-given port, and `-port default` clears it". Read literally, `-port default` alone clears the saved port; it does not — only answering `y` at the prompt does (REQ-6), and the offer comes only when the flag's port differs. doc-reconcile promotes the line verbatim, so it should say e.g. "…offers to save a flag-given port that differs from it, and saving `-port default` clears it".

### Notes

1. **[note]** `parsePortFlag` uses `strconv.Atoi`, so `-port +9000` and `-port 09000` are accepted as 9000. They are integers in range, so REQ-1 holds; nothing changed.
2. **[note]** `cmd/musterd/CLAUDE.md`'s startup order lists "save-port prompt, update check, browser open", but `run` calls `maybeOpenDashboard` before `maybeOfferSavePort`. Both only start goroutines, so the order you can observe is the same either way.
3. **[note]** With a corrupt saved-port file and any non-zero `-port` (including one equal to 8765), `resolvePort` offers to save. Without the flag the daemon would fail, so the flag's port does "differ" from what it would pick. This fits REQ-4 and gives the `-port default` remedy a way to clear the file.
4. **[note]** D2 (binds 8765) is tested at resolution level only (`TestResolvePort`). No test binds the real 8765, since the developer's own daemon may hold it. That is reasonable.

## Maintainability review

# Maintainability review: Custom Port

**Plan**: custom-port
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11489 words (budget 30000)
**Scope**: 3 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (`cmd/musterd/CLAUDE.md`, `cmd/musterd/main.go`, `cmd/musterd/port.go`)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/port.go | onexit.go, open.go, preflight.go, tokens.go, update.go, main.go | yes (4 lines) | none | Critical 1: second stdin reader, no owner |
| cmd/musterd/main.go | onexit.go, open.go, preflight.go, tokens.go, update.go | yes (`fset.Func` post-Parse validation, `servingEnv.offerSavePort`) | funlen `parseFlags` 48→53, reason contradicted; funlen `run` 44→45, reason holds; filelen 518→538, reason holds | Major 1 |
| cmd/musterd/CLAUDE.md | (package brief; no siblings) | n/a | none | pass |

## Issues

### Critical
1. **[daemon-impl]** Two goroutines read the same terminal stdin and nothing owns it, so the answer to the `-on-exit` kill prompt goes to the save-port prompt. `cmd/musterd/port.go:113-120`: `maybeOfferSavePort` starts `offerSavePort`, which blocks in `bufio.NewReader(stdin).ReadString('\n')` with no context and no way to end it. `cmd/musterd/onexit.go:154-156`: `askKillPrompt` later starts a second `bufio.NewReader(stdin)` on the same `*os.File`.
   The interleaving: the developer runs `musterd -port 9000` on a terminal, ignores "Save port 9000 for future starts? [y/N]", and presses Ctrl-C with live sessions. `shutdownGracefully` prints "… kill them? [y/N]" and the developer types `y`. The first reader, which is still blocked, gets the `y`. `offerSavePort` takes it as "yes, save port 9000", writes `<data-dir>/port` and logs "port saved for future starts". `askKillPrompt` times out after 10 s and returns `leave`. So one keystroke saves a port the developer never agreed to save and leaves the sessions they asked to kill.
   - Measured with a stand-alone copy of the two reader shapes under a pty (`/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/904cb417-7c40-449a-bd0a-daee7872e60f/scratchpad/stdinrace/`). The first reader starts, the second starts 300 ms later, and the test types `y\n`. It went the same way in all 5 runs:
     ```
     0 ['SAVE-PROMPT reader got "y"', 'KILL-PROMPT timed out -> leave']
     … (runs 1–4 identical)
     ```
   - Decisions names this as a "known edge" that "times out into `leave` (the safe default)". That describes only half the effect: it leaves out the unrequested port save.
   - The `design:` line says "no sharing across goroutines", but that refers to the `offerSavePort` bool. Stdin is the state actually shared, and no `design:` line names it.
   - Cites `docs/conventions.md` § Design "Shared state names its writers and its guard" and "One owner per concept". Also § Go: "`context.Context` is the first parameter of anything that blocks … or should die on shutdown — nothing ignores ctx". The sibling `maybeOpenDashboard`/`openDashboard` (`main.go:505`, `open.go:22`) takes `ctx` for its goroutine; `maybeOfferSavePort` does not.
   - A fix must make these true:
     - Stdin has one reader at a time.
     - A line typed while the `-on-exit` prompt is showing reaches `askKillPrompt` and never `offerSavePort`. The reverse holds too.
     - The save prompt's read is over before shutdown reads stdin.
     - A `design:` line names stdin as shared and says what guards it.

### Major
1. **[daemon-impl]** The size-warning reason for `parseFlags` is false. Decisions says "`parseFlags` (48 statements) was already over 40 and my change is statement-neutral". The gates' size log says `cmd/musterd/main.go:115:6: Function 'parseFlags' has too many statements (53 > 40)`. `golangci-lint run --enable-only funlen ./cmd/musterd/` on a `git archive main` copy says `(48 > 40)`. So the change adds 5 statements: `var portArg`, the `fset.Func` callback body, and the `portFromArg` call with its error check and assignment, at `main.go:142-180`. Cites the review rule for size warnings (a reason the code contradicts is a Major) and kb:adr/process-size-linters-warn-never-fail. A fix must make the Decisions reason for `parseFlags` true for the code as it stands, or restructure `parseFlags`. A split made only to silence funlen does not count.

### Minor

### Notes
1. **[note]** This branch adds an import edge from `cmd/musterd` to `internal/atomicfile` (`port.go:15`). `kb:diagram/daemon-components` draws `atomicfile` only from `claudecode`, `server` and `selfupdate`. That is review-work's DIAG row.
2. **[note]** Reuse check (`rg`):
   - `"y", "yes"` appears at `cmd/musterd/onexit.go:162` and `cmd/musterd/port.go:122`.
   - `ReadString('\n')` appears at `onexit.go:155` and `port.go:120`.
   - `65535` and `8765` appear only in `port.go` and the `-port` usage text.
   - Other `atomicfile.Write` callers: `internal/selfupdate/apply.go:216`, `internal/claudecode/settings.go:373`, `internal/server/launcher.go:621`.

   No second implementation of the port logic exists. The yes-parse is three lines copied from `askKillPrompt`, which the `design:` line says was on purpose. If Critical 1's fix gives stdin a single reader, that reader is the natural home for the yes-parse too.
3. **[note]** The default port 8765 and the `"default"` word are constants in `port.go:19-20`, and the `-port` usage string at `main.go:144` repeats both as literals. That is the same shape as `-on-exit`'s usage repeating `ask` (`main.go:152`), so it matches the siblings. Still, changing `defaultPort` would leave the usage text out of date.
4. **[note]** Putting the saved-port file logic in `cmd/musterd` rather than `internal/` matches `tokens.go`, which also owns a data-dir file (`writeTokensFile`). Decisions gives a good reason for using a file instead of a kv row: `store` has no delete, and clearing the port needs one.
5. **[note]** `run` funlen 44→45 and `main.go` length 518→538: the reasons in Decisions hold. Each is one call beside `maybeOpenDashboard`, and both functions were already over the threshold on `main`. Decisions says 535 lines; the gate measured 538. `main_test.go`'s `TestBuildServerConfig_…` funlen warning was already there on `main`.

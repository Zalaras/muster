# Correctness review: Custom Port

**Plan**: custom-port
**Verdict**: needs-changes
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

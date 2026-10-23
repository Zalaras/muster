# Review: custom-port

**Plan**: custom-port
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, maintainability | skipped: browser
**Part verdicts**: code approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Custom Port

**Plan**: custom-port
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 22437 words (budget 30000)

This is a full cycle, not a delta re-review: cycle 2's open finding was a Major (maintainability Major 1), not only Minors. The tree changed in one commit since cycle 2's review (`git diff 30326e48..HEAD`), which is wave 1's `02614e32`. It touches three files: `cmd/musterd/stdin.go`, `port.go` and `onexit.go`. I read that diff in full against the plan. Everything else is byte-identical to the tree I approved in cycle 2, so the cycle-2 findings below carry forward, re-checked against this cycle's gate run.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `-addr` removed; `-port` takes 0–65535 or `default`; a bad value exits before preflight, naming the flag and the value | Yes, unchanged since cycle 2. `parseFlags` → `portFromArg`/`parsePortFlag` | Yes. `TestParsePortFlag`, `TestParseFlags_Port`, `TestRun_InvalidPortFailsBeforePreflightAndDataDir` | pass |
| REQ-2 order is flag, then saved port, then 8765; host is always 127.0.0.1 | Yes, unchanged. `resolvePort`, `prepareServing` | Yes. `TestResolvePort`, proc tests | pass |
| REQ-3 saved port lives in the data dir and survives restarts | Yes, unchanged. `<data-dir>/port` is written by `atomicfile.Write` with mode 0600 | Yes. `TestSavePort`, `TestResolvePort_SavedPortIsScopedToTheDataDir`, proc D14 | pass |
| REQ-4 prompt only when the flag is given, the port differs, it is not 0, stdin is a terminal and the daemon did not restart | Yes, unchanged. The guards are in `maybeOfferSavePort` | Yes. `TestMaybeOfferSavePort_Guards`, `TestPortProc_NeverPrompts` | pass |
| REQ-5 only `y`/`yes` saves; empty, EOF or anything else saves nothing | Yes. The yes rule now lives once, in `(*lineInput).confirm` (`stdin.go:58`): case-insensitive `y`/`yes` after `TrimSpace`. Any other answer, or a read that gave up, returns false. `offerSavePort` returns early on false (`port.go:127`). The single-reader fix from cycle 1 has not changed (`readLine`/`take` untouched) | Yes. The `TestOfferSavePort` table (15 rows) still asserts the exact prompt bytes and that each non-yes answer saves nothing. The `askKillPrompt` tables (`main_test.go:104`, `onexit_test.go:484`) exercise the same `confirm` through the kill prompt. `TestSavePromptThenKillPrompt_OneTerminalOneReader` and the `TestPortProc_ShutdownAskPrompt…` proc test still pass | pass |
| REQ-6 saving `default` clears the saved port | Yes, unchanged | Yes. `TestOfferSavePort_DefaultAnsweredYesClearsTheSavedPort` | pass |
| REQ-7 daemon serves while the prompt waits | Yes, unchanged. The prompt runs on its own goroutine after `Serve` | Yes. D12 proc test | pass |
| REQ-8 bind failure exits non-zero, with no fallback and nothing saved | Yes, unchanged | Yes. `TestPortProc_BusyPortExitsNamingThePortAndTheFlag` | pass |
| REQ-9 bind message names the port and `-port N` | Yes, unchanged | Yes. Same proc test | pass |
| E1 E2E harness uses `-port` | Yes, unchanged. `buildArgs` in `web/e2e/helpers/daemon.ts` | E2E sweep: 644 passed | pass |
| DIAG | `kb for cmd/musterd/stdin.go` names `kb:diagram/daemon-components`. `confirm` adds only a `fmt` import (stdlib), so the package graph is unchanged and the `Rel(cmd, atomicfile, "saved port")` edge is still true. `onexit.go` dropped `strings` (stdlib) | — | pass |

## Build & Tests

E2E tests: pass (644, full suite; the scope is harness-only, so `SPECS=''` runs everything). Daemon tests (race): pass (every package ok; `cmd/musterd` took 92.3 s). Web tests: pass (3032 in 106 files). Render tests: pass (418). Daemon build: pass. Web build: pass. Lint: pass (golangci-lint 0 issues; web lint clean). All of these come from `$GATES_LOG_DIR` (`gates-custom-port-c3`, 0 failed lines). The `WARN size` line (`run` 47, `main.go` 540 lines, two test funlens; unchanged from cycle 2) belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (01-build.log is empty, exit 0) |
| D1 | `make test` | pass (deduped to `go test -race -count=1 ./...`, 02-test.log) |
| D2 | `make lint` | pass (03-lint.log, 0 issues) |
| D15 | `! rg -n -- '"-addr"' cmd/ web/e2e/` | pass (22-D15.log is empty) |
| W1 | `make web-build` | pass (04-web-build.log) |
| E1 | `make e2e` | pass (21-e2e.log, 644 passed, 5.7m) |
| K1 | `make check-kb` | pass (14-kb-check.log: 643 records, 0 problems) |
| — | baseline gate lines: web-test, render-fixtures (106 scenarios), render-lint, render-test, web-lint, contrast (0 failures in all three themes), features inventory, versions, e2e-honest, e2e-lint, features scope, comment checks, comment ledger, e2e-level census | all pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Nothing under `docs/` or `TODO.md` changed this cycle. Cycle 2's Note 1 wording is applied in `doc-delta.md`: "a flag-given port that differs from the one it would otherwise use". The code supports this exactly (`resolvePort.offerSave`; with nothing saved, `-port 8765` does not prompt). The fix log has no `deviation:` or `doc-delta:` lines. Its `design:` decision (`confirm` lives on `lineInput`) is not a deviation from the plan and needs no ADR |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | Prompt reads exactly `Save port N for future starts? [y/N]`, with N the bound port | pass | `port.go:127` passes `fmt.Sprintf("Save port %d for future starts? [y/N] ", port)` to `confirm`, which prints it with `fmt.Fprint` unchanged. `TestOfferSavePort` asserts the whole stderr equals that string |
| V2 | Startup still opens the browser on the new port's tokenised URL when on a terminal | pass (code read) | `maybeOpenDashboard` has not changed since cycle 2, and the open path never reads stdin. Not exercised in a browser because review-browser was skipped (Work Type daemon) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The change is in `cmd/musterd` and adds no Claude-Code-format knowledge |
| 2 | No terminal-output state parsing | pass. `confirm` reads the developer's answer from stdin; it never reads pane output |
| 3 | Non-blocking hook handler | pass (untouched) |
| 4 | tmux via `-L muster` / private socket | pass (no new tmux invocation) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | n/a (no dashboard change) |
| 7 | Identity on tmux target | pass (untouched) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` in tests | pass (no test change this cycle; proc tests use the `-claude-bin` stub) |

## Delta (delta re-review only)

n/a. This is a full cycle. Cycle 2's code finding, checked here:

| Prior finding | Fix commit | Verified how |
|---------------|------------|--------------|
| cycle 2 maintainability Major 1 `[daemon-impl]` the save prompt and the kill prompt are two copies of the y/N routine | `02614e32` | Diff read. `(*lineInput).confirm` prints the prompt, reads one line through the single reader, prints a newline when the read gives up, and accepts only `y`/`yes` case-insensitively. Both callers now delegate to it and each keeps its own prompt text and ctx: `offerSavePort` uses the run's cancel-on-shutdown ctx, and `askKillPrompt` uses the 10 s `WithTimeout`. The only ordering change is that `askKillPrompt` now creates its timeout ctx before printing rather than after, and nobody can observe that. `rg '"y", "yes"' cmd internal` now finds one hit, `stdin.go:66`. No behaviour change: the prompt-text, answer-table and EOF tests for both prompts pass unchanged |
| cycle 2 correctness Note 1 `[note]` Doc Delta "differs from it" wording | `doc-delta.md` | Applied: "differs from the one it would otherwise use" |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `confirm` has no direct unit test of its own. It is covered through both callers' answer tables (`TestOfferSavePort`, `TestAskKillPrompt_*`), which together cover every branch: yes, no, empty, EOF and a cancelled read through `TestSavePromptThenKillPrompt_OneTerminalOneReader`. No change requested.
2. **[note]** Carried from cycles 1–2: `cmd/musterd/CLAUDE.md` lists the startup order as "save-port prompt, update check, browser open", but `run` calls `maybeOpenDashboard` before `maybeOfferSavePort`. Both only start goroutines, so the order you can observe is the same. No change requested.
3. **[note]** Carried from cycle 2: on the update-restart path, an unanswered save prompt is left without a trailing newline before `syscall.Exec`. The restarted daemon never asks again (D9), and nothing reads stdin before the exec, so REQ-5 holds.

## Maintainability review

# Maintainability review: Custom Port

**Plan**: custom-port
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 11493 words (budget 30000)
**Scope**: 5 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (`cmd/musterd/CLAUDE.md`, `cmd/musterd/main.go`, `cmd/musterd/onexit.go`, `cmd/musterd/port.go`, `cmd/musterd/stdin.go`). This is a full review, not a delta: cycle 2 left a Major open.

## Cycle 2 findings

| Cycle 2 finding | Fix commit | Verified how |
|-----------|-----------|---------------|
| Major 1: the save-port prompt and the kill prompt were two copies of the "ask y/N" routine | 02614e32 | `stdin.go:58` adds `(*lineInput).confirm(ctx, stderr, prompt) bool`. It prints the prompt, reads one line through `readLine`, prints a newline when the read gives up, and accepts only `y`/`yes` (case-insensitive). `askKillPrompt` (`onexit.go:148-157`) and `offerSavePort` (`port.go:126-140`) both call it. Each keeps its own prompt text and its own ctx (a 10s `WithTimeout` for the kill prompt, cancel-on-shutdown for the save prompt), and each does its own thing with the answer. `rg -n '"y", "yes"' cmd internal --glob '*.go'` finds one line: `cmd/musterd/stdin.go:66`. `rg -n 'confirm\(' cmd` finds the definition and the two callers (`onexit.go:153`, `port.go:127`). Fix Attempt 3 in Decisions adds a `design:` line that names `confirm` as the shared routine and pastes its reuse grep. The gate test line (`go test -race -count=1 ./...`) gives `ok … cmd/musterd 92.255s`. Resolved. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/stdin.go | onexit.go, port.go, open.go, main.go | yes (`lineInput` owner and guard; `confirm` as the one y/N routine) | none | pass |
| cmd/musterd/port.go | onexit.go, stdin.go, open.go, tokens.go, main.go | yes | none | pass |
| cmd/musterd/onexit.go | stdin.go, port.go, main.go | yes (covered by the `lineInput` and `confirm` lines) | none | pass |
| cmd/musterd/main.go | onexit.go, open.go, port.go, preflight.go | yes | funlen `parseFlags` 53 (48 on main), reason holds; funlen `run` 47 (44 on main), reason holds; filelen 540 (518 on main), reason holds | pass |
| cmd/musterd/CLAUDE.md | (package brief; no siblings) | n/a | none | pass |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** The first `design:` line in `daemon-implementation.md` § Decisions still says "The prompt copies `askKillPrompt`'s shape". Fix Attempt 3's `design:` line replaced that: both prompts now share `lineInput.confirm`. Decisions is a log written one fix attempt at a time, so the later line wins. Still, a newcomer who reads only the first line would get the wrong picture. Not filed: this is the log, not code.
2. **[note]** Cycle 2 note 1 still holds. The `stop` that `maybeOfferSavePort` returns is called only on the signal exit (`main.go:323`). The restart exit (`main.go:318-320`) and the serve-error exit (`main.go:304-308`) end the prompt through `run`'s `defer cancel()` and do not wait for its goroutine. This is cosmetic: on restart, an abandoned prompt line may have no line ending. The goroutine shares no state with the restart.
3. **[note]** Cycle 2 note 2 still holds. `lineInput` (`stdin.go:12-17`) and `confirm` have no doc comment, and in the struct `mu` sits between `reader`, which it does not guard, and `pending`, which it does. The `design:` line names the guard, which is what § Design "Shared state names its writers and its guard" asks for. Code comments belong to the comment pass (kb:adr/process-comment-pass-owns-code-comments). `askKillPrompt`'s doc comment (`onexit.go:141-146`) still says it "reads one line from stdin, racing a 10s timeout". That is still true in effect, since the race is now a ctx timeout inside `confirm`.
4. **[note]** Cycle 2 notes 3, 5 and 6 still hold:
   - `run` checks `isTerminal(stdin)` twice in a row (`maybeOpenDashboard` and `newLineInput`), and a `design:` line explains why.
   - The `cmd→atomicfile` diagram edge is drawn.
   - The `-port` usage text repeats its literals the way `-on-exit` does.
   - The port file logic matches `tokens.go`.
5. **[note]** Test-file size warnings, which are outside my diff and are not `dupl` hits:
   - `cmd/musterd/port_proc_test.go:286` is 64 lines against a limit of 60.
   - `cmd/musterd/main_test.go:164` is 67 lines against a limit of 60.

   They belong to review-work if anyone's.

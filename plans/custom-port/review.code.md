# Correctness review: Custom Port

**Plan**: custom-port
**Verdict**: approved
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

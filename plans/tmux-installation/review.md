# Review: tmux-installation

**Plan**: tmux-installation
**Cycle**: 1
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 tmux preflight before data dir / listen; failure to run is fatal | Yes — `internal/tmux/preflight.go:103`, called at `cmd/musterd/main.go:122` after logger, before `checkWebDist`/`MkdirAll`/`Listen` | Yes — `TestPreflight_NotFoundOnPath`, `TestPreflight_FoundButFailsToRun`, `TestPreflight_HangingTmuxIsBoundedAndFatal`, `TestRun_FailedPreflightLeavesNoSideEffects` | pass |
| REQ-2 reject tmux older than 3.2, justification cited | Yes — `MinVersion` + doc comment citing `new-session -e` / `set-option -as terminal-features` (`internal/tmux/preflight.go:16-20`) | Yes — `TestMinVersion`, `TestPreflight_TooOld`, `TestPreflight_ExactlyMinVersionIsOK` | pass |
| REQ-3 unparsable `tmux -V` is a warning, not fatal | Yes — `StatusUnrecognized`, `runTmuxPreflight` returns nil error | Yes — `TestPreflight_UnrecognizedVersionIsNotFatal`, `TestRunTmuxPreflight_UnrecognizedVersionIsNotFatal` | pass |
| REQ-4 version knowledge lives in `internal/tmux` | Yes — no literal, no parsing, no minimum in `cmd/` | Yes — `TestParseVersion`/`TestParsedVersion_Less` run against `internal/tmux`'s exported surface (D6); reviewer grep below (R2) | pass |
| REQ-5 `-version` succeeds with no tmux | Yes — early return at `main.go:98`, preflight at `:122` | Yes — `TestRun_VersionFlagSucceedsWithTmuxAbsent` | pass |
| REQ-6 `-open` default true; fires iff flag **and** terminal stdin | Yes — `main.go:226` `if *openFlag && isTerminal(stdin)` | Yes — `TestOpen_DefaultOpenWithTerminalStdinRunsStubOnce`, `TestOpen_OpenFalseNeverRunsStub`, `TestOpen_DefaultOpenWithDevNullStdinNeverRunsStub` | pass |
| REQ-7 `-open-cmd` test seam, default `open` | Yes — `main.go:86` | Yes — every `open_test.go` test drives it | pass |
| REQ-8 auto-open never blocks startup/shutdown; bounded 10 s; failure warns | Yes — `cmd/musterd/open.go:21-29`, goroutine + `context.WithTimeout` | Yes — `TestOpen_NonexistentOpenCmdStillReachesServingState` | pass |
| REQ-9 `isCharDevice` → `isTerminal` on go-isatty; `-on-exit=ask` consults it | Yes — `main.go:429` and `main.go:442-447` | Yes — `TestIsTerminal` (5 subtests incl. the `/dev/null` regression and a real pty), `TestResolveOnExit_AskWithNonTTYStdinIsLeave` | pass |
| REQ-10 E2E harness passes `-open=false` | Yes — `web/e2e/helpers/daemon.ts:393` | Yes — exercised by all 16 spec files' spawns | pass |
| REQ-11 `onexit_test.go` spawns pass `-open=false` | Yes — `onexit_test.go:158` in the shared `spawnDaemon` arg list (all three spawns) | n/a (is a test) | pass |
| REQ-12 README Prerequisites + full Install story; remedy byte-identical | Yes — `README.md:49-93` | Yes — `TestReadmeTmuxRemedyMatchesPreflight`; reviewer measurement (R1/R7) | pass |
| REQ-13 nothing printed on all-clear; version on the starting log line | Yes — `runTmuxPreflight` returns early on `StatusOK`; `Str("tmux", preflight.Version)` at `main.go:219` | Yes — `TestRunTmuxPreflight_OKPrintsNothing`; reviewer measurement (R3) | pass |
| REQ-14 report names the resolved absolute path | Yes — `PreflightResult.Path` from `exec.LookPath`, printed on the too-old and found-but-broken rows | Yes — `TestPreflight_FoundButFailsToRun`, `TestPreflight_TooOld` assert `got.Path` | pass |
| REQ-15 `kill()` warns on the 5 s SIGKILL escalation | Yes — `web/e2e/helpers/daemon.ts:465-473` | Structural; verified silent across two full suite runs (R6) | pass |
| REQ-16 dev-loop SKILL notes `-open` | Yes — `.claude/skills/dev-loop/SKILL.md:30-34` | n/a | pass |
| REQ-17 remedy distinguishes not-installed from too-old | Yes — `brew install tmux` vs `brew upgrade tmux` | Yes — `TestRunTmuxPreflight_NotFoundReportsInstallRemedy`, `TestRunTmuxPreflight_TooOldNamesDetectedAndMinimum` | pass |

## Build & Tests

E2E tests: **pass** (174/174, `make e2e` from a clean `web-build build`; a prior `npm run e2e` sweep also 174/174)
Daemon tests: **pass** (`make test`, all 12 packages `ok`)
Web tests: **pass** (606 tests in 21 files, Vitest)
Daemon build: **pass** (`go build ./...` exit 0; `go vet ./...` exit 0)
Web build: **pass** (`npm run build` — `tsc --noEmit` + Vite)
Lint: **pass** (`make lint` — "0 issues."); `gofmt -l .` empty, `gofmt -d` on all nine changed Go files empty

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass — every package `ok`, gate for D1–D12 |
| D2 | `make lint` | pass — `0 issues.` |
| D3 | `go build ./...` | pass — exit 0 |
| D13 | `rg -q "brew install tmux" README.md` | pass — `README.md:55` |
| E1 | `rg -q -e "-open=false" web/e2e/helpers/daemon.ts` | pass — `daemon.ts:393` |
| E2 | `make e2e` | pass — `174 passed (42.7s)` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | README remedy and preflight remedy are the **same string** | pass | Ran a scratch `musterd` with `PATH` set to an empty dir; `od -c` of stderr gives the remedy bytes `brew install tmux` (no trailing punctuation, no wrapping). `README.md:55` carries `brew install tmux` verbatim. Both derive from / quote `tmuxInstallRemedy` (`cmd/musterd/preflight.go:49`). |
| R2 | `cmd/musterd` holds no tmux version knowledge | pass | `rg -n "3\.2\|MinVersion\|ParseVersion\|versionPattern" cmd/` returns 6 hits: 3 in `preflight.go` (one prose comment, two `tmux.MinVersion` interpolations) and 3 in `preflight_test.go` (two prose, one `tmux.MinVersion.String()`). No literal `3.2`, no parsing, no comparison in `cmd/`. |
| R3 | Nothing printed on all-clear; version on the starting log line | pass | Real tmux 3.7b, scratch data dir: stderr contains **no** `musterd preflight` block at all, and the starting line reads `… dashboard_url=… data_dir=… port=63790 tmux=3.7b version=dev`. |
| R4 | Auto-open adds no new log line carrying the UI token | pass | Drove musterd under a real pty stdin (Python `pty.openpty()` as the child's fd 0) with a recording `-open-cmd` stub. The stub fired **once** with exactly the `dashboardUrl` from `tokens.json`; `grep -c "$uiToken"` over musterd's full stderr = **1**, the pre-existing `dashboard_url` field on `musterd starting`. `openDashboard` logs only `open_cmd` + `err`. |
| R5 | `go.sum` unchanged | pass | `git diff main...plan/tmux-installation -- go.sum \| wc -l` = **0**. `go.mod` moves `github.com/mattn/go-isatty v0.0.24` indirect → direct, nothing else. |
| R6 | Graceful SIGTERM teardown, no `kill()` escalation | pass | Two full suite runs (174 tests each, incl. every live-session teardown in `terminal/sessions/views/actions`): `grep -c "did not exit within 5s\|escalating to SIGKILL"` = **0** on both. Directly: `TestOnExit_AskWithNonTTYStdinBehavesAsLeave` (live tmux session, `-on-exit=ask`, non-TTY stdin) completes in **0.81 s**, and its own `elapsed < 5s` assertion holds. |
| R7 | README Prerequisites leads with tmux; Install covers arch/destination/quarantine/verification | pass | Read `README.md:49-93`. Prerequisites' first bullet is **tmux 3.2 or newer** (then macOS, then Claude Code). Install covers: arch choice (`uname -m`: `x86_64` → amd64, `arm64` → arm64, both archive names given), destination (`mv musterd ~/.local/bin/musterd`), quarantine (`xattr -d com.apple.quarantine`), verification (`musterd -version`). |

### The plan's hard condition — "no test run may open a browser"

Verified the guarantee is where the plan puts it and was **not** weakened to flag-only:

- `cmd/musterd/main.go:226` is `if *openFlag && isTerminal(stdin)` — both conjuncts, terminal condition included.
- `main()` passes the real `os.Stdin` (`main.go:54`), so the condition is on the process's actual fd 0.
- `TestOpen_DefaultOpenWithDevNullStdinNeverRunsStub` (D9b) is the regression test: `-open` left at its **true default**, `cmd.Stdin` nil (`/dev/null`), stub never runs.
- The flags are additive belt: `daemon.ts:393` and `onexit_test.go:158` both pass `-open=false`, and both files' comments name themselves as defence in depth.
- No production path branches on being under test; `-open-cmd` follows `-claude-bin`'s seam pattern exactly.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no Claude-Code-format knowledge added anywhere; `checkClaudeCode` untouched |
| 2 | No terminal-output state parsing | pass — no `capture-pane`, no pane text read; version comes from `tmux -V` stdout, which is not session state |
| 3 | No blocking hook handler / >2 s hook timeout | pass — plan touches no hook path |
| 4 | No bare tmux | pass — `internal/tmux/preflight.go:112` execs `tmux -V` with no socket flag; **measured**: `tmux -V` neither starts nor contacts a server (`/private/tmp/tmux-501/default` still absent after running it, `tmux -L muster ls` unchanged). Every other tmux call still goes through `Client.run`'s `socketFlag()`. Test helpers use a private `-S <t.TempDir()>` socket (`open_test.go:71-72`). No `resize-pane` added. |
| 5 | No payload logging | pass — new log fields are `tmux` (a version string) and `open_cmd` (a program name) |
| 6 | No empty-gauge dishonesty | pass — no UI; and REQ-3 deliberately renders an unknown version as *unrecognised … assuming 3.2 or newer* rather than guessing |
| 7 | Session identity on tmux target | pass — untouched |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — no test or fixture invokes it; `open_test.go` daemons never launch a session |

## Manual Verification

The plan ships no DOM (`Testable UI Elements: None`), so there is no browser surface to drive. The user-facing surface this plan adds is `musterd`'s own stderr and its auto-open behaviour, and I drove all of it by hand against a freshly built `go build -o <scratch>/musterd ./cmd/musterd`, in scratch `-data-dir`/`-web-dist` trees under `mktemp -d` (all removed; `-tmux-socket muster-review`, never the default server, and no session was ever launched so no socket was created):

1. **tmux absent** (`PATH` = an empty temp dir): exit 1, stderr exactly

   ```
   musterd preflight
     x tmux    not found in $PATH
   musterd: tmux is required - Muster runs every session in tmux. Install it with: brew install tmux
   ```

   confirmed byte-by-byte with `od -c`. The data dir was **not** created (D4).
2. **All-clear** (real tmux 3.7b, `/dev/null` stdin): no `musterd preflight` block printed at all; `musterd starting` carries `tmux=3.7b`; exactly one stderr line contains the UI token (the pre-existing `dashboard_url`). SIGTERM → exit 0.
3. **Auto-open firing for real**: spawned musterd with a genuine pty as fd 0 and `-open-cmd` pointed at a recording stub. The stub was invoked **once**, with the single argument `http://127.0.0.1:63811/auth?token=…`, identical to `tokens.json`'s `dashboardUrl`. musterd's own output still carried the token on exactly one line.
4. **`tmux -V` server-safety**: listed tmux sockets before and after; no server started, default socket still absent.

Not verified by me and not verifiable here: the real macOS `open` actually raising a browser window (the stub stands in for it by design, and Edge Cases 7/8 already make any `open` failure a warning-only path).

## Issues

### Critical

None.

### Major

1. **[orchestrator]** Doc upkeep is still outstanding and is the plan's own assignment to Completion, not to any impl agent — listing it so the Doc-Upkeep Backstop acts on it. Does **not** block approval. Three items, verbatim from the plan's Implementation Notes: tick both `TODO.md` "Reported issues (pre-v1 release)" entries (#2 and #4) keeping their full markdown links intact; add a `SPEC.md` changelog entry (tmux is a preflighted hard dependency with a stated 3.2 minimum; the dashboard auto-opens by default; `isCharDevice` was not a TTY check — `/dev/null` is a character device, measured 2026-08-31); and `/land` with `closes #2` / `closes #4`. `docs/protocol.md` correctly needs nothing — the plan adds no protocol delta and the diff does not touch it.

### Minor

1. **[daemon-impl]** The plan's UI spec illustrates a **blank line** between the report block and the `musterd:` verdict line for both fatal cases; the implementation prints none. Measured with `od -c`: `… $PATH \n m u s t e r d :` — the two run together. `cmd/musterd/preflight.go:33,42` — add a trailing `fmt.Fprintln(stderr)` on the two fatal paths (not on the warning path, which has no verdict line following it).
2. **[daemon-impl]** The too-old remedy `brew upgrade tmux` is an inline literal inside `fmt.Errorf` at `cmd/musterd/preflight.go:33`, while the install remedy is the `tmuxInstallRemedy` const carrying a "README quotes this byte-for-byte, keep in sync by hand" comment. Both strings are quoted by README, so both deserve the same single source — promote it to a `tmuxUpgradeRemedy` const and have `TestReadmeTmuxRemedyMatchesPreflight` assert against the const rather than its own re-typed literal (`preflight_test.go:150`).
3. **[daemon-impl]** `cmd/musterd/preflight.go:33` calls `fmt.Errorf` with a constant string and no format verbs — `errors.New` is the right call there (the sibling at `:42` genuinely formats).
4. **[daemon-impl]** Two README prose inaccuracies. `README.md:92-93`: "the tmux preflight above only runs once musterd actually starts serving" — it does not; it runs at startup *before* the data dir is created and before the port is bound, which is the whole point of D4. Say "only runs when musterd actually starts" instead. `README.md:53`: "— same as the note below:" dangles; what follows is the remedy fence itself, not a note.
5. **[daemon-impl]** `internal/tmux/preflight.go:17` — "NewSession **above** uses …". `NewSession` and `applyServerOptions` are in `tmux.go`, not above this declaration in this file. (The function names themselves are correct — `applyServerOptions` at `tmux.go:148` is right, and it is the plan's own `serverOptions` that was loose.)
6. **[e2e-specs]** `web/e2e/helpers/daemon.ts:420` still asserts `stdin "ignore" (=/dev/null) is never a character device`. That is precisely the falsehood REQ-9 exists to correct: `/dev/null` **is** a character device (measured `mode=Dcrw-rw-rw-`), it is simply not a terminal — and the old `isCharDevice` believing otherwise is why every scratch daemon was being SIGKILLed. The comment now sits two lines below this plan's own new `-open=false` comment and contradicts the plan's premise. Reword to "stdin `ignore` (= `/dev/null`) is never a *terminal*".

### Notes

1. **[note]** `plans/tmux-installation/daemon-implementation.md`'s manual-verification block for D1 and D2 shows the report and the `musterd:` line separated by a blank line. The real output has no blank line (measured above, Minor 1) — so that "paste" was reconstructed from the plan's spec rather than captured from the run. Everything else in that log that I re-measured (D4's absent data dir, R3's clean all-clear, R4's single token line, R5's zero-line `go.sum` diff, D8's single stub invocation) checked out exactly as written, so this reads as one transcription slip rather than a pattern — recorded because CLAUDE.md asks for pasted output, not retyped output.
2. **[note]** `internal/tmux.MinVersion` is an exported `var` rather than a `const` (a struct cannot be `const`), so it is technically package-level mutable state under `docs/conventions.md` § Go. It is constant in practice, never written, and `TestMinVersion` pins its value. Accepted as-is; flagging only so a future reviewer does not re-open it.
3. **[note]** `Preflight` classifies a bare `tmux 3` (digits with no dot) as `StatusUnrecognized`, i.e. a warning that lets startup proceed. No real tmux has ever shipped such a `-V` string, and REQ-3's "cannot prove an unrecognised build is too old" reasoning covers it, so this is the right default — but it does mean a hypothetical `tmux 2`-style build would pass the gate with a warning rather than be rejected. `internal/tmux/preflight_test.go:33` pins the behaviour deliberately.
4. **[note]** `openDashboard` takes `run`'s cancellable `ctx`, so a hung `-open-cmd` is torn down by `defer cancel()` on `run`'s return as well as by its own 10 s bound — belt and braces for Edge Case 9. Worth remembering if the auto-open call is ever moved earlier than `ctx`'s construction.

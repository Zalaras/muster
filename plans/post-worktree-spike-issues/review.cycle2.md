# Review: post-worktree-spike-issues

**Plan**: post-worktree-spike-issues
**Cycle**: 1
**Verdict**: needs-changes

One agent-tagged Minor blocks approval. Everything else is clean: 9/9 authored checks pass,
the full 281-test E2E suite passes, all nine hard rules are clean, and every Reviewer-Verified
criterion holds. The Minor is a one-phrase correction to the rule REQ-10 exists to transmit,
which the plan's own REQ-2 test contradicts.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 — `WaitDelay` on every pipe-owning `exec.CommandContext` | Yes (7 files) | D5 + existing suites | pass |
| REQ-2 — `InstalledVersion` bounded against a descendant holding stdout | Yes | `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup` | pass |
| REQ-3 — same for `tmux.Preflight`'s `runCommand` | Yes | `TestRunCommand_DescendantHoldingStdoutDoesNotHang` | pass |
| REQ-4 — failed `start()` leaves nothing behind | Yes | `make e2e-fixture-leak-check` (W1) | pass |
| REQ-5 — rejection keeps its diagnostic + captured output | Yes | asserted in the self-test | pass |
| REQ-6 — E7 gates ⌥⌘1 on rail DOM order | Yes | `views.spec.ts` E7, 5× + 2 full sweeps | pass |
| REQ-7 — takeover test reads the repaint before writing | Yes | D11 5/5 + D4 discrimination proof | pass |
| REQ-8 — `cmd/musterd` bound derived, arithmetic written down | Yes | D10 5/5 | pass |
| REQ-9 — one stub `claude` per package run | Yes | verified by grep; D10 5/5 | pass |
| REQ-10 — `docs/conventions.md` states the rule | Yes | reviewer-read | pass, with Minor 1 |
| REQ-11 — drift guard (Nice to Have) | No — deliberate | n/a | accepted (see Notes 3) |
| REQ-12 — `musterdBinOverride` option field | Yes | W6/W7 reviewer-verified | pass |

## Build & Tests

E2E tests: **pass** (281 passed, 1.2m — full suite, my own independent sweep; E1's gate sweep
passed a second time)
Daemon tests: **pass** (`make test`, 14 packages; D10 `cmd/musterd` 5/5, D11 `internal/server` 5/5)
Web tests: **pass** (Vitest, 1053 tests / 29 files)
Daemon build: **pass** (`go build ./...` via `make check` and E2's `make build`)
Web build: **pass** (`npm run build` via E2's `make web-build`)
Lint: **pass** (`golangci-lint run`, 0 issues; `make contrast` and `make e2e-lint` also green
inside `make check`)

`test-specs.md` has no `## Repairs` table (E2E Scope is `harness-only`; no spec was authored,
so no repair cycle ran). No `test.skip` / `test.fixme` / `.only` and no weakened assertion
appears anywhere in `git diff main...HEAD` — checked mechanically over `web/e2e`, `cmd/` and
`internal/`.

## Acceptance Checks

Run fresh via `.claude/skills/orchestrate/scripts/gates.sh post-worktree-spike-issues --checks-only`
(9 lines, 0 failed).

| ID | Command | Result |
|----|---------|--------|
| D1 | `make check` | pass |
| D5 | `WaitDelay` present in all seven named files | pass |
| D6 | `git diff --quiet main -- internal/termbridge/termbridge.go` | pass |
| D10 | `go test -count=1 ./cmd/musterd` ×5 | pass |
| D11 | `go test -count=1 ./internal/server` ×5 | pass |
| W1 | `make e2e-fixture-leak-check` | pass |
| W5 | `git diff --quiet main -- web/src` | pass |
| E1 | `make e2e` | pass |
| E2 | `make web-build build` + `views.spec.ts` ×5 | pass |
| DOC | doc upkeep (orchestrator, pre-review) | pass — `TODO.md` corrections (`fab03f0`) and `docs/design/test-strategy.md` lessons (`ad03029`) check out against `validation.md`; `docs/conventions.md` carries REQ-10's rule (`db2eced`); no `SPEC.md` decision changed, correctly |

I verified the two orchestrator doc commits against `validation.md` rather than on trust:
`fab03f0`'s claims (findings 2/3 fixed by `e0319f8`/`feec502`; census pair index increases with
recency so trees ≤ 25 predate both; the "still flaked on pairs 21, 24, 27, 28" grep artefact;
E7's mechanism being `railSort`'s broadcast-only update, not a late keydown listener) all match
`validation.md` line for line. `ad03029`'s two lessons likewise, including the 2 s + 5 s = 7 s
arithmetic, which I confirmed against the real constants (`internal/tmux/preflight.go:14`,
`cmd/musterd/main.go:42`).

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D2 | the stub really leaves a *descendant* holding stdout | pass | `writeVersionLeakStub` (`internal/claudecode/version_test.go:47`) is `echo …` / `sleep 60 &` / `exit 0`: the tracked child exits 0 **immediately** and the backgrounded `sleep` inherits stdout. The call runs under `context.Background()` — never cancelled — so nothing but `WaitDelay` can bound it. A sleep-then-exit stub could not produce this. Genuine discrimination, independent of the agents' revert experiment. |
| D3 | same for `tmux.Preflight` | pass | `writeTmuxLeakStub` (`internal/tmux/preflight_test.go:216`) is the identical shape, driven through the real `runCommand` seam (not `fakePreflighter`), also under `context.Background()`. |
| D4 | the marker assertion survived; the repaint read did not become it | pass | `internal/server/terminal_test.go:583-586`: the repaint `Read` is a separate `require.NoError` precondition; `readUntilContains(t, c2, "TAKEOVER_ORDER_MARKER", 5*time.Second)` and `require.Contains(…)` are both still there, unchanged. `maxSeen <= 1`, the 2 ms poller, and the poller's start **before** the `c2` dial are byte-identical. |
| D7 | no cross-package export from `internal/claudecode` | pass | Both sites use an inline `cmd.WaitDelay = 2 * time.Second` literal. `grep` over `internal/claudecode/*.go` shows no new identifier at all, exported or otherwise. No Claude-Code-format knowledge moved outward. |
| D8 | the bound's comment names the timeouts it clears | pass | `cmd/musterd/onexit_test.go:150-165` names `internal/tmux.preflightTimeout` (2 s) and `versionCheckTimeout` (5 s); I confirmed both constants exist at those values. |
| D9 | exactly one stub `claude` per `cmd/musterd` package run | pass | `runTestMain` is the only writer of `stub-claude.sh` (`onexit_test.go:81`); `newSleepStubClaude` now only returns `sharedStubClaude`. The one other `os.WriteFile(…0o755)` in the package, `open_test.go:38`, writes `stub-open.sh` for `-open-cmd` — a different stub, out of REQ-9's scope. |
| W2 | rethrown error keeps message + captured output | pass | `spawnAndWait` builds `"<healthz error>\nscratch musterd output:\n<output>"` (`daemon.ts:583`); `start()`'s catch does a bare `throw err`. The self-test asserts both `"never became healthy"` and `"scratch musterd output:"` are present, so this is gated, not just read. |
| W3 | the self-test discriminates | pass | Confirmed by construction, not by taking the revert on trust: without the try/catch, `spawnAndWait()`'s throw propagates out of `startScratchDaemon`, so nothing kills the fake (`exec sleep 3600`, whose pid the script read from a pidfile written before the `exec`) and nothing `rm`s the `muster e2e-*` mkdtemp. Both are exactly what the script checks. The `exec`-not-fork and pidfile-not-`pgrep -f` decisions in `web-implementation.md` are both correct and load-bearing — `pgrep -f` genuinely cannot see the pre-`exec` argv. |
| W4 | cleanup tolerates partial construction, never masks the original error | pass | `daemon.teardown()` is wrapped in `.catch(() => {})` and the original `err` is rethrown last. `kill()` returns early on a null/exited proc; the tmux `kill-server` is inside `try/catch`; `rm` is `force: true`. The `daemon === undefined` branch closes the deny stub and `rm`s `dataDir`, both guarded. No `await` sits between `new ScratchDaemon(...)` and `daemon.denyStubServer = denyStubServer`, so there is no window where the object exists but the listener is unreachable. |
| W6 | existing call sites unchanged | pass | `opts.musterdBinOverride ?? musterdBin` — omitted means the module-relative `bin/musterd`, byte-identical to before. |
| W7 | `musterdBinOverride` only in `helpers/daemon.ts` and the self-test | pass | `grep -rn musterdBinOverride web/e2e web/scripts web/src` → 3 hits in `helpers/daemon.ts` (2 are comments), 2 in `web/scripts/e2e-fixture-leak-check.mjs`. No spec file. |
| E3 | no `e2e-lint.sh` rule relaxed | pass | `git diff main...HEAD -- web/scripts/e2e-lint.sh` is empty. The self-test lives in `web/scripts/`, and rule 1 scans `e2e/*.ts` only, so it needs no exemption. |
| REQ-10 | `docs/conventions.md` states the pipe/`WaitDelay` rule | pass, with Minor 1 | The rule and its directive are there and correct; its *explanation* of when the hang occurs is wrong in the case this plan actually fixed. See Minor 1. |
| REQ-11 | judgement on a drift guard | not added — I agree | See Notes 3. |

### REQ-1 completeness, checked independently of the plan's list

I swept every `exec.Command*` in non-test, non-rig Go code rather than trusting the plan's
seven. The complete set is the seven fixed files plus three that correctly own no pipe:
`cmd/musterd/open.go:26` (`Run()`, `Stdout` nil → child stdout goes to `/dev/null`, no copying
goroutine), `internal/termbridge/termbridge.go:51` (PTY), and
`internal/tmux/tmuxtest/tmuxtest.go:37` (`Run()`, no `Stdout`). Nothing was missed and nothing
was over-applied.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format outside `internal/claudecode/` | pass — the only Claude-format string in the diff is `claudecode.PinnedVersion + " (Claude Code)"` in `cmd/musterd/onexit_test.go`, which is pre-existing text *moved* from `newSleepStubClaude` into `runTestMain`, not new leakage |
| 2 | No terminal-output state parsing | pass — the takeover test's repaint read is a test oracle over a WS frame, not a state source |
| 3 | No blocking hook handler | pass — no hook code touched |
| 4 | tmux always on a dedicated socket; no `resize-pane` for sizing | pass — no new tmux server invocation; the `tmux` stub in `preflight_test.go` is a temp-dir shell script answering `-V`, which never contacts a server |
| 5 | No payload logging | pass — no logging added |
| 6 | No empty-gauge dishonesty | n/a — no UI change (W5 verified) |
| 7 | Session identity on the tmux target | pass — untouched |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` in the diff |
| 9 | No real `claude` outside canary/probes | pass — every new executable is a stub written into a temp dir |

## Manual Verification

This plan ships **no user-facing UI change** — that is its own W5 criterion, and I confirmed it
independently (`git diff --quiet main -- web/src` exits 0). There is no rendered output, no
displayed value and no new element to inspect by hand, so §2a's browser pass has nothing of its
own to verify beyond what the suite already drives.

What I did verify through a real browser: the one browser-observable change, E7's readiness gate,
ran in real Chromium **seven** times green — my own independent full-suite sweep (281 passed,
1.2 m), E1's second full sweep, and E2's five consecutive `views.spec.ts` runs. I also checked by
hand that the new gate cannot pass vacuously (Edge Case 9): the fixture launches `prio-b` first
and gives only `prio-a` the permission prompt, so manual order is `[B, A]` while the polled
expectation is `[sessionA.id, sessionB.id]` — the two genuinely differ, and `railOrderIds`
(`web/e2e/helpers/railorder.ts:26`) reads the same `#sessions` DOM that `orderRail(store.values(),
railSort)` renders, i.e. the exact state `focusNth` reads, not a proxy that flips earlier.

I did not drive the dashboard manually beyond that, and I am recording the reason rather than
skipping it silently: there is no change to observe.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** The `WaitDelay` rule's explanation says the hang only happens once the
   context is done — but the case this plan actually fixed happens with a context that never
   fires, and the plan's own REQ-2 test proves it. `docs/conventions.md:31-36` reads:

   > "…makes the read block forever **even though the context is already done** — `WaitDelay`
   > bounds how long `Wait` waits **after the context's kill** before it force-closes the pipes."

   Go starts the `WaitDelay` timer at *whichever comes first*: the context being done, **or**
   `Wait` observing that the child exited. `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup`
   runs under `context.Background()` — never cancelled — and still returns in ~2.3 s with
   `exec.ErrWaitDelay`, entirely via the second trigger. So the shipped doc describes a
   mechanism the shipped test contradicts, and a future author with a long-lived or `Background`
   context would read this bullet and correctly conclude the rule does not apply to them —
   which is exactly backwards, and exactly the reasoning REQ-10 exists to prevent.

   The directive itself ("must set `cmd.WaitDelay`") is right and unconditional; only the
   rationale clause needs the fix. Suggested wording for the second sentence: *"Without it, a
   grandchild still holding the pipe open — or a child that ignores its kill signal — makes the
   read block forever. `WaitDelay` bounds that wait: the timer starts when the context is done
   or when `Wait` sees the child exit, whichever comes first, and then force-closes the pipes.
   The grandchild case does not need the context to fire at all."*

   The same narrowing recurs verbatim in the seven per-site comments — "once ctx has killed the
   process itself" (`internal/claudecode/version.go:33-38`, `credentials.go:36-40`,
   `internal/tmux/tmux.go:301-305` and `:322-326`, `internal/gitutil/gitutil.go:52-56`,
   `internal/locate/spotlight.go:36-40`, `internal/ghissue/ghissue.go:62-66`). Correct them in
   the same pass; it is one phrase repeated. `internal/tmux/preflight.go:35-39` is already
   closest to right and needs the least. No test or behaviour changes — comments and one doc
   bullet only.

### Notes

1. **[note]** W1's automated check verifies two of the criterion's three leaks. The self-test
   proves the process is reaped and the `muster e2e-*` tmpdir is removed, but it cannot observe
   the deny-stub listener: it has no handle to it, and it deliberately calls `process.exit()`
   (correctly — otherwise a *failing* run hangs forever on the very handles it is reporting)
   which also suppresses the open-handle signal. I verified that third clause by reading
   `teardown()` (`daemon.ts:640-654`), which nulls and `close()`s `denyStubServer`, and the
   catch path routes through it. If this is ever revisited, `process.getActiveResourcesInfo()`
   sampled just before the explicit exit would catch a stray `TCPSERVERWRAP` cheaply. No change
   requested now.

2. **[note]** `tokensFileWriteBound = 20 * time.Second` is a derivation for its floor and a
   judgement for its headroom. The arithmetic REQ-8/D8 asks for is genuinely written down and
   genuinely correct (2 s preflight + 5 s version check = 7 s, both constants confirmed), and
   the measured 10.02 s failure is cited. The step from "clears 7 s" to "20 s specifically"
   is stated as headroom rather than computed — which is honest and which the comment says
   plainly. I judged this a derivation with declared slack, not a bumped magic number, and
   D8 passes. Worth knowing that a future reader may re-ask where 20 came from.

3. **[note]** REQ-11 (Nice to Have) was not implemented, and I agree it should not be. The
   honest mechanical guard — grep every file containing `exec.CommandContext` for `WaitDelay` —
   would immediately false-positive on the three legitimately pipe-less sites
   (`cmd/musterd/open.go`, `internal/termbridge/termbridge.go`,
   `internal/tmux/tmuxtest/tmuxtest.go`), so it needs an allowlist that itself drifts. With
   D5 pinning today's seven sites by name and REQ-10 recording the rule for the next author,
   the marginal value is small and the maintenance cost is real. Revisit only if a new
   pipe-owning site actually lands without the delay.

4. **[note]** `musterdBinOverride` is silently ignored when `serveEmbedded` is set —
   `serveEmbedded`'s `copyFile` still reads the module-level `musterdBin`, and `spawn` uses
   `embeddedBinPath`. `web-implementation.md` reasons this out deliberately and correctly (the
   embed fixture's whole point is proving the *checked-in* binary serves its own assets), and
   W7 pins the field to a single caller that never combines them. Only flagging it as a future
   footgun; the field's doc comment could carry the caveat if it ever grows a second user.

5. **[note]** The leak-check's `before`/`after` scan of `os.tmpdir()` for `muster e2e-*` would
   false-fail if it ran concurrently with the Playwright suite, which creates dirs matching the
   same prefix. `gates.sh` runs checks sequentially so this cannot bite today, and I mention it
   only because the check's purpose is anti-flake.

6. **[note]** The **web-tests skip was the right call** — I was asked to rule on it and I agree.
   The plan defines no `web-tests` Affected Files, `web/src/**` is untouched under a checked
   gate (W5), and the web deliverable is E2E-harness code plus a Node self-test. Vitest in this
   repo covers pure `web/src` modules; neither artefact is Vitest territory, and the self-test
   is itself the gate for the harness change. No Vitest coverage was owed.

7. **[note]** The **REQ-10 plan/dispatch mismatch resolved correctly.** The plan's Implementation
   Notes assign `docs/conventions.md` to the orchestrator's doc-upkeep pass; the dispatch named
   it in daemon-impl's scope. daemon-impl did it, flagged the discrepancy rather than deferring
   silently (`db2eced`, `1a438f5`), and the orchestrator did not duplicate it. Outcome: the rule
   exists exactly once, in the right file, with the discrepancy on the record. That disposition
   is right. (Minor 1 is about the rule's *wording*, not about who wrote it.)

8. **[note]** `newRecordingStub` (`cmd/musterd/open_test.go:34`) still writes a fresh
   `stub-open.sh` per call and pays the same macOS first-exec tax REQ-9 removed for the `claude`
   stub. It is out of REQ-9's scope (a different stub, and only two call sites), and D10 is 5/5
   without it. Noted for whoever next touches that file, not requested here.

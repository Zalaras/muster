# Validation of the worktree-spike census findings

Measured 2026-09-07 against `main` @ `2aea5ee`. Source: `TODO.md` lines 532–559 (commit
`e9b8331`), backed by `spikes/worktree/S5-census.md` and the raw logs in
`~/.muster-spikes/s5-census/` (worktree `muster-spikes`, branch `spike/worktree-conflicts`).

**Ordering key for the census logs**: pair index increases with recency. Pair 26's B is
`e0319f8`, so pair 27 = (`e0319f8`, `feec502`) and pair 28 = (`feec502`, `f9e15a3`). Trees at
index ≤ 25 therefore predate both the subprocess seams (`e0319f8`) and the E2E load policy
(`feec502`) — which is what decides two of the four findings below.

## Finding 1 — `claude --version` can hang startup forever: VALID, and wider than logged

`internal/claudecode/version.go:31` is still `exec.CommandContext(ctx, bin, "--version").Output()`
with no `cmd.WaitDelay`. Confirmed by reading. The 5 s `versionCheckTimeout` kills the binary
but `Output()` waits for stdout EOF, so any descendant holding the pipe hangs `musterd` before
its first log line.

The census logged one site. It is a **class**: `Wait` blocks on the stdout/stderr copy whenever
os/exec owns the pipe, which covers `Output()`, `CombinedOutput()` *and* `cmd.Stdout = &buf`.
Eight exposed sites, none of which sets `WaitDelay`:

| Site | Shape |
|---|---|
| `internal/claudecode/version.go:31` | `Output()` — **startup path** |
| `internal/tmux/preflight.go:39` | `Output()` — **startup path** |
| `internal/tmux/tmux.go:300` | `CombinedOutput()` |
| `internal/tmux/tmux.go:318` | `cmd.Stdout`/`Stderr` bufs + `Run()` |
| `internal/gitutil/gitutil.go:51` | `Output()` |
| `internal/locate/spotlight.go:36` | `cmd.Stdout` buf + `Run()` |
| `internal/claudecode/credentials.go:36` | `cmd.Stdout` buf + `Run()` |
| `internal/ghissue/ghissue.go:62` | `cmd.Stdout`/`Stderr` bufs + `Run()` |

Not exposed: `cmd/musterd/open.go:26` (`Run()` with no `Stdout` set — no pipe) and
`internal/termbridge/termbridge.go:51` (PTY, not an exec pipe).

## Finding 2 — `TestPreflight_TooOld` 2.00 s flake: ALREADY FIXED

The census's two failures (`log-6-M-check.txt`, `log-13-B-check.txt`) read
`Status` expected 2 got 1 and `Version` expected `"3.1a"` got `""` at exactly 2.00 s — the
real `tmux -V` subprocess exhausting `preflightTimeout`. At HEAD the test is
`fakePreflighter("tmux 3.1a", nil)` (`internal/tmux/preflight_test.go:156`): no subprocess,
no timeout in the path. `e0319f8` fixed it. Both census failures were on trees ≤ 13. **No work.**

## Finding 3 — `actions.spec.ts:640` tile-End flake: ALREADY FIXED

The census-era failure (`log-17-M-e2e.txt`) is a one-shot
`expect(neighbourWidthAfter).toBe(neighbourWidthBefore)` — `Expected "80", Received "84"`, a
tmux geometry read taken mid-reflow. `feec502` replaced that with
`await expect.poll(neighbourGeometry).toBe(...)` plus `expectAllTileGeometrySettled` for the
baseline (`git log -S neighbourGeometry` → `feec502` only).

All 15 failures of this test are on trees at index ≤ 17. **Every tree containing `feec502`
was 281/281 green** (pairs 27-M and 28-M, 1.3 m). The census's claim that it "still flaked on
later green trees (pairs 0, 21, 24, 27, 28)" is a grep artefact — the search matched the test's
name in the ✓ *pass* list, not a failure. **No work.**

## Finding 4 — takeover-test flake: VALID but unreproduced at HEAD

`TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` is still a real-tmux
keep-real test at HEAD. Census: 11 failures, all `"" does not contain "TAKEOVER_ORDER_MARKER"`
at ~5.2 s — an **empty** capture, i.e. the new attach emitted nothing at all inside
`readUntilContains`'s 5 s bound.

Measured at HEAD: **21/21 green** — 8× targeted, 10× targeted under (attempted) CPU load at
0.60–0.61 s each, and `internal/server` green in 3/3 full `go test -count=1 ./...` runs. All 11
census failures were on trees ≤ 25, i.e. before `e0319f8` and before `3056d6f` cut ~20 process
forks out of `internal/server`.

So the flake is plausibly already gone, but nothing proves it: the test still writes to `c2` the
instant `dialTerminalOK` returns, with no wait for the new attach client to be wired to the
pane, and still reads on a fixed 5 s bound. The open question the fix must answer first is
whether that is the harness racing or the daemon genuinely dropping input written during
attach — a wait would paper over the second.

## Finding 5 — E2E fixture leaks the scratch daemon on a failed `start()`: VALID, reproduced

`ScratchDaemon.start()` (`web/e2e/helpers/daemon.ts:387`) spawns the process, then
`await daemon.spawnAndWait()` throws on an unhealthy daemon (`waitForHealthy`, 10 s) and the
error propagates straight out of `startScratchDaemon`. The `daemon` fixture never receives an
object, so its `await daemon.teardown()` never runs. Nothing between spawn and return is
guarded.

Reproduced at HEAD: `bin/musterd` temporarily replaced with `exec sleep 600`, then
`startScratchDaemon()` called directly.
- `start() threw as expected: scratch musterd never became healthy at http://127.0.0.1:60461`
- the scratch tmpdir **survived** the failure (`.../T/muster e2e-moPJn0`, removed by hand after)
- the node process could not exit after catching — nothing followed the `catch` but two sync
  reads, yet it hung until killed at 2 min, because the un-killed child still held its stdio
  pipes. The spawned daemon is never signalled.

Three things leak per failed start, not one: the `musterd` process, the `muster e2e-*` tmpdir,
and the `denyStubServer` HTTP listener that `start()` opens before spawning. Same hole for all
three fixture shapes (`daemon`, `startDaemon`, `fileDaemon`) — they all call `startScratchDaemon`.

## New, not in the census

`TestOnExit_Leave_LiveSessionSurvivesShutdown` (`cmd/musterd/onexit_test.go:269`) failed once
in 3 full `go test -count=1 ./...` runs at HEAD, at **10.02 s** — `spawnDaemon`'s 10 s
`require.Eventually` on `tokens.json` (`onexit_test.go:191`), i.e. a fresh `musterd` taking
over 10 s to write its tokens file. Honest caveat: that run overlapped a `make build` and the
finding-5 repro, so the load was above a plain `make check`. Its `-claude-bin` stub does answer
`--version`, so this is not finding 1's hang.

Context, already logged separately under M5+: `views.spec.ts` E7 is load-flaky (1 in 5
full-suite runs, 2026-09-07) and `theme.spec.ts:78` flaked once in the census (`log-17-M`).

## Score

Of the four logged items: **two are already fixed** (findings 2 and 3, by `e0319f8` and
`feec502` — the census measured mostly pre-fix trees), **two are real** (the `WaitDelay` class
and the fixture leak, both reproduced), and one flake (the takeover test) is unreproducible at
HEAD but still has the fixed-timeout shape that produced it.

The census's headline — "16 of 25 merges had a spurious red … any automated gate will cry wolf
on roughly one land in three" — does not hold for today's tree: the two E2E/unit flakes driving
that rate were fixed by `feec502` and `e0319f8`, and the newest trees ran 281/281.

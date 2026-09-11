# Test strategy re-evaluation — groundwork

**Status:** decided 2026-09-06 (see "Decision" at the end). The standing rule lives in
`docs/conventions.md` §Testing; this file keeps the measurements and the reasoning.
Raised 2026-09-03 after the `file-drop-fix` run.
**Question:** how should tests be run across the codebase — Go unit, Vitest, Playwright E2E —
so that coverage stays where it is (or improves), the suites are deterministic, and runtime
stays acceptable? Mocking, reduced concurrency, longer timeouts, shared fixtures, or a
combination: decide the strategy, not just the two symptoms below.

## Symptoms that triggered this

Both are tests with a wall-clock limit that a busy machine can exceed. Neither is a product
defect. Both were measured, not inferred (`plans/file-drop-fix/review.md`, cycle 1).

### 1. `make test` is intermittently red on `main`

- `make test` is `go test -count=1 ./...` — every package's test binary runs in parallel
  (Go's default `-p` is `GOMAXPROCS`; this machine has 12 cores).
- Eight tests spawn a real `tmux -V` subprocess and bound it with `preflightTimeout`
  (`internal/tmux/preflight.go`, **2 s**): `internal/tmux`
  `TestPreflight_{TooOld,ExactlyMinVersionIsOK,NewerDoubleDigitMinorIsOK,UnrecognizedVersionIsNotFatal,UppercaseProgramNamePrefixIsNotTrimmed}`
  and `cmd/musterd`
  `TestRunTmuxPreflight_{TooOldNamesDetectedAndMinimum,UnrecognizedVersionIsNotFatal,OKPrintsNothing}`.
- Under default parallelism they fail at exactly 2.00 s; under `-p 1` every package passes
  every time. Identical on `main` and on the plan branch. Three agents in one run each
  rediscovered this independently before the reviewer measured it against `main`.
- Runtime under `-p 1` (from the daemon-tests log): `internal/server` 13.5 s, `cmd/musterd`
  10.8 s, `internal/tmux` 7.7 s, everything else under 2 s — roughly 40 s serial in total.
- `internal/server` and `internal/termbridge` also start real tmux servers on per-test
  sockets; those were seen to flake once in the impl step (wrapper-script and launcher
  tests) and pass on rerun.

### 2. `make e2e` flaked ~50 % after adding one spec file

- Playwright config: `fullyParallel: true`, `retries: 0`, default worker count (6 on this
  machine), default `expect` timeout 5 s.
- Every E2E test (18 files, 214 tests) starts its own scratch daemon plus tmux server via
  `startScratchDaemon` (`web/e2e/helpers/daemon.ts`) in `beforeEach`, so six daemons and six
  tmux servers are being created and torn down at any moment.
- `drop.spec.ts` added 11 such tests. Measured full-suite runs: branch 3 red of 6; branch
  minus `drop.spec.ts` 0 of 3; `main` 0 of 5. The red runs failed a *different* unrelated spec
  each time, each passing in isolation:
  - `terminal.spec.ts` — a `MUSTER-STUB-READY` wait on the default 5 s where the same
    assertion elsewhere in the file uses `{ timeout: 15_000 }` (26 explicit 15 s waits in the
    file).
  - `theme.spec.ts` — an `expect.poll` on the default 5 s; 21 of 25 polls in the file carry
    no timeout.
  - `actions.spec.ts` — a tmux geometry race (`expected "80", received "84"`).
- Interim fix in `file-drop-fix`: `test.describe.configure({ mode: "serial" })` on the new
  file only, which caps its load to one daemon at a time. Eight consecutive green full-suite
  runs followed. Trade-off recorded by the reviewer: a red first test in a serial file masks
  the remaining ten (the suite still goes red).
- Full suite runtime today: ~54 s at 6 workers.

## What this means

The suites are load-sensitive rather than wrong. Each new plan adds tests, so peak load only
grows, and any fixed timeout is a threshold the suite will eventually cross. A one-off timeout
bump or a one-off `-p 1` fixes the symptom of the week; the question is what the standing rule
should be.

## Options on the table (not decided; combinations are likely)

1. **Fake the subprocess boundary in unit tests.** The preflight tests exercise version
   parsing and the fatal/non-fatal decision — neither needs a real `tmux -V`. A runner
   interface (already the shape `internal/locate` uses for `mdfind`) removes the stopwatch
   entirely. Same question for the server/termbridge tests that start real tmux servers:
   which of them test Muster's behaviour (keep real tmux, per conventions) and which test
   plumbing that a fake would cover?
2. **Reduce concurrency where the resource is shared.** `go test -p N` for the tmux-spawning
   packages only (Go has no per-package setting; a Makefile split or a build tag would do it),
   and/or fewer Playwright workers. Cost: runtime. `-p 1` roughly doubles `make test`; halving
   Playwright workers would take `make e2e` from ~54 s toward ~100 s.
3. **Raise the timeouts that are actually marginal.** The three E2E waits above to the 15 s
   their siblings use; a conventions rule that any wait on daemon or tmux startup uses the
   long timeout. Cheap, but it treats the threshold rather than the load.
4. **Share fixtures.** One scratch daemon per spec file (Playwright `beforeAll`) instead of
   per test. Cuts E2E daemon churn ~10×, but several specs rely on being the only session on
   their daemon (Focus auto-focus, top-of-sort assumptions), so it is a per-file judgement.
5. **Playwright `retries: 1` on CI only.** Rejected so far because a retry hides exactly the
   load sensitivity we want to see; listed for completeness.

## Constraints that carry over

- `docs/conventions.md` §Testing: E2E fakes Claude Code; test Muster's behaviour, not tmux's;
  state machine / reconcile / JSON merge get exhaustive unit tests.
- CLAUDE.md: tmux always on a dedicated socket; never read terminal output for state.
- The pipeline's gates (`gates.sh`) run `make test` and `make e2e` once and treat one red as a
  failure. Whatever is chosen has to make a single run trustworthy, or change the gate.

## What "done" looks like

A plan whose acceptance criteria include: `make test` and `make e2e` each green N times in a
row under default invocation on this machine (N chosen in the plan), the runtime of each after
the change, and a conventions entry stating the standing rule for timeouts, subprocesses and
per-test fixtures that future plans follow.

## Decision (2026-09-06)

Settled directly with Damian on `main`. The rule is in `docs/conventions.md` §Testing; the
SPEC changelog entry of the same date summarises. What the audit changed about the framing:

- **Option 4 as stated was wrong for most files.** Of the 16 per-test spec files, nearly all
  assert daemon-global state (full rail order, exact grid counts, prefs/usage/theme, the recents
  list, auto-focus on the only session) or restart/kill the daemon; `ScratchDaemonOptions` are
  spawn flags, so option-bearing tests cannot share at all. Only title-scoped files (`auth`,
  `embedded`, `ingest`, `subagent-status`, most of `actions`, most of `sessions`) share. The
  deliverable became *explicit, uniform, lintable* fixture choice — `web/e2e/helpers/fixtures.ts`
  (`daemon` / `startDaemon` / `fileDaemon()`), a **Fixture plan** header in plans, and
  `web/scripts/e2e-lint.sh` — plus the load policy in `playwright.config.ts`
  (`workers: 4`, `expect.timeout` 15 s, `timeout` 60 s).
- **Option 1 landed for the actual `make test` flake** (`internal/tmux` preflighter run-func seam;
  `cmd/musterd`'s preflight takes the function; `claude --version` honours `-claude-bin`; a
  walk-only Locator in `internal/server`'s locate tests). The `internal/server` creation/attach
  seam and a shared socket-helper were left as `TODO.md` follow-ups; **both closed 2026-09-06 by
  plan `v1-cleanup`** — `internal/server` now declares consumer-side `paneSpawner` and
  `paneConn`/`attachFunc` interfaces with nil-defaulting `Config.TmuxClient`/`Config.Attach`
  overrides, and `internal/tmux/tmuxtest` replaces the socket idiom at its eight sites. The 25
  tests whose assertions are genuinely tmux-observable keep a real server, by a keep-real list
  fixed in the plan rather than left to agent judgement. Measured below.
- **Option 3 became one config number** rather than per-site edits: 106 of 129 `expect.poll`s
  and 3 `MUSTER-STUB-READY` waits had been on the 5 s default; they now inherit 15 s.
- **Option 2 (fewer workers)** taken as 4; **option 5 (retries)** rejected again.

Measured on this machine (12 cores), fresh runs, default invocation:

| Suite | Before | After |
|---|---|---|
| `go test -count=1 ./...` | 26–29 s, intermittently red (8 preflight tests at 2.00 s) | 26–28 s, 5/5 green |
| `make e2e` (281 tests) | 72–78 s at 6 workers, 1 red in 2 runs (`theme.spec.ts:83`, non-retrying `expect` after `goto`) | 76 s at 4 workers, 3/3 green |
| `npx playwright test --workers=6` (suite only, no build) | 71 s | 61.5 s |

### `internal/server` test seams (plan `v1-cleanup`, 2026-09-06)

REQ-19 of `plans/v1-cleanup/plan.md`, closing the two follow-ups the Decision above left open.
Same machine (12 cores), fresh runs, default invocation; baseline column is this file's
2026-09-06 numbers.

| Invocation | Baseline | After the seams |
|---|---|---|
| `go test -count=1 ./internal/server/...` (package alone) | 26.9 s (421 tests) | 18.6 s (3 runs: 18.58 / 18.61 / 18.67 s) |
| `internal/server` inside `go test -count=1 ./...` (packages parallel) | — | 20.3–22.8 s (3 runs) |
| `cmd/musterd` inside the same full run | 15.0 s | 11.1–11.7 s |
| `internal/tmux` inside the same full run | 10.2 s | 7.5–8.6 s |

The standalone number beats the plan's own honest ~22 s estimate; the full-suite number varies
run to run with contention from the other packages, as the plan predicted ("the wall is set by
the slowest package"). **The wall-clock is not the point** — the win is ~20 fewer process forks
per run in the package this note identified as load-sensitive, which is what made `make test`
intermittently red. No timing threshold is gated on: a timing gate on a shared machine is a
flake generator.

**The worker cap costs nothing at this suite size** — and the migration found a tax the
baseline had been paying all along. The first full runs after the migration took 112–118 s
and did not move with the worker count (6 → 113.6 s, 5 → 112.8 s, 4 → 117 s); bisecting
(config back to a 5 s expect timeout: 116 s; the same specs against a HEAD-built `musterd`:
74 s) put it in the daemon binary, and a repeat-each probe put it in startup: a scratch
daemon took 0.8–2.3 s to become healthy under 6-way concurrency (median 1.37 s) against
0.15 s at HEAD. Cause: `claude --version` now runs the harness's stub, a *freshly written*
script per daemon, and macOS charges the first exec of a new executable ~270 ms
(measured: fresh file 258–311 ms, same file again 5 ms, `/bin/sh -c exit` 5 ms, real `claude`
21 ms) and serialises those assessments across processes. Every session launch had been
paying the same per-stub tax inside its `MUSTER-STUB-READY` wait. `helpers/daemon.ts` now
writes ONE stub per run at a content-hashed path (`ensureSharedStubClaude`); startup median
fell to 0.17 s and the whole suite got faster than HEAD at equal workers.

Found while migrating (each a real coupling, fixed): `shell.spec.ts` asserted on the real
installed Claude Code's `2.` version prefix (the stub now answers `--version`
deterministically); INV-5 in `actions.spec.ts` needs a fresh daemon because End moves Focus to
the next live card, which legitimately opens a socket; `terminal.spec.ts` allocated two daemons
for its nested restart test; 17 fixed sleeps existed (the review found 9), all now `settleFor`
holds for stays-unchanged checks or converted to polls; 29 per-test `test.setTimeout` lines were
redundant; several "collection-only / expected to fail" headers were stale.

### Wait bounds and the stub tax in `cmd/musterd` (plan `post-worktree-spike-issues`, 2026-09-07)

Two lessons from fixing the load-flaky tests the worktree spikes' history census surfaced
(`spikes/worktree/S5-census.md`; the validation that split its four findings in half is
`plans/post-worktree-spike-issues/validation.md`).

**A wait bound must clear the path's own legitimate worst case, with the arithmetic written
down.** `cmd/musterd`'s "daemon wrote `tokens.json`" waits were bounded at 10 s on a startup path
that contains two *bounded-but-blocking* subprocess steps before the write: the tmux preflight
(2 s) and the `claude --version` check (5 s). 7 s of sanctioned blocking under a 10 s assertion is
not a margin, it is a threshold the suite will keep crossing — measured once as
`TestOnExit_Leave_LiveSessionSurvivesShutdown` failing 1 of 3 full runs at **10.02 s**, which reads
like a shutdown bug and is not one. The bound is now one named constant
(`tokensFileWriteBound`, `cmd/musterd/onexit_test.go`) whose comment names the two timeouts it
clears, and whose failure message repeats the derivation so the next reader can tell a slow
machine from a regression. This is the *one* place this plan raised a number, and it is a bound
derived from the path's worst case rather than a bumped magic number — the standing rule that a
timing gate on a shared machine is a flake generator is otherwise unchanged, and every other fix
in that plan removed a timing dependence instead of widening one.

**The first-exec stub tax is not only an E2E problem.** The note above measured macOS charging
~270 ms, serialised across processes, for the first exec of a freshly written executable, and
fixed it in the E2E harness with `ensureSharedStubClaude`. `cmd/musterd`'s tests were paying the
same tax package-side, writing a fresh stub `claude` per `spawnDaemon`/`openTestDaemonArgs` call
(~7 per run). The stub is now written once per package run in `TestMain` and shared; the package's
tests run sequentially, so one stub is sufficient. After both fixes,
`go test -count=1 ./cmd/musterd` and `go test -count=1 ./internal/server` are each **5/5 green**
across consecutive runs (D10/D11), against 1 red in 3 before.

**Also fixed, and worth the pattern rather than the detail:** the `internal/server` takeover test
wrote its marker into a tmux attach that was still setting its terminal up, and now reads tmux's
initial repaint first as a precondition (the marker assertion is unchanged — the repaint read did
not become the assertion). `views.spec.ts` E7 synchronised on a `<select>`'s own DOM value rather
than on the state the code under test actually reads, and now waits on the rail's DOM order. Both
are the same shape: **synchronise on the thing the production code reads, not on a proxy that
changes earlier.**

### Transient displays are not oracles (`terminal.spec.ts` E12, 2026-09-11)

E12 ("killing the stub's tmux session shows the ended placeholder") was the last flaky spec on
`main`, and the one whose in-file comment blamed "attaching a real tmux/PTY bridge under
parallel load" and widened its timeout to 15 s. A timed probe (15 kills, each issued at a
chosen phase of the liveness tick) showed the attach path was innocent. After `kill-window`
the daemon's PTY read hits EOF, closes the terminal socket with `4001`, and the browser
painted the "session ended" overlay **5–9 ms** later; the same EOF branch then nudges the
liveness poll, whose `alive:false` upsert made `render()` dispose the `TerminalSurface` and
show `#dead-surface` **~30 ms** after the kill, every trial. The two travel on different
WebSockets; in 1 of 15 kills the browser handled the state upsert first, `dispose()` had run,
the late `close` event was dropped, and the overlay never existed — a failure no timeout can
reach. `views.spec.ts`'s tile-kill test carried the same oracle, and its next assertion (the
footer marker flipping to "stopped") was alive-driven, i.e. true only on the render pass that
destroys the overlay it had just asserted.

E12 predates the dead surface (m2, 2026-08-23). m4-reconcile added `#dead-surface` three days
later and repointed the neighbouring REQ-13 test at it, with a comment saying so; E12 kept the
old oracle for three weeks. Both tests now assert the durable end state — the socket closed
(`TerminalSocketTracker`), the dead surface's `.endcap`, the region unmounted — and leave the
`4001` close *code* to `TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness`.
`terminalOverlay` no longer matches "session ended" and e2e-lint rule 4 rejects the oracle.

Two rules fall out. **Assert the state the UI settles in**; a display that a later render pass
destroys is unit-test territory (`overlay.test.ts` covers the 4001→"ended" mapping). And **a
flake fix is proven, not believed**: `make e2e-soak SPEC=<file> N=10` runs one file's tests N
times *concurrently* (each repetition its own test entry on its own scratch daemon, so the
copies supply the load that widens races); every repetition must be green, `retries` stays 0.
One green `make e2e` cannot tell a fix from a lucky roll — E12 passed 304/304 the same morning
the probe reproduced it.

### Operator hazard: a concurrent build invalidates a running `make e2e` (2026-09-07)

`make e2e` serves the **prebuilt** bundle in `internal/webui/assets/`. A concurrent
`npm run build` or `make web-build` rewrites those assets underneath a sweep that is already
running, and the result is `element(s) not found` failures that look exactly like a real UI
regression. Observed during plan `post-worktree-spike-issues`' review: a first sweep reported
279 passed / 2 failed in `rail-order.spec.ts` with a build running alongside it; a clean re-run
with nothing else going was 281/281, and the plan's E1 gate passed independently twice more.

This is an operator hazard, not a suite defect, and it is worth writing down precisely because
everything else in this file is about real flakes: a red of this shape should be re-run clean
before it is believed. `gates.sh` runs its checks sequentially, so the pipeline itself is safe —
the exposure is a human or an agent running a sweep beside a build.

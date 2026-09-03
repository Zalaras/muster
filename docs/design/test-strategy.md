# Test strategy re-evaluation — groundwork

**Status:** open question, not yet planned. Raised 2026-09-03 after the `file-drop-fix` run.
**Owner:** Damian decides; a `/spec` + `/plan-work` pass turns this into a plan.
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

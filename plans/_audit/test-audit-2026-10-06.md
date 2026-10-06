# Test-value audit — trial runs, 2026-10-06

Informal, not yet a process. The question: of ~1,700 Go tests, ~1,700 Vitest tests and
715 Playwright tests, which are worth keeping and which were added for coverage and
protect nothing? The hope behind it was a shorter test run.

## Method

Three signals per test, run one package at a time:

1. **Mutation testing** — make small deliberate breaks in the package's non-test code
   (swap `<`/`<=`, `==`/`!=`, `&&`/`||`; negate an `if`; drop `!`; delete a statement;
   empty a string literal; zero/bump an int; flip a bool) and run the package's tests
   once per break. A test that catches nothing protects nothing *the tool can express*.
2. **Subsumption** — a test whose set of caught breaks is contained in another single
   test's set is a redundancy candidate. This replaced per-test coverage, which answers
   the same question more weakly.
3. **A read of every flagged test** — the numbers only nominate. Every deletion was
   decided by reading the test.

Tooling: `test-audit-tools/` beside this file (`python3 run.py internal/<pkg>`). Mutants
are swapped in with `go test -overlay`, so the tree is never edited; results land in
`$TMPDIR/test-audit/<pkg>/report.txt`.

## Out of scope

- `test/canary/` — `//go:build canary`, runs only under `make canary`. Its tests guard
  Claude Code's behaviour (the `guard:` of fact records), not Muster's code, so mutation
  and coverage would score them as dead.
- `docs/history/spikes/` — a separate Go module the normal suite never runs.
- Repo tooling (`kb`, `triage`, `commentpass`, `versions`, `gatelock`, ~320 tests) is
  in scope, with the same method; it ranks below shipped code.

## What the tooling had to learn

Each was a false "this test catches nothing" before it was fixed:

- **`go test` runs vet first.** vet rejects an emptied format string as a build error,
  hiding those mutants. Mutant runs need `-vet=off`.
- **A panic or timeout aborts the test binary**, so every test after it never reports
  and gets no credit. The runner now skips the tests already judged (`-skip`) and
  re-runs until every test has reported; a timed-out run credits the tests Go lists
  under "running tests:".
- **The operator set changes the redundancy picture.** Adding literal mutations gave a
  "redundant" locate test a break only it catches. Subsumption is a nominee, not a verdict.
- **Identical catch sets aren't redundancy** when the two tests pin different properties
  the mutator has no operator for (e.g. a symlink at the invoked path).
- **A break no package test catches is not yet a gap.** Before reporting one, run the
  mutant against the importing packages too (`go test -overlay … ./internal/server
  ./cmd/musterd`) and look at E2E. A claimed missing-signature gap in selfupdate turned
  out to be pinned by `internal/server`. Importer runs are slow (`internal/server` ~110 s
  a run), so they are a second pass over plausible gaps only.

## Results

| Package | Tests | Mutants | Caught | Not caught | Didn't compile | Removed |
|---|---|---|---|---|---|---|
| `internal/locate` | 26 | 127 | 73 | 27 | 27 | 2 |
| `internal/selfupdate` | 56 | 521 | 283 | 148 | 90 | 2 |

`internal/locate`'s row is the first upgraded run (before the vet and crash fixes).
Caught includes runs that hung (1 and 6).

**Removed** (commit 38b382d0):

- `TestLocate_ReturnsNotLocatedWhenNoFinderYieldsAnything` — identical catches to
  `…VerifyCandidatesDropsVanishedCandidateInsteadOfErroring`.
- `TestWalkFinder_FindsMultipleCandidatesOfTheSameNameAndSize` — subsumed by three tests.
- `TestSHA256Of` — compared the function with the stdlib call it wraps; it could not fail.
- `TestRunVersionProbe_NonZeroExitIsAnError` — tested `os/exec`, not Muster.

**Weak tests, worth fixing rather than deleting:**

- `TestSpotlightFinder_Find_NoCandidatesNoErrorWhenRunFails` and
  `…TimesOutAndDegradesRatherThanBlocking` still pass with `Find`'s run-error branch
  deleted: their fake returns empty output with the error. A fake returning partial
  output *and* an error would make them real tests.
- The two `TestChecksumFor_…` tests (extracts the hash; one or two spaces) catch
  identical breaks and could be one table.
- `TestAssetName`, `TestVersion_String`, `TestReleaseTag` are one-line format pins fully
  covered elsewhere — low-value either way.

**Small gaps no test covers:**

- locate: the walk's entry cap could be off by one (`>` vs `>=`); an empty dropped file
  could match a candidate that vanished before it was read; a directory with the
  target's name and size is not excluded.
- selfupdate: `installBinary` promises the temp file is removed on every failure path
  (kb:adr/update-trust-root-minisign-signed-checksums); no Go test checks it, including
  in `internal/server` and `cmd/musterd`.

Most remaining uncaught breaks are cleanup calls (`Body.Close`, unlocks), defensive
defaults (nil client), wire strings pinned in other packages, or equivalent mutants.
The 148 in selfupdate were not all read individually.

## Conclusion so far

About 5% of the audited tests were removable, and finding gaps outnumbered finding dead
tests. More to the point, both packages' whole suites run in about a second: deleting
weak unit tests does not shorten the run. Test time is the separate question of which
tests are slow, answered by measuring durations, not by mutation.

## Where the time goes (measured 2026-10-06, after 38b382d0)

One run of each suite, nothing else on the machine (the Go run under the shared gate
lock, E2E under the exclusive one).

| Suite | Tests | Wall time | Shape |
|---|---|---|---|
| Playwright E2E | 715 | 5.9 min (4 workers) | flat: median 1.4 s, top 100 tests = 39% of test time |
| Go `./...` | 1,645 | 127 s | wall = slowest package; a few tests dominate |
| Vitest | 2,404 | 8 s | no test over 0.1 s |

**E2E is about 70% of the total, and its time is breadth, not outliers.** Only 8 tests
take 10 s or more (the worst is 21 s, all but one in `update.spec.ts`); the rest is ~715 ×
per-test setup (a scratch daemon, a tmux server, a stub shell). `card-location.spec.ts`
(88 tests, 211 s) and `update.spec.ts` (27 tests, 195 s) are the largest files. `workers: 4`
is a measured load policy (`docs/conventions.md` §Testing), not a free knob. One flake in
the run: `update.spec.ts:997` failed on `clock.pauseAt: Cannot fast-forward to the past`
and passed three times alone.

**Go wall time is `internal/server` (121 s), then `cmd/musterd` (84 s)**: packages run in
parallel, so speeding up any other package does not shorten the run. `internal/server`
runs its 559 tests serially (one of 59 test files uses `t.Parallel`); 443 take under
0.1 s and five take 53 of its 106 s of test time:

- `TestUpdateManager_StopNeverRacesAnApplyThatHasRegistered` — 30 s by design (200 trials
  × a 150 ms stop timeout).
- `TestWSHub_CloseAll…` ×2 and `TestShellRegistry_EnsureBoundedByShellTmuxTimeout…` —
  5 s each, waiting out a production timeout.
- `TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch` — 7 s.

`cmd/musterd`: the six `TestOnExit_*` tests spawn a real daemon and take ~7.5 s each
(~48 s). `TestCheckClaudeCode_MapsEachStatus…` took 24 s in the full run but 1.9 s alone —
contention from the first exec of freshly written stub scripts
(kb:lesson/first-exec-of-fresh-script-costs-270ms). The content-keyed shared stub that
lesson led to is used in `internal/server` and the E2E helpers but not in `cmd/musterd`,
`internal/claudecode` or `internal/selfupdate`. The two "descendant holding stdout" tests
(`internal/claudecode` 10 s, `internal/tmux` 8 s) are also exec-bound.

## Investigation: running `internal/server`'s tests in parallel (2026-10-06)

Method: a `go test -overlay` copy of every server test file adding `t.Parallel()` to each
top-level test, except the 14 that reach `t.Setenv` (directly or through
`newTestShellRegistry`), which Go refuses to run in parallel. Nothing in the tree changed.
No test assigns a production package variable (checked with a parser, not grep), and nothing
on record argues for serial; it is just the default.

| Run | Serial | Parallel |
|---|---|---|
| `internal/server` alone | 78 s | 20–25 s, 5/5 clean (after one test fix, below) |
| `internal/server` under `-race` | 203 s | 69–70 s, 1 flake in 2 |
| whole `go test ./...` | 127 s | 63–67 s; `cmd/musterd` (61–65 s) becomes the slowest package |

What has to be fixed first — all test-only:

- **`TestHandleTerminal_SupersedesMidTyping`** failed 3 of 5 parallel runs: it takes the first
  connection's next frame as the 4000 close, but terminal output can be queued ahead of it.
  Its sibling `…SecondSocketSupersedesTheFirst` already drains with `readUntilError` for this
  reason. A latent flake whether or not the package goes parallel.
- **The shared stub's session files would collide silently.** `sharedStubClaude` writes
  `session-<id>` into one package-wide directory and every test server numbers sessions from
  1, so `TestLauncher_SuccessfulLaunchEndToEnd`'s `MUSTER_SESSION` check could be satisfied by
  another test's file. It passes either way; it would stop proving anything. Recording into the
  launch directory (per test) fixes it.
- **Load-sensitive tests fail inside the full suite**, where the parallel burst overlaps every
  other package: `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` and
  `…RespawnsAfterExternalKillWithNoMusterSession` (serial, but their per-test stub shell from
  `newStubShellBin` pays the first-exec charge and misses a 5 s wait),
  `TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast` (fresh wrapper
  scripts against a 3 s budget), and under `-race` `TestIngestStatusLine_RoutedToOneSession
  LeavesTheOtherUnaffected` (not yet read). Each failed once; none failed with the package
  alone.

A lower-risk variant: 443 of the 559 tests take under 0.1 s, so marking only the ~116 slower
ones parallel should keep most of the gain while exposing fewer tests to concurrency.

**After the fixes** (a32323d2..a3067f90): the four items above no longer fail. The real tree's
`go test ./...` now takes 90 s (from 127 s) with the race-test and stub changes. Re-running
the parallel overlay inside the full suite twice (63 s wall, server 30 s) still failed:
`TestWrapperScriptsShellRoundTrip` and `…_UnmanagedSessionProducesZeroRequests` in both runs,
timing out on freshly written wrapper scripts whose content embeds an `httptest` server's
random port, so caching cannot help; and `TestHandleTerminal_TakeoverNeverLeavesTwoClients
AttachedAtOnce` once (tmux's repaint on the new attach not seen within its wait). The class
is any test that runs a newly written script, or waits on tmux, against a short budget
while the parallel burst overlaps the other packages. Leaving those few tests serial is the
simplest route.

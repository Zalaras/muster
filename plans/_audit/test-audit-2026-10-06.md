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

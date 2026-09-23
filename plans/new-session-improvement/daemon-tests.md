# Daemon Tests: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: pass
**Pack**: kb pack 27423 words (budget 8000, WARN exceeds); sections — rules 841 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2459 · lessons 2246 · runbooks 2

## Fix Wave — review cycle 1

**Issues addressed** (all `[daemon-tests]`): correctness Major 2, correctness Minor 1,
correctness Minor 2.

**Correctness Major 2** (`test/canary/static_test.go:59-62`) — the comment mirroring
REQ-9's needles misstated D11's scope: it read "D11: they may not appear outside that
package in non-test code" — the opposite of D11's actual text, "Test files are inside the
net." Re-read the plan's D11 (`plans/new-session-improvement/plan.md:423-426`): D11 scopes
its `rg` to `internal/` and `cmd/`, where test files are checked too (an `internal/server`
test holding the sentence would fail the `rg`); `test/canary` sits outside that boundary
entirely, which is the actual reason it may hold the needles. Reworded to state that
correctly and to keep the real reason (`modelCatalogSentence` is unexported, so importing
it isn't an option): "D11 scopes to internal/ and cmd/, where test files are inside the
net too; test/canary sits outside that boundary entirely, and modelCatalogSentence is
unexported, so mirroring rather than importing is the only option here." Re-ran D11's own
`rg` command verbatim (`rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model
catalog" internal/ cmd/ --glob '!internal/claudecode/**'`) — zero matches, confirmed the
comment now describes a boundary the code actually honours.

**Correctness Minor 1** (`internal/claudecode/modelcheck_test.go:24-25`) — the
`"the measured full line"` row's stderr ended `update Claude Code, or pick another
model.`, which is `internal/server/sessions.go`'s own refusal-message wording
(`modelUnrecognized`), not anything the row's name claims provenance from. Checked both
places the review named as carrying the actual measured tail —
`plans/new-session-improvement/plan.md:330` and `web/e2e/helpers/daemon.ts:135` — both
read `...model catalog; update Claude Code, or map it with behavesAs on a modelPicker
row.` Replaced the row's stderr with that exact tail. `stderrSaysUnrecognised` only
substring-matches `modelCatalogSentence` (`"isn't described by this version's model
catalog"`), so the row still asserts `want: true` — ran
`go test ./internal/claudecode/... -run TestStderrSaysUnrecognised -v`: all 5 subtests
pass, including the renamed row.

**Correctness Minor 2** (`internal/server/sessions_test.go:437-458`) — D8 says a
recognised-verdict launch "returns 201 with the same row the pre-plan launch produced";
the test asserted only `State == started` and a non-empty `TmuxTarget`. Took the review's
first fix option: launch the same request through a `checkModel: nil` baseline launcher
into a second directory on the same store, then assert every `session.Session` field that
does not necessarily differ between two distinct launches sharing one store's monotonic
counters (id, RepoID, TmuxTarget/TmuxPane — which embed the id — RailPos, and
StateSince/CreatedAt all encode which launch produced them, so those stay excluded; so
does Directory, since the two dirs are deliberately different `t.TempDir()`s). Compared:
State, PermissionMode, PermissionModeSource, Branch, IsWorktree, Title, FirstLaunchHere,
Alive, ClaudeSessionID, Compactions, Attention, Failure, Context, LastActivity, EndedAt,
Pinned, TitleOverride, and Model (ID + DisplayName) — plus, per D7, the two repo rows'
LaunchCount/LastModel/LastPermissionMode. Doc comment reworded to state the comparison it
now performs rather than restate D8's prose unverified. `go test ./internal/server/...
-run TestLauncher_ModelRecognised_ProceedsToCreated -v`: pass.

**Handoff tidy applied** (optional, `test/canary/harness_test.go`): daemon-impl's wave 1
moved the model-check timeout inside `claudecode.CheckModel` itself, leaving run F's own
`modelCheckRunTimeout` wrap around its two direct `CheckModel` calls redundant (nested,
equal value) but not broken. Dropped the constant and both
`context.WithTimeout(ctx, modelCheckRunTimeout)` wraps, calling `CheckModel(ctx, …)`
directly, and reworded the doc comment to name where the 5 s bound now lives. `go vet
-tags canary ./test/canary/...` clean; `MUSTER_CANARY_OFFLINE=1 make canary` green
(below).

**Verification**:
- `go build ./...` — clean.
- `make test` (`go test -count=1 ./...`) — every package `ok`, zero failures.
- `make lint` — `0 issues.`
- `go vet -tags canary ./test/canary/...` — clean.
- `MUSTER_CANARY_OFFLINE=1 make canary` — green, including
  `TestInstalledBinaryCarriesInterfaceStrings` (proves the reworded D11 comment sits
  beside a needle set that still finds every string in the installed binary) and
  `TestSkipDecision`'s 7 rows; every real-`claude`-driving test (including run F) skips
  correctly under offline.
- `gofmt -l .` — clean.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py --all` — `2942 references
  checked, 0 missing`.

**Files touched this wave**: `internal/claudecode/modelcheck_test.go`,
`internal/server/sessions_test.go`, `test/canary/static_test.go`,
`test/canary/harness_test.go`. No implementation file touched.

## Fix Wave — review cycle 2

**Issue addressed** (`[daemon-tests]`): correctness Minor 1
(`internal/server/sessions_test.go:436-446` and `:495`).

Cycle 1's fix (Minor 2, above) widened the comparison but still hand-picked fields:
`TestLauncher_ModelRecognised_ProceedsToCreated`'s doc comment claims "every other field
must match" while the body never touched `LastSnapshot`, `LastSnapshotAt`,
`TranscriptPath`, `PlanPath`, `PlanExists`, `Unread` or `LastPrompt`, and compared `Model`
by `ID`/`DisplayName` only rather than the whole struct. Separately, the repo-row block
was labelled `// D7:` (D7 is `TestLauncher_ModelUnrecognised_RefusesAndWritesNothing`,
the refusal test above it) but the block it's attached to is D8's own repo-defaults
check.

Read `internal/session/session.go`'s current `Session` struct (`session.go:68-138`) to
get the field list, then took the review's preferred fix: replaced the seventeen
individual `assert.Equal` calls with one whole-struct comparison. `baseline` and `sess`
are copied by value, the fields that necessarily differ between two distinct launches
sharing one store's counters (`ID`, `RepoID`, `TmuxTarget`, `TmuxPane`, `RailPos`,
`StateSince`, `CreatedAt`, `Directory`) are zeroed on both copies, then a single
`assert.Equal(t, baselineCmp, sessCmp, …)` proves everything else — including the seven
fields the doc comment claimed but the old body never checked, `Model`'s full struct (not
just its two fields), and the two unexported prompt-tracking fields
(`currentPromptID`/`closedPromptIDs`), all for free and staying true as fields are added.
Relabelled the repo-row comment `// D7:` → `// D8:`.

`go test ./internal/server/... -run TestLauncher_ModelRecognised_ProceedsToCreated -v`:
pass.

**Verification**:
- `go build ./...` — clean.
- `make test` (`go test -count=1 ./...`) — every package `ok`, zero failures.
- `make lint` — `0 issues.`
- `go vet -tags canary ./test/canary/...` — clean.
- `MUSTER_CANARY_OFFLINE=1 make canary` — green: `TestInstalledBinaryCarriesInterfaceStrings`
  and `TestSkipDecision`'s 7 rows pass, every real-`claude`-driving test skips correctly
  under offline.

**Files touched this wave**: `internal/server/sessions_test.go`. No implementation file
touched.

## Summary

Tests created: 25 top-level functions (43 with subtests) | Passing: 25 (43 with subtests) | Failing: 0

## Re-run after daemon-impl's Fix Attempt 1 (pre-review fix)

Daemon-impl's fix (commit `95ec42d`) added a `ctx.Err()` check ahead of the
`errors.As(err, &exitErr)` swallow in `RunModelCheck` — exactly the remedy this suite
suggested below. Re-read `internal/claudecode/modelcheck.go` and
`plans/new-session-improvement/daemon-implementation.md`'s new `## Fix Attempt 1` section
before touching anything; no test file needed changing — the existing
`TestRunModelCheck_ContextDeadlineBoundsAHungProcess` (unchanged since it was written) is
exactly the regression guard for this fix, and it now passes:

```
=== RUN   TestRunModelCheck_ContextDeadlineBoundsAHungProcess
--- PASS: TestRunModelCheck_ContextDeadlineBoundsAHungProcess (0.10s)
PASS
ok  	github.com/Zalaras/muster/internal/claudecode	1.951s
```

Full re-run, this session:
- `go build ./...` — clean.
- `make test` (full tree, `go test -count=1 ./...`) — every package `ok`, zero failures
  (previously one `FAIL` in `internal/claudecode`).
- `make lint` — `0 issues.`
- `MUSTER_CANARY_OFFLINE=1 make canary` — green: `TestInstalledBinaryCarriesInterfaceStrings`
  passes, `TestSkipDecision`'s 7 rows pass, every real-`claude`-driving test correctly
  skips under `MUSTER_CANARY_OFFLINE=1` (not run — that's the forced canary, orchestrator's
  only, per this task's instructions; not touched here).
- `make check-kb` — 7 "owned by no feature" lines, all expected/known
  (doc-reconcile's, per this run's instructions, not mine): `modelcheck.go`,
  `modelcheck_test.go`, the three `web/e2e/launch-*.spec.ts` files, and
  `web/src/features/launch-restore.{ts,test.ts}`.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py --all` — `2931 references
  checked, 0 missing`.

No implementation bug remains. Everything — D4, D5, D6, D7, D8, D9, D10, and REQ-9's
canary work — is green.

Also repaired daemon-impl's five sanctioned assertion-only breaks in
`internal/claudecode/launch_test.go` (`TestBuildArgv`'s four rows plus
`TestBuildArgv_UsesTheGivenBinaryName`) per REQ-4/D10, and added an exhaustive D10/INV-3
table (`TestBuildArgv_PermissionModeAlwaysExplicit`, 8 rows: all 4 modes × with/without
`ResumeSessionID`) that a per-row-only fix would have missed
(kb:lesson/invariant-missed-by-per-transition-tests).

`TestLauncher_ModelUnrecognised_RefusesAndWritesNothing` (72 lines, `funlen` WARN) is
intentionally long rather than split: it walks INV-1's two source states end to end
(store rows, fake-tmux call counts, broadcast log, settings-file bytes) per
`docs/conventions.md`'s "invariants get cross-state coverage" rule — splitting it would
duplicate the setup, not the assertions. `TestBuildArgv`'s pre-existing `funlen` WARN
(63>60) predates this plan (`git show HEAD:internal/claudecode/launch_test.go` — already
~70 lines before my edits, which only changed row contents, not row count). No `dupl`
warning named any file I touched.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/modelcheck_test.go` | `TestStderrSaysUnrecognised` (5 rows: full sentence, empty, `Input must be provided` alone, unauth tag line alone, unknown-option error) | D4/INV-2: only the measured sentence blocks | pass |
| `internal/claudecode/modelcheck_test.go` | `TestCheckModel_ArgvAndDir` | D5: exact 7-element argv and dir passed to the run seam | pass |
| `internal/claudecode/modelcheck_test.go` | `TestCheckModel_VerdictFollowsStderr` (2 rows) | CheckModel's verdict is wired to `stderrSaysUnrecognised` | pass |
| `internal/claudecode/modelcheck_test.go` | `TestCheckModel_ExitErrorIsNotAFailure` | REQ-2: exit code is not a signal | pass |
| `internal/claudecode/modelcheck_test.go` | `TestCheckModel_RunError_FailsOpen` | D6 (CheckModel half): a run error fails open, `ModelRecognised` | pass |
| `internal/claudecode/modelcheck_test.go` | `TestCheckModel_ContextDeadlineExceeded_FailsOpen` | D6 (CheckModel half): a ctx-deadline run error fails open | pass |
| `internal/claudecode/modelcheck_test.go` | `TestRunModelCheck_ReturnsStderrRegardlessOfExitCode` | REQ-2 at the real-subprocess seam: exit 1 is not an error | pass |
| `internal/claudecode/modelcheck_test.go` | `TestRunModelCheck_StdinIsEmpty` | D5: stdin never inherited | pass |
| `internal/claudecode/modelcheck_test.go` | `TestRunModelCheck_UsesGivenDirectory` | D5: `cmd.Dir` is honoured | pass |
| `internal/claudecode/modelcheck_test.go` | `TestRunModelCheck_CommandCannotStart_ReturnsError` | D6/Edge Case 2: binary can't start → error | pass |
| `internal/claudecode/modelcheck_test.go` | `TestRunModelCheck_ContextDeadlineBoundsAHungProcess` | D6/REQ-2/Edge Case 1: a ctx-killed hang must come back as an error | pass (was FAIL — implementation bug, fixed by daemon-impl's Fix Attempt 1) |
| `internal/claudecode/modelcheck_test.go` | `TestRunModelCheck_HarmlessSmokeTestNeverUsesRealClaude` | D11 boundary documentation (mirrors `credentials_test.go`'s `TestRunCommand_*`) | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv` (10 rows, repaired) | REQ-4: every mode incl. `default` now emits `--permission-mode` | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv_PermissionModeAlwaysExplicit` (8 rows: 4 modes × resume on/off) | D10/INV-3 exhaustive: the flag appears exactly once, for every mode, with and without `ResumeSessionID` | pass |
| `internal/claudecode/launch_test.go` | `TestBuildArgv_UsesTheGivenBinaryName` (repaired) | REQ-19 regression, updated for the explicit flag | pass |
| `internal/server/sessions_test.go` | `TestLauncher_ModelUnrecognised_RefusesAndWritesNothing` (2 rows: never-launched dir, prior-launch dir) | D7/INV-1 both source states: store, fake-tmux call count, broadcast log and settings file all unchanged on a refusal | pass |
| `internal/server/sessions_test.go` | `TestLauncher_ModelRecognised_ProceedsToCreated` | D8: a recognised verdict proceeds to 201 | pass |
| `internal/server/sessions_test.go` | `TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn` | REQ-2/D6 server half: a check error fails open and the warn log names dir+model | pass |
| `internal/server/sessions_test.go` | `TestLauncher_ValidationFailure_NeverInvokesTheModelCheck` | D9: an invalid request never calls `checkModel` | pass |
| `test/canary/static_test.go` | `TestInstalledBinaryCarriesInterfaceStrings` (extended: model catalog sentence, `--bare`, `--no-session-persistence`) | REQ-9 static tier | pass (offline) |
| `test/canary/harness_test.go` / `canary_test.go` | `unauthRuns` sweep gains `{sessionUnauthDefault, "default"}`; `TestLaunchFlags`'s `permission_mode` table gains the "unauth, explicit default" row | REQ-9: the explicit `default` spelling's wire mapping | untested here — needs `MUSTER_CANARY_FORCE=1` (D13, orchestrator's) |
| `test/canary/harness_test.go` / `canary_test.go` | run F (`f.runF`) + `TestModelCatalogPrecheck` (2 subtests) | REQ-9/D13: `CheckModel`/`RunModelCheck` against the installed binary — an unrecognised custom model and the recognised haiku preset | untested here — needs `MUSTER_CANARY_FORCE=1` (D13, orchestrator's) |

## Implementation Bugs (resolved — history, verdict is now `pass`)

| Bug | File | Expected (per plan) | Actual |
|-----|------|---------------------|--------|
| A ctx-timeout-killed model check is silently treated as success, not an error | `internal/claudecode/modelcheck.go:53-58` (`RunModelCheck`) | REQ-2: "A failure to run the check is logged at warn level with the directory and model." Edge Case 1: "The check hangs (a wedged binary). The 5 s context fires, and WaitDelay bounds a descendant holding the pipe. **The launch proceeds and a warn line is logged.**" Daemon-impl's own Decisions log states the intent explicitly: "only a run that couldn't start at all, or **was killed by WaitDelay/ctx, is reported as an error**." | A process killed by `exec.CommandContext`'s context cancellation returns a plain `*exec.ExitError` (`"signal: killed"`) from `cmd.Run()` — Go does **not** distinguish "exited on its own" from "killed by ctx" at that type. `RunModelCheck`'s `errors.As(err, &exitErr)` check treats both the same and swallows the kill, returning `(emptyStderr, nil)`. `CheckModel` then sees `err == nil`, `stderr` empty → verdict `ModelRecognised`, `err == nil`. `Launch`'s `if err != nil { warn log }` branch never fires, so a wedged-binary launch proceeds **silently** — functionally harmless (still fails open, no launch blocked) but the required warn line never appears. |

**Fixed by daemon-impl's Fix Attempt 1** (`95ec42d`, `internal/claudecode/modelcheck.go`,
`RunModelCheck`): a `ctx.Err()` check now runs ahead of the `errors.As(err, &exitErr)`
swallow — exactly the remedy suggested below — so a ctx-cancelled kill (and a
`WaitDelay`-forced one, which per Go's own `exec.Cmd.WaitDelay` doc only ever fires once
ctx is already done) both now return an error. Re-run of the unchanged regression test
confirms it: see "Re-run after daemon-impl's Fix Attempt 1" above.

**Evidence — standalone Go probe** (isolated from any test framework, to rule out a
testify quirk):
```go
ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
cmd := exec.CommandContext(ctx, "sh", "-c", "sleep 30")
cmd.WaitDelay = 500 * time.Millisecond
err := cmd.Run()
// err: signal: killed (type *exec.ExitError)
// errors.As ExitError: true
// errors.Is DeadlineExceeded: false
```

**Evidence — the failing unit test** (`internal/claudecode/modelcheck_test.go`,
`TestRunModelCheck_ContextDeadlineBoundsAHungProcess`), run via `go test ./internal/claudecode/... -run TestRunModelCheck`:
```
--- FAIL: TestRunModelCheck_ContextDeadlineBoundsAHungProcess (0.10s)
    modelcheck_test.go:220:
        Error Trace:    /Users/damian/Documents/code/Projects/muster/internal/claudecode/modelcheck_test.go:220
        Error:          An error is expected but got nil.
        Test:           TestRunModelCheck_ContextDeadlineBoundsAHungProcess
```
Confirmed this is the only failure in the whole tree: `go test -count=1 ./...` and
`make test` both fail with exactly this one test red, everything else green (pasted
below). I did not modify `internal/claudecode/modelcheck.go` to fix this — test-agent
constraint.

**Suggested remedy** (for daemon-impl, not applied here): check `ctx.Err() != nil` before
or alongside the `errors.As(err, &exitErr)` branch, so a context-cancelled run reports an
error regardless of what shape `cmd.Run()` handed back — e.g. `if ctx.Err() != nil { return
stderr.Bytes(), ctx.Err() }` ahead of the existing `ExitError` check.

## Test Run Output

Current (this re-run, after daemon-impl's Fix Attempt 1): `go build ./...` clean;
`make test` (`go test -count=1 ./...`) — every package `ok`:
```
ok  	github.com/Zalaras/muster/cmd/musterd	70.891s
ok  	github.com/Zalaras/muster/internal/claudecode	23.925s
ok  	github.com/Zalaras/muster/internal/server	50.846s
... (every other package ok, zero failures)
```
Targeted re-run of the regression test alone (`-race`):
```
=== RUN   TestRunModelCheck_ContextDeadlineBoundsAHungProcess
--- PASS: TestRunModelCheck_ContextDeadlineBoundsAHungProcess (0.10s)
PASS
ok  	github.com/Zalaras/muster/internal/claudecode	1.951s
```

`make lint`: `0 issues.`

`MUSTER_CANARY_OFFLINE=1 make canary`: green, including
`TestInstalledBinaryCarriesInterfaceStrings` and `TestSkipDecision`'s 7 rows; every
real-`claude`-driving test correctly skips with `MUSTER_CANARY_OFFLINE is set`. D13's
forced run (`MUSTER_CANARY_FORCE=1 make canary`) was **not** run here per this task's
instructions — that is the orchestrator's, once, with the developer's approval.

`python3 .claude/skills/orchestrate/scripts/dead-refs.py --all`: `2931 references
checked, 0 missing`.

`make check-kb`: 7 "owned by no feature" lines — `internal/claudecode/modelcheck.go`,
`modelcheck_test.go`, the three `web/e2e/launch-*.spec.ts` files, and
`web/src/features/launch-restore.{ts,test.ts}` — confirmed as the same known set named in
this task's instructions, doc-reconcile's to resolve, not a new problem.

---

**Prior (superseded) run**, for history — `go test -count=1 ./...` before the fix:
```
--- FAIL: TestRunModelCheck_ContextDeadlineBoundsAHungProcess (0.10s)
    modelcheck_test.go:220:
        Error Trace:    /Users/damian/Documents/code/Projects/muster/internal/claudecode/modelcheck_test.go:220
        Error:          An error is expected but got nil.
        Test:           TestRunModelCheck_ContextDeadlineBoundsAHungProcess
FAIL
FAIL    github.com/Zalaras/muster/internal/claudecode  14.833s
ok      github.com/Zalaras/muster/internal/server      43.886s
ok      github.com/Zalaras/muster/cmd/musterd          69.162s
... (every other package ok)
```

## Files touched

This re-run touched no test files — the existing `modelcheck_test.go` regression test
already covered the fixed defect exactly, so nothing needed adding or changing. Only this
report (`plans/new-session-improvement/daemon-tests.md`) was updated.

Original files (unchanged since):

- `internal/claudecode/modelcheck_test.go` (new) — D4/D5/D6 tables, including the
  regression test above.
- `internal/claudecode/launch_test.go` — repaired the 5 sanctioned breaks (REQ-4/D10) and
  added the exhaustive `TestBuildArgv_PermissionModeAlwaysExplicit`.
- `internal/server/sessions_test.go` — D7 (both INV-1 source states)/D8/D9, plus a
  server-level fail-open/warn-log test; added the `claudecode` import.
- `test/canary/static_test.go` — REQ-9 static needles (catalog sentence, `--bare`,
  `--no-session-persistence`).
- `test/canary/harness_test.go` — REQ-9: `sessionUnauthDefault`/explicit-`default` sweep
  row, run F (`f.runF`) driving production `CheckModel`/`RunModelCheck` against the
  installed binary, `fixture.modelCheck` result fields.
- `test/canary/canary_test.go` — REQ-9: the sweep table's new row, and
  `TestModelCatalogPrecheck` reading run F's results.

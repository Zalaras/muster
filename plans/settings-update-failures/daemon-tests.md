# Daemon Tests: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: pass
**Pack**: `kb: pack 12058 words (budget 8000)` — WARN exceeds budget; sections rules 885 · features 5124 · diagrams 0 · decisions 3642 · proposed 0 · facts 71 · lessons 1686 · runbooks 644

## Summary

Repaired the two sanctioned test-file breaks daemon-impl's Handoff named
(`internal/selfupdate/install_test.go:57,61` undefined `InstallerRemedy`;
`cmd/musterd/main_test.go:297` missing the new `reclassify` argument), then added unit
coverage for every daemon-side requirement/criterion this plan lists: REQ-1–REQ-12 and
D1–D13 (D14/D15 are Reviewer-Verified — race/layering checks the review agents own, not
this role's).

Tests created: 25 new test functions (many with table subtests — the largest,
`TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates`, is 32 subtests crossing
INV-1 against every source state the plan names) across one new file in
`internal/selfupdate`, one new file in `internal/server`, one new file in `cmd/musterd`,
plus the two repaired pre-existing files.

Passing: all (repaired files + 4 new files) | Failing: 0

`go build ./...`, `make test` (full tree, uncached), `make test-race` (full tree) and
`make lint` all ran green — outputs below. `python3
.claude/skills/orchestrate/scripts/dead-refs.py` reports 739 references checked, 0
missing (up from daemon-impl's 722, consistent with the new REQ/D/kb citations this
plan's tests add). `rg -n "not installed by the muster installer" internal cmd web/src
web/e2e` (D23) still finds nothing.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `internal/selfupdate/install_test.go` | `TestClassify_Table` (repaired) | D1/D2 exact composed remedies replace the removed `InstallerRemedy` constant per case | pass |
| `internal/selfupdate/install_test.go` | `TestReclassify_UnwritableDirectoryRemedy` | D1: composed remedy for a plain error and a real `os.PathError`/`syscall.Errno` chain | pass |
| `internal/selfupdate/install_test.go` | `TestReclassify_UnwritableDirectory_RealFilesystem` | D1 against a real `chmod 0555` dir via the production `WritableDir` func (E2's fixture, at unit scale) | pass |
| `internal/selfupdate/install_test.go` | `TestReclassify_GitTreeRemedy` | D2: immediate-parent and two-levels-up checkout roots, git-at-home is installer, and unwritable-wins-over-git-tree precedence | pass |
| `internal/selfupdate/install_test.go` | `TestReclassify_FlipsBetweenInstallerAndUnmanaged` | D4 at the pure-function level: writability flips the kind both ways | pass |
| `internal/selfupdate/install_test.go` | `TestReclassify_FlipsWhenGitTreeIsRemoved` | D4/edge case 1: removing `.git` flips unmanaged back to installer | pass |
| `internal/selfupdate/failure_test.go` | `TestNetworkCause_Table` / `TestInnermostCause_UnwrapsToTheDeepestError` | The Implementation Notes' unwrap rules: timeout (both shapes), DNS, connection-refused chain, plain error | pass |
| `internal/selfupdate/failure_test.go` | `TestDescribeCheckFailure_Table` | D8: all four REQ-8 sentence shapes, exactly, plus a double-wrapped `errors.As` case | pass |
| `internal/selfupdate/failure_test.go` | `TestDescribeCheckFailure_TransportErrorStripsTheURLEvenThoughTheWrappedErrorCarriesOne` / `_NeverContainsAURL` | INV-2 against the real `*url.Error` shape `net/http` returns | pass |
| `internal/selfupdate/failure_test.go` | `TestDescribeApplyFailure_Table` | D9: both REQ-9 shapes plus every verify.go sentinel/install-error passthrough | pass |
| `internal/selfupdate/failure_test.go` | `TestDescribeApplyFailure_NeverContainsAURL` | INV-2 on the apply side | pass |
| `internal/server/updatereclassify_test.go` | `TestUpdateManager_Reclassify_RunsBeforeEveryCheck` | D5: reclassify runs before the network call, both paths, win or lose | pass |
| `internal/server/updatereclassify_test.go` | `TestUpdateManager_Reclassify_BroadcastsOnceOnChangeNeverOnNoChange` | D5/REQ-5: exactly one broadcast on change (isolated from the check's own), none on no-change | pass |
| `internal/server/updatereclassify_test.go` | `TestUpdateManager_Reclassify_NeverRerunsForDevOrHomebrew` | D7/REQ-6: reclassifyFn never invoked for dev/homebrew | pass |
| `internal/server/updatereclassify_test.go` | `TestUpdateManager_Reclassify_DuringInFlightApplyLeavesItRunning` | D6: a recheck mid-download doesn't disturb the apply, which finishes and actually installs | pass |
| `internal/server/updatereclassify_test.go` | `TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates` | D10: INV-1 crossed against kind × apply phase × pref × check outcome (32 subtests) | pass |
| `internal/server/updatereclassify_test.go` | `TestHandleApplyUpdate_UnsupportedUsesTheCurrentRemedyAfterARecheck` | D12/REQ-7: 409 body is the post-recheck remedy, not the startup one | pass |
| `internal/server/updatereclassify_test.go` | `TestUpdateManager_CheckAvailability_LogsAtWarnForManualDebugForAutomatic` | REQ-11 check half: warn for manual, debug for automatic | pass |
| `internal/server/updatereclassify_test.go` | `TestUpdateManager_FinishApplyFailed_LogsAtWarn` | REQ-11 apply half: full chain at warn | pass |
| `internal/server/updatereclassify_test.go` | `TestHandleCheckUpdate_ExactREQ8Message` | D8 wired through the HTTP layer: exact 502 body for transport/status/tag failures | pass |
| `internal/server/updatereclassify_test.go` | `TestHandleApplyUpdate_FailedDownloadReportsTheExactREQ9Sentence` | D9 download class wired through the HTTP layer + binary untouched | pass |
| `internal/server/updatereclassify_test.go` | `TestHandleApplyUpdate_MissingSignatureReportsTheExactREQ9Sentence` | D9 minisig-404 class wired through the HTTP layer | pass |
| `cmd/musterd/logstartup_test.go` | `TestLogStartup_CarriesExePathAsExe` | D13/REQ-12: `musterd starting` carries `exe` | pass |
| `cmd/musterd/logstartup_test.go` | `TestLogStartup_RemedyLineFollowsWhenPresent` | The REQ-1/REQ-2 remedy log line follows only when a remedy exists | pass |
| `cmd/musterd/main_test.go` | `TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig` (repaired + extended) | Repaired for the new `reclassify` parameter; now also asserts it's threaded through, not rebuilt | pass |

## Implementation Bugs

None found. Verdict: pass.

## Test Run Output

```
$ go build ./...
(exit 0)

$ go vet ./internal/selfupdate/... ./internal/server/... ./cmd/musterd/...
(exit 0)

$ go test -race -count=1 ./internal/selfupdate/... ./internal/server/... ./cmd/musterd/...
ok  	github.com/Zalaras/muster/internal/selfupdate	1.869s
ok  	github.com/Zalaras/muster/cmd/musterd	55.770s
ok  	github.com/Zalaras/muster/internal/server	137.065s

$ make test                                          # full tree, uncached
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	68.724s
... (24 more ok lines, 0 failures) ...
ok  	github.com/Zalaras/muster/tools/versions	9.672s

$ make test-race                                     # full tree, race detector
go test -race -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	70.003s
... (24 more ok lines, 0 failures) ...
ok  	github.com/Zalaras/muster/internal/server	146.124s
... 0 failures

$ make lint
golangci-lint run
0 issues.

$ gofmt -l cmd/musterd/main_test.go cmd/musterd/logstartup_test.go \
    internal/selfupdate/install_test.go internal/selfupdate/failure_test.go \
    internal/server/updatereclassify_test.go
(empty)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 739 references checked, 0 missing

$ rg -n "not installed by the muster installer" internal cmd web/src web/e2e   # D23
(no matches, exit 1)
```

## Notes for the orchestrator

- REQ-13–REQ-19 (the web-side restart record, banner text, reload/handoff) are
  `web-tests`' job per Affected Files — not touched here.
- D14 (`install` read under `mu` everywhere + a `make test-race` case racing a recheck
  against `Current`/`RequestApply`) and D15 (no file outside `internal/selfupdate`
  composes release-host failure text) are the plan's own **Reviewer-Verified** items —
  left to review-work/review-maintainability, not duplicated here. `make test-race`
  above is green regardless, which is corroborating evidence but not a substitute for
  D14's own targeted racer.
- `internal/selfupdate/CLAUDE.md`'s gotcha "Sentinel error text is user-facing" was
  re-checked while writing `TestDescribeApplyFailure_Table`'s passthrough cases: all
  three `verify.go` sentinels still end "nothing was installed" and are asserted
  unchanged.

## Fix Attempt 1 (e2e-validate wave 2 — WS drain-before-close)

**Scope**: daemon-impl's Fix Attempt 1 (commit `2ea779e`) added `drainOutboxes` /
`wsDrainAck` / `closeDrainTimeout` to `internal/server/ws.go` so a broadcast already
queued in a client's outbox (the restarting-phase `update` message) gets a bounded chance
to reach the wire before `closeAll`'s `Close` tears the socket down — root-caused by
e2e-validate's soak run hitting a 1-in-250 scheduling race. Its Handoff named the unit
test daemon-tests should add; this wave adds it, in a new
`internal/server/wshub_drain_test.go`.

### Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `wshub_drain_test.go` | `TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing` | Handoff item 1: `broadcast` then `closeAll` with no sleep, 300 iterations, each asserting the client actually receives the queued message before the socket closes | pass |
| `wshub_drain_test.go` | `TestWSHub_CloseAllBoundedWithQueuedMessageOnNonReadingPeer` | Handoff item 2: a message queued for a client that never reads (dequeues neither the message nor the close handshake) still lets `closeAll` return within a bounded time | pass |
| `wshub_drain_test.go` | `TestDrainOutboxes_AckedClientReturnsWellUnderTheBound` | Handoff item 3 (direct, package-internal): a client whose outbox is actively drained closes the ack marker immediately, well under `closeDrainTimeout` | pass |
| `wshub_drain_test.go` | `TestDrainOutboxes_DeadReaderHitsTheBound` | Handoff item 3 (direct, package-internal): a client whose outbox nothing ever reads still returns at `closeDrainTimeout`, not later, not never | pass |

### Proving the race test fails on the pre-fix code

Per the task's instruction, `TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing` was
proven against pre-fix `ws.go` in a throwaway copy, never by touching the shared tree:
`git archive 37caef8 | tar -x` into a scratch dir (`37caef8` is the commit immediately
before the fix, "test(settings-update-failures): validate E2E specs; soak surfaces a real
restart-broadcast race" — confirmed by reading that commit's `internal/server/ws.go`,
which has no `drainOutboxes`/`wsDrainAck`/`closeDrainTimeout`), then copying in the new
test (only the one test + `probeMessage`, isolated from the other three which reference
fix-only symbols and can't compile against pre-fix code). Ran it 4 times: **every run
failed on iteration 0**, in well under a second, with:

```
Error: Received unexpected error:
       failed to read JSON message: failed to get reader: received close frame:
       status = StatusNormalClosure and reason = "musterd shutting down"
```

i.e. the client got the shutdown close frame instead of the queued probe message —
exactly the loss Fix Attempt 1's root-cause analysis describes. The scratch dir was
removed after (`rm -rf`), never left behind.

### A test-design bug found and fixed along the way (not an implementation bug)

The first version of `TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing` read the
probe message only *after* `closeAll()` returned, sequentially. Against the **fixed**
code this made every iteration pay `closeAll`'s own ~5s close-handshake timeout: `Close()`
blocks waiting for the peer's close-frame reply, and coder/websocket only sends that
reply from inside a `Read` call that observes the incoming close frame — which hadn't
happened yet, since the test's own read was scheduled to start later. 300 iterations ×
~5s means the run doesn't hang forever, but it durably exceeds any reasonable foreground
gate timeout (confirmed: 5 iterations alone took 25s, i.e. ~5s/iteration, matching the
close-handshake timeout exactly). Fixed by starting the client's read in a goroutine
*before* `broadcast`/`closeAll` (matching a real dashboard's always-on read loop) and
issuing a second `Read` after the probe to let the library see and ack the close frame —
confirmed by adding temporary `t.Logf` timestamps per iteration, seeing each iteration
stall for ~5s at exactly the `closeAll()` call, then confirming 5 iterations dropped to
0.02s total once the client read concurrently. Re-verified the corrected test still fails
reliably (4/4 runs, iteration 0) against the pre-fix scratch copy above, so the fix to the
test's own concurrency shape didn't accidentally weaken what it catches.

### Gates (this wave)

```
$ go build ./...                                        # exit 0
$ go vet ./internal/server/...                           # exit 0
$ gofmt -l internal/server/wshub_drain_test.go           # empty
$ go test -count=1 -run 'TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing|TestWSHub_CloseAllBoundedWithQueuedMessageOnNonReadingPeer|TestDrainOutboxes_' -v ./internal/server/...
--- PASS: TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing (0.14s)
--- PASS: TestWSHub_CloseAllBoundedWithQueuedMessageOnNonReadingPeer (5.01s)
--- PASS: TestDrainOutboxes_AckedClientReturnsWellUnderTheBound (0.00s)
--- PASS: TestDrainOutboxes_DeadReaderHitsTheBound (0.25s)
ok  	github.com/Zalaras/muster/internal/server	6.529s

$ go test -race -count=1 -run 'TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing|TestWSHub_CloseAllBoundedWithQueuedMessageOnNonReadingPeer|TestDrainOutboxes_' -v ./internal/server/...
(all 4 pass, ok, 8.201s)

$ go test -race -count=1 ./internal/server/...           # full package, race
ok  	github.com/Zalaras/muster/internal/server	142.592s

$ make lint
golangci-lint run
0 issues.

$ make test                                              # full tree, uncached
go test -count=1 ./...
... 26 ok lines, 0 failures ...

$ .claude/skills/orchestrate/scripts/size-warn.sh | grep wshub_drain
(no output — file not warned)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 746 references checked, 0 missing
```

**Verdict for this wave: pass.** No implementation bug found; `closeAll`'s new
drain-before-close behaviour matches Fix Attempt 1's Handoff exactly under both named
guarantees, and both regressed to failure on the pre-fix code as expected.

## Fix Attempt 2 (review cycle 1)

**Scope**: cycle 1's `[daemon-tests]`-tagged correctness issues (Major 2, Major 3, Minor 2)
plus one correctness Minor 1 case daemon-impl's own Fix Attempt 2 left for this role (its
Handoff/Decisions record it fixed the bug but didn't add the test, since impl agents don't
write tests). Also repaired the one sanctioned break daemon-impl's Fix Attempt 2 Handoff
named: `drainOutboxes` gained a `log zerolog.Logger` parameter.

### Sanctioned break repaired

- `internal/server/wshub_drain_test.go:155,176` — both `drainOutboxes(clients)` calls now
  pass `zerolog.Nop()` as the second argument, per daemon-impl's Handoff. Added the
  `"github.com/rs/zerolog"` import.

### Issues addressed

- **Major 2 (D8 fourth class untested through the HTTP layer)**: added a fourth subtest,
  "anything else: no Location header on the redirect", to
  `TestHandleCheckUpdate_ExactREQ8Message` (`internal/server/updatereclassify_test.go`). It
  drives a real 302-with-no-`Location` response through `handleCheckUpdate` end to end and
  asserts the exact single-prefix sentence, plus `strings.Count(got, "update check
  failed:") == 1` so a doubled prefix (Major 1's bug) fails this test directly rather than
  only the pure-function table in `failure_test.go`. Confirmed against the pre-fix shape
  by reading Major 1's own repro in review.md (not re-run against old code — Major 1 was
  daemon-impl's to fix and is already fixed and verified in its own Fix Attempt 2 log);
  this test's assertion is the one that would have caught it.
- **Major 3 (D14's racer half missing)**: added
  `TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent`
  (`internal/server/updatereclassify_test.go`), run under `go test -race`. Three goroutines
  loop for 200 iterations each against one shared `*updateManager`: one calling
  `checkAvailability` (which runs `reclassify` as its own first step), one calling
  `RequestApply`, one calling `Current` and asserting INV-1 on every read. The `Reclassify`
  seam flips installer↔unmanaged on every call, so `RequestApply`'s `MayApply` check and
  `reclassify`'s write are actively contended, not just theoretically concurrent. The
  `OnChange` channel (buffered 64 in the shared `newTestUpdateManager` helper) is drained by
  a background goroutine for the run's duration — undrained, the emit volume from 200
  concurrent checks/reclassifies/apply-failures overruns the buffer and deadlocks `m.emit()`
  inside the race, which would silently turn "the racer never ran" into "the test hung",
  not a red assertion. `exePath` points at a fresh `t.TempDir()` file (never the zero-value
  default, which would have `AcquireLock` write a lock file into the process's own working
  directory). `go test -race -count=1 -run
  TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent -v ./internal/server/...` passes
  in 0.05s with the race detector enabled; `go build`/`go vet` clean.
- **Minor 2 (D10/INV-1 cross-product missing two dimensions)**: extended
  `TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates` with a `starts` dimension
  (`{Kind: KindInstaller}`, `{Kind: KindUnmanaged, Remedy: "startup remedy"}`) crossed
  against the existing `next`/`phase`/`checkEnabled`/`checkFails` dimensions — the
  constructed manager's `Install` was previously always `KindInstaller`. Also set
  `m.installed` (not just `m.applyVersion`) whenever `phase == PhaseDone`, since
  `runApply` (`updatemanager.go`) always sets both together on a successful apply — a
  "done" state with `applyVersion` but no `installed` can't actually occur, so the table
  was testing a state INV-1 never has to hold in. 32 subtests → 64; all pass, in 0.05s.
- **Minor 1's test (correctness; daemon-impl fixed the code, left the test)**: added
  `TestDescribeCheckFailure_MalformedLocationNeverLeaksTheURL`
  (`internal/selfupdate/failure_test.go`). Rather than hand-building an error shape, it
  starts a real `httptest.Server` answering a 302 with the review's own malformed
  `Location` (`.../v1%zz`) and drives it through the real `LatestTag` — confirming, via
  `errors.As`, that net/http's own `Client.Do` failure (it resolves `Location` before
  `LatestTag`'s `CheckRedirect` ever runs) surfaces as a `*TransportError`, not some other
  shape — then asserts `DescribeCheckFailure` on that real error is exactly `"update check
  failed: couldn't reach the release host (an unreadable response)"` and contains no
  `"://"`. Confirmed this only passes on the current tree: the guard is in `networkCause`
  (`internal/selfupdate/failure.go`), and without it this test's exact-text assertion would
  see the raw `Location` value from the wrapped `*url.Error` instead.

### Comment cleanup

The first drafts of four of the comments above cited `review.md correctness Major
1`/`Major 2`/`Major 3`/`Minor 1`/`Minor 2` by name — the same plan-review-cycle citation pattern
maintainability Major 1 (this same cycle) flagged and had removed from production code.
Caught it re-reading the diff before writing this log (docs/conventions.md § Comments:
cite `kb:<type>/<slug>`, "never by path, date or plan name") and reworded all four to state
the why directly, matching the sibling D-number/REQ-number style these test files already
use throughout.

### Blast radius measured

- `drainOutboxes(` call sites: `rg -n "drainOutboxes\(" internal/server` → 3 (`ws.go`'s
  declaration and `closeAll`, both already updated by daemon-impl; `wshub_drain_test.go`'s
  two direct calls, both repaired here) — nothing else references it.
- `errCheckFailed`: confirmed removed from production code by daemon-impl's Fix Attempt 2;
  no test file (including the one this wave edits) references the removed symbol.

### Verification run

```
$ go build ./...                                        # exit 0
$ go vet ./...                                           # exit 0
$ gofmt -l internal/server/updatereclassify_test.go internal/selfupdate/failure_test.go \
    internal/server/wshub_drain_test.go                  # empty
$ go test -race -count=1 -run \
    'TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent|TestHandleCheckUpdate_ExactREQ8Message' \
    -v ./internal/server/...                             # all subtests PASS
$ go test -race -count=1 -run \
    'TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates' -v ./internal/server/...
    # 64/64 subtests PASS, 2.30s
$ go test -race -count=1 -run \
    'TestDescribeCheckFailure_MalformedLocationNeverLeaksTheURL' -v ./internal/selfupdate/...
    # PASS
$ go test -race -count=1 ./internal/selfupdate/... ./internal/server/... ./cmd/musterd/...
ok  	github.com/Zalaras/muster/internal/selfupdate	1.6s
ok  	github.com/Zalaras/muster/internal/server	144.3s
ok  	github.com/Zalaras/muster/cmd/musterd	54.8s

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 768 references checked, 0 missing

$ rg -n "not installed by the muster installer" internal cmd web/src web/e2e   # D23
(no matches, exit 1)

$ make test                                              # full tree, uncached — 0 failures
$ make lint                                               # golangci-lint run — 0 issues
$ make test-race                                          # full tree, race — 0 failures

$ bash .claude/skills/orchestrate/scripts/size-warn.sh --changed
WARN  internal/server/updatereclassify_test.go:200:6: TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent is too long (69 > 60) (funlen)
WARN  internal/server/updatereclassify_test.go:441:6: TestHandleCheckUpdate_ExactREQ8Message is too long (61 > 60) (funlen)
# plus 7 pre-existing hits (main.go/server.go/main_test.go/install_test.go/updatemanager.go),
# unchanged by this wave (already accounted for in daemon-impl's Fix Attempt 2 log).
```

**New size warnings, reasons (WARN never fails — kb:adr/process-size-linters-warn-never-fail):**
- `TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent` (69 lines): this cycle's own ask
  is one racer exercising three seams concurrently against one shared manager under
  `-race`; splitting the three goroutines into separate helper functions would obscure that
  they share the same manager instance and run concurrently, which is the point of the test.
- `TestHandleCheckUpdate_ExactREQ8Message` (61 lines, was under 60 before this wave): the
  fourth subtest this cycle asks for is one more case in an existing table-shaped test
  (three subtests already present); a table-driven test naturally grows by one case per
  requirement it covers, and the four subtests share nothing further to extract.

**Verdict for this wave: pass.** No implementation bug found in any of the three areas
reviewed. `TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent` passes under `-race`
against the current tree (its purpose is proving the existing `m.mu` guard actually holds
under concurrency, not catching a new bug), `TestHandleCheckUpdate_ExactREQ8Message`'s new
subtest confirms Major 1's fix (already landed by daemon-impl this cycle) end to end, the
extended `TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates` holds across all 64
source-state combinations, and `TestDescribeCheckFailure_MalformedLocationNeverLeaksTheURL`
confirms Minor 1's `networkCause` URL guard (already landed by daemon-impl this cycle)
against the real net/http error shape.

## Fix Attempt 3 (review cycle 2)

**Scope**: cycle 2's two `[daemon-tests]`-tagged issues — correctness Major 2 (INV-2
untested against the fourth, unclassified `DescribeCheckFailure` class) and the
`[daemon-tests]` half of maintainability Minor 1 (the one bare `newWSHub()` test call left
after daemon-impl added the constructor's `log` parameter).

### Issues addressed

- **Correctness Major 2**: `internal/selfupdate/failure_test.go` gained three new test
  functions covering every one of D8's four `check_failed` classes for INV-2, not three:
  - `TestDescribeCheckFailure_FourthClassNeverLeaksTheURL` drives the real `LatestTag`
    against an `httptest` server, in two subtests: a **300** (not 302 — net/http never
    auto-follows or auto-parses Location for 300/304/305/306, only 301/302/303/307/308,
    which is why this class reaches `LatestTag`'s own `url.Parse` instead of becoming a
    `*TransportError`) with a malformed `Location: …/v1%zz`, and a 300 with no `Location`
    header at all. Both assert `DescribeCheckFailure`'s output contains no `://`; the
    malformed-Location case pins the exact fallback sentence, the no-Location case pins the
    unmodified pass-through sentence (it never carried a URL to begin with).
  - `TestDescribeCheckFailure_MalformedBaseURLNeverLeaksTheURL` covers review's second
    measured leak path (a malformed base URL fails inside `LatestTag`'s own
    `http.NewRequestWithContext`, before any round trip, so no server is needed), which the
    review flagged as cheap to add alongside the Location cases.
  - All three drive the real `LatestTag`/`DescribeCheckFailure` pair end to end (no
    hand-built error), matching the review's own repro method.
- **Maintainability Minor 1 ([daemon-tests] half)**: `internal/server/shellactivity_test.go:439`'s
  `hub := newWSHub()` is now `hub := newWSHub(zerolog.Nop())`, matching every other
  logger-bearing constructor in the package (daemon-impl's Fix Attempt 3 changed
  `newWSHub`'s signature; `rg -n "newWSHub\(" internal/server` confirms this was the only
  remaining bare call — `server.go`'s own construction and `ws.go`'s declaration were
  already updated).

### Red/green proof (correctness Major 2)

Major 1 (the production fix) landed in c973ed3, parent commit e0f8a22. Verified the three
new cases fail on the pre-fix code without touching the shared tree: `git archive e0f8a22`
extracted into a scratch directory (`/private/tmp/.../scratchpad/prefix-check`, deleted
after), the new `failure_test.go` section copied in, then run there:

```
$ go test ./internal/selfupdate/... -run \
    'TestDescribeCheckFailure_FourthClassNeverLeaksTheURL|TestDescribeCheckFailure_MalformedBaseURLNeverLeaksTheURL' -v
--- FAIL: TestDescribeCheckFailure_FourthClassNeverLeaksTheURL (0.00s)
    --- FAIL: TestDescribeCheckFailure_FourthClassNeverLeaksTheURL/300_with_a_malformed_Location (0.00s)
        Error: "update check failed: parsing redirect location \"https://github.com/Zalaras/muster/releases/tag/v1%zz\": parse \"https://github.com/Zalaras/muster/releases/tag/v1%zz\": invalid URL escape \"%zz\"" should not contain "://"
    --- PASS: TestDescribeCheckFailure_FourthClassNeverLeaksTheURL/300_with_no_Location_header (0.00s)
--- FAIL: TestDescribeCheckFailure_MalformedBaseURLNeverLeaksTheURL (0.00s)
        Error: "update check failed: building latest-release request: parse \"http://exa mple.test/latest\": invalid character \" \" in host name" should not contain "://"
FAIL
```

The no-Location subtest passes even pre-fix (it never carried a URL), which is why the
review's own text asks for it "so every class of the four is covered" rather than because
it alone would catch the bug — it documents the fourth class's other shape (missing
Location, not malformed) has no leak to begin with. The two failing cases match review's
own measured text (Major 1, correctness) exactly. Against the current tree (post c973ed3),
all three subtests plus the pre-existing base-URL case pass — see the verification run
below.

### Verification run

```
$ go build ./...                                          # exit 0
$ go test ./internal/selfupdate/... -run 'TestDescribeCheckFailure' -v
--- all PASS, including the three new functions/subtests above
$ rg -n "newWSHub\(" internal/server
internal/server/shellactivity_test.go:439:  hub := newWSHub(zerolog.Nop())
internal/server/server.go:152:              hub: newWSHub(cfg.Logger),
internal/server/ws.go:61:   func newWSHub(log zerolog.Logger) *wsHub {
$ make test                                                # full tree, uncached — 0 failures
$ make lint                                                # golangci-lint run — 0 issues
$ make test-race                                           # full tree, race — 0 failures
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 776 references checked, 0 missing
$ bash .claude/skills/orchestrate/scripts/size-warn.sh --changed
# 10 hits, none in either file this wave touched — the same pre-existing set daemon-impl's
# and daemon-tests' earlier logs already carry a reason for (main.go/server.go filelen,
# funlen on parseFlags/run/New/TestBuildServerConfig_.../TestClassify_Table/
# TestTick_BusyGating_Table/the two updatereclassify_test.go table tests)
```

### Comment check

Re-read every comment added this wave against docs/conventions.md § Comments before
writing this log: no narration, no citation of a review cycle/issue label (review's
correctness cycle-2 Note flagged that pattern in a sibling file this wave doesn't touch;
`grep -n "cycle\|Minor [0-9]\|Major [0-9]" internal/selfupdate/failure_test.go
internal/server/shellactivity_test.go` finds nothing), and every symbol/target named
(`LatestTag`, `DescribeCheckFailure`, `*TransportError`, `url.Parse`,
`http.NewRequestWithContext`, D8) exists and was read.

**Verdict for this wave: pass.** Both issues were test-only gaps (missing coverage, one
stale constructor call), not implementation defects — the production fix for correctness
Major 1 and the constructor-signature change for maintainability Minor 1 were both already
landed by daemon-impl this cycle. The new tests prove Major 1's fix red-then-green against
the actual pre-fix code rather than assuming it from the diff.

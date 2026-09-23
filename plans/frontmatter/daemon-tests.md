# Daemon Tests: Frontmatter

**Plan**: frontmatter
**Verdict**: pass
**Pack**: `go run ./tools/kb pack --plan frontmatter --role daemon-tests` — `kb: pack 7247 words (budget 8000)` — sections rules 841 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 1523 · runbooks 2

## Summary

The daemon-side scope of this plan is REQ-8/REQ-9 (D7, `kb:adr/reader-plan-sticky-once-named`),
implemented entirely in `internal/server/reader.go`'s `scanPlan` (commit `68ad61d`, already on the
branch). REQ-9 (the straggler `claudeSessionID` gate) was explicitly left unchanged by the
implementer and is already covered by the existing
`TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` — that test asserts the
plan is unmoved across a `/clear` rebind with three reordered stale hooks. Nothing in this plan's
scope touches that path, so it needed no new coverage; I read it to confirm it still passes
unchanged (`go test ./internal/server/... -run TestIngestRouting_Straggler -v`, PASS).

REQ-8 itself — retention: a scan finding nothing keeps the retained plan path and re-derives
`exists` by stat, and a scan finding a plan always replaces — had **no** existing coverage. Both
tests that exercise `scanPlan`'s trigger path
(`TestHandleReaderList_NoTranscriptRespondsPlanNullAndBroadcastsNothing`,
`TestHandleReaderList_KnownTranscriptResolvesPlanAndBroadcastsBeforeResponding`) start from a
session with no prior plan, so neither enters the new retained-path branch (confirmed by reading
both — the daemon-impl log states this and I verified it by reading the two tests directly). I
added `TestScanPlan_StickyOnceNamed`, a table crossing every reachable retention state (no plan
retained yet; a retained plan whose file is still on disk; a retained plan whose file has since
been deleted) against every scan outcome a real transcript scan can produce (transcript file
missing; transcript exists but names no plan; transcript names a new plan whose file exists;
transcript names a new plan not yet written) — 3 x 4 = 12 subtests, calling `scanPlan` directly
(same package) against a real `session.Manager` via the existing `newTestServer`/
`seedLiveSessionInDir` helpers, matching the file's established pattern for `scanPlan`-adjacent
tests. This is the "invariant gets cross-state coverage" case by construction: the "scan finds
nothing never clears a retained plan, and always re-derives `exists`" rule is checked from both a
present-file and a deleted-file retained state, not just the transition that motivated the fix.

**Size-warn note**: `make size-warn` reports `TestScanPlan_StickyOnceNamed` at 106 lines
(funlen threshold 60), warn-only per `kb:adr/process-size-linters-warn-never-fail`. It is one
function because it is one exhaustive cross-product table (2 tables crossed by a nested loop);
splitting it into 12 named functions would fragment the invariant into per-transition tests
of exactly the kind `kb:lesson/invariant-missed-by-per-transition-tests` warns against, for no
readability gain — the table rows are already named and run as independent `t.Run` subtests.

No implementation bugs found. `go build ./...`, `make test` and `make lint` are all clean.

Tests created: 3 (14 subtests) | Passing: 14 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_file_does_not_exist` | First-ever scan, missing transcript: plan stays null | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_exists_but_names_no_plan` | First-ever scan, planless transcript: plan stays null | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_names_a_plan_whose_file_exists` | First-ever scan finds a plan: path set, exists true | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_names_a_plan_not_yet_written` | First-ever scan finds a plan not yet on disk: path set, exists false | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_file_does_not_exist` | REQ-8: scan finds nothing (missing transcript) — retained path survives, exists stays true | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_exists_but_names_no_plan` | REQ-8: scan finds nothing (planless transcript) — retained path survives, exists stays true | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_names_a_plan_whose_file_exists` | A scan naming a plan always replaces, even with a plan already retained | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_names_a_plan_not_yet_written` | Replacement plan not yet on disk: new path, exists false | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_file_does_not_exist` | REQ-8's key case: retained path's file deleted, scan finds nothing — path stays, exists re-derived to false by stat | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_exists_but_names_no_plan` | Same as above via a planless (not missing) transcript | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_names_a_plan_whose_file_exists` | Replacement still wins even when the previously-retained file was deleted | pass |
| `internal/server/reader_test.go` | `TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_names_a_plan_not_yet_written` | Replacement to a not-yet-written plan even after the old file was deleted | pass |

| `internal/server/reader_test.go` | `TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched` | D6/edge case 10: a planless scan of session A leaves session B's retained plan and broadcast untouched | pass |
| `internal/server/reader_test.go` | `TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained` | D4/edge case 3: SessionStart(B) processed before A's late SessionEnd — the rebind's own scan retains the pre-clear plan, and the late SessionEnd moves nothing further | pass |

### Declined coverage

- REQ-9 (straggler gate, unaffected by this plan): covered by the pre-existing
  `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan`
  (`internal/server/reader_test.go:751`), whose final assertions —
  `assert.Equal(t, planB, got.PlanPath, "a straggler's scan must never move the plan")` and
  `assert.True(t, got.PlanExists)` — are exactly REQ-9's case: a straggler hook's `scanPlan` call
  runs (and would hit the new retained-path fallback), but `SetPlan`'s `claudeSessionID` mismatch
  discards the result before persistence, so B's plan is untouched. Verified still green after my
  changes.

## Implementation Bugs

None.

## Fix Attempt 1 (review cycle 1)

**Failure addressed**: correctness Major 3 — `TestScanPlan_StickyOnceNamed` asserted only the
final `PlanPath`/`PlanExists` after a direct `scanPlan` call, so four acceptance criteria had no
test asserting what they state: D2 ("broadcast once") and D3 ("broadcasts it") — no broadcast was
observed; D5 ("broadcasts nothing") — only the pre-existing no-transcript listing test covered it,
not the planless-*transcript* case; D4 (SessionStart{clear} applied before the late
SessionEnd{clear}, edge case 3) — no test anywhere, the existing straggler test delivers
SessionEnd first; D6 (a planless scan of one session leaves another untouched, edge case 10) — no
test anywhere.

**Changes made**:
- `TestScanPlan_StickyOnceNamed` (`internal/server/reader_test.go`): each of the 12 subtests now
  dials its own WS client after `rs.setup` and reads `before, _ := srv.manager.Get(sess.ID)` — the
  session's *actual* pre-scan state, not `setup`'s returned `retainedPath`/`retainedExists` (those
  name what a scan finding nothing must leave in place, which for the "file since deleted" row is
  `exists:false` even though the session's actually-stored `PlanExists` is still `true` until a
  scan re-derives it by stat — using the returned values as the "before" baseline would have wrongly
  called that row's exists-flip a no-op). After `scanPlan` runs, if the final `wantPath`/`wantExists`
  differs from `before`, the subtest reads exactly one `sessionUpsertMessage` off the socket,
  asserts it carries the committed plan (D2/D3), then calls `assertNoSessionUpsertArrives` to prove
  it was exactly one and not a second (D2's "broadcast once"); otherwise it calls
  `assertNoSessionUpsertArrives` directly (D5). Of the 12 rows, 4 (both "no plan retained yet" and
  "plan retained, file still on disk" crossed with the two scan-finds-nothing outcomes) exercise
  the no-broadcast branch and 8 exercise the broadcast branch — both branches are live, not
  vacuous (confirmed by the run: every subtest that should broadcast did, per the passing
  `readJSON[sessionUpsertMessage]` calls below; a wrong assertion would have timed out the read,
  not passed silently).
- `TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched` (new): two sessions,
  A and B, each bound to its own Claude id with its own plan set via `SetPlan`. A planless
  transcript (`RawSessionEnd`, names no plan) is scanned against A only
  (`srv.reader.scanPlan(ctx, sessA.ID, claudeA, transcriptA)`); asserts B's `PlanPath`/`PlanExists`
  are unchanged and that no `sessionUpsert` arrives for either session (neither actually changed).
  This is the "destructive/lifecycle path gets multi-instance coverage on shared substrates" case
  applied to `Manager.ApplyPlanScan`'s single `m.sessions` map — the shared substrate here — asserting
  the untouched session, not just the touched one.
- `TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained` (new): through the
  real ingest path (`postIngest` + `srv.ingest.queue.Drain`, not a direct `scanPlan` call, since
  D4 is about hook *arrival order*, which only the ingest pipeline can exercise), binds to
  claude id A, sets a plan, then delivers the rebind's `SessionStart(claudeB, source:"clear")`
  — which fires its own scan against a transcript naming no plan — **before** A's `SessionEnd`
  arrives at all. Asserts the plan is retained after the rebind's own scan (proving D4 does not
  depend on the SessionEnd having come first), then delivers the late `SessionEnd(claudeA)` and
  asserts nothing further moves: `SessionEnd` never sets `PlanMaybeReady`
  (`claudecode.InterpretFiles`), so it fires no scan by construction regardless of order, and its
  `claudeSessionID` (A) no longer names the session's current binding (B) — the same straggler
  gate `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` already covers for
  the SessionEnd-first ordering; this test covers the SessionStart-first ordering D4 names.

**Verification**: `go build ./...` — exit 0. `go test ./internal/server/... -run
'TestScanPlan_StickyOnceNamed|TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched|TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained'
-v` — all 14 subtests/tests PASS. `go test -race -count=1 ./internal/server/... ./internal/session/...`
— both `ok`. `make test` — every package `ok`. `make lint` — `0 issues`. `python3
.claude/skills/orchestrate/scripts/dead-refs.py` — `611 references checked, 0 missing`.

**Size-warn**: `TestScanPlan_StickyOnceNamed` now reports 131 lines (was 106; funlen threshold
60), still warn-only (`kb:adr/process-size-linters-warn-never-fail`). The added lines are the
per-subtest broadcast assertion, which is the same "one exhaustive cross-product table" shape the
original size-warn note justified — splitting it would fragment the invariant back into
per-transition tests (`kb:lesson/invariant-missed-by-per-transition-tests`). The two new
standalone tests stay under the threshold.

**Implementation bugs found**: none. All four gaps were coverage-only; `Manager.ApplyPlanScan`'s
already-implemented behaviour (from wave 1's fix) satisfied every new assertion on the first run.

## Fix Attempt 2 (review cycle 2)

**Failure addressed**: correctness Minor 1 —
`TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained` said three times
(header comment and one assertion message) that the rebind's own scan runs "against a transcript
naming no plan" / "(transcriptB names no plan)", but `transcriptB` was the literal
`/tmp/transcript-clear-before-late-end-b.jsonl`, never written to disk (`ls` confirms it does not
exist). `LocatePlanFile` (`internal/claudecode/plan.go:87`) treats a missing file as `PlanFile{}`
via its own dedicated branch (`os.Open` returns `os.ErrNotExist` → early return, before
`scanPlanFile` ever runs) — a different branch from the one a real `/clear` produces, where the new
transcript exists and simply contains no plan-file evidence yet
(`kb:fact/clear-mints-new-session-id`). Both branches happen to converge on `foundPath == ""`, so
D4's assertion still passed, but the test wasn't exercising the route its own comments claimed.

**Change made**: `transcriptB` is now written for real, into `t.TempDir()`, with
`claudecodetest.RawSessionEnd(claudeB, "other")` content — a real file with no plan-file marker in
it, the same fixture pattern `TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched`
(this file, D6) already uses for "planless transcript". This makes the rebind's `SessionStart(B)`
scan take `scanPlanFile`'s empty-scan return, not `LocatePlanFile`'s missing-file short-circuit —
the branch the header comment and the D4 assertion message actually describe. Added a short comment
at the declaration explaining why transcriptB is now written while transcriptA (right above it) is
not: A's own `SessionStart` scan runs before `SetPlan` is called, when the session has no plan yet
either way, so nothing in this test depends on transcriptA's content or existence — checked by
reading the test's own sequencing (bindA's scan happens at line ~1085, `SetPlan` at line ~1091,
after it) and confirming no assertion or comment makes a claim about what that first scan finds.

**Verification**: `go build ./...` — exit 0. `go test ./internal/server/... -run
TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained -v` — PASS. `make test`
— every package `ok`. `make lint` — `0 issues`. `python3
.claude/skills/orchestrate/scripts/dead-refs.py` — `611 references checked, 0 missing` (the new
comment's `kb:fact/clear-mints-new-session-id` citation resolves).

**Blast radius**: one file changed (`internal/server/reader_test.go`), one test's setup block; no
other test reads `transcriptB` before this point, and the assertions after it (on `got.TranscriptPath`,
`got.PlanPath`) are unchanged and still pass with the real path.

**Implementation bugs found**: none. This was a test-fixture gap, not a behaviour gap — the
reviewer's own diff confirms D4's assertion still held either way; only the route exercised was
wrong.

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ go test ./internal/server/... -run TestScanPlan_StickyOnceNamed -v
=== RUN   TestScanPlan_StickyOnceNamed
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_file_does_not_exist
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_exists_but_names_no_plan
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_names_a_plan_whose_file_exists
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_names_a_plan_not_yet_written
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_file_does_not_exist
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_exists_but_names_no_plan
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_names_a_plan_whose_file_exists
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_names_a_plan_not_yet_written
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_file_does_not_exist
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_exists_but_names_no_plan
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_names_a_plan_whose_file_exists
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_names_a_plan_not_yet_written
--- PASS: TestScanPlan_StickyOnceNamed (0.15s)
    (all 12 subtests PASS)
PASS
ok  	github.com/Zalaras/muster/internal/server	1.276s

$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	20.766s
ok  	github.com/Zalaras/muster/internal/claudecode	15.703s
ok  	github.com/Zalaras/muster/internal/ghissue	0.413s
ok  	github.com/Zalaras/muster/internal/gitutil	1.623s
ok  	github.com/Zalaras/muster/internal/kb	3.261s
ok  	github.com/Zalaras/muster/internal/locate	2.802s
ok  	github.com/Zalaras/muster/internal/selfupdate	3.217s
ok  	github.com/Zalaras/muster/internal/server	37.176s
ok  	github.com/Zalaras/muster/internal/session	8.079s
ok  	github.com/Zalaras/muster/internal/store	3.886s
ok  	github.com/Zalaras/muster/internal/termbridge	6.178s
ok  	github.com/Zalaras/muster/internal/tmux	16.564s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	5.672s
ok  	github.com/Zalaras/muster/internal/triage	5.059s
ok  	github.com/Zalaras/muster/internal/tty	5.251s
ok  	github.com/Zalaras/muster/internal/usage	4.981s
ok  	github.com/Zalaras/muster/internal/webui	5.337s
ok  	github.com/Zalaras/muster/tools/kb	5.053s
ok  	github.com/Zalaras/muster/tools/triage	3.296s
ok  	github.com/Zalaras/muster/tools/versions	9.758s

$ make lint
golangci-lint run
0 issues.

$ make size-warn (relevant lines only)
WARN  internal/server/reader_test.go:437:6: Function 'TestScanPlan_StickyOnceNamed' is too long (106 > 60) (funlen)
WARN  internal/server/reader_test.go:873:6: Function 'TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan' has too many statements (46 > 40) (funlen)
```

## Fix Attempt 1 Test Run Output

```
$ go build ./...
(exit 0, no output)

$ go test ./internal/server/... -run 'TestScanPlan_StickyOnceNamed|TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched|TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained' -v
=== RUN   TestScanPlan_StickyOnceNamed
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_file_does_not_exist
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_exists_but_names_no_plan
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_names_a_plan_whose_file_exists
=== RUN   TestScanPlan_StickyOnceNamed/no_plan_retained_yet/transcript_names_a_plan_not_yet_written
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_file_does_not_exist
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_exists_but_names_no_plan
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_names_a_plan_whose_file_exists
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_still_on_disk/transcript_names_a_plan_not_yet_written
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_file_does_not_exist
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_exists_but_names_no_plan
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_names_a_plan_whose_file_exists
=== RUN   TestScanPlan_StickyOnceNamed/plan_retained,_its_file_since_deleted/transcript_names_a_plan_not_yet_written
--- PASS: TestScanPlan_StickyOnceNamed (3.87s)
    (all 12 subtests PASS, including the new broadcast assertions)
=== RUN   TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched
--- PASS: TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched (0.32s)
=== RUN   TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained
--- PASS: TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained (0.03s)
PASS
ok  	github.com/Zalaras/muster/internal/server	5.343s

$ go test -race -count=1 ./internal/server/... ./internal/session/...
ok  	github.com/Zalaras/muster/internal/server	94.326s
ok  	github.com/Zalaras/muster/internal/session	27.414s

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 611 references checked, 0 missing

$ make size-warn (relevant lines only)
WARN  internal/server/reader_test.go:443:6: Function 'TestScanPlan_StickyOnceNamed' is too long (131 > 60) (funlen)
WARN  internal/server/reader_test.go:961:6: Function 'TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan' has too many statements (46 > 40) (funlen)
```

## Fix Attempt 2 Test Run Output

```
$ go build ./...
(exit 0, no output)

$ go test ./internal/server/... -run TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained -v -count=1
=== RUN   TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained
--- PASS: TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained (0.03s)
PASS
ok  	github.com/Zalaras/muster/internal/server	1.133s

$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	24.734s
ok  	github.com/Zalaras/muster/internal/claudecode	19.280s
ok  	github.com/Zalaras/muster/internal/ghissue	1.318s
ok  	github.com/Zalaras/muster/internal/gitutil	2.753s
ok  	github.com/Zalaras/muster/internal/kb	5.646s
ok  	github.com/Zalaras/muster/internal/locate	4.284s
ok  	github.com/Zalaras/muster/internal/selfupdate	3.705s
ok  	github.com/Zalaras/muster/internal/server	41.304s
ok  	github.com/Zalaras/muster/internal/session	11.217s
ok  	github.com/Zalaras/muster/internal/store	6.651s
ok  	github.com/Zalaras/muster/internal/termbridge	7.752s
ok  	github.com/Zalaras/muster/internal/tmux	20.272s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.965s
ok  	github.com/Zalaras/muster/internal/triage	7.323s
ok  	github.com/Zalaras/muster/internal/tty	7.336s
ok  	github.com/Zalaras/muster/internal/usage	7.394s
ok  	github.com/Zalaras/muster/internal/webui	6.720s
ok  	github.com/Zalaras/muster/tools/kb	6.316s
ok  	github.com/Zalaras/muster/tools/triage	5.765s
ok  	github.com/Zalaras/muster/tools/versions	10.297s

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 611 references checked, 0 missing
```

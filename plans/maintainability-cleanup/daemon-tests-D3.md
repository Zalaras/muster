# Daemon Tests: Maintainability Cleanup — D3/D4 test repair and constructor

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: `kb: pack 67281 words (budget 8000)` — WARN over budget (generic project docs;
this unit's actual brief was the team lead's message plus `daemon-implementation-D3.md`,
`daemon-implementation-D4.md` and `review.maintainability.a-session.md` read in full).

## Summary

D3's rename (`session.Config.SessionKiller` → `TmuxSessions`) and its new required-ports
rule (`NewManager` panics if `PaneChecker`/`PaneSnapshotter`/`TmuxSessions` is nil) had
broken the test binaries for `internal/session` and `internal/server` (D4's binary was
clean already — verified, see below). Repaired both, added the one shared test
constructor Minor 8 asked for (plus its server-package-local equivalent), and added the
three new-logic tests the team lead's brief named (`NewManager`'s panic, a corrupt stored
time surfacing as a scan error, a duplicate migration version being a load error).

Tests created: 5 top-level (2 new coverage, 1 fixture-renamed-in-place, 2 pre-existing
reconcile tests needed a genuine fixture rewrite, not just a rename) | Modified (compile
repair only, same assertions): ~50 `NewManager`/`session.NewManager` call sites across 5
files | Passing: all | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/manager_test.go` | `TestNewManager_PanicsOnMissingRequiredPort` (subtests `PaneChecker`/`PaneSnapshotter`/`TmuxSessions`) | a-M1: each of the three required ports panics on its own when nil, not just the first one a caller omits | pass |
| `internal/session/manager_test.go` | `TestKillAllShells_EmptySocketReadsAsNoShells` (renamed from `TestKillAllShells_NoSessionKillerReadsAsNoShells`) | a-M1 removed the nil-`TmuxSessions` fallback this test's old name/comment described; rewritten to prove the equivalent case — an empty tmux socket (default fake `TmuxSessions`, `ListSessions` returns none) still reads as zero shells, not an error | pass |
| `internal/session/manager_test.go` | `TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical` | genuine fixture bug found by running the suite (below) — fixed | pass |
| `internal/session/manager_rail_test.go` | `TestReconcile_LeavesUnreadAndLastPromptUntouchedAcrossRowClasses` | same fixture bug, same fix | pass |
| `internal/store/migrate_test.go` | `TestLoadMigrations_DuplicateVersionIsLoadError` | a-m6: two migration files sharing a version is a load error naming both files, not a silent skip | pass |
| `internal/store/store_test.go` | `TestCorruptStoredTime_SurfacesAsScanError` (subtests `scanSession`/`scanRepo`/`EventSummary`) | a-m2: a stored time column that fails to parse surfaces as an error (naming the column for `scanSession`/`scanRepo`) instead of silently reading back a zero time | pass |
| `internal/session/*_test.go` (5 files), `internal/server/sessions_test.go`, `internal/server/fakes_test.go` | ~50 pre-existing tests | compile/behaviour repair only for the `TmuxSessions` rename and the required-ports rule — same assertions, no coverage change | pass |

## Fixture-logic bug found while running the suite (not an implementation bug)

Two pre-existing Reconcile tests (`TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical`,
`TestReconcile_LeavesUnreadAndLastPromptUntouchedAcrossRowClasses`) predate D3's a-M1 fix
and were written against the *old*, now-deleted `classifySessions` fallback: they set a
fake `PaneChecker.setExists(target, true/false)` on an arbitrary, non-numeric
`TmuxTarget` string (e.g. `"muster-livepane:@1"`) and supplied no `TmuxSessions` at all.
D3's a-M1 removed that fallback per review Major 1's explicit fix ("Reconcile has one
classification path... Tests supply fakes, see Minor 8") — the surviving
`classifySessionsByOwnership` path classifies purely by `TmuxSessions.ListSessions`'
answer, matched against each session's real numeric id via `tmux.SessionName(id)`, and
never consults `PaneChecker` at all. Run against the two tests' original fixtures this
produced `KeptAlive:0, MarkedEnded:2` instead of the expected `KeptAlive:1, MarkedEnded:1`
— the "live" row was never in `ListSessions`' (empty, default-fake) answer, so it was
misclassified as gone.

This is the "tests supply fakes" half of a-M1's own fix-must-make-true, called out by
name in the finding — a test bug in fixtures the review flagged as needing exactly this
rewrite, not a defect in D3's Reconcile logic. Fixed both by supplying a `TmuxSessions`
fake whose `ListSessions` lists the live session's real `tmux.SessionName(id)`, dropping
the now-inert `PaneChecker.setExists` calls (Reconcile no longer reads them) and adding a
comment stating why. Verified: both pass; every other `internal/session` test (including
every other Reconcile test, which already used real ids or `TmuxSessions` correctly)
passed unmodified.

## Constructor decisions (review Minor 8)

- **`internal/session`**: `newTestManager` (already the majority helper — 106 of ~154
  `Manager` constructions in the package already called it) got the fix: default fakes
  for `PaneSnapshotter`/`TmuxSessions` (previously only `PaneChecker` had a
  nil-defaults-in-helper convention) plus a `testManagerOpt` variadic tail
  (`withPaneSnapshotter`, `withTmuxSessions`, `withOnRemoved`, `withWatcher`,
  `withPollInterval`, `withLogger`) for the ~15 sites that needed one of those. Kept the
  existing 4-positional-arg shape (`t, st, pc, onUpsert`) rather than switching to
  all-options, specifically to avoid touching the 106 already-passing call sites — a
  variadic tail is backward compatible with every existing call. All ~29
  `NewManager(Config{...})` sites and the near-duplicate `newTestManagerWithWatcher`
  (removed; its 5 call sites now use `newTestManager(..., withWatcher(w))`) now route
  through the one constructor.
- **`internal/server`**: session's own test doubles are unexported in `_test.go` files,
  which don't export across packages, so `sessions_test.go`'s 16 direct
  `session.NewManager(session.Config{...})` sites needed their own equivalent. Added a
  package-local `newSessionTestManager` + `sessionManagerOpt` (mirroring the session
  package's shape) plus three no-op doubles (`noopPaneChecker`/`noopPaneSnapshotter`/
  `noopTmuxSessions`) in `sessions_test.go` itself, right where the existing
  `errKiller`/`spawnerKiller` doubles already live — **not** a new exported
  `internal/session/sessiontest` package. Reasoning: only one file needs this (16 sites,
  a single consumer), unlike `claudecodetest`/`tmuxtest`, which are genuinely reused
  across many test files in other packages; a new package would be permanent public
  surface for one file's benefit. Recorded here per the team lead's ask.
- `errKiller`, `spawnerKiller` (server) and `fakeKiller` (session) all gained a
  `ResolveSessionTarget` returning a fixed "not supported" error — the same shape a real
  resolve failure already takes, satisfying the `TmuxSessions` interface for tests that
  never exercise repair/revive. `fakeResolvingKiller` (session,
  `manager_writeorder_test.go`) still shadows `fakeKiller`'s new method with its real
  answer for the tests that do.
- Comment sweep: every stale `SessionKiller`/`Killer`/`targetResolver` reference left in
  a test file's comments (5 found, across `manager_test.go` ×2, `manager_writeorder_test.go`,
  `sessions_test.go` ×2, `fakes_test.go`) was corrected to name the actual current
  mechanism (e.g. "seed's default fakes: kill no-ops, PaneExists defaults false" instead
  of "seed has no SessionKiller/PaneChecker").

## New-logic test design notes

- **`TestLoadMigrations_DuplicateVersionIsLoadError`**: `migrate.go`'s `migrationsFS` is a
  package-level `embed.FS` with no injectable seam (`go:embed` paths are fixed relative to
  the declaring file), so the only way to exercise the duplicate-version branch is a
  fixture `embed.FS` with a genuine duplicate, swapped into the package var for the
  test's duration. Added `internal/store/migratetest` (mirrors
  `internal/tmux/tmuxtest`/`internal/claudecode/claudecodetest`'s shape — a small
  non-`_test.go` companion package, since the fixture directory needs its own file to
  declare a `//go:embed migrations` relative to a *different* directory than the real
  one) holding two trivial `.sql` files that both claim version 1. The swap is restored
  via `t.Cleanup`; safe because `internal/store`'s test suite has no `t.Parallel()`
  anywhere (verified by grep) so nothing else can observe the swapped var mid-test.
- **`TestCorruptStoredTime_SurfacesAsScanError`**: one corrupted column per
  `decodeTime`/`decodeReceiptTime` call site (`scanSession`'s `state_since`, `scanRepo`'s
  `last_launched_at`, `EventSummary`'s `received_at`), not all 7 columns across the two
  scan functions — the parse-and-wrap shape is identical for the rest (visually verified
  in `session.go`/`repo.go`; same `decodeTime(x); if err != nil { return
  fmt.Errorf("...: %s: %w", ...) }` shape at every site). Corrupts via direct
  `st.db.ExecContext` (established precedent in this package — `repo_test.go`,
  `usage_test.go`, `store_test.go` all do this already), never `InsertSession`/`UpsertRepo`
  themselves (which always write a valid encoding). `EventSummary`'s wrapped error
  ("summarizing events for session %d: parsing stored receipt time...") does not
  literally name the column the way `scanSession`/`scanRepo`'s do (there is only one time
  column read there), so that subtest asserts `require.Error` only, not a column-name
  `Contains` — asserting what the code actually does, not an invented expectation.

## Verification

```
$ go build ./...
(exit 0)

$ go vet ./...
(exit 0)

$ golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 372 references checked, 0 missing
```

## Test Run Output

```
$ go test -race -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	65.387s
ok  	github.com/Zalaras/muster/internal/claudecode	17.966s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	2.494s
ok  	github.com/Zalaras/muster/internal/gitutil	5.147s
ok  	github.com/Zalaras/muster/internal/kb	6.349s
ok  	github.com/Zalaras/muster/internal/locate	4.542s
ok  	github.com/Zalaras/muster/internal/selfupdate	1.600s
ok  	github.com/Zalaras/muster/internal/server	108.565s
ok  	github.com/Zalaras/muster/internal/session	36.142s
ok  	github.com/Zalaras/muster/internal/store	15.137s
?   	github.com/Zalaras/muster/internal/store/migratetest	[no test files]
ok  	github.com/Zalaras/muster/internal/termbridge	4.649s
ok  	github.com/Zalaras/muster/internal/tmux	17.948s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	5.817s
ok  	github.com/Zalaras/muster/internal/triage	6.797s
ok  	github.com/Zalaras/muster/internal/tty	5.753s
ok  	github.com/Zalaras/muster/internal/usage	8.664s
ok  	github.com/Zalaras/muster/internal/webui	5.169s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failapi	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/kb	5.388s
ok  	github.com/Zalaras/muster/tools/triage	4.810s
ok  	github.com/Zalaras/muster/tools/versions	9.310s
```

## Files Touched (all `_test.go`; no implementation file edited)

- `internal/session/manager_test.go`
- `internal/session/manager_rail_test.go`
- `internal/session/manager_writeorder_test.go`
- `internal/session/reconcile_shell_test.go`
- `internal/server/sessions_test.go`
- `internal/server/fakes_test.go`
- `internal/store/migrate_test.go`
- `internal/store/store_test.go`

## Follow-up: `loadMigrations` gained an `fs.FS` parameter — dropped the var-swap

daemon-impl (not this unit) changed `loadMigrations()` to `loadMigrations(fsys fs.FS)`,
with `Migrate` passing the package-level `migrationsFS` — the injectable seam my original
write-up flagged as missing. Per the team lead's follow-up, rewrote
`TestLoadMigrations_DuplicateVersionIsLoadError` to call `loadMigrations(fstest.MapFS{...})`
directly with two inline fixture entries sharing version 1, and deleted
`internal/store/migratetest` entirely (package, both fixture `.sql` files) — no more
package-var swap, no more non-`_test.go` test-support package. The test's own logic and
assertions are unchanged (same "share version"/both-filenames `Contains` checks); only the
fixture's shape changed, from an embedded fake filesystem to an inline `fstest.MapFS`.

```
$ go vet ./internal/store/...
(exit 0)

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/store/... -v
=== RUN   TestMigrate_AppliesInitSchema
--- PASS: TestMigrate_AppliesInitSchema (0.12s)
=== RUN   TestMigrate_SecondCallIsANoOp
--- PASS: TestMigrate_SecondCallIsANoOp (0.13s)
=== RUN   TestLoadMigrations_DuplicateVersionIsLoadError
--- PASS: TestLoadMigrations_DuplicateVersionIsLoadError (0.00s)
=== RUN   TestMigrate_CreatesSchemaMigrationsTableIfAbsent
--- PASS: TestMigrate_CreatesSchemaMigrationsTableIfAbsent (0.12s)
[... every other internal/store test, all PASS ...]
=== RUN   TestCorruptStoredTime_SurfacesAsScanError
=== RUN   TestCorruptStoredTime_SurfacesAsScanError/scanSession:_state_since
=== RUN   TestCorruptStoredTime_SurfacesAsScanError/scanRepo:_last_launched_at
=== RUN   TestCorruptStoredTime_SurfacesAsScanError/EventSummary:_received_at
--- PASS: TestCorruptStoredTime_SurfacesAsScanError (0.38s)
    --- PASS: TestCorruptStoredTime_SurfacesAsScanError/scanSession:_state_since (0.13s)
    --- PASS: TestCorruptStoredTime_SurfacesAsScanError/scanRepo:_last_launched_at (0.13s)
    --- PASS: TestCorruptStoredTime_SurfacesAsScanError/EventSummary:_received_at (0.12s)
PASS
ok  	github.com/Zalaras/muster/internal/store	9.431s

$ go build ./...
(exit 0)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 371 references checked, 0 missing
```

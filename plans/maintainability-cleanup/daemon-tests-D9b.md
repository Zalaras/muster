# Daemon Tests: maintainability-cleanup (D9b — server dupl tables)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Scope**: `internal/server/*_test.go` only, T1 seed (dupl pairs → table rows). D9's other
items (c-M4/c-m16 claudecodetest builders, a-m8 `Manager` constructor) belong to D9a.

## Summary

`size-warn.sh | grep dupl` before: 7 WARN lines across three dupl pairs (prefs_test.go
439/555/738 as one triple; shellscroll_test.go 201/247; terminal_test.go 298/326).
`size-warn.sh | grep dupl` after: **empty** (confirmed below).

Tests created: 3 table-driven tests (replacing 7 standalone tests) | Passing: all | Failing: 0

## Before → after test-name list and case counts

### prefs restart-persistence family (5 tests → 1 table, 5 rows)

Before (`internal/server/prefs_test.go` unless noted):
- `TestPrefs_PersistAcrossADaemonRestart` (view+density) — line ~263
- `TestPrefs_UsageModelPersistsAcrossADaemonRestart` (usageModel) — line ~490
- `TestPrefs_RailSortPersistsAcrossADaemonRestart` (railSort) — line ~580
- `TestPrefs_ThemePersistsAcrossADaemonRestart` (theme) — line ~738
- `internal/server/prefs_rail_test.go`: `TestPrefs_RailDensityAndRailActivityPersistAcrossADaemonRestart` (railDensity+railActivity)

After (`internal/server/prefs_test.go`):
- `TestPrefs_PersistAcrossADaemonRestart` with a shared `restartAndReloadPrefs(t, body) PrefsInfo`
  helper and 5 subtests: `view_and_density`, `usageModel`, `railSort`, `theme`,
  `railDensity_and_railActivity`. `prefs_rail_test.go`'s copy is gone; a one-line pointer comment
  replaces it.

Every original body/field-check pair survives as a row's `body` + `want` closure. Import cleanup:
`prefs_rail_test.go` no longer needs `path/filepath`, `github.com/rs/zerolog`, or
`github.com/Zalaras/muster/internal/store` (its only user was the removed test) — removed.

### shellscroll copy-mode-cancel family (3 tests → 1 table, 3 rows)

Before (`internal/server/shellscroll_test.go`):
- `TestHandleShellTerminal_TypingWhileInCopyModeCancelsBeforeTheWrite` (entered=true → wantCancels=1)
- `TestHandleShellTerminal_TypingNeverCancelsWhenNoScrollHasHappened` (no scroll sent → wantCancels=0)
- `TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput` (entered=false → wantCancels=0)

After:
- `TestHandleShellTerminal_CopyModeCancelOnNextInput`, table `{name, scrollFirst, entered,
  wantCancels}`, 3 rows matching the three cases above exactly (the "no scroll at all" case is the
  third row, `scrollFirst: false`, as the orchestrator's brief specified).

### terminal resize family (2 tests → 1 table, 2 rows)

Before (`internal/server/terminal_test.go`):
- `TestHandleTerminal_ResizeFrameAppliesRealGeometry` (cols:150,rows:45 → width "150"/height "45")
- `TestHandleTerminal_ResizeFrameIsClampedToTheProtocolBounds` (cols:99999,rows:1 → width
  "500"/height "5")

After:
- `TestHandleTerminal_ResizeFrameAppliesRealGeometry`, table `{name, frame, wantWidth,
  wantHeight}`, 2 rows. Both rows share the one real tmux session/socket/WS connection launched
  before the subtests and send their resize frames in sequence on that same connection — each
  row's `DisplayVar` assertion checks only the geometry its own frame just set, so sharing doesn't
  make the rows depend on each other (per the orchestrator's brief: "only if each row's assertion
  stays independent").

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `prefs_test.go` | `TestPrefs_PersistAcrossADaemonRestart/view_and_density` | D10 restart persistence, view+density | pass |
| `prefs_test.go` | `TestPrefs_PersistAcrossADaemonRestart/usageModel` | D10 restart persistence, usageModel | pass |
| `prefs_test.go` | `TestPrefs_PersistAcrossADaemonRestart/railSort` | D10 restart persistence, railSort | pass |
| `prefs_test.go` | `TestPrefs_PersistAcrossADaemonRestart/theme` | D10 restart persistence, theme | pass |
| `prefs_test.go` | `TestPrefs_PersistAcrossADaemonRestart/railDensity_and_railActivity` | D10 restart persistence, both rail-card fields | pass |
| `shellscroll_test.go` | `TestHandleShellTerminal_CopyModeCancelOnNextInput/scroll_enters_copy_mode,_next_input_cancels_it_first_(REQ-10)` | entered=true → cancel before next write | pass |
| `shellscroll_test.go` | `TestHandleShellTerminal_CopyModeCancelOnNextInput/scroll_reports_entered=false,_next_input_never_cancels_(REQ-12/edge_case_10)` | entered=false → never cancels | pass |
| `shellscroll_test.go` | `TestHandleShellTerminal_CopyModeCancelOnNextInput/no_prior_scroll_at_all,_ordinary_typing_never_cancels_(REQ-10_negative_source_state)` | no scroll at all → never cancels | pass |
| `terminal_test.go` | `TestHandleTerminal_ResizeFrameAppliesRealGeometry/within_bounds_applies_exactly` | REQ-3 real geometry via DisplayVar | pass |
| `terminal_test.go` | `TestHandleTerminal_ResizeFrameAppliesRealGeometry/out_of_range_clamps_to_the_protocol_bounds` | REQ-3 clamp boundary via DisplayVar | pass |

## Gate Run Output

`go vet ./internal/server/...`: clean, no output.

`go build ./...`: clean, no output.

`make lint`:
```
golangci-lint run
0 issues.
```

`size-warn.sh | grep dupl` (after): no output (exit 1, i.e. no matches) — confirms all three dupl
pairs are gone.

`go test -race -count=1 ./internal/server/...`:
```
ok  	github.com/Zalaras/muster/internal/server	167.617s
```

Targeted `-v` rerun of the three new table tests (all subtests):
```
=== RUN   TestPrefs_PersistAcrossADaemonRestart
=== RUN   TestPrefs_PersistAcrossADaemonRestart/view_and_density
=== RUN   TestPrefs_PersistAcrossADaemonRestart/usageModel
=== RUN   TestPrefs_PersistAcrossADaemonRestart/railSort
=== RUN   TestPrefs_PersistAcrossADaemonRestart/theme
=== RUN   TestPrefs_PersistAcrossADaemonRestart/railDensity_and_railActivity
--- PASS: TestPrefs_PersistAcrossADaemonRestart (0.16s)
    --- PASS: TestPrefs_PersistAcrossADaemonRestart/view_and_density (0.03s)
    --- PASS: TestPrefs_PersistAcrossADaemonRestart/usageModel (0.03s)
    --- PASS: TestPrefs_PersistAcrossADaemonRestart/railSort (0.03s)
    --- PASS: TestPrefs_PersistAcrossADaemonRestart/theme (0.03s)
    --- PASS: TestPrefs_PersistAcrossADaemonRestart/railDensity_and_railActivity (0.05s)
=== RUN   TestHandleShellTerminal_CopyModeCancelOnNextInput
=== RUN   TestHandleShellTerminal_CopyModeCancelOnNextInput/scroll_enters_copy_mode,_next_input_cancels_it_first_(REQ-10)
=== RUN   TestHandleShellTerminal_CopyModeCancelOnNextInput/scroll_reports_entered=false,_next_input_never_cancels_(REQ-12/edge_case_10)
=== RUN   TestHandleShellTerminal_CopyModeCancelOnNextInput/no_prior_scroll_at_all,_ordinary_typing_never_cancels_(REQ-10_negative_source_state)
--- PASS: TestHandleShellTerminal_CopyModeCancelOnNextInput (0.20s)
    --- PASS: TestHandleShellTerminal_CopyModeCancelOnNextInput/scroll_enters_copy_mode,_next_input_cancels_it_first_(REQ-10) (0.08s)
    --- PASS: TestHandleShellTerminal_CopyModeCancelOnNextInput/scroll_reports_entered=false,_next_input_never_cancels_(REQ-12/edge_case_10) (0.07s)
    --- PASS: TestHandleShellTerminal_CopyModeCancelOnNextInput/no_prior_scroll_at_all,_ordinary_typing_never_cancels_(REQ-10_negative_source_state) (0.05s)
=== RUN   TestHandleTerminal_ResizeFrameAppliesRealGeometry
=== RUN   TestHandleTerminal_ResizeFrameAppliesRealGeometry/within_bounds_applies_exactly
=== RUN   TestHandleTerminal_ResizeFrameAppliesRealGeometry/out_of_range_clamps_to_the_protocol_bounds
--- PASS: TestHandleTerminal_ResizeFrameAppliesRealGeometry (0.45s)
    --- PASS: TestHandleTerminal_ResizeFrameAppliesRealGeometry/within_bounds_applies_exactly (0.08s)
    --- PASS: TestHandleTerminal_ResizeFrameAppliesRealGeometry/out_of_range_clamps_to_the_protocol_bounds (0.09s)
PASS
ok  	github.com/Zalaras/muster/internal/server	2.547s
```

`dead-refs.py` on the four touched files: `dead-refs: 2 references checked, 0 missing`.

## Notes

Historical `plans/*/daemon-tests.md`, `review*.md` and `proposed-backlog.md` logs from other,
already-completed plans (`rail-card-improvements`, `rail-card-improvements-2`,
`terminal-fixes-cleanup`, `usage-model-bar`, `order-sidebar`, `m2-terminal`, `new-ui-design-colors`)
still cite the old per-field test names in their own historical run records. Those are frozen
history of past pipeline runs (`docs/history/` convention: "how things got here, never current
state"), not live docs, so they were left untouched.

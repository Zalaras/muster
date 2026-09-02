# Daemon Tests: new-ui-design-colors

**Plan**: new-ui-design-colors
**Verdict**: pass

## Summary

Tests created: 42 (8 in `theme_test.go`, 9 in `themepoll_test.go`, 14 new in `prefs_test.go`, 2 new in `state_test.go`, plus 2 fixed pre-existing tests and augmented assertions on `TestHandleState_ReturnsSnapshotJSON`) | Passing: all | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/theme_test.go` | `TestReadThemeFamily_UnknownCases` (8 subtests: missing file, directory-as-unreadable-path, not JSON, empty file, theme value number/bool/object/array) | D5 | pass |
| `internal/claudecode/theme_test.go` | `TestReadThemeFamily_KeyAbsentIsDark` (2 subtests) | D6 | pass |
| `internal/claudecode/theme_test.go` | `TestReadThemeFamily_PrefixMapping` (7 subtests: light/light-daltonized/light-ansi/dark/dark-daltonized/dark-ansi/solarized) | D7 | pass |
| `internal/claudecode/theme_test.go` | `TestReadThemeFamily_IgnoresEveryOtherTopLevelKey` | D8 | pass |
| `internal/claudecode/theme_test.go` | `TestReadThemeFamily_NeverWritesThePath` | INV-6/R1 at the function level | pass |
| `internal/claudecode/theme_test.go` | `TestDefaultConfigPath_JoinsHomeAndFileName` | sanity check on `DefaultConfigPath` | pass |
| `internal/server/themepoll_test.go` | `TestThemePoller_Tick_FirstTickFromUnknownBroadcastsTheReadFamily` | REQ-14 immediate-first-tick from the poller's own initial state | pass |
| `internal/server/themepoll_test.go` | `TestThemePoller_Tick_BroadcastsExactlyOnceOnChangeZeroTimesOtherwise` | D10 | pass |
| `internal/server/themepoll_test.go` | `TestThemePoller_Tick_SingleFailedReadSelfHealsWithoutBroadcast` | D11 branch 1 (self-heal) | pass |
| `internal/server/themepoll_test.go` | `TestThemePoller_Tick_TwoConsecutiveFailuresDoBroadcastUnknown` | D11 branch 2 (two failures) | pass |
| `internal/server/themepoll_test.go` | `TestThemePoller_Tick_UnknownReadWhileAlreadyUnknownNeverRetries` | retry guard's condition from the other reachable source state | pass |
| `internal/server/themepoll_test.go` | `TestThemePoller_NeverWritesTheConfigFile` | D9/INV-6 at the poller level, real reader + real fixture | pass |
| `internal/server/themepoll_test.go` | `TestThemePoller_StartStop_ImmediateFirstTickThenPromptStop` | Start/Stop goroutine-leak guard | pass |
| `internal/server/themepoll_test.go` | `TestServer_ClaudeThemePollZeroConstructsNoPoller` | D17 | pass |
| `internal/server/themepoll_test.go` | `TestServer_ClaudeThemePollPositiveConstructsAPoller` | D17's reverse case | pass |
| `internal/server/prefs_test.go` | `TestLoadPrefs_DefaultThemeIsFollow` | default-before-any-PUT for `theme` | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_ThemeValidationErrors` (6 subtests incl. D13's exact `"Dark Mode!"` case) | D13 | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_ThemeAcceptsTheOpaquePattern` (7 subtests) | opaque-pattern acceptance (REQ-7) | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_ThemePersistsToKV` | D12 (kv half) | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_ThemeFollowRoundTripsAfterAnOverride` | D14 from the "returning to follow" state | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_ThemePresentAloneSatisfiesAtLeastOneFieldRequired` | "at least one field" clause from theme's side | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_SetsThemeOnlyLeavesOtherFieldsUntouched` | per-field independence | pass |
| `internal/server/prefs_test.go` | `TestLoadPrefs_InvalidThemeInKVFallsBackToFollowIndependently` | D16 | pass |
| `internal/server/prefs_test.go` | `TestPrefs_ThemePersistsAcrossADaemonRestart` | restart persistence | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_BroadcastsThemeInPrefsMessage` | D12 (broadcast half) | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_PersistsToKVUnderOneJSONKey` (fixed) | sanctioned breakage: `"theme":"follow"` added | pass |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_UsageModelPersistsToKVAlongsideViewAndDensity` (fixed) | sanctioned breakage: `"theme":"follow"` added | pass |
| `internal/server/state_test.go` | `TestBuildSnapshot_M0Shape` (fixed) | sanctioned breakage: top-level `claudeTheme` + `prefs.theme` added | pass |
| `internal/server/state_test.go` | `TestHandleState_ReturnsSnapshotJSON` (augmented) | added `Prefs.Theme`/`ClaudeTheme.Family` assertions | pass |
| `internal/server/state_test.go` | `TestCurrentSnapshot_FreshDaemonHasFollowThemeAndUnknownFamily` | D15 | pass |
| `internal/server/state_test.go` | `TestCurrentSnapshot_UsesThemePollerCurrentFamilyWhenPollingEnabled` | REQ-15's wiring through `currentSnapshot` | pass |

## Implementation Bugs

None found. The implementation matches the plan's D5–D17 criteria as built, including D11's documented interpretation ("two consecutive failures" = initial read + the one 250 ms retry within a single tick) — tested directly against that behaviour rather than against the plan's looser prose.

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	15.724s
ok  	github.com/Zalaras/muster/internal/claudecode	0.461s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	1.896s
ok  	github.com/Zalaras/muster/internal/gitutil	3.531s
ok  	github.com/Zalaras/muster/internal/server	19.156s
ok  	github.com/Zalaras/muster/internal/session	5.049s
ok  	github.com/Zalaras/muster/internal/store	6.707s
ok  	github.com/Zalaras/muster/internal/termbridge	8.030s
ok  	github.com/Zalaras/muster/internal/tmux	17.402s
ok  	github.com/Zalaras/muster/internal/usage	5.344s
ok  	github.com/Zalaras/muster/internal/webui	5.739s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.
```

## Notes for the reviewer

- D4 (config file name/key appear nowhere outside `internal/claudecode/`) is satisfied by
  construction: every new test lives either inside `internal/claudecode/` (where the
  literal `.claude.json` is allowed, matching the check's own `--glob '!internal/claudecode/**'`
  exclusion) or inside `internal/server/` using only `ReadThemeFamily`/`t.TempDir()` paths —
  never the real basename.
- INV-5 (no test reads the real config file): every path in every new test comes from
  `t.TempDir()`; `Damian's real `~/.claude.json` is never opened.
- The "unreadable file" case in D5 uses a directory path rather than a chmod'd file — this
  avoids flakiness under a root or sandboxed test runner (which can silently bypass file
  permissions) while still exercising `os.ReadFile`'s error path deterministically on every
  platform.
- Two of D11's retry-path tests (`TestThemePoller_Tick_SingleFailedReadSelfHealsWithoutBroadcast`,
  `TestThemePoller_Tick_TwoConsecutiveFailuresDoBroadcastUnknown`) each take ~250ms (the real
  `themeRetryDelay`, not injectable) — acceptable, matches the existing `usagepoll_test.go`
  pattern of real short sleeps for coalescing tests.

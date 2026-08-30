# Daemon Tests: usage-model-bar

**Plan**: usage-model-bar
**Verdict**: pass

## Summary

Tests created: 78 new test functions (across 5 new files + additions to 2 existing files) | Passing: all (full repo: `go test -race ./...` green, 418 total Go tests) | Failing: 0

Also fixed: 4 pre-existing test files broken by the approved Protocol Contract delta (sanctioned breakage, listed in daemon-implementation.md's Handoff), and the `cmd/musterd/onexit_test.go` Keychain/network safety gap the orchestrator flagged.

## Sanctioned breakage fixed (daemon-implementation.md Handoff)

| File | Fix |
|------|-----|
| `internal/server/usagewire_test.go` | Added the second `usage.ModelSnapshot{Source: "subscription-api"}` argument to all 3 `toWireUsage` call sites; asserted the new fields on each. |
| `internal/server/state_test.go` | Added `modelScoped`/`modelScopedAt`/`modelScopedError`/`modelScopedSource` to the usage JSON literal and `usageModel` to the prefs literal (both `TestBuildSnapshot_M0Shape` and `TestHandleState_ReturnsSnapshotJSON`). |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_PersistsToKVUnderOneJSONKey`'s `assert.JSONEq` literal now includes `"usageModel":"Fable"`. |
| `internal/store/migrate_test.go`, `internal/store/store_test.go` | Migration-count literals bumped 4→5 (three assertions, `0005_usage_model.sql` now applies). |

## Safety fix (orchestrator note 2)

`cmd/musterd/onexit_test.go`'s `spawnDaemon` now passes `-usage-poll 0` and `-usage-token-file <dataDir>/usage-token-not-present` in every spawned real-`musterd` invocation. Before this fix, `-usage-poll`'s non-zero CLI default plus REQ-1's immediate-fetch-on-`Start` meant every D19–D21 test process would shell out to the real macOS Keychain and, on a machine where that lookup succeeds, call the real `https://api.anthropic.com` with Damian's real subscription token as an unannounced side effect of `make test` — exactly what CLAUDE.md forbids. Verified: `go test ./cmd/musterd/... -run TestOnExit -v` still passes (3/3, ~2s total).

## Tests

| File | Test Name(s) | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/usageapi_test.go` | `TestInterpretUsageReport_MeasuredLiveShape` | Decodes the exact live-measured 2026-08-30 response shape (canary-fields.md), only `weekly_scoped`→`UsageWindow` | pass |
| | `TestInterpretUsageReport_EpochSecondsResetsAt` | REQ-4 dual format: integer epoch `resets_at` | pass |
| | `TestInterpretUsageReport_MissingLimitsKeyIsNilNotError` / `_EmptyLimitsArrayIsNil` | Missing/empty `limits` → nil `ModelScoped`, no error (D5) | pass |
| | `TestInterpretUsageReport_NonWeeklyScopedKindsAreIgnored` | `session`/`weekly_all` kinds ignored (D5) | pass |
| | `TestInterpretUsageReport_NullScopeIsIgnored` / `_NullDisplayNameIsIgnored` / `_EmptyDisplayNameIsIgnored` | REQ-4's "non-empty display_name" clause from every null/empty variant | pass |
| | `TestInterpretUsageReport_UnparseableResetsAtOnOneEntrySkipsOnlyThatEntry` | One bad entry doesn't fail the whole decode (D5) | pass |
| | `TestInterpretUsageReport_UnknownTopLevelKeysAreIgnored` | Feature-flag noise (`amber_ladder`, etc.) ignored (D5) | pass |
| | `TestInterpretUsageReport_MultipleWeeklyScopedEntries` / `_MalformedJSONReturnsError` / `_ResetsAtWithoutFractionalSecondsStillParses` | Multi-window, malformed-JSON error path, RFC3339 without micros | pass |
| | `TestFetchUsage_Success_SendsMeasuredHeadersAndPath` | Path, `Authorization: Bearer`, `anthropic-beta`, `Content-Type` (REQ-3) | pass |
| | `TestFetchUsage_401ReturnsErrUnauthorized` / `_403ReturnsErrUnauthorized` | REQ-6's "401-403" → `ErrUnauthorized` | pass |
| | `TestFetchUsage_5xxReturnsGenericErrorNotUnauthorized` | 5xx must NOT map to unauthorized | pass |
| | `TestFetchUsage_ConnectionRefusedReturnsError` / `_MalformedBodyReturnsDecodeError` | Network/decode failure paths | pass |
| | `TestFetchUsage_ErrorMessagesNeverContainTheToken` | Defensive D9 check: FetchUsage's own error text never echoes the token | pass |
| `internal/claudecode/credentials_test.go` | `TestKeychainTokenReader_Success_ParsesAccessTokenAndPassesExpectedArgs` | Correct `security` args, JSON parse (D8: injected exec func only) | pass |
| | `TestKeychainTokenReader_ExecFailure_*` / `_MalformedJSON_*` / `_EmptyAccessToken_*` / `_MissingAccessTokenKey_*` | All map to `ErrNoCredentials` | pass |
| | `TestKeychainTokenReader_AppliesTwoSecondExecTimeout` | Implementation Notes' "2s exec timeout" verified via `ctx.Deadline()` | pass |
| | `TestKeychainTokenReader_RespectsParentContextCancellation` | Cancellation propagates into the exec seam | pass |
| | `TestFileTokenReader_Success` / `_MissingFile_*` / `_MalformedJSON_*` / `_EmptyAccessToken_*` / `_WhitespacePaddedFileStillParses` / `_ReReadsOnEveryCall` | REQ-13 test seam; "re-read on every call, never cached" (Edge Case 3) | pass |
| | `TestDecodeOAuthToken_TrimsWhitespaceFromToken` / `_IgnoresUnknownSiblingKeys` | Shared decode helper | pass |
| | `TestRunCommand_HarmlessSmokeTestNeverUsedByKeychainTests` | Documents D8: `RunCommand` itself exercised only against `echo`, never `security` | pass |
| `internal/usage/modelscoped_test.go` | `TestModelScoped_Current_BootStateIsNilBothWindowsAndAt` | REQ-14/INV-1 boot state | pass |
| | `TestModelScoped_Record_FirstSuccessPersistsAndBroadcasts` / `_EmptySuccessfulFetchIsDistinctFromNeverFetched` | REQ-5 happy path + Edge Case 4 (empty ≠ never-fetched) | pass |
| | `TestModelScoped_Record_IdenticalListDedupsNoRowsNoBroadcast` / `_ChangedListPersistsNewRowsAndBroadcasts` | REQ-5 dedup, both directions | pass |
| | `TestModelScoped_Record_SortsByDisplayNameBeforeDedupIgnoringInputOrder` | REQ-5's "sorted by displayName" dedup clause | pass |
| | `TestModelScoped_Record_PersistFailureLeavesMemoryAndDedupStateUnchanged` | D6: mirrors `TestAggregator_Record_PersistFailureLeavesMemoryUnchanged` | pass |
| | `TestModelScoped_SetError_FirstOccurrenceBroadcastsRepeatDoesNot` / `_DifferentKindTransitionBroadcastsAgain` | REQ-6 Warn-once/Debug-repeat + broadcast-on-transition | pass |
| | `TestModelScoped_SetError_AfterSuccessKeepsLastGoodListAndAt` | Cross-state: failure after a good fetch (not boot) | pass |
| | `TestModelScoped_Record_SuccessAfterFailureClearsErrorEvenWhenListUnchanged` | Success-after-failure still broadcasts (error cleared) | pass |
| | `TestModelScoped_INV1_AtNullIffWindowsNull` | INV-1 asserted across boot → first success → failure-after-success → success-after-failure → `[]` result, one table | pass |
| | `TestModelScoped_INV1_FailureBeforeAnySuccessKeepsBothNil` | The one INV-1 state the happy-path table skips | pass |
| | `TestWindowsEqual_NilVsEmptyAreNeverEqual` / `_DetectsEveryFieldDifference` | Pure-function tests of the nil-vs-empty distinction REQ-14 depends on | pass |
| | `TestSortedWindows_SortsByDisplayNameAndDoesNotAliasInput` / `_NilInputReturnsNonNilEmpty` | Sort + no-aliasing guarantee | pass |
| `internal/server/usagepoll_test.go` | `TestUsagePoller_Tick_SuccessRecordsWindows` | D7 success case | pass |
| | `TestUsagePoller_Tick_NoCredentialsSetsErrorKeepsListNil` | INV-3 from never-fetched state | pass |
| | `TestUsagePoller_Tick_UnauthorizedKeepsLastGoodListAndAt` | INV-3 from "after a good fetch" state (cross-state, not just boot) | pass |
| | `TestUsagePoller_Tick_5xxMapsToUnreachable` / `_ConnectionRefusedMapsToUnreachable` | `usageErrorKind`'s "anything else" branch, two distinct causes | pass |
| | `TestUsagePoller_Tick_EmptyLimitsIsARecordedEmptySuccess` | Edge Case 4 at the poller level | pass |
| | `TestUsagePoller_Refresh_ChannelCoalescesToOneBufferedSignal` | Coalescing at the channel level | pass |
| | `TestUsagePoller_Refresh_ConcurrentRefreshesWhileATickIsInFlightCoalesceToOneExtraFetch` | D7 coalescing at the full loop level, deterministic (gated in-flight request, not a timing race) | pass |
| | `TestUsagePoller_StartStop_LoopExitsPromptly` | No goroutine leak on Stop | pass |
| `internal/server/usage_test.go` | `TestHandleUsageRefresh_DisabledPollingReturns404` / `_RequiresCookie` | Edge Case 14, auth | pass |
| | `TestHandleUsageRefresh_EnabledPollingReturns202AndTriggersAFetch` | REQ-7 happy path end-to-end through the real HTTP handler | pass |
| | `TestHandleUsageRefresh_TwoRapidPostsBothReturn202` | Edge Case 7 at the HTTP layer | pass |
| `internal/server/usagewire_test.go` (additions) | `TestToWireUsage_ModelScopedPopulatedListFormatsEveryField` / `_EmptyNonNilListRendersAnEmptyArrayNotNull` / `_ErrorKeepsLastGoodListAlongsideIt` / `_StatusLineAndModelScopedHalvesAreIndependent` | Edge Case 10's single-mapping-point merge, REQ-14's `[]`≠null on the wire | pass |
| `internal/server/prefs_test.go` (additions) | `TestLoadPrefs_DefaultUsageModelIsFable`, `TestHandlePutPrefs_UsageModelValidationErrors` (table: empty/whitespace/33-char), `_UsageModelExactly32CharsIsAccepted`, `_SetsUsageModelOnlyLeavesViewAndDensityUntouched`, `_UsageModelIsTrimmedBeforePersisting`, `_UsageModelPresentAloneSatisfiesAtLeastOneFieldRequired`, `_UsageModelPersistsToKVAlongsideViewAndDensity`, `_BroadcastsUsageModelInPrefsMessage`, `TestLoadPrefs_InvalidUsageModelInKVFallsBackToFableIndependently`, `TestPrefs_UsageModelPersistsAcrossADaemonRestart` | D10: validate/persist/echo/restart for the new pref field, mirroring existing view/density coverage per-field | pass |

## Test helper added

`internal/claudecode/claudecodetest/claudecodetest.go` gained `UsageWindowOpt`, `UsageAPIBody(...)`, and `OAuthCredentialsBody(token)` — sanctioned fixture builders (same pattern as the existing `EnvelopedSessionStart` etc.) so `internal/server` test files can get realistic usage-endpoint/Keychain-item JSON bodies without spelling the endpoint's own wire vocabulary (`weekly_scoped`, `claudeAiOauth`) themselves. This was necessary to pass **D3**: my first drafts of `internal/server/usagepoll_test.go` and `usage_test.go` embedded that vocabulary directly in literal JSON test bodies, which `rg -n "claudeAiOauth|Claude Code-credentials|weekly_scoped|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'` correctly flagged. Moved the fixture construction into the already-`internal/claudecode/claudecodetest`-scoped helper (excluded from the D3 grep by its own path) and switched both files to call it.

## D-item cross-check

- **D1** `make test`: pass.
- **D2** `make lint`: pass (0 issues) — also fixed several `unused-parameter` (revive) findings in my own new test files along the way.
- **D3**: `rg -n "claudeAiOauth|Claude Code-credentials|weekly_scoped|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'` → no output.
- **D4**: `go list -deps ./internal/usage ./internal/store | rg 'muster/internal/claudecode'` → no output.
- **D5**: `internal/claudecode/usageapi_test.go` covers RFC3339-with-offset, epoch `resets_at`, missing `limits`, non-`weekly_scoped` kinds, null `display_name`, unknown top-level keys — all present.
- **D6**: `TestModelScoped_Record_PersistFailureLeavesMemoryAndDedupStateUnchanged` in `internal/usage/modelscoped_test.go` mirrors `TestAggregator_Record_PersistFailureLeavesMemoryUnchanged`'s structure (kill the store, assert error returned + `Current()` unchanged + dedup state not advanced).
- **D7**: `internal/server/usagepoll_test.go` covers success, 401→unauthorized-with-list-kept, 5xx and connection-refused→unreachable, refresh coalescing (both channel-level and full-loop-level), and INV-1/INV-3 from multiple source states.
- **D8**: every `KeychainTokenReader` test passes its own func literal; `RunCommand` is exercised exactly once against `echo`, never `security`.
- **D9**: read every log call in `usagepoll.go` (2: shutdown-deadline Warn, persist-failure Warn — neither touches the token), `credentials.go` (0 log calls), `usageapi.go` (0 log calls). Also added a defensive unit test (`TestFetchUsage_ErrorMessagesNeverContainTheToken`) asserting the token never leaks into `FetchUsage`'s own error text.
- **D10**: `internal/server/prefs_test.go`'s new `usageModel`-specific tests cover accept/validate/persist/echo/restart.

## Test Run Output

```
$ go build ./...
(clean, exit 0)

$ gofmt -l .
(clean, no output)

$ make lint
golangci-lint run
0 issues.

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	5.993s
ok  	github.com/Zalaras/muster/internal/claudecode	1.388s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	2.639s
ok  	github.com/Zalaras/muster/internal/server	12.656s
ok  	github.com/Zalaras/muster/internal/session	4.704s
ok  	github.com/Zalaras/muster/internal/store	3.086s
ok  	github.com/Zalaras/muster/internal/termbridge	5.472s
ok  	github.com/Zalaras/muster/internal/tmux	6.255s
ok  	github.com/Zalaras/muster/internal/usage	4.321s

$ go test -race ./...
(all ok, no data races — cmd/musterd, claudecode, gitutil, server, session, store, termbridge, tmux, usage)

$ rg -n "claudeAiOauth|Claude Code-credentials|weekly_scoped|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'
(no output)

$ go list -deps ./internal/usage ./internal/store | rg 'muster/internal/claudecode'
(no output)
```

## Notes for the orchestrator/reviewer

- No implementation code was modified — only test files (the 5 new ones, additions to `usagewire_test.go`/`prefs_test.go`, the 4 sanctioned-breakage fixes, the `onexit_test.go` safety fix) and the one non-`_test.go` shared fixture helper `claudecodetest.go` (a test-support package, not exercised by production code — nothing under `cmd/` or the rest of `internal/` imports it).
- INV-5 ("the poller never calls the status-line `Aggregator.Record`") and INV-6 (two dashboard windows) are structural/E2E-only per the plan's own Reviewer-Verified list and aren't unit-testable in a meaningful way beyond what `internal/server/server.go`'s wiring already shows (two separate holders, two separate `OnChange` closures) — left to review-work's code read and the E2E suite respectively, as the plan specifies.
- No implementation bugs found. The one behavior I initially treated with suspicion — `ModelScoped.Record` doesn't advance `At` on a success-after-failure call when the list itself is unchanged (only clears the error) — is consistent with the code's own documented intent ("a success after a failure must broadcast even when the list itself is unchanged, since modelScopedError changed") and does not violate REQ-14/INV-1's null-iff-null invariant (the only At-related acceptance criterion), so it wasn't escalated.

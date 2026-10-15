# Daemon Tests: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: pass
**Pack**: kb: pack 9851 words (budget 30000)

## Summary

Tests created: 24 top-level `TestClaudeVersion_*` in `internal/server/claudeversion_test.go` (plus table subtests; 3 added in review cycle 2), 2 existing tests updated | Passing: all | Failing: 0

`go test -race -count=1 ./cmd/musterd/ ./internal/server/`: both `ok`. `make lint` 0 issues, `make test` all ok. `go test -run ClaudeVersion ./internal/server/` selects the new tests (checks line D2).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `claudeversion_test.go` | TestClaudeVersion_StartsNotCheckedWithFloorAndVerifiedPopulated | initial held value | pass |
| | TestClaudeVersion_IdentityChangeRunsExactlyOneCheckAndBroadcastsOnce | identity change: one check, one broadcast | pass |
| | TestClaudeVersion_UnchangedIdentityRunsNoCheck | unchanged identity: no check, no broadcast | pass |
| | TestClaudeVersion_IdentityFieldsEachTriggerACheck | path / size / mtime each count as a change | pass |
| | TestClaudeVersion_UnchangedResultBroadcastsNothing | new identity, same result: check runs, no push | pass |
| | TestClaudeVersion_FirstUnknownResultEqualsTheNotCheckedValueAndBroadcastsNothing | first failing check is no change | pass |
| | TestClaudeVersion_UnresolvableIdentityRunsNoCheckAndKeepsTheHeldValue | unresolvable identity: no check, value kept, seen identity retained | pass |
| | TestClaudeVersion_UnresolvableIdentityAtTheFirstLookStaysNotChecked | unresolvable at first look | pass |
| | TestClaudeVersion_FailingCheckAfterAKnownValueReplacesItAndIsBroadcast | logged Decision: unknown replaces known and is pushed; identity recorded, not re-run every tick | pass |
| | TestClaudeVersion_CheckRunsUnderADeadline | check ctx carries a deadline | pass |
| | TestClaudeVersion_CheckInterruptedByShutdownDiscardsItsResult | cancelled ctx: result discarded | pass |
| | TestClaudeVersion_InstalledNullIffUnknownFromEveryStateAfterEveryOutcome | 4x4 (initial + 3 held states) x 4 outcomes: installed null iff unknown, floor/verified populated, latest wins | pass |
| | TestClaudeVersion_StartDoesNotBlockOnTheFirstCheckAndRunsIt | Start returns while the first check is still running; it then lands | pass |
| | TestClaudeVersion_LoopPicksUpABinaryReplacedBetweenLooks | real loop: many looks, one check per identity | pass |
| | TestClaudeVersion_ZeroPollNeverLooksAndNeverChecks | Poll<=0 never execs | pass |
| | TestClaudeVersion_ConfigPollReachesTheFeature | Config.ClaudeVersion.Poll reaches the feature | pass |
| | TestClaudeVersion_WireSendsOneClaudeCodeMessagePerChangedResult | real hub: exact key sets, null installed, none for unchanged | pass |
| | TestClaudeVersion_HelloOfALateClientReadsTheLatestValueNotTheStartupOne | hello reads latest | pass |
| | TestClaudeVersion_IssueSnapshotReadsTheLatestValueNotTheStartupOne | REQ-4 snapshot reads latest across verified/above/unknown | pass |
| | TestClaudeVersion_MapsEachStatusAndLogsAtTheRightLevel | ported (stub claude via `CheckVersion`): status mapping + log level per outcome | pass |
| | TestClaudeVersion_UnknownOutcomeNeverFailsStartup | ported, now through the constructor's real identity look and check: missing (identity look fails) / non-zero exit / unparseable -> unknown, warn, no `installed` in log, Start/Stop do not panic | pass |
| | TestClaudeVersion_EmptyClaudeBinNamesClaudeBeforeTheFeatureSeesIt | `defaultClaudeBin("")` is `claude`; the feature never sees `""` (replaces the dropped "empty path" case) | pass |
| | TestClaudeVersion_BinaryChangedWhileACheckRunsIsCheckedAgainOnTheNextLook | plan Edge Case 2: `onCheck` swaps identity; next tick runs check 2, a further tick none | pass |
| | TestClaudeVersion_UnresolvableIdentityLogsOncePerUnresolvedStretch | one warn (with the resolution error) across two unresolved ticks; none on resolve; one more after a new stretch; same identity after the stretch runs no check | pass |
| `server_test.go` | TestNew_RegistersLifecycleFeaturesInStartOrder | 7 lifecycle features; `srv.claudeVersion` last | pass |
| `cmd/musterd/main_test.go` | TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig | adds `cfg.ClaudeVersion.Poll == claudeVersionLookInterval` | pass |

## Handoff Received

- `internal/server/server_test.go` `TestNew_RegistersLifecycleFeaturesInStartOrder`: count 6 -> 7, asserts `srv.claudeVersion` is `lifecycles[6]`.
- `cmd/musterd/main_test.go`: added the `cfg.ClaudeVersion.Poll` assertion; the two `TestCheckClaudeCode_*` cases ported (below).
- `internal/server/helpers_test.go`: left as the impl agent's compile-only edit (`srv.claudeVersion.current = cc` after `New`). It is a sufficient seam; tests that need the not-checked value pass `notCheckedClaudeCode()` because `ClaudeCodeInfo{}` has an empty status.

## Implementation Bugs

None.

## Notes

- Ported test names for the ADR `tests:` repoint (both in `internal/server/claudeversion_test.go`):
  - `TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel` -> `TestClaudeVersion_MapsEachStatusAndLogsAtTheRightLevel`
  - `TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup` -> `TestClaudeVersion_UnknownOutcomeNeverFailsStartup`
  Originals: `git show 441e2c28:cmd/musterd/main_test.go` lines ~164-253.
- Review cycle 2: `watchVersionOf` no longer overrides `identify`; the ported cases run the constructor's own identity look and check, so the missing-binary case would fail against the pre-4089623e silent `tick`. The "empty path" case is dropped: production maps `""` to `claude` in `defaultClaudeBin` and never calls `CheckVersion("")`.
- The ported cases exec a content-keyed stub claude by path (`cachedStub`) through the feature's `check` seam wired to `claudecode.CheckVersion`, the production wiring; never a real claude.
- No `dupl` or size warning names the new file (`make size-warn`).

## Test Run Output

```
ok  	github.com/Zalaras/muster/cmd/musterd	53.990s
ok  	github.com/Zalaras/muster/internal/server	272.005s  (go test -race -count=1 ./internal/server/, review cycle 2)
```

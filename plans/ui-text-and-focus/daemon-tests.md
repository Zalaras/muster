# Daemon Tests: ui-text-and-focus

**Plan**: ui-text-and-focus
**Verdict**: pass

## Summary

Tests created: 26 | Passing: 26 | Failing: 0

Also repaired the two sanctioned pre-existing test breakages named in
`daemon-implementation.md`'s Handoff (hardcoded migration count `6 -> 7` in
`internal/store/migrate_test.go` and `internal/store/store_test.go`).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/session_test.go` | `TestSession_DisplayTitle` (4 subtests) | D4: `DisplayTitle()` precedence for all four cells of override x Claude-name, each null/non-null | pass |
| `internal/session/session_test.go` | `TestSession_DisplayTitle_ReturnsTheOverridePointerItself` | `DisplayTitle()` returns the override's own pointer when set | pass |
| `internal/session/title_test.go` | `TestTitleOverride_INV1_SurvivesEverySourceState` (9 subtests: launch, SessionStart bind, /clear rebind, resume rebind, status w/ new name, status w/ no name, liveness sweep to dead, daemon restart/row reload, `PUT .../title` itself) | D5/INV-1: `title == titleOverride` whenever `titleOverride != null`, from every source state the Invariants section lists | pass |
| `internal/session/title_test.go` | `TestApplyStatusUpdate_NeverTouchesTitleOverride` (7 subtests: 6 displayed states + dead) | D6/INV-2: `applyStatusUpdate` never touches `TitleOverride`, from every state | pass |
| `internal/session/title_test.go` | `TestSetTitle_BroadcastsOnceOnARealChangeZeroOnEdgeCases3And4` (6 subtests) | D7: `SetTitle` broadcasts exactly once on a real change, zero on edge cases 3 (clear when no override exists) and 4 (set to the same override string); also covers a full clear-back-to-Claude's-name, edge case 5 (override equal to Claude's current name), and an unknown session id | pass |
| `internal/session/title_test.go` | `TestApplyStatus_OverrideSetAndClaudeNameChanges_PersistsButDoesNotBroadcast` | D10/REQ-12: a status post that changes only Claude's name while an override is set persists the row but does not broadcast | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_RequiresCookie` | 401 without the UI cookie | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_AbsentKeyIs400ButExplicitNullIs204` | D8: absent `title` key (400) vs explicit `"title": null` (204) | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_InvalidBodyIs400` (9 subtests: not JSON, number, boolean, array, object, whitespace-only, empty string, >100 runes, >100 multi-byte runes) | D8: §3.15's 400 envelope for every invalid-body shape, including rune- vs byte-counting | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_Exactly100RunesIsValid` | Positive boundary twin: exactly 100 multi-byte runes is accepted | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_TrimsLeadingAndTrailingWhitespaceBeforeStorage` | §3.15's trim-before-storage clause | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_UnknownSessionIs404` | D8: 404 `unknown_session` envelope | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_SuccessIs204AndPersists` | D8: happy path through the real HTTP handler, store reflects `title_override` | pass |
| `internal/server/title_test.go` | `TestHandleSetTitle_NoOpClearIs204WithNoBroadcast` | Edge case 3 at the HTTP layer: no-op clear is 204 with no `sessionUpsert` over a live WS connection | pass |
| `internal/store/session_test.go` | `TestInsertSession_TitleOverrideDefaultsNil` | A freshly inserted session has `title_override` null | pass |
| `internal/store/session_test.go` | `TestUpdateSession_TitleOverrideRoundTrip` | D9: `title_override` survives insert -> update (set) -> load, and update (clear to nil) -> load | pass |
| `internal/store/migrate_test.go` | `TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp` | Sanctioned breakage repair: migration count/version `6 -> 7` for `0007_title_override.sql` | pass |
| `internal/store/store_test.go` | `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations` | Sanctioned breakage repair: migration count `6 -> 7` | pass |

## Implementation Bugs

None found. `DisplayTitle()`, `Manager.SetTitle`, `Manager.ApplyStatus`'s REQ-12 split,
`handleSetTitle`, and the `title_override` store column all behave exactly as the plan's
requirements and protocol contract specify.

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ go vet ./...
(exit 0, no output)

$ make lint
golangci-lint run
0 issues.

$ go test ./internal/store/... ./internal/session/... ./internal/server/... -count=1
ok  	github.com/Zalaras/muster/internal/store	1.145s
ok  	github.com/Zalaras/muster/internal/session	3.566s
ok  	github.com/Zalaras/muster/internal/server	17.149s

$ go test ./... -count=1
ok  	github.com/Zalaras/muster/cmd/musterd	18.490s
ok  	github.com/Zalaras/muster/internal/claudecode	1.236s
ok  	github.com/Zalaras/muster/internal/ghissue	2.515s
ok  	github.com/Zalaras/muster/internal/gitutil	2.828s
ok  	github.com/Zalaras/muster/internal/locate	3.395s
ok  	github.com/Zalaras/muster/internal/server	24.263s
ok  	github.com/Zalaras/muster/internal/session	7.545s
ok  	github.com/Zalaras/muster/internal/store	7.580s
ok  	github.com/Zalaras/muster/internal/termbridge	6.161s
--- FAIL: TestPreflight_TooOld (2.00s)
--- FAIL: TestPreflight_ExactlyMinVersionIsOK (2.00s)
FAIL	github.com/Zalaras/muster/internal/tmux	19.823s
ok  	github.com/Zalaras/muster/internal/usage	7.031s
ok  	github.com/Zalaras/muster/internal/webui	7.971s
```

The `internal/tmux` failures are pre-existing flakiness, not caused by this plan: this
plan touches no file under `internal/tmux` or `internal/claudecode`. Confirmed by
re-running `go test ./internal/tmux/...` in isolation, where both named tests pass
individually, and by two full `go test ./...` runs producing a *different* failing test
each time (`TestOnExit_Leave_LiveSessionSurvivesShutdown` in `cmd/musterd` and
`TestLauncher_SuccessfulLaunchEndToEnd` in `internal/server` on one run;
`TestPreflight_TooOld`/`TestPreflight_ExactlyMinVersionIsOK` in `internal/tmux` on
another) — consistent with the "make test intermittently red on main" behaviour already
on file, and with `daemon-implementation.md`'s own Handoff note about transient
wrapper-script test flakiness. The three packages this plan actually touches
(`internal/store`, `internal/session`, `internal/server`) are green on every run.

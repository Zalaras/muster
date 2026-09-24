# Daemon Tests: Maintainability Cleanup — Unit D7a (server file splits)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: not run for this unit — briefed directly by the team lead, same as
`daemon-implementation-D7a.md`; `kb:adr/update-install-kinds-decide-who-may-apply` and
`kb:adr/update-release-knowledge-in-selfupdate-package` read in full instead.

## Summary

Tests created: 3 (2 in `internal/selfupdate`, 1 in `internal/server`) | Passing: all | Failing: 0

Scope: table tests for the four functions D7a introduced with no prior direct coverage —
`selfupdate.Install.MayApply`, `selfupdate.ReleaseTag`, `selfupdate.CheckNewer`, and
`server.evictOldest`. Everything else D7a touched (`launcher.go`'s `spawnSession` /
`killWindowAfterRecordFailure`, `sessions.go`'s trim, `issue.go`'s `fileIssue`,
`update.go`'s `buildUpdateInfo`/`remedyPointer`, `RequestApply`'s `MayApply()` call site,
`runApply`'s `ReleaseTag()` call site, `checkAvailability`'s `CheckNewer()` call site) is
pure move or a substitution behind an already-tested call path — see Declined Coverage
below for the specific existing tests that cover each.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/selfupdate/install_test.go` | `TestInstall_MayApply` | `MayApply()` over all four `Kind`s (Dev/Homebrew/Unmanaged false, Installer true) — the allow-list `internal/server/update.go` used pre-refactor and the deny-list `cmd/musterd/update.go` used pre-refactor, now one rule | pass |
| `internal/selfupdate/release_test.go` | `TestReleaseTag` | `ReleaseTag("0.11.0") == "v0.11.0"` | pass |
| `internal/selfupdate/release_test.go` | `TestReleaseTag_RoundTripsWithParseRelease` | `ParseRelease(ReleaseTag(v.String())) == v` | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer/latest_is_newer_than_running` | newer=true, latest parsed correctly | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer/latest_equals_running` | newer=false | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer/latest_is_older_than_running` | newer=false | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer/running_does_not_parse_(dev_build)_reports_not-newer_with_no_error` | dev `running` → newer=false, err=nil (per `CheckNewer`'s doc comment) | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer_Errors/transport_error` | `LatestTag` transport failure propagates a non-nil error | pass |
| `internal/selfupdate/release_test.go` | `TestCheckNewer_Errors/redirect_tag_not_a_release_version` | a resolved tag that fails `ParseRelease` propagates a non-nil error | pass |
| `internal/server/evict_test.go` | `TestEvictOldest/below_limit_evicts_nothing` | `len(m) < limit` → no-op | pass |
| `internal/server/evict_test.go` | `TestEvictOldest/exactly_at_limit_evicts_nothing` | `len(m) == limit` → no-op (the `<=` guard) | pass |
| `internal/server/evict_test.go` | `TestEvictOldest/one_over_limit_evicts_exactly_the_oldest` | evicts the single oldest-by-`at()` entry, others untouched | pass |
| `internal/server/evict_test.go` | `TestEvictOldest/far_over_limit_still_evicts_only_one_entry_per_call` | one call removes exactly one entry even when `len(m)` is several past `limit` (matches both call sites' "once per insert" usage) | pass |
| `internal/server/evict_test.go` | `TestEvictOldest/tied_oldest_timestamps_still_evict_exactly_one_entry` | a tie among the oldest still leaves `len(m) == limit`, and the strictly newer entry always survives | pass |
| `internal/server/evict_test.go` | `TestEvictOldest/limit_zero_evicts_down_by_one_from_a_single_entry` | `limit == 0` boundary | pass |
| `internal/server/evict_test.go` | `TestEvictOldest/generic_over_a_non-int_key_and_a_struct_value` | the generic signature works over a `map[string]struct{...}`, not just the two call sites' own `map[int64]*issueCapture` / `map[string]time.Time` shapes | pass |

## Declined Coverage

Everything else D7a changed already has direct coverage from before the refactor, and the
refactor did not change externally observable behaviour at those call sites (confirmed by
reading the diff and by the passing `go test -race` run below, which exercises the same
handler/manager surface unchanged):

- **`sessionLauncher.spawnSession` / `killWindowAfterRecordFailure`'s success path** —
  extracted verbatim from `Launch`/`Resume`'s inline blocks (same log lines, same control
  flow). Both are already exercised: `TestLauncher_SuccessfulLaunchEndToEnd`
  (`internal/server/sessions_test.go:291`) drives `spawnSession` via `Launch`, and
  `TestLauncher_ConcurrentResumesSpawnExactlyOnce` (`internal/server/sessions_test.go:984`)
  asserts `fake.newSessionCalls == 1` through `Resume`'s call to the same helper.
- **`killWindowAfterRecordFailure`'s actual invocation** (a `RecordLaunch`/`RecordResume`
  failure after a successful spawn) has no dedicated test, before or after this refactor —
  triggering it needs the real `*store.Store` (sqlite, per `openLauncherTestStore` in
  `sessions_test.go`) to fail a specific write mid-launch, which no existing fixture does.
  This is a pre-existing gap in the code this unit moved verbatim, not something D7a's
  extraction introduced or could introduce a regression in (identical error-handling
  statements, just called from two sites instead of duplicated at two sites) — not this
  unit's to add, since Minor 2/V7's scope was the dedup itself, not new coverage of a path
  neither original inline copy had a test for either.
- **`sessions.go`'s trim to the HTTP feature** — byte-identical bodies per the
  implementation log; every `handle*`/`parseSessionID`/request-response type is covered by
  the existing `TestHandle*`/`TestSessionActionHandlers_RequireCookie` tests in
  `sessions_test.go`, none of which needed a signature change.
- **`issue.go`'s `fileIssue`** — verbatim extraction of `handleCreateIssue`'s former body;
  `internal/server/issue_test.go`'s existing create-issue tests exercise the same
  reserve/post/consume/release sequence through the HTTP handler, unchanged.
- **`issue.go`'s `newIssueFeature` nil-client-when-disabled** and **`captureStore.put`'s
  call into `evictOldest`** — covered by `internal/server/issue_test.go`'s existing
  disabled-issue-tracker and capture-eviction tests (unaffected: the only change at these
  call sites is delegating to the now-separately-tested `evictOldest`).
- **`reader.go`'s `writeLog.record`'s call into `evictOldest`** — covered by
  `internal/server/reader_test.go`'s existing write-log tests, same reasoning.
- **`update.go`'s `buildUpdateInfo`/`remedyPointer`** — consolidate two previously
  hand-written `UpdateInfo{...}` literals with identical field values; both call sites
  (`updateManager.Current`, `updateFeature.current`) are already covered by
  `update_test.go`/`update_check_test.go`'s wire-shape assertions (e.g.
  `update_check_test.go:64`'s `CanCheck` assertion, `update_test.go`'s per-`Kind` remedy
  table around line 511 asserting `update_unsupported`'s message equals the install's
  remedy).
- **`RequestApply`'s `!m.install.MayApply()` call site** — `update_test.go`'s
  `for _, kind := range []selfupdate.Kind{KindHomebrew, KindUnmanaged}` subtest (around
  line 511) and its `KindInstaller` success subtest (around line 479) already exercise
  three of the four `Kind`s through the HTTP handler; `KindDev` is unreachable through the
  handler (it 404s earlier on `installKind() == KindDev`), so it is covered only at the
  `selfupdate.Install.MayApply` level by this unit's new `TestInstall_MayApply` — which is
  exactly why that table lives in `internal/selfupdate`, not `internal/server`.
- **`runApply`'s `Tag: selfupdate.ReleaseTag(version)` call site** — `update_test.go`'s
  successful-apply subtest downloads/verifies/installs against a fake origin keyed by tag,
  so a wrong tag format would 404 against the fake and fail that test; it already passes.
- **`checkAvailability`'s `selfupdate.CheckNewer` call site** — `update_check_test.go`
  already covers the manual/automatic check paths' wire behaviour (available/checkedAt,
  the `check_failed` 502 mapping); this unit's `TestCheckNewer`/`TestCheckNewer_Errors`
  cover the composed logic itself at the `selfupdate` level, one layer down.

## Test Run Output

```
$ go build ./...
(exit 0)

$ go vet ./...
(exit 0)

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/selfupdate/... ./internal/server/... ./cmd/...
ok  	github.com/Zalaras/muster/internal/selfupdate	1.858s
ok  	github.com/Zalaras/muster/internal/server	103.429s
ok  	github.com/Zalaras/muster/cmd/musterd	57.674s
```

One transient `go build ./...` failure was observed mid-session (`cmd/musterd`:
`checkClaudeCode`/`shutdownGracefully`/`onExitDecision`/... redeclared, from
`cmd/musterd/{onexit,tokens,claudeversion,webdist}.go` existing alongside a not-yet-trimmed
`main.go`) — a concurrent impl agent mid-split of `cmd/musterd/main.go` in this shared
worktree, not caused by this unit (D7a touches only `cmd/musterd/update.go`). Re-verified
green once that agent's edit landed; the build/vet/lint/test output above is from that
clean state.

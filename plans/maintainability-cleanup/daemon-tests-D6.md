# Daemon Tests: Maintainability Cleanup — D6 test repair

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: not run — briefed directly by the team lead against
`daemon-implementation-D6.md`'s Handoff, which named the exact sanctioned breakage and, for
five of the six items, the exact fix.

## Summary

D6's composition-root rework (constructor arguments replacing post-construction field
writes, `*Server` delegator methods removed in favour of calling the owning feature
directly) had broken the `internal/server` test binary at 6 files / ~50 call sites, all
mechanical per the Handoff. Repaired all 6, plus moved `ingestQueue.Drain` (Handoff item 6,
left undone by D6 because the move is test-file content, outside daemon-impl's remit) out
of `ingest.go` into `ingest_test.go` verbatim.

Tests created: 0 (repair only — no new coverage). Tests repaired: 6 files. Passing: all.
Failing: 0.

## Tests

| File | Change | What It Fixes | Status |
|------|--------|----------------|--------|
| `sessions_test.go:848,917` | added `nil` (new `reader` param) to two `newSessionsFeature(...)` calls | compile: `newSessionsFeature` gained a constructor-argument `reader writeLogForgetter` | pass |
| `ingest_test.go:237,251,270,284` | appended `, nil, nil, nil` (new `manager, files, usage` params) to four `newIngestQueue(...)` calls | compile: `newIngestQueue` gained three constructor arguments | pass |
| `issue_test.go` (8 sites: 645, 741, 767, 787, 800, 825, 925) | `srv.buildIssueSnapshot(...)` → `srv.issue.buildIssueSnapshot(...)` | compile: the `*Server` delegator was removed; the method lives unchanged on `*issueFeature` | pass |
| `prefs_test.go` (27 sites), `prefs_rail_test.go` (8 sites) | `srv(2).loadPrefs(context.Background())` → `loadPrefs(context.Background(), srv(2).store)` | compile: the `*Server` delegator was removed; `loadPrefs` is an unchanged free function taking `*store.Store` | pass |
| `browse_test.go` (`newBrowseRootTestServer`) | rewrote the helper to build the server via `Config{Launch: LaunchConfig{BrowseRoot: root}}` instead of `srv.browseRoot = root` (field removed); added `context`, `github.com/rs/zerolog`, `github.com/Zalaras/muster/internal/store` imports | compile: `Server.browseRoot` field is gone, root is now construction-time-only | pass |
| `ingest.go` / `ingest_test.go` | moved `(q *ingestQueue) Drain(ctx context.Context) error` verbatim (doc comment included) from `ingest.go` into `ingest_test.go`, placed immediately before `TestIngestQueue_Drain_NothingQueuedReturnsImmediately` | Handoff item 6 / Minor 5's fourth item: `Drain`'s doc comment says "Test-only"; its 5 call sites (`ingest_test.go` ×2, `ingest_routing_test.go` ×2, `reader_test.go` ×3) are all in-package white-box tests reaching `q.ch`/`q.wg` directly, and `ingest_test.go` already imports `context` | pass |

No assertion, fixture, or test-name changes anywhere in this unit — every fix above is
signature/call-site/location only, exactly as the Handoff specified.

## Notes

- Verified before editing that every `newSessionsFeature`/`newIngestQueue` call site
  matched the Handoff's described shape (`grep -n` each symbol in its test file) and that
  `srv.issue`/`srv.store` are the correct field names (`server.go:124`
  `issue *issueFeature`; `testServer` embeds `store *store.Store`,
  `helpers_test.go:52`) before using them in the replacement.
- The first `prefs_test.go`/`prefs_rail_test.go` attempt used a regex substitution
  (`s/(srv2?)\.loadPrefs\(([^)]*)\)/loadPrefs(\2, \1.store)/`) that mishandled the nested
  parens in `context.Background()`, producing `loadPrefs(context.Background(, srv.store))`.
  Caught by inspecting the sed output before moving on; reverted both files with
  `git checkout --` and re-applied with a direct (non-regex-capture) string substitution,
  since every one of the 35 call sites' argument was confirmed identical
  (`context.Background()`, no other forms present).
- `Drain`'s new home is `ingest_test.go` rather than a dedicated `ingest_testonly_test.go`:
  the file already declares/uses every type `Drain` touches (`ingestQueue`, `ingestJob`)
  and already imports `context`, and this repair's placement (immediately before its own
  first caller) needed no new import or file.

## Gates

```
$ go build ./...
(exit 0)

$ go test -c -o /dev/null ./internal/server/
(exit 0)

$ gofmt -l internal/server/
(no output)

$ go vet ./...
(exit 0)

$ make lint
golangci-lint run
0 issues.
```

```
$ make test-race
go test -race -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	72.480s
ok  	github.com/Zalaras/muster/internal/claudecode	25.621s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	1.872s
ok  	github.com/Zalaras/muster/internal/gitutil	4.351s
ok  	github.com/Zalaras/muster/internal/kb	5.361s
ok  	github.com/Zalaras/muster/internal/locate	5.946s
ok  	github.com/Zalaras/muster/internal/selfupdate	6.744s
ok  	github.com/Zalaras/muster/internal/server	108.777s
ok  	github.com/Zalaras/muster/internal/session	37.757s
ok  	github.com/Zalaras/muster/internal/store	16.168s
ok  	github.com/Zalaras/muster/internal/termbridge	6.471s
ok  	github.com/Zalaras/muster/internal/tmux	23.120s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	8.974s
ok  	github.com/Zalaras/muster/internal/triage	8.629s
ok  	github.com/Zalaras/muster/internal/tty	8.598s
ok  	github.com/Zalaras/muster/internal/usage	12.309s
ok  	github.com/Zalaras/muster/internal/webui	9.099s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failapi	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/kb	8.240s
ok  	github.com/Zalaras/muster/tools/triage	6.275s
ok  	github.com/Zalaras/muster/tools/versions	12.896s
```

## Files Touched (all `_test.go` except the sanctioned `ingest.go` Drain removal)

- `internal/server/sessions_test.go`
- `internal/server/ingest_test.go`
- `internal/server/issue_test.go`
- `internal/server/prefs_test.go`
- `internal/server/prefs_rail_test.go`
- `internal/server/browse_test.go`
- `internal/server/ingest.go` (removed `ingestQueue.Drain` only — moved verbatim to `ingest_test.go`, per the team lead's explicit one-exception grant)

Not committed per instructions (no `git add`/`git commit` run).

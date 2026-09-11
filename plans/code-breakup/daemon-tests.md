# Daemon Tests: Code Breakup

**Plan**: code-breakup
**Verdict**: pass

## Summary (re-run, after Fix Attempt 1)

Tests created: 3 | Repaired (sanctioned breakage): 7 files | Passing: 332 | Failing: 0.
See `## Re-run after Fix Attempt 1` below for the new test, the re-run gates, and why
REQ-11's Stop half needed a second, direct test rather than relying on the registration-order
one alone.

## Summary (original run, superseded)

Tests created: 2 | Repaired (sanctioned breakage): 7 files | Passing: 330 | Failing: 1

## Repaired sanctioned breakage

Every site listed in `daemon-implementation.md`'s `## Handoff` was fixed exactly per its
stated old→new mapping — no other file needed a change, matching the Handoff's own claim.

| File | Fix |
|------|-----|
| `gauges_test.go` | `srv.usage.Current()` → `srv.usage.aggregator.Current()` (4 sites) |
| `usage_test.go` | `Config{UsagePoll, UsageAPIURL, UsageTokenFile}` → `Config{Usage: UsageConfig{Poll, APIURL, TokenFile}}` (1 site) |
| `issue_test.go` | `Config{IssueRepo, IssueAPIURL, IssueTokenFile}` → `Config{Issue: IssueConfig{Repo, APIURL, TokenFile}}` (1 site); `srv.issueCaptures` → `srv.issue.captures` (9 sites) |
| `locate_test.go` | `srv.locator` → `srv.locate.locator` (7 sites) |
| `state_test.go` | `Config{ClaudeThemePoll, ClaudeConfigFile}` → `Config{Theme: ThemeConfig{Poll, ConfigFile}}` (1 site); `srv.themePoller` → `srv.theme.poller` (2 sites) |
| `themepoll_test.go` | same two patterns as `state_test.go` (1 Config site + 2 `srv.themePoller` sites) |
| `update_test.go` | `Config{UpdateCheckInterval}` → `Config{Update: UpdateConfig{CheckInterval}}`; every `c.UpdateBaseURL`/`c.UpdatePublicKey`/`c.Install`/`c.ExePath` mutate-closure site → `c.Update.<Field>` (14 sites, scoped to the `*Config`-typed closures only — the three `*updateManagerConfig`-typed `c.ExePath` sites in the white-box `updateManager` tests were already correct and untouched); `srv.updates` → `srv.update.um` (14 sites) |

`go build ./...`, `go vet ./...` and `gofmt -l internal/server/*.go` are all clean. The
full `internal/server` package (including `_test.go`) compiles.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `server_test.go` | `TestNew_RegistersLifecycleFeaturesInStartOrder` | REQ-11: the four lifecycle features (`ingestFeature`, `usageFeature`, `themeFeature`, `updateFeature`) run in registration order ingest→usage→theme→update, since `Start`/`Shutdown` both loop `s.features` unreversed (INV-5) | **fail — implementation bug, see below** |
| `server_test.go` | `TestNew_ZeroValueLaunchConfigDefaultsClaudeBin` | REQ-10 for `LaunchConfig`: a zero-value `Config.Launch` still defaults `sessionLauncher.claudeBin` to `"claude"` (the one `LaunchConfig` field `New` itself interprets at construction) | pass |

### REQ-10 zero-value coverage for the other four sub-structs: already covered, not duplicated

- **Usage** — `usage_test.go:60` `TestHandleUsageRefresh_DisabledPollingReturns404` builds via
  `newTestServer` (zero-value `UsageConfig`) and asserts
  `assert.Equal(t, http.StatusNotFound, rec.Code)` /
  `assert.Equal(t, "not_found", decodeErrorCode(t, rec))` — provable only because
  `usageFeature.poller` is nil, which is exactly REQ-10's "never reaches the network or the
  Keychain" (the poller is what would construct the Keychain/`TokenFile` reader).
- **Theme** — `themepoll_test.go:239` `TestServer_ClaudeThemePollZeroConstructsNoPoller`
  directly asserts `assert.Nil(t, srv.theme.poller, ...)` for a zero-value `ThemeConfig`.
- **Issue** — `issue_test.go:986`/`issue_test.go:1126`
  (`TestHandleCreateCapture_DisabledWhenIssueAPIURLEmpty`,
  `TestHandleCreateIssue_DisabledWhenIssueAPIURLEmpty`) assert 404 `not_found` for a
  zero-value `IssueConfig`, which the handler only reaches when `f.apiURL == ""` —
  provably never constructs a live `gh`/GitHub-reaching path.
- **Update** — `update_test.go`'s `TestHandleApplyUpdate_ErrorTable` subtest `"no update
  manager (UpdateBaseURL empty) is 404 not_found"` (line 496) builds via
  `newUpdateTestServer(t, nil)` (zero-value `UpdateConfig`) and asserts 404 `not_found`,
  reachable only when `f.um == nil` — i.e. zero `BaseURL` never constructs the manager that
  would reach github.com.

No new zero-value test was added for these four; each already asserts, from the outside,
that the zero-value sub-struct results in the nil/disabled internal state REQ-10 requires.

## Implementation Bug

**Verdict driver.** `TestNew_RegistersLifecycleFeaturesInStartOrder` fails against the
current implementation and is not a test bug — it directly asserts REQ-11's own stated
order, matching daemon-implementation.md's Decisions section and the very comment
`server.go:193-196` puts above the registration calls it decorates.

| Bug | File | Expected (per plan) | Actual |
|-----|------|---------------------|--------|
| Lifecycle registration order | `internal/server/server.go:180-201` | REQ-11: "Start and Stop order is exactly today's ... ingest, usage poller, theme poller, updates" — `Start`/`Shutdown` loop `s.features` in registration order (server.go's own comment: "REQ-11's Start/Stop order — ingest, usage poller, theme poller, updates — is this registration order") | `s.update` is registered at line 191, *before* `s.ingest` (197), `s.usage` (199) and `s.theme` (201) — so the actual lifecycle order in `s.features` is **update, ingest, usage, theme**: updates starts first and stops first, reversed from every other position relative to the stated order |

Confirmed two ways:
1. An ad-hoc probe (`for i, f := range srv.features { if _, ok := f.(lifecycle); ok { ... } }`)
   printed, in order: `*server.updateFeature`, `*server.ingestFeature`,
   `*server.usageFeature`, `*server.themeFeature`.
2. `TestNew_RegistersLifecycleFeaturesInStartOrder`'s own failure output (below) shows each
   `assert.Same` comparing the wrong pair — position 0 holds `*updateFeature` where
   `*ingestFeature` (`srv.ingest`) is expected, and position 3 holds `*themeFeature` where
   `*updateFeature` (`srv.update`) is expected.

**Likely fix** (for daemon-impl, not applied here — outside this agent's remit): move the
`s.update = register(...)` call (and its `s.prefs.updateChecker = s.update` follow-up) to
after the `s.ingest`/`s.usage`/`s.theme` registrations, immediately before `s.routes()` —
Edge Case 13's construction-cycle ordering (prefs before update) is independent of *where*
in the overall registration sequence that pair sits, so this should be a pure reordering
with no other change needed. Not verified further since implementation edits are outside
this agent's remit.

## Test Run Output

```
$ go build ./...
(exits 0)

$ go vet ./...
(no output)

$ gofmt -l internal/server/*.go
(no output)

$ make lint
golangci-lint run
0 issues.

$ make test
...
--- FAIL: TestNew_RegistersLifecycleFeaturesInStartOrder (0.01s)
    server_test.go:26:
        	Error Trace:	/Users/damian/Documents/code/Projects/muster/internal/server/server_test.go:26
        	Error:      	Not same:
        	            	expected: &server.ingestFeature{...} (*server.ingestFeature)(0x1...)
        	            	actual  : &server.updateFeature{...} (*server.updateFeature)(0x1...)
        	Test:       	TestNew_RegistersLifecycleFeaturesInStartOrder
        	Messages:   	REQ-11: ingest must start first
    server_test.go:27:
        	Error:      	Not same:
        	            	expected: &server.usageFeature{...}
        	            	actual  : &server.ingestFeature{...}
        	Messages:   	REQ-11: usage poller must start second
    server_test.go:28:
        	Error:      	Not same:
        	            	expected: &server.themeFeature{...}
        	            	actual  : &server.usageFeature{...}
        	Messages:   	REQ-11: theme poller must start third
    server_test.go:29:
        	Error:      	Not same:
        	            	expected: &server.updateFeature{...}
        	            	actual  : &server.themeFeature{...}
        	Messages:   	REQ-11: updates must start last
FAIL
FAIL	github.com/Zalaras/muster/internal/server	24.824s
FAIL	github.com/Zalaras/muster/internal/server [build failed... no — ran, 1 of 331 subtests failed]
make: *** [test] Error 1
```

Full package run: 330 passing, 1 failing (`go test -count=1 ./internal/server/... -v`
subtest count). Every other package in the repo (`go test -count=1 ./...` minus
`internal/server`) is green, unaffected by this plan.

## Re-run after Fix Attempt 1

**Trigger**: daemon-impl's Fix Attempt 1 (commit `b819ee8`, pre-review fix) reordered
`internal/server/server.go`'s `New()` registrations to ingest, usage, theme, update, fixing
the bug this agent's original run reported above.

**Confirmed `TestNew_RegistersLifecycleFeaturesInStartOrder` now passes**:
```
$ go test ./internal/server -run TestNew_RegistersLifecycleFeaturesInStartOrder -v
=== RUN   TestNew_RegistersLifecycleFeaturesInStartOrder
--- PASS: TestNew_RegistersLifecycleFeaturesInStartOrder (0.02s)
PASS
ok  	github.com/Zalaras/muster/internal/server	1.075s
```

**Gap found and closed — REQ-11 covers Start *and* Stop, only Start's half was pinned.**
`TestNew_RegistersLifecycleFeaturesInStartOrder` asserts the order features land in
`s.features` by type-asserting `lifecycle` and comparing pointers — it never calls
`Shutdown`, so it proves what `Start` (which loops that slice forward) will do but nothing
about `Shutdown`'s own loop body. Re-reading `server.go`, `Start` (line 224) and `Shutdown`
(line 261) are two independently-written `for _, f := range s.features { ... }` loops over
the same slice, both unreversed today — but nothing enforces they stay in lockstep; a future
edit reversing `Shutdown` to LIFO teardown (a common, plausible convention for teardown code)
would not be caught by any existing test, including the registration-order one. No other test
in the package calls `Shutdown` while recording cross-feature invocation order either
(checked: every `srv.Shutdown(...)` call site in `*_test.go` is a single-feature test —
WS-close, terminal-close, ingest-flush — none of them assert relative order across the four
lifecycle features).

Added `TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed` to
`internal/server/server_test.go`: a `recordingLifecycleFeature` double (implements `feature`
+ `lifecycle`, appends `"start:"+name"` / `"stop:"+name` to a shared log) is substituted for
`srv.features` after construction, then `srv.Shutdown(context.Background())` is called
directly and the resulting log is asserted to be `stop:ingest, stop:usage, stop:theme,
stop:update` — the actual `Stop` call order, not an inference from where features sit in a
slice. This is a genuine behavioural test of `Shutdown`'s loop body, exercised independently
of `Start`.

```
$ go test ./internal/server -run 'TestNew_RegistersLifecycleFeaturesInStartOrder|TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed' -v
=== RUN   TestNew_RegistersLifecycleFeaturesInStartOrder
--- PASS: TestNew_RegistersLifecycleFeaturesInStartOrder (0.02s)
=== RUN   TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed
--- PASS: TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed (0.01s)
PASS
ok  	github.com/Zalaras/muster/internal/server	1.075s
```

### Updated Tests table entry

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `server_test.go` | `TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed` | REQ-11's Stop half directly: substitutes recording doubles for `s.features`, calls `Shutdown`, and asserts the actual `Stop` call order is forward (ingest→usage→theme→update), not LIFO | pass |

### Full gate re-run (this step)

```
$ go build ./...
(exits 0)

$ gofmt -l internal/server/server_test.go
(no output)

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	18.114s
ok  	github.com/Zalaras/muster/internal/claudecode	15.869s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	0.986s
ok  	github.com/Zalaras/muster/internal/gitutil	3.661s
ok  	github.com/Zalaras/muster/internal/locate	0.528s
ok  	github.com/Zalaras/muster/internal/selfupdate	3.111s
ok  	github.com/Zalaras/muster/internal/server	25.902s
ok  	github.com/Zalaras/muster/internal/session	5.400s
ok  	github.com/Zalaras/muster/internal/store	4.004s
ok  	github.com/Zalaras/muster/internal/termbridge	4.172s
ok  	github.com/Zalaras/muster/internal/tmux	14.420s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	5.357s
ok  	github.com/Zalaras/muster/internal/triage	5.359s
ok  	github.com/Zalaras/muster/internal/usage	5.548s
ok  	github.com/Zalaras/muster/internal/webui	3.835s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/triage	3.907s
ok  	github.com/Zalaras/muster/tools/versions	11.337s

$ make lint
golangci-lint run
0 issues.

$ go test ./internal/server/... -v 2>&1 | grep -c '^--- PASS'
332
$ go test ./internal/server/... -v 2>&1 | grep -c '^--- FAIL'
0
```

All packages green, `internal/server` at 332 passing / 0 failing subtests (up from 330/1
before this step: +1 net test file addition, +1 test net of the fix removing the prior
failure). `make lint` reports 0 issues, matching daemon-impl's own Fix Attempt 1 gate
evidence.

**No implementation file touched.** Only `internal/server/server_test.go` and this log
changed in this step.

## Scope note

Per the assignment: only `_test.go` files under `internal/server/` were touched (the seven
sanctioned-breakage files plus the new `server_test.go`). No implementation file, no file
under `web/`, and no orchestrator-owned file (`plans/code-breakup/orchestration-state.json`,
modified by a concurrent agent) was edited by this step.

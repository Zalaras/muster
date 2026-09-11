# Daemon Implementation: Code Breakup

**Plan**: code-breakup
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/server.go` | rewritten | Composition root only (≤300 lines, D4): core `Config`, `Server`, `New`, `Handler`, `Start`, `Shutdown`, `EndAllSessions`, `LiveSessionCount`, `TmuxSocket`, `RestartRequests`, `routes`; `feature`/`lifecycle`/`snapshotContributor` interfaces and the generic `register[F feature]` helper. `paneSpawner` moved to `sessions.go`, `paneConn`/`attachFunc` to `terminal.go`, `ClaudeCodeInfo` to `ws.go` to make the line budget. |
| `internal/server/sessions.go` | rewritten | `LaunchConfig`, `paneSpawner`, `sessionLauncher` (unchanged logic), and `sessionsFeature` (create/end/resume/remove/pin/order/title/pane) with deps manager, launcher, shells (`*shellRegistry`), terminals (`*terminalRegistry`), logger. |
| `internal/server/terminal.go` | rewritten | `paneConn`/`attachFunc`, `terminalRegistry` (unchanged, now explicitly shared by 3 features), `terminalFeature` (`GET /ws/terminal/{id}`, `closeAll` for Shutdown), and the pump/resize functions turned into free functions (`pumpPTYToSocket`, `pumpSocketToPTY`, `applyResizeFrame`) parameterized on `zerolog.Logger` and an optional `nudge` callback, since both `terminalFeature` and `shellFeature` call them. |
| `internal/server/shells.go` | rewritten | `shellRegistry` (unchanged) plus `shellFeature` (`POST /api/sessions/{id}/shell`, `GET /ws/shell/{id}` — moved here from sessions.go/terminal.go respectively) with deps registry, terminals, manager, attach, logger. |
| `internal/server/ingest.go` | rewritten | `ingestQueue` (unchanged) plus `ingestFeature` wrapping it: mounts the two unguarded `/ingest/{token}/...` routes (ignores the `guard` param) and implements `lifecycle`. |
| `internal/server/prefs.go` | rewritten | `loadPrefs` became a free function `loadPrefs(ctx, *store.Store)` (issueFeature needs it without depending on the whole prefs feature); `checkEnabledSetter` interface (Edge Case 13); `prefsFeature` (`PUT /api/prefs`, snapshot contributor) with deps store, hub, updateChecker (wired post-construction). Kept a thin `(*Server).loadPrefs(ctx)` delegator — 23 `prefs_test.go` sites call it directly and it's outside the plan's sanctioned-breakage list. |
| `internal/server/usage.go` | rewritten | `UsageConfig` and `usageFeature` (aggregator, model-scoped holder, optional poller, `POST /api/usage/refresh`, snapshot contributor). `usagewire.go`/`usagepoll.go` unchanged. |
| `internal/server/themepoll.go` | modified | Added `ThemeConfig` and `themeFeature` (optional poller, snapshot contributor, no routes); `themePoller` itself unchanged. |
| `internal/server/issue.go` | modified | Added `IssueConfig` and `issueFeature` (capture store, `ghissue.Client`, both routes) with deps store, manager, daemonVersion, claudeCode, logger. `buildIssueSnapshot` became a method on `issueFeature`, using the new free `loadPrefs`. Kept a thin `(*Server).buildIssueSnapshot(...)` delegator for `issue_test.go`'s 7 direct call sites (same rationale as `loadPrefs`). |
| `internal/server/update.go` | modified | Added `UpdateConfig` and `tmuxSessionLister` interface; `updateFeature` wraps the (possibly nil) `*updateManager`, always registered, always answering the disabled shape when nil (Edge Case 14 applied at the feature boundary). `SetCheckEnabled` satisfies `prefs.go`'s `checkEnabledSetter`. `updateManager` itself unchanged. |
| `internal/server/locate.go` | modified | Added `locateFeature` (manager, locator) owning `POST /api/sessions/{id}/locate`. |
| `internal/server/browse.go` | rewritten | `browseFeature` takes `root *string` (a pointer to `Server.browseRoot`, not a copied value) so `browse_test.go`'s direct `srv.browseRoot = root` mutation after construction is still observed live by the handler. |
| `internal/server/repos.go` | rewritten | `reposFeature` (store, logger) owning `GET /api/repos`. |
| `internal/server/state.go` | modified | `currentSnapshot` now fills `Sessions` from the manager directly (core) and loops `s.features`, type-asserting `snapshotContributor` for everything else — no feature named by name (REQ-6/D7). Removed the old `currentUpdate` method (now `updateFeature.current`). |
| `internal/server/ws.go` | modified | `ClaudeCodeInfo` moved here from server.go (kept the doc comment). |
| `cmd/musterd/main.go` | modified | The `server.Config` literal now nests `Launch`/`Usage`/`Issue`/`Theme`/`Update` sub-structs; every flag maps to the same-named sub-struct field, no flag renamed or defaulted differently. |

## Decisions

- **Edge Case 13 (prefs/update construction cycle)**: resolved exactly as the plan's Implementation Notes describe — `prefsFeature` is constructed first (store, hub only), `updateFeature` is constructed next passing `loadPrefs(ctx, cfg.Store).UpdateCheck` as its initial `CheckEnabled`, then `s.prefs.updateChecker = s.update` wires the setter side. `updateFeature.SetCheckEnabled` is a no-op when its internal `um` is nil, so this holds even when updates are disabled.
- **`loadPrefs` is a free function, not a `prefsFeature` method**: `issueFeature.buildIssueSnapshot` needs the persisted prefs' view/density/railSort for its dashboard-scope row, and the plan's cross-feature dependency list ("issue → store, manager, ClaudeCodeInfo, daemonVersion") does not include a dependency on the whole prefs feature. Since `loadPrefs`'s only dependency is `*store.Store`, making it a free function `loadPrefs(ctx, store)` lets both `prefsFeature` and `issueFeature` call it without one depending on the other.
- **Two test-facing delegator methods kept on `*Server`**: `loadPrefs(ctx) PrefsInfo` and `buildIssueSnapshot(ctx, now, sess) issueSnapshot`. Neither is in the plan's enumerated sanctioned-breakage list (`prefs_test.go` calls `srv.loadPrefs(ctx)` 23 times, `issue_test.go` calls `srv.buildIssueSnapshot(...)` 7 times — measured via `rg -n '\.loadPrefs\(|\.buildIssueSnapshot\('`), so per REQ-13 ("only tests that reach a moved field or set a feature Config field change") these must keep compiling. Each is a one-line delegate to the real feature. Consequence: `golangci-lint run --tests=false ./...` flags both as `unused` (2 issues, no others) since their only callers are test files — this is an expected, by-design result of the back-compat shim, not a defect; `make lint` (tests included) does not flag them.
- **`browseFeature.root` is `*string`, not `string`**: `browse_test.go:144` does `srv.browseRoot = root` directly after `New()` returns, with no rebuild. Kept `browseRoot string` as a real `Server` field (set from `cfg.Launch.BrowseRoot` at construction) and passed `&s.browseRoot` into `newBrowseFeature`, so the handler reads the live value instead of a snapshot taken at construction time. `srv.locator`/`srv.issueCaptures`/`srv.themePoller`/`srv.usage` get no such treatment — those are the plan's explicit sanctioned breakage (moved fully onto their feature, no back-compat).
- **`terminalRegistry` is one shared instance**, constructed once in `New()` and passed to `sessionsFeature` (End/Remove's socket close), `terminalFeature` (Claude surface takeover) and `shellFeature` (shell surface takeover) — not three separate registries. The one-live-client law is per `(sessionID, surface)` key already, so sharing changes nothing observable; splitting it would have required `sessionsFeature` to hold two registries to implement `closeSessionAndShell`, for no behavioural gain.
- **Pump functions (`pumpPTYToSocket`, `pumpSocketToPTY`, `applyResizeFrame`) became free functions** taking `zerolog.Logger` explicitly (and a `nudge func(context.Context, int64)` callback for the EOF liveness-nudge), since both `terminalFeature.handleTerminal` and `shellFeature.handleShellTerminal` call them and there is no single receiver type common to both.

## Handoff

**Build status**: `go build ./...` exits 0.

**Sanctioned test breakage** (measured via `go test -vet=off -gcflags="-e" -c ./internal/server/ -o /tmp/x`, matches the plan's Affected Files → Daemon list exactly, no more and no less):
- `internal/server/gauges_test.go` (4 sites): `srv.usage.Current` — `usage` is now `*usageFeature`; the aggregator/model-scoped holders are `srv.usage.aggregator`/`srv.usage.modelScoped`.
- `internal/server/usage_test.go` (1 site): `Config{UsagePoll: ..., UsageAPIURL: ..., UsageTokenFile: ...}` — now `Config{Usage: server.UsageConfig{Poll: ..., APIURL: ..., TokenFile: ...}}`.
- `internal/server/issue_test.go` (1 Config-literal site + 9 `srv.issueCaptures` sites): `Config{IssueRepo: ..., IssueAPIURL: ..., IssueTokenFile: ...}` → `Config{Issue: server.IssueConfig{...}}`; `srv.issueCaptures` → `srv.issue.captures` (both now unexported fields of `*issueFeature`).
- `internal/server/locate_test.go` (7 sites): `srv.locator = walkOnlyLocator()` — `locator` moved to `srv.locate.locator`.
- `internal/server/state_test.go` (1 Config-literal site + 2 `srv.themePoller` sites): `Config{ClaudeThemePoll: ..., ClaudeConfigFile: ...}` → `Config{Theme: server.ThemeConfig{Poll: ..., ConfigFile: ...}}`; `srv.themePoller` → `srv.theme.poller`.
- `internal/server/themepoll_test.go` (1 Config-literal site + 2 `srv.themePoller` sites): same two patterns as state_test.go.
- `internal/server/update_test.go` (many sites: 1 Config-literal, ~14 `c.UpdateBaseURL`/`c.UpdatePublicKey`/`c.Install`/`c.ExePath` mutate-closure sites, ~14 `srv.updates` sites): `Config{UpdateCheckInterval: ...}` → `Config{Update: server.UpdateConfig{CheckInterval: ...}}`; the `mutate(&cfg)` closures need to set `cfg.Update.BaseURL` etc.; `srv.updates` → `srv.update.um` (both now unexported, `um` is `*updateManager`, nil when disabled).

None of these edits are in `_test.go` files I'm permitted to touch. No test file outside this list should need a change — confirmed by the same compile run showing zero errors anywhere else in the package, and by `go test $(go list ./... | grep -v /internal/server$)` passing clean (all other packages, including `cmd/musterd`, are green).

**Gate evidence**:
```
$ go build ./...
(exits 0)

$ gofmt -l .
(no output)

$ go vet $(go list ./... | grep -v '/internal/server$')
(no output)

$ golangci-lint run --tests=false ./...
internal/server/issue.go:541:18: func (*Server).buildIssueSnapshot is unused (unused)
internal/server/prefs.go:160:18: func (*Server).loadPrefs is unused (unused)
2 issues:
* unused: 2
```
Both findings are the test-facing delegators discussed under Decisions — real callers exist only in `_test.go` files, which `--tests=false` excludes by design. `make lint` (tests included) currently fails at the first sanctioned typecheck error in `internal/server` (as documented in the daemon-impl skill's "blinds your lint gate" note) and reports nothing else; the `--tests=false` run above is what stands in for it and found no other issue anywhere in the repo.

`go build ./...` and `wc -l internal/server/server.go` (300, ≤300 for D4) both re-checked after the final comment edit.

## Fix Attempt 1

**Failures addressed**: `TestNew_RegistersLifecycleFeaturesInStartOrder` (`internal/server/server_test.go`) — verdict `implementation-bug` from daemon-tests. `New()` registered `s.update` (line 191, old numbering) before `s.ingest`/`s.usage`/`s.theme` (lines 197–201), so `s.features` held the four `lifecycle`-implementing features in the order update, ingest, usage, theme instead of REQ-11's ingest, usage, theme, update. `Start`/`Shutdown` both iterate `s.features` in registration order (unreversed, INV-5), so this was a real behavioural bug, not just a cosmetic mismatch with the comment already sitting above the code.

**Root cause, only one path**: there is exactly one registration site for each of `s.prefs`/`s.update`/`s.ingest`/`s.usage`/`s.theme` in `New()` — no clear-rebind, no second construction path, no alternate entry point that could register these features in a different order (confirmed: `rg -n 'register\(s, new(Update|Ingest|Usage|Theme|Prefs)Feature'` in `internal/server/server.go` returns exactly one hit per feature, all inside `New`). Fixing the one call-site ordering closes the defect completely; there is no second door to check.

**Changes made**: In `internal/server/server.go`'s `New()`, moved the `s.ingest`/`s.usage`/`s.theme` registrations (and the `s.ingest.queue.manager`/`s.ingest.queue.usage` wiring that must sit between them) to before `s.update`'s registration, keeping `s.prefs` registered first and the `s.prefs.updateChecker = s.update` wiring last. New order: prefs → ingest → usage → theme → update. `prefsFeature` implements no `Start`/`Stop` (verified: `grep -n "func (f \*prefsFeature)" internal/server/prefs.go` shows only `mount`/`contribute`/`handlePutPrefs`, no lifecycle methods), so moving ingest/usage/theme's registration between prefs and update does not touch Edge Case 13's construction-cycle requirement (prefs built before update, `updateChecker` wired after both exist) — only the *lifecycle* subsequence needed reordering, and prefs was never part of that subsequence. Tightened the Edge Case 13 comment from 3 lines to keep `server.go` at exactly 300 lines (D4).

**Repro re-run** (the tester's exact command):
```
$ go test ./internal/server -run TestNew_RegistersLifecycleFeaturesInStartOrder -v
=== RUN   TestNew_RegistersLifecycleFeaturesInStartOrder
--- PASS: TestNew_RegistersLifecycleFeaturesInStartOrder (0.01s)
PASS
ok  	github.com/Zalaras/muster/internal/server	0.523s
```

**Gate evidence**:
```
$ go build ./...
(exits 0)

$ wc -l internal/server/server.go
300 internal/server/server.go

$ gofmt -l .
(no output)

$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	26.632s
ok  	github.com/Zalaras/muster/internal/claudecode	23.378s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	1.604s
ok  	github.com/Zalaras/muster/internal/gitutil	3.147s
ok  	github.com/Zalaras/muster/internal/locate	3.525s
ok  	github.com/Zalaras/muster/internal/selfupdate	4.282s
ok  	github.com/Zalaras/muster/internal/server	30.596s
ok  	github.com/Zalaras/muster/internal/session	7.088s
ok  	github.com/Zalaras/muster/internal/store	5.361s
ok  	github.com/Zalaras/muster/internal/termbridge	7.974s
ok  	github.com/Zalaras/muster/internal/tmux	17.472s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.685s
ok  	github.com/Zalaras/muster/internal/triage	7.292s
ok  	github.com/Zalaras/muster/internal/usage	7.782s
ok  	github.com/Zalaras/muster/internal/webui	7.803s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/triage	7.658s
ok  	github.com/Zalaras/muster/tools/versions	17.669s

$ make lint
golangci-lint run
0 issues.
```

**Note on the previously-flagged `unused` findings**: the `Fix Attempt` above did not touch `loadPrefs`/`buildIssueSnapshot`; `make lint` (tests included) reports 0 issues, consistent with those two delegators having real callers only in `_test.go` files, as already documented under Decisions.

**No test files touched.** Only `internal/server/server.go` and this log changed.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: Review issue 3 `[daemon-impl]` — `internal/server/issue.go:366` cited `render/issue.ts`, which review-work's Major 2 established had moved to `web/src/features/issue.ts`; separately tagged because web-impl may not edit Go files.

**Blast radius sweep** (Go source only, excludes bundled `internal/webui/assets/*.js.map` which legitimately embed old source-map paths from the build):
```
$ rg -n --type go 'render/(launch|settings|issue)\.ts|main\.ts' internal cmd
internal/server/issue.go:366:// dashboard's render/issue.ts implements the identical rule for the live preview, and
```
Exactly one hit — the one the review named. No other Go comment cites a moved web path or a stale `main.ts` ownership claim.

**Changes made**: `internal/server/issue.go:366` — `noteSection`'s doc comment now reads "the dashboard's features/issue.ts implements the identical rule for the live preview" (was `render/issue.ts`), matching the file's actual location after this plan's REQ-2 move. Verified the target exists and the old path does not: `web/src/features/issue.ts` present, `web/src/render/issue.ts` absent.

**Gate evidence**:
```
$ go build ./...
(exits 0)

$ make lint
golangci-lint run
0 issues.

$ golangci-lint run --tests=false ./...
internal/server/issue.go:541:18: func (*Server).buildIssueSnapshot is unused (unused)
internal/server/prefs.go:160:18: func (*Server).loadPrefs is unused (unused)
2 issues:
* unused: 2
```
Both `--tests=false` findings are the pre-existing, by-design test-facing delegators documented under Decisions above (Fix Attempt 1) — unchanged by this comment-only fix, real callers exist only in `_test.go` files. `make lint` (tests included) reports 0 issues.
```
$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	27.364s
ok  	github.com/Zalaras/muster/internal/claudecode	24.170s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	4.292s
ok  	github.com/Zalaras/muster/internal/gitutil	2.535s
ok  	github.com/Zalaras/muster/internal/locate	3.613s
ok  	github.com/Zalaras/muster/internal/selfupdate	2.139s
ok  	github.com/Zalaras/muster/internal/server	31.857s
ok  	github.com/Zalaras/muster/internal/session	7.209s
ok  	github.com/Zalaras/muster/internal/store	7.391s
ok  	github.com/Zalaras/muster/internal/termbridge	7.330s
ok  	github.com/Zalaras/muster/internal/tmux	19.018s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.674s
ok  	github.com/Zalaras/muster/internal/triage	7.571s
ok  	github.com/Zalaras/muster/internal/usage	8.196s
ok  	github.com/Zalaras/muster/internal/webui	7.581s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/triage	8.110s
ok  	github.com/Zalaras/muster/tools/versions	17.037s
```

**No test files touched.** Only `internal/server/issue.go` and this log changed.

# Daemon Implementation: Maintainability Cleanup — Unit D6 (server composition root and wire homes)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: not run for this unit — briefed directly by the team lead with the exact finding
IDs (Major 9/seed V5, Minor 5, Minor 6, Minor 1's V8 half) from
`review.maintainability.b-server.md`, read in full, plus `daemon-implementation-D4.md` and
`daemon-implementation-D5.md` for the transport/terminal-lifecycle helpers those units
already landed (`respond.go`'s `writeJSON`/`sessionOr404`/`msgInternalError`,
`terminal.go`'s `attachAndPump`), both reused unchanged.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/server.go` | modified | `New` no longer writes into another feature's fields after `register`: `sessions.reader`, `ingest.queue.{manager,files,usage}`, `prefs.updateChecker` are now constructor arguments. `defaultIngestQueueSize`, the `claudeBin`/scroller defaults and the `sessionLauncher{...}` literal moved out to their owning constructors. `httpClient` is resolved once (mirrors the existing `spawner`/`attach` pattern) and passed to usage/issue/update. `Server` struct drops `browseRoot`, `shell`, `browse`, `repos` (write-only, never read — Minor 5). `features`'s doc comment states registration order is what governs Start/Stop (REQ-11), independent of construction order. `ClaudeCodeInfo` moved in from `ws.go` (Minor 6 — it's a `Config` type). OnUpsert/OnRemoved now call `sessionwire.go`'s `sessionUpsertWire`/`sessionRemovedWire`. |
| `internal/server/sessionwire.go` | modified | Added `sessionUpsertWire`/`sessionRemovedWire` — the wire-mapping half of `New`'s two session-manager callbacks, moved here (Major 9: "wire mapping lives in a `*wire.go` file"). |
| `internal/server/sessions.go` | modified | Added `newSessionLauncher(store, manager, tmux, LaunchConfig, log)`, defaulting `claudeBin` internally (was `New`'s job). `newSessionsFeature` takes `reader writeLogForgetter` as a constructor argument instead of a post-construction write; `sessionsFeature`'s doc comment updated. |
| `internal/server/shells.go` | modified | `newShellFeature` takes both `scroll` (the override) and `realScroll` (the daemon's one real tmux client) and defaults internally, instead of `New` resolving `scroller` before calling it. |
| `internal/server/browse.go` | modified | `browseFeature.root`/`newBrowseFeature` take a plain `string`, not `*string` — the pointer existed only so `browse_test.go` could mutate `Server.browseRoot` post-construction (Minor 5); `Server.browseRoot` field is gone. |
| `internal/server/ingest.go` | modified | `newIngestQueue`/`newIngestFeature` take `manager *session.Manager`, `files filesObserver`, `usage *usage.Aggregator` as constructor arguments; `newIngestQueue` defaults `size` internally. `defaultIngestQueueSize` moved here from `server.go`. |
| `internal/server/prefs.go` | modified | `PrefsInfo` type moved in from `state.go` (Minor 6). `newPrefsFeature` takes `updateChecker checkEnabledSetter` as a constructor argument. Removed `Server.loadPrefs` (Minor 5 — deadcode-only, test-facing). Rewrote `checkEnabledSetter`'s doc comment: there is no construction-order cycle (see Decisions). |
| `internal/server/update.go` | modified | `newUpdateFeature` takes `store *store.Store` instead of a precomputed `prefsUpdateCheck bool`, and reads `loadPrefs(ctx, store).UpdateCheck` itself (Major 9 — "loadPrefs store I/O leaves construction"). Its own `http.DefaultClient` nil-check removed (New now hands it an always-non-nil client). Added `defaultUpdateInfo()` (Minor 6). |
| `internal/server/usage.go` | modified | `newUsageFeature`'s own `http.DefaultClient` nil-check removed (same reason). |
| `internal/server/issue.go` | modified | `newIssueFeature`'s own `http.DefaultClient` nil-check removed. Removed `Server.buildIssueSnapshot` (Minor 5 — deadcode-only, test-facing). |
| `internal/server/usagewire.go` | modified | `UsageBucket`, `UsageModelWindow`, `UsageInfo` moved in from `state.go`; added `emptyUsageInfo()`, `buildSnapshot`'s new placeholder builder (Minor 6). |
| `internal/server/themepoll.go` | modified | `ClaudeThemeInfo` moved in from `state.go`; added `defaultClaudeThemeInfo()` (Minor 6). |
| `internal/server/state.go` | modified | Trimmed to `Snapshot`, `buildSnapshot`, `currentSnapshot`, `handleState` — every moved-out type's default now comes from a function call, not an inlined literal (Minor 6: "buildSnapshot owns only the core fields"). |
| `internal/server/ws.go` | modified | `ClaudeCodeInfo` moved out to `server.go`. |
| `internal/server/CLAUDE.md` | modified | Corrected the "never on `*Server`" invariant to name its four core-route exceptions (`/healthz`, `GET /auth`, `GET /api/state`, `GET /ws`) and why (Minor 1's V8 half — chose "fix the sentence" over wrapping them in a feature, see Decisions). |

## Decisions

Every REQ this unit owns (Major 9/V5, Minor 5, Minor 6, Minor 1's V8 half) is covered
above; nothing deliberately skipped except `ingestQueue.Drain`, called out below.

- **The two "construction-order cycles" the code claimed were not real cycles** — this is
  the load-bearing finding of this unit, so stated plainly: `sessionsFeature` doesn't need
  anything from `readerFeature` except a narrow `writeLogForgetter`, and `readerFeature`
  has no dependency on `sessionsFeature` at all (`newReaderFeature(manager, hub, log)` —
  `internal/server/reader.go:123`) — reader is simply built first now and handed straight
  into `newSessionsFeature`. Likewise `updateFeature` never needed a `*prefsFeature`, only
  the persisted `updateCheck` bool, which it can read itself via `loadPrefs` given the
  `*store.Store` it already takes for other things; `prefsFeature` needs `updateFeature`
  (as `checkEnabledSetter`) but that's a one-directional dependency, so update is built
  first and passed straight into `newPrefsFeature`. Both "cycles" were artifacts of
  registration order being conflated with construction order, not real cycles — no
  late-binding seam was needed for either.
- **One real ordering constraint, resolved by decoupling construction from registration.**
  `ingestFeature`'s constructor now takes `usage.Aggregator` (so `usageFeature` must be
  *constructed* first), but REQ-11 requires ingest's `Start`/`Stop` to run before usage's
  poller (registration order). `register(s, f)` only appends to `s.features`, so
  construction and registration are separable: `usageFeat := newUsageFeature(...)` is
  built as a plain local first, then `s.ingest = register(s, newIngestFeature(...,
  usageFeat.aggregator, ...))`, then `s.usage = register(s, usageFeat)` — registered
  ingest-then-usage, satisfying REQ-11, even though usage was *constructed* first. This is
  the "smallest late-binding seam" the brief asked for when a genuine ordering constraint
  exists: separating `register`'s call site from the constructor call, not a
  post-construction field write.
- **`httpClient` defaulted once in `New`, matching the existing `spawner`/`attach`
  pattern.** `usage.go:69-72`, `issue.go:505-508` and `update.go:549-552` each re-ran
  `if client == nil { client = http.DefaultClient }` before this change (confirmed: `git
  show HEAD:internal/server/usage.go internal/server/issue.go internal/server/update.go |
  grep -n 'http.DefaultClient'` → 3 hits, one per file). The team lead's brief named this
  explicitly ("the http client default once per daemon") alongside queue
  size/claudeBin/attach/scroller, so it's in this unit's scope even though it overlaps the
  edge of Minor 3/V6 (D7's unit, "`update.go` duplicates within itself" — the `remedy`/
  `install` duplication and `newUpdateManager`'s own independent nil-check are untouched,
  left for D7). `newUpdateManager` keeps its own default: `update_test.go:223` calls it
  directly (`grep -n 'newUpdateManager(' internal/server/*.go` → only that test call site
  and `update.go`'s own use), so it's a genuine test seam, not New-path duplication.
- design: `newSessionLauncher` — no existing constructor for `sessionLauncher`; `rg -n
  'sessionLauncher{' internal/server/*.go` (non-test) before this change showed exactly
  one, the literal `New` built. 16 test call sites build the struct literal directly
  (`grep -rln 'sessionLauncher{' internal/server/*_test.go` → `plainshell_test.go`,
  `sessions_test.go` ×15) and are untouched — same-package white-box construction is the
  sanctioned "reach the feature directly" pattern (Minor 5's own fix text), not something
  this constructor needs to unify.
- design: `newShellFeature(..., scroll, realScroll shellScroller, ...)` — two named
  `shellScroller` params rather than resolving the fallback in `New` (as before) or a
  bespoke options struct; matches the shape `newSessionLauncher`/`ingestQueue`'s size
  default already use elsewhere in this unit (resolve-with-fallback inside the one
  consumer's constructor). No test calls `newShellFeature` directly (`grep -rn
  'newShellFeature\(' internal/server/*_test.go` → none), so the added parameter is free.
- design: `sessionUpsertWire`/`sessionRemovedWire` in `sessionwire.go` — the file already
  declares `sessionUpsertMessage`/`sessionRemovedMessage` and `toWireSession`; these two
  functions are the missing mapping step between a `*session.Session`/`id` and the
  broadcast envelope. `New`'s `OnUpsert`/`OnRemoved` closures keep the one line of actual
  glue (`s.hub.broadcast(...)`), which is wiring, not mapping.
- design: `emptyUsageInfo()`/`defaultClaudeThemeInfo()`/`defaultUpdateInfo()` — one
  function per feature, colocated with that feature's wire type, called from
  `buildSnapshot`. `emptyUsageInfo`'s two literals (`"subscription"`,
  `"subscription-api"`) are unchanged values, just relocated: they still can't reference
  `internal/usage`'s own `defaultSource`/`defaultModelScopedSource` consts because those
  are unexported (`grep -n 'defaultSource\|defaultModelScopedSource'
  internal/usage/*.go` → both `const`, no exported alias) — noted in `emptyUsageInfo`'s
  doc comment as a known duplication, not solved here (solving it would mean exporting a
  usage-package constant or constructing a throwaway `usage.Aggregator{}` just to read one
  field, neither of which this unit's scope (internal/server only) covers cleanly).
- **Minor 1's V8 half — corrected the sentence, did not wrap the core routes in a
  feature.** `handleWS`'s `currentSnapshot` loops `s.features` (every registered
  `snapshotContributor`), which only the composition root can do without every feature
  taking a `[]feature` back-reference to itself — that would recreate exactly the
  coupling Major 9 removes elsewhere in this unit. `handleHealthz`/`handleAuth` predate
  any feature existing at all. `internal/server/CLAUDE.md`'s invariant now names these
  four routes as the stated exception, rather than the code being bent to satisfy an
  invariant that was already contradicted by four working handlers. This is the "fix the
  sentence" option the team lead's brief offered.
- Not fixed: `ingestQueue.Drain`'s "Test-only" comment (Minor 5's fourth item, `ingest.go`).
  Its five call sites (`ingest_test.go` ×2, `ingest_routing_test.go` ×2, `reader_test.go`
  ×3) are all in `package server` (white-box test files), so `Drain` could move entirely
  into a test file — but that means *adding* a new method definition inside a test file,
  which is content beyond the "fix an import" exception this role's test-file constraint
  allows. Left in `ingest.go`, called out for daemon-tests below.

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l internal/server/
(no output)

$ go build ./...
(exit 0)

$ golangci-lint run --tests=false ./internal/server/...
0 issues.

$ go vet $(go list ./... | grep -v '^github.com/Zalaras/muster/internal/server$')
(no output — every other package in the tree is unaffected)
```

`go vet ./internal/server/...`, full `golangci-lint run ./internal/server/...` and `go test
-race -count=1 ./internal/server/...` do **not** run: the package's test binary doesn't
compile (sanctioned breakage below). `go test -gcflags="all=-e" -c -o /dev/null
./internal/server/` (bypasses the 10-error cap) shows exactly these 6 test files affected,
nothing else:

```
internal/server/browse_test.go:144:6: srv.browseRoot undefined
internal/server/ingest_test.go:237,251,270,284: not enough arguments in call to newIngestQueue
internal/server/issue_test.go:645,741,767,787,800,825,925: srv.buildIssueSnapshot undefined
internal/server/prefs_rail_test.go / prefs_test.go (~34 sites total): srv(2).loadPrefs undefined
internal/server/sessions_test.go:848,917: not enough arguments in call to newSessionsFeature
```

**Test files needing changes** (all mechanical — signature/call-site only, no assertion or
fixture changes):

1. `internal/server/sessions_test.go:848,917` — `newSessionsFeature(manager, launcher,
   shells, terminals, zerolog.New(&logBuf))` → add `nil` (the new `reader` parameter)
   before the logger: `newSessionsFeature(manager, launcher, shells, terminals, nil,
   zerolog.New(&logBuf))`. Neither test exercises Remove's write-log drop, so `nil` is the
   same valid no-op it already relied on implicitly.

2. `internal/server/ingest_test.go:237,251,270,284` — `newIngestQueue(nil, logger, 1)` /
   `newIngestQueue(nil, zerolog.Nop(), 4)` → append `, nil, nil, nil` for the new
   `manager, files, usage` parameters (all four calls already exercise only raw
   persistence, per their surrounding test names).

3. `internal/server/issue_test.go` (8 call sites: 645, 741, 767, 787, 800, 825, 925) —
   `srv.buildIssueSnapshot(...)` → `srv.issue.buildIssueSnapshot(...)` (the feature
   itself still has this method unchanged; only the `*Server` delegator was removed).

4. `internal/server/prefs_test.go` (24 call sites) and `internal/server/prefs_rail_test.go`
   (8 call sites) — every `X.loadPrefs(ctx)` (`X` is `srv` or `srv2`) → `loadPrefs(ctx,
   X.store)`. The free function `loadPrefs(ctx context.Context, st *store.Store)
   PrefsInfo` is unchanged and still exported to the package; only the `*Server` method
   delegator was removed. Mechanical, e.g.:
   `sed -E 's/(srv2?)\.loadPrefs\(([^)]*)\)/loadPrefs(\2, \1.store)/' -i ''
   internal/server/prefs_test.go internal/server/prefs_rail_test.go`
   (verify with a diff after — `srv2` is a second `*Server`/`*testServer` some tests build
   for a two-daemon-instances scenario, and both embed `store` the same way).

5. `internal/server/browse_test.go:138-146` (`newBrowseRootTestServer`) — `srv.browseRoot
   = root` no longer compiles (`Server.browseRoot` is gone; `browseFeature.root` is a
   plain, construction-time `string`). Rewrite the helper to pass the root through
   `Config.Launch.BrowseRoot` instead of mutating post-construction, e.g.:
   ```go
   func newBrowseRootTestServer(t *testing.T) (*testServer, string) {
       t.Helper()
       root := t.TempDir()
       dbPath := filepath.Join(t.TempDir(), "muster.db")
       st, err := store.Open(context.Background(), dbPath)
       require.NoError(t, err)
       t.Cleanup(func() { _ = st.Close() })
       logBuf := &syncBuffer{}
       srv := New(Config{
           Store: st, Logger: zerolog.New(logBuf), UIToken: testUIToken,
           IngestToken: testIngestToken, WebDist: t.TempDir(), DaemonVersion: "test-version",
           Launch: LaunchConfig{BrowseRoot: root},
       })
       return &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st}, root
   }
   ```
   (mirrors `helpers_test.go`'s `newTestServer` exactly, plus `Launch.BrowseRoot`). Its
   two callers (`TestHandleBrowse_NoPathDefaultsToConfiguredBrowseRoot`,
   `TestHandleBrowse_ConfiguredBrowseRootIsTheUpCeilingButExplicitPathsElsewhereStillWork`)
   need no change themselves.

6. Not a compile break, but flagged for daemon-tests to consider: `ingestQueue.Drain`
   (`ingest.go:100-116`, doc-commented "Test-only") could move entirely into a test
   helper file now that this unit has audited every call site
   (`ingest_test.go`, `ingest_routing_test.go`, `reader_test.go` — all `package server`
   white-box tests, so `q.ch`/`q.wg` are directly reachable without it). Left in
   production code because implementing that move is itself a test-file content change,
   outside this role's remit.

**doc-delta**: none. No feature spec or `docs/protocol.md` sentence describes `New`'s
internals, `Server`'s field list, or `internal/server/CLAUDE.md`'s hand-written
invariants at a level this changes — the CLAUDE.md correction is in the Changes table
above, not a `docs/features/*/spec.md` claim.

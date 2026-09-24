# Daemon Implementation: Maintainability Cleanup — Unit D7a (server file splits)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: not run for this unit — briefed directly by the team lead with the exact finding
IDs (`review.maintainability.b-server.md` Minor 2, Minor 3, Minor 4; `review.maintainability.c-adapters.md`
Major 3) read in full, plus `daemon-implementation-D4.md`/`D5.md`/`D6.md` for the
transport/terminal-lifecycle/composition-root work those units already landed and reused
unchanged here (`respond.go`'s `writeJSON`/`writeJSONError`/`msgInternalError`, D6's
`New`-level `httpClient` default and `sessionUpsertWire`/`sessionRemovedWire`).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/launcherrors.go` | created | **Pure move**, verbatim: `launchError`, `Error()`, `invalidRequest`/`launchFailed`/`notFound`/`notResumable`/`directoryMissing`/`modelUnrecognized`, and the `msgEndFailed`/`msgRemoveFailed`/`msgLaunchFailed`/`msgShellSpawnFailed` consts — sessions.go's "launch error vocabulary" (Minor 2). |
| `internal/server/launcher.go` | created | The launch/resume service. Mostly **pure move** (`paneSpawner`, `LaunchConfig`, `createSessionRequest`, `sessionLauncher`, `newSessionLauncher`, `validateLaunchRequest`, `buildLaunchEnv`, `maxLaunchAttempts`, `launchTmuxTimeout`, `rollback`, `writeSettings`) plus two **dedups** (Minor 2/V7): added `spawnSession` (the `context.WithTimeout` + `tmux.NewSession` + `cancel` block, spawned twice — Launch's attempt loop and Resume — now called from both) and `killWindowAfterRecordFailure` (the `context.WithTimeout` + `tmux.KillWindow` + `cancel` + error-log block after a failed `RecordLaunch`/`RecordResume`, also spawned twice). `spawnAndRecordLaunch` and `Resume` are modified to call these instead of repeating the blocks inline; their control flow and every log line/message are otherwise unchanged. |
| `internal/server/sessions.go` | rewritten | Trimmed to the HTTP feature only: `sessionsFeature`, `writeLogForgetter`, `newSessionsFeature`, `mount`, and every `handle*` method, `parseSessionID`, the request/response types and their consts — all **pure move**, byte-identical bodies. 831 → 319 lines; the file's own funlen/filelen warning (814 lines, "no reason holds" per review) is gone. |
| `internal/server/update.go` | modified | Minor 3 + Major 3. Added `buildUpdateInfo`/`remedyPointer` (the `UpdateInfo{...}` + Remedy-pointer construction `updateManager.Current` and `updateFeature.current` each wrote by hand); both now call it — one builder for the enabled and disabled `update` object. `RequestApply`'s `m.install.Kind != selfupdate.KindInstaller` → `!m.install.MayApply()`. `runApply`'s `Tag: "v" + version` → `Tag: selfupdate.ReleaseTag(version)`. `checkAvailability`'s hand-rolled `LatestTag` → `ParseRelease(tag)` → `ParseRelease(m.running)` → `Compare` sequence → one call to `selfupdate.CheckNewer`. `newUpdateManager`'s own `http.DefaultClient` nil-check is left as-is — D6 already established it's a genuine test seam (`update_test.go:223` constructs the manager directly), not New-path duplication. |
| `internal/server/issue.go` | modified | Minor 4. `newIssueFeature` builds the token reader and `*ghissue.Client` only when `cfg.APIURL != ""` (mirrors `usageFeature`'s nil-when-disabled poller) — `client` stays nil when disabled, safe because every handler already 404s on `f.apiURL == ""` first. Added `errCaptureUnusable` sentinel and `fileIssue` (reserve → post → consume/release, extracted verbatim from `handleCreateIssue`'s body); `handleCreateIssue` now decodes/validates, delegates to `fileIssue`, and encodes the result — the reserve/release/consume lifecycle no longer lives in the handler. `captureStore.put`'s inline evict-oldest loop → `evictOldest(...)`. |
| `internal/server/evict.go` | created | `evictOldest[K comparable, V any](m map[K]V, limit int, at func(V) time.Time)` — the "insert then evict-oldest-by-time past a cap" loop `captureStore.put` (issue.go) and `writeLog.record` (reader.go) each wrote out by hand (Minor 4's "the eviction loop exists once"). |
| `internal/server/reader.go` | modified | `writeLog.record`'s inline evict-oldest loop → `evictOldest(...)`. |
| `internal/selfupdate/release.go` | modified | Added `ReleaseTag(version string) string` (`"v" + version`, the tag⇄version mapping `cmd/musterd/update.go` and `internal/server/update.go` each rebuilt) and `CheckNewer(ctx, client, base, running) (latest Version, newer bool, err error)` (the "resolve latest tag, parse, compare to running" sequence both callers ran by hand — Major 3). |
| `internal/selfupdate/install.go` | modified | Added `Install.MayApply() bool` (`Kind == KindInstaller`) — kb:adr/update-install-kinds-decide-who-may-apply's rule, previously spelled once as an allow-list (server) and once as a deny-list (cmd). |
| `cmd/musterd/update.go` | modified | `runUpdate` now calls `selfupdate.CheckNewer`, `install.MayApply()` and `selfupdate.ReleaseTag(latest.String())` instead of its own `LatestTag`/`ParseRelease`/`Compare`/kind-enumeration/tag-building. |
| `docs/features/launch/spec.md` | modified | `go:` glob gains `internal/server/launcher*.go` so the new files are owned by the launch feature (`make check-kb` otherwise reports them ownerless). |
| `docs/features/issue/spec.md` | modified | `go:` glob gains `internal/server/evict*.go`. |
| `docs/features/launch/INDEX.md`, `docs/features/issue/INDEX.md`, `.claude/rules/issue.md` | regenerated | `make gen-kb` after the glob edits above. |

## Decisions

Every finding this unit owns (b-Minor 2, b-Minor 3, b-Minor 4, c-Major 3) is covered above;
nothing deliberately skipped.

- **Pure-move inventory** (for commit splitting): `launcherrors.go` is 100% pure move.
  `launcher.go` is pure move except `spawnSession`/`killWindowAfterRecordFailure` (new) and
  the two call sites that now use them (`spawnAndRecordLaunch`, `Resume` — modified in
  place, same log lines/messages, same control flow). `sessions.go` is 100% pure move
  (trimmed, not rewritten). `issue.go`'s `fileIssue` is a verbatim extraction of
  `handleCreateIssue`'s former reserve/post/consume body into its own method (same
  statements, same order, only the surrounding shape — parameters/return values instead of
  closure-captured locals — differs); `captureStore.put`/`writeLog.record`'s calls into
  `evictOldest` replace hand-written loops with identical semantics. `update.go`'s
  `buildUpdateInfo` consolidates two near-identical hand-written `UpdateInfo{...}`
  literals; `checkAvailability`'s call to `selfupdate.CheckNewer` replaces its own
  `LatestTag`/`ParseRelease`×2/`Compare` sequence. Everything in `internal/selfupdate` and
  `cmd/musterd/update.go` is new/substituted code, not moved.
- **`selfupdate.CheckNewer` unifies behaviour that was already dead-path-identical.**
  `updateManager.checkAvailability` is only ever reached when `Install.Kind != KindDev`
  (construction requires it for the tick path — `cfg.CheckEnabled && cfg.Install.Kind !=
  selfupdate.KindDev` — and `handleCheckUpdate`'s manual path 404s first on
  `installKind() == KindDev`). `selfupdate.Classify` only returns a non-`KindDev` kind when
  the running version string already parsed via `ParseRelease` (`install.go:51`: `if _, ok
  := ParseRelease(version); !ok { return Install{Kind: KindDev, ...} }`). So by the time
  `checkAvailability` runs, `m.running` is structurally guaranteed to parse — the
  `running`-doesn't-parse branch `CheckNewer` shares between the two callers is reachable
  in production only for `cmd/musterd`'s pre-`Install.Kind`-known belt-and-braces case, not
  for server. One behavioural side effect: the debug-log text on a bad-tag failure changes
  from two distinct lines (`"update check failed"` for a network failure vs `"update
  check: latest tag is not a release version"` for a bad tag) to one generic `"update
  check failed"` line for both, since the distinction is no longer visible outside
  `CheckNewer`. This is an internal daemon-log-only change — `internal/server/update_check_test.go`
  asserts only the HTTP status and error `code`, never this text (`grep -n "latest tag is
  not a release version\|update check failed" internal/server/*_test.go` → one hit,
  `update_check_test.go:96`'s `t.Run("latest tag is not a release version is 502
  check_failed", ...)` subtest *name*, not an assertion on log output or the response
  body), and `docs/protocol.md`'s `check_failed` contract says only "the message names the
  reason", not a pinned string. No wire-visible or tested behaviour changed.
- **`newUpdateManager`'s own `http.DefaultClient` nil-check is left untouched.** D6's log
  already traced this: `update_test.go:223` calls `newUpdateManager` directly (`grep -n
  'newUpdateManager(' internal/server/*.go` → the constructor's own use plus that one test
  call site), so it is a genuine test seam, not production-path duplication with `New`'s
  single default. Confirmed unchanged by this unit.
- **`issue.go`/`update.go` still exceed the 500-line filelen threshold (688/738 lines) —
  kept, not split further.** This unit's scope (Minor 2/3/4, Major 3) did not ask for a
  multi-file split of either feature beyond the sessions.go split Minor 2 named
  explicitly; `update.go`'s size was already flagged as "no reason holds" by the review,
  but resolving it would mean choosing a wire/worker/feature split analogous to D7's
  sessions.go work without a finding directing where the seams go, which risks
  conflicting with whatever a later unit (or this same review's other findings) decides.
  Left for the team lead to scope explicitly if wanted. `sessions.go`'s own filelen warning
  (814 lines) is resolved: split into three files, all under 500 lines
  (`wc -l internal/server/{sessions,launcher,launcherrors,evict}.go` → 319/474/65/23).
- design: `evict.go`'s `evictOldest[K comparable, V any]` — generics are already an
  accepted idiom in this package (`rg -n '^func .*\[' internal/server/*.go` →
  `server.go:89`'s `register[F feature]` is the existing precedent); no non-generic helper
  already covers this (`rg -n 'evict|oldest' internal/server/*.go` before this change
  matched only the two hand-written loops this unit removes). Named `limit`, not `max` —
  golangci-lint's `revive` flagged the builtin shadow (`redefines-builtin-id`) on first
  pass, fixed and re-verified clean.
- design: `issueFeature.fileIssue` returns `(number int, htmlURL, scope string, err
  error)` rather than a struct, matching `sessionLauncher.Launch`/`Resume`'s existing
  multi-value-return shape in the same package rather than introducing a new result type
  for a three-value return.
- design: `selfupdate.CheckNewer`/`ReleaseTag`/`Install.MayApply` — no existing selfupdate
  function already answered "is there a newer release" or "may this install apply"
  (`rg -n 'func ' internal/selfupdate/*.go` before this change had `LatestTag`,
  `ParseRelease`, `Version.Compare`, `Install.Kind` but nothing composing them); placed in
  `release.go`/`install.go` beside the primitives they compose, matching
  `selfupdate/CLAUDE.md`'s "owns … semver comparison" and "release knowledge" boundary
  (kb:adr/update-release-knowledge-in-selfupdate-package).
- doc-delta: none. No feature spec or `docs/protocol.md` sentence describes `sessions.go`'s
  internal file layout, `update.go`'s internal builder shape, or `issue.go`'s internal
  capture lifecycle at a level this changes — every wire shape, status code and message
  text is unchanged (the one non-wire log-text change is called out above).

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l internal/server internal/selfupdate cmd/musterd
(no output)

$ go build ./...
(exit 0)

$ go vet ./...
(no output)

$ make lint
golangci-lint run
0 issues.

$ golangci-lint run --tests=false ./...
0 issues.

$ go test -race -count=1 ./internal/server/... ./internal/selfupdate/... ./cmd/...
ok  	github.com/Zalaras/muster/internal/server	101.296s
ok  	github.com/Zalaras/muster/internal/selfupdate	1.851s
ok  	github.com/Zalaras/muster/cmd/musterd	56.504s

$ make check-kb
go run ./tools/kb check
kb: 425 records, 23 features, 0 problem(s)
kb: all checks pass
```

One transient failure during the run, re-verified clean and not caused by this unit:
`cmd/musterd`'s `TestReexec_PassesArgvAndEnvVerbatim` failed once with `go build musterd:
… internal/webui/webui.go:20:12: pattern all:assets: cannot embed directory assets:
contains no embeddable files` — a concurrent web-impl agent was rebuilding `web/`'s dist
output in this shared worktree at that moment. Re-run in isolation
(`go test -run TestReexec_PassesArgvAndEnvVerbatim ./cmd/musterd/...`) passed immediately,
and the full `./cmd/...` run pasted above is green.

No test files needed changes for this unit (no constructor signature or exported-symbol
touched by D7a's changes) — `newSessionsFeature`, `newIssueFeature`, `newUpdateFeature`,
`newUpdateManager` all kept their existing signatures; `Server.buildIssueSnapshot` was
already removed by D6, and this unit's `issueFeature.buildIssueSnapshot` (the feature
method, not the removed `*Server` delegator) is untouched.

**doc-delta**: none (see Decisions).

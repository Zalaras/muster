# Daemon Implementation: Maintainability Cleanup — Unit D7b (server shared rules)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: not run for this unit — briefed directly by the team lead with the exact finding
IDs (`review.maintainability.b-server.md` Major 4/6, Minor 7/8/12/14; `review.maintainability.c-adapters.md`
Minor 11) read in full, plus D7a's log (`daemon-implementation-D7a.md`) for the file-split
precedent and what it already did to `sessions.go`/`issue.go`/`update.go`.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/issuesnapshot.go` | created | **Pure move**: `issueSnapshot` and its sub-types, `buildIssueSnapshot`, `issueFooter`, `renderSnapshotMarkdown`, `row`/`escapeCell`, the `*Cell` helpers, `noteSection`/`composeIssueBody` — issue.go's snapshot-assembly and markdown-rendering concerns (Minor 4's file-split half). |
| `internal/server/issuecapture.go` | created | **Pure move**: `maxCaptures`/`captureTTL`, `issueCapture`, `captureStore` and its methods, `randomCaptureID` — issue.go's capture-store concern. |
| `internal/server/issue.go` | rewritten | Trimmed to `IssueConfig`, the request/response wire types, `issueFeature`/`newIssueFeature`/`mount`, and the two handlers (`handleCreateCapture`, `fileIssue`, `handleCreateIssue`) — all **pure move**. 688 → 266 lines. |
| `internal/server/updatewire.go` | created | **Pure move**: `updateMessage`, `UpdateApplyInfo`, `UpdateInfo`, `defaultUpdateInfo`, `buildUpdateInfo`, `remedyPointer` — update.go's wire-only concern (Minor 3's file-split half). |
| `internal/server/updatemanager.go` | created | Mostly **pure move**: the sentinel errors, `updateExecFunc`, `updateManagerConfig`, `updateManager` and every one of its methods (`newUpdateManager`, `Start`/`Stop`/`tick`/`checkAvailability`/`checkSwap`/`SetCheckEnabled`/`Refresh`/`installKind`/`Remedy`/`RequestApply`/`runApply`/`setApplyPhase`/`finishApplyFailed`/`Current`/`emit`). **Not pure**: `Start`/`Stop` bodies now call the new `bgLoop`/`runTicked` helpers (Major 4, see below) instead of hand-rolling `context.WithCancel`+`wg`+the bounded-wait tail; every other method is byte-identical. |
| `internal/server/update.go` | rewritten | Trimmed to `UpdateConfig`, `updateFeature`/`newUpdateFeature`/`mount`/`Start`/`Stop`/`SetCheckEnabled`/`current`/`contribute`/`restartRequestsChan`, and the three handlers. 738 → ~245 lines before the Minor 8/14 edits below. |
| `internal/server/bgloop.go` | created | New package-private `bgLoop` (Start/cancel/bounded-wait-with-warn) and `runTicked` (tick/ticker/refresh loop) — Major 4/G3: the shape `usagePoller`, `themePoller`, `shellActivityPoller` and `updateManager` each hand-wrote. |
| `internal/boundedwait/boundedwait.go` | created | New leaf package holding just `Wait(ctx, wg, log, msg)` — the bounded-wait-with-warn tail that `internal/server`'s `bgLoop.stop` and `internal/session.Manager.Stop` and `internal/server.ingestQueue.Stop` all now call (Major 4: "Manager and ingest reuse the bounded wait"). Imports nothing internal. |
| `internal/server/usagepoll.go` | modified | `usagePoller` drops its own `cancel`/`wg` fields for `bg bgLoop`; `Start`/`Stop`/`loop` collapse to two one-line calls into `bgLoop.start`/`bgLoop.stop`/`runTicked`. `tick` untouched. |
| `internal/server/themepoll.go` | modified | Same shape for `themePoller` (no refresh channel — `runTicked` called with `nil`). |
| `internal/server/shellactivity.go` | modified | Same shape for `shellActivityPoller` (no refresh channel). |
| `internal/server/update.go` (Minor 8/14) | modified | `updateFeature` drops `tmuxLister tmuxSessionLister` (and the `tmuxSessionLister` interface is gone — Minor 8: "drop the seam if it loses its last caller", confirmed the only caller). `handleRestartImpact` now delegates to a new `restartImpactShells(ctx, sessions *session.Manager)` (Minor 14: one call returns the wire-ready `[]restartImpactShell`), which asks `session.Manager.ShellNames` instead of a tmux-lister seam of its own (Minor 8). |
| `internal/server/server.go` | modified | Removed `Server.tmuxLister` field and its `New`-time assignment; `newUpdateFeature` now takes `s.manager` directly instead of `s.tmuxLister`. |
| `internal/session/actions.go` | modified | `shellNamesOnSocket` → exported `ShellNames` (rename only; its two in-package callers, `KillAllShells`/`ShellCount`, updated) — Minor 8's "one owner lists shell sessions". |
| `internal/session/session.go` | modified | Added `PermissionModes` (the four `PermissionMode` constants as a slice) and `ValidPermissionMode(s string) bool` — Major 6's one owner. |
| `internal/server/launcher.go` | modified | `validateLaunchRequest`'s hand-spelled `switch req.PermissionMode { case "default", "plan", "acceptEdits", "auto": }` → `session.ValidPermissionMode(req.PermissionMode)`. Same error message, same check order. |
| `internal/claudecode/launch.go` | modified (comment only) | `LaunchParams`'s doc comment now names `session.PermissionModes` as the one owner and explains why `BuildArgv`'s own literal switch cannot become a pass-through of it (see Decisions — Minor 11). No code change; `BuildArgv`'s body is untouched. |
| `internal/server/ingest.go` | modified | `process`'s `if ev.Type == "status_line"` → `if job.kind == claudecode.KindStatus` (Minor 7): the typed value already in hand, instead of comparing against the string `claudecode.Kind.ingest.go` mints. Also switched `ingestQueue.Stop` to `boundedwait.Wait` (see above). |
| `internal/server/reader.go` | modified | Minor 12: `walkMarkdown`'s dead `if walkErr != nil && !errors.Is(walkErr, errWalkCap) { _ = walkErr }` branch is gone; `filepath.WalkDir`'s return value is now discarded at the call (`_ = filepath.WalkDir(...)`) with the "why" comment moved to sit on that discard instead of inside a body that never ran. |
| `internal/server/browse.go` | modified | Minor 14: `handleBrowse`'s directory walk/dot-filter/git-probe/sort/parent-computation body extracted into a new package-level `browseDirectory(ctx, root, path) (browseResponse, error)`; the handler now only decodes the query param, delegates, and maps the returned sentinel (`errBrowsePathNotAbsolute`/`errBrowseDirNotFound`/`errBrowseDirNotReadable`, or the wrapped home-dir failure) to a status/code/message and encodes. Same three wire messages, same status codes. |
| `internal/session/liveness.go` | modified | `Manager.Stop`'s hand-rolled bounded-wait tail → `boundedwait.Wait(ctx, &m.wg, m.log, ...)`. `m.cancel`/`m.wg` fields and `m.stopped.Store(true)` ordering untouched. |
| `docs/features/lifecycle/spec.md` | modified | `go:` glob gains `internal/boundedwait/**` (new package, otherwise ownerless). |
| `docs/features/connection/spec.md` | modified | `go:` glob gains `internal/server/bgloop*.go` (new file, otherwise ownerless — see design: line below for why `connection` rather than one of the four poller features). |
| `docs/features/lifecycle/INDEX.md`, `docs/features/connection/INDEX.md`, `.claude/rules/lifecycle.md`, `.claude/rules/connection.md` | regenerated | `make gen-kb` after the two glob edits above. |

## Decisions

Every finding this unit owns is covered above (Major 4, Major 6, Minor 7, Minor 8, Minor
12, the browse+restart-impact half of Minor 14, and c-adapters Minor 11's server half),
plus the file splits (issue.go, update.go). Nothing deliberately skipped.

- **Major 4 shared package: `internal/boundedwait`, not a new poller-owned type.**
  `internal/session` must never import `internal/server`
  (kb:diagram/daemon-components), so the piece Manager/ingest/the four pollers all
  reuse (the bounded-wait-with-warn tail) cannot live in `internal/server`. A new leaf
  package was the only option that keeps the diagram's "leaf adapters import nothing
  internal" property (`internal/store`, `internal/tmux`, `internal/tty`,
  `internal/claudecode` are its existing examples) rather than adding a new
  session→server or server→session edge. `internal/server`'s own `bgLoop`/`runTicked`
  (the *rest* of the four-pollers' Start/cancel/tick-ticker-refresh shape) stay local to
  `internal/server`, because Major 4's text scopes cross-package reuse to "the bounded
  wait" specifically ("Manager and ingest reuse the bounded wait") — Manager's own
  Start/loop shape (no refresh channel, a different tick signature) was left as-is
  rather than folded into `bgLoop` too, since nothing asked for that and it would have
  meant reshaping `Manager`'s own `cancel`/`wg` fields for a unit scoped to
  `internal/server`. Per Note 7 of `review.maintainability.b-server.md` ("If a new
  package appears, the diagram's owner is review-work's DIAG row"), I did not edit
  `docs/diagrams/daemon-components.md` myself — flagging the new `internal/boundedwait`
  leaf package here for that review pass.
- **`internal/lifecycle` was the first name tried, renamed to `internal/boundedwait`.**
  `go build ./...` failed: `internal/server/server.go:77:6: lifecycle already declared
  through import of package lifecycle ("github.com/Zalaras/muster/internal/lifecycle")
  internal/server/bgloop.go:10:2: other declaration of lifecycle` — `internal/server`
  already has its own `lifecycle` interface (feature Start/Stop). Renamed rather than
  import-aliased, since the collision showed the word is already claimed in this
  codebase for a different concept.
- **c-adapters Minor 11 (claudecode's half) cannot be closed the way the finding
  describes, and I did not bend the wire to force it.** The finding wants "argv building
  consult[s]" the one owner. `internal/claudecode` cannot import `internal/session`:
  `rg -n '"github.com/Zalaras/muster/internal' internal/session/*.go | grep -v _test`
  shows `internal/session` already imports `internal/claudecode` (`apply.go`,
  `machine.go`, `status.go`, for `StateInput`), so the reverse import would cycle — a
  compile error, not a style preference — and claudecode must stay a leaf adapter
  regardless (kb:diagram/daemon-components). Separately, `BuildArgv`'s drop-unknown
  behaviour is pinned byte-for-byte by a test I may not edit:
  `internal/claudecode/launch_test.go:54-58`, `"an unrecognized permission mode adds no
  flag (validation is the caller's job)"`, asserting `PermissionMode: "bogus"` produces
  no `--permission-mode` flag at all — and the team lead's brief says "same argv" is a
  hard constraint for this unit. Making `BuildArgv` a blind pass-through of a non-empty
  string (the only way to stop it re-spelling the four literals) would have broken that
  frozen assertion. What I did instead: `session.PermissionModes`/`ValidPermissionMode`
  are the one real owner — `internal/server` now validates against it and no longer
  re-spells the four literals (Major 6, closed). `claudecode/launch.go`'s doc comment on
  `LaunchParams` now says explicitly that `BuildArgv`'s own switch is a second,
  by-hand-kept-in-sync copy of that owner's set, and why it can't be anything else. This
  is reported prominently rather than silently accepted: the daemon still has two
  textual owners of the permission-mode set (down from three), not one, and closing the
  gap fully would need either a plan change (a shared leaf type both packages import,
  with `internal/session` re-pointing its own constants at it) or dropping the frozen
  test — both out of scope for an implementation unit to decide unilaterally.
- **Minor 7's behavioural footnote:** `job.kind == claudecode.KindStatus` and `ev.Type ==
  "status_line"` are equivalent for every real post (`internal/claudecode/ingest.go:83`:
  `ParseIngestBody` sets `eventType = "status_line"` if and only if `kind == KindStatus`),
  with one edge case closed rather than preserved: previously, a raw *hook* post
  (`kind == KindHook`) whose own `hook_event_name` field happened to literally be the
  string `"status_line"` would have been misrouted into `processStatus` by the old
  string check. Claude Code never emits that as a real `hook_event_name`
  (`docs/history/spikes/canary-fields.md`'s measured set), so this is not a reachable
  production behaviour change, and it removes rather than adds a coupling to a
  claudecode-minted string.
- **Minor 8's `ShellNames` is a rename, not a new method** — `rg -n
  "shellNamesOnSocket" internal/session` before the change showed exactly three call
  sites (its own declaration plus `KillAllShells`/`ShellCount`), all updated together;
  its `unread`-adjacent doc comment gains one sentence naming the new caller.
- **Minor 14 scope, confirmed with the team lead's brief:** only `browse.go` and
  `update.go`'s restart-impact handler are touched. The reader's own domain (`reader.go`'s
  `writeLog`/`readerPathQualifies`/`confine`/`listMarkdown`/`walkMarkdown`) is explicitly
  out of scope for this unit ("the reader-package extraction is NOT in scope") and is
  untouched beyond Minor 12's dead-branch removal.
- design: `bgLoop`/`runTicked` (`internal/server/bgloop.go`) — `rg -n 'func .*Start\(\)'
  internal/server/*.go` before this change showed four independent copies
  (`usagepoll.go`, `themepoll.go`, `shellactivity.go`, `update.go`), each cited by the
  review as "the pattern copied from" its neighbour; no existing helper composed them.
  Kept as two small unexported pieces (a struct for the cancel/wg half, a free function
  for the loop-body half) rather than one type, because `updateManager.Start` needs an
  extra dev-install guard *before* starting and `Stop` needs the `shuttingDown` flag set
  *before* stopping — those stay as plain code in the caller, which a single do-it-all
  type would have had to grow a hook or callback to support.
- design: `internal/boundedwait.Wait` — a free function, not a type, since the three
  callers (`bgLoop.stop`, `session.Manager.Stop`, `ingestQueue.Stop`) each already own a
  `sync.WaitGroup` field and a `zerolog.Logger`; a wrapping type would only add an
  allocation with no state of its own to hold. `rg -n 'wg.Wait\(\)' internal --type go |
  grep -v _test.go` (paste in `review.maintainability.b-server.md` G3) is the "nothing
  already does this" evidence — six identical hand-written copies, zero existing helpers.
- design: `restartImpactShells` (`internal/server/update.go`) — a free function taking
  `*session.Manager` rather than a method on `updateFeature`, matching
  `browseDirectory`'s shape (also a free function the handler delegates to) rather than
  adding a receiver that would only ever be called with `f.sessions`.
- design: `browseDirectory`'s error shape — three sentinel `var`s
  (`errBrowsePathNotAbsolute`/`errBrowseDirNotFound`/`errBrowseDirNotReadable`) checked
  with `errors.Is` in the handler, matching `locateFeature.handleLocateFile`'s existing
  sibling shape (`locate.go`'s `errNoFilePart`/`errBadFilename` checked the same way)
  rather than reusing `launcher.go`'s `*launchError{status,code,message}` struct, whose
  name and shape are launch/resume-specific (`grep -n "type launchError" internal/server`
  → one declaration, in `launcherrors.go`, documented there as launch/resume's own
  vocabulary). The one non-sentinel case (home-directory resolution) stays a wrapped
  generic `error` since it is `browseDirectory`'s only 500 and needs no code/status
  branch of its own.
- doc-delta: none. Every wire status code, error code and message text is unchanged
  (browse's three messages, restart-impact's shape, launch/resume's `permissionMode`
  validation error text, `POST /ingest/{token}/status` routing). No feature spec or
  `docs/protocol.md` sentence describes `issue.go`/`update.go`'s internal file layout,
  the pollers' internal Start/Stop implementation, or `session.Manager`'s internal
  method name (`ShellNames` was already unexported and undocumented in any spec).

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l internal/server internal/session internal/claudecode internal/boundedwait
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

$ go test -race -count=1 ./internal/server/... ./internal/session/... ./internal/claudecode/... ./internal/boundedwait/...
ok  	github.com/Zalaras/muster/internal/server	102.855s
ok  	github.com/Zalaras/muster/internal/session	31.952s
ok  	github.com/Zalaras/muster/internal/claudecode	9.506s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
?   	github.com/Zalaras/muster/internal/boundedwait	[no test files]

$ make check-kb
go run ./tools/kb check
kb: 425 records, 23 features, 0 problem(s)
kb: all checks pass

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 915 references checked, 0 missing
```

No test files needed changes for this unit — no constructor signature, exported symbol,
or test-visible field this unit touched has a test call site: `newUpdateFeature` lost a
parameter (`tmuxLister`) but `rg -n "newUpdateFeature(" internal/server/*_test.go` finds
no direct test call (it's always reached through `New(Config{...})`);
`session.Manager.ShellNames` is a rename of a previously-unexported method with no test
caller; `browseDirectory`/`restartImpactShells` are new, not replacements of anything a
test called directly.

`make size-warn` was run; every warning it reports on a file this unit touched
(`internal/server/issuesnapshot.go:113` `buildIssueSnapshot` funlen "too long (76 > 60)",
`internal/server/launcher.go:190` `Launch` funlen, `internal/server/server.go:131` `New`
funlen) is a pre-existing warning on code whose *body* this unit did not change —
`buildIssueSnapshot` is a byte-identical pure move from `issue.go` (D7a's log already
attributed this function's size to "a flat allowlist copy" reason that holds, per
`review.maintainability.b-server.md` Note 1); `Launch`'s and `New`'s size predate this
unit and belong to other units' scope (Note 1 and Major 9 respectively, neither assigned
to D7b). No warning was introduced by code this unit wrote or moved with a changed body.

**doc-delta**: none (see Decisions).

## Concurrent-tree note

This worktree is shared with other in-flight agents. `git status` at the time of writing
shows unstaged changes to `web/**`, `.claude/rules/rail.md`, `.claude/rules/usage.md`,
`docs/features/rail/{spec,INDEX}.md`, `docs/features/usage/{spec,INDEX}.md`,
`internal/claudecode/claudecodetest/claudecodetest.go`,
`internal/claudecode/status_test.go`, `internal/server/gauges_test.go`, and
`plans/maintainability-cleanup/findings.md` that are **not this unit's work** — they
belong to concurrent web/D7a/D8/tests agents. Two of those files
(`docs/features/rail/INDEX.md`, `docs/features/usage/INDEX.md` and their `.claude/rules/`
counterparts) were touched by my own `make gen-kb` run as a side effect: `rail/spec.md`
and `usage/spec.md` already carried uncommitted `web:` glob edits from a concurrent web
agent when I ran it, and `gen-kb` regenerates every stale generated file tree-wide, not
just the ones this unit's own spec edits touched. I did not hand-edit either `rail` or
`usage` spec — only `connection` and `lifecycle`. Per the plan's rules I have not run
`git add`/`git commit`; the team lead should confirm these regenerated files ride
whichever commit picks up the concurrent web agent's `rail`/`usage` glob edits (or
re-run `make gen-kb` once more work lands, since it's idempotent).

## Follow-up: Major 6 / c-Minor 11 ownership reversed (team lead correction, pre-commit)

The team lead correctly identified that my first pass had the ownership backwards: the
permission-mode values are Claude Code CLI flag values, so CLAUDE.md's hard rule puts
them in `internal/claudecode`, not `internal/session`. Reversed:

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/launch.go` | modified | Added the one real owner: `PermissionDefault`/`PermissionPlan`/`PermissionAcceptEdits`/`PermissionAuto` string constants, `PermissionModes` (their slice) and `ValidPermissionMode(s string) bool`. `BuildArgv`'s hand-rolled `switch p.PermissionMode { case "default", "plan", "acceptEdits", "auto": ... }` → `if ValidPermissionMode(p.PermissionMode) { ... }` — it now consults the owner directly instead of re-spelling the four literals. The drop-unknown behaviour `launch_test.go:54-58` pins is unchanged: `ValidPermissionMode("bogus")` is `false`, so the flag is still omitted for an unrecognized mode, exactly as before. |
| `internal/session/session.go` | modified | Added `"github.com/Zalaras/muster/internal/claudecode"` import (session already imports it elsewhere — `apply.go`/`machine.go`/`status.go` — so this is not a new edge in kb:diagram/daemon-components, just a new file in the same package using it). `PermissionDefault`/`PermissionPlan`/`PermissionAcceptEdits`/`PermissionAuto` now derive from `claudecode`'s constants via `PermissionMode(claudecode.PermissionDefault)` etc. (a constant type-conversion is itself a constant expression, so these stay real `const`s, not `var`s — verified by `go build`/`go vet` passing with no "not a constant" error). `ValidPermissionMode` now delegates: `return claudecode.ValidPermissionMode(s)` instead of walking its own copy of `PermissionModes`. `PermissionModes` (the `[]PermissionMode` slice) stays — nothing asked for its removal, and `internal/server` still validates through it for the reason below. |
| `internal/server/launcher.go` | unchanged | Still calls `session.ValidPermissionMode(req.PermissionMode)` (this unit's earlier pass already put the call here). Session is the natural caller-side owner for this one call site: `validateLaunchRequest` sits three lines above `spawnAndRecordLaunch`'s own `session.PermissionMode(req.PermissionMode)` conversion in the same file, so the surrounding code already treats permission mode as session's typed value; routing the validation call through `session.ValidPermissionMode` (which now delegates to claudecode) needed no new import here. |

**Evidence the set now has one real declaration.** `rg -n '"acceptEdits"' --type go -g
'!*_test.go'` → exactly one production hit, `internal/claudecode/launch.go:14`
(`PermissionAcceptEdits = "acceptEdits"`); the only other hit tree-wide is a claudecodetest
fixture literal (`claudecodetest.go:249`, unrelated — a hook payload's own
`permission_suggestions.mode` field, not a validated set member). Previously (before this
follow-up) the same grep found two production hits, one per package.

**Gates re-run after the reversal** (same set as the initial pass):

```
$ gofmt -l internal/server internal/session internal/claudecode internal/boundedwait
(no output)

$ go vet ./...
(no output)

$ go build ./...
(exit 0)

$ make lint
golangci-lint run
0 issues.

$ golangci-lint run --tests=false ./...
0 issues.

$ go test -race -count=1 ./internal/server/... ./internal/session/... ./internal/claudecode/... ./internal/boundedwait/...
ok  	github.com/Zalaras/muster/internal/server	104.324s
ok  	github.com/Zalaras/muster/internal/session	32.689s
ok  	github.com/Zalaras/muster/internal/claudecode	10.056s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
?   	github.com/Zalaras/muster/internal/boundedwait	[no test files]

$ go test ./internal/claudecode/... -run TestBuildArgv -v
--- PASS: TestBuildArgv (0.00s)
    --- PASS: TestBuildArgv/an_unrecognized_permission_mode_adds_no_flag_(validation_is_the_caller's_job) (0.00s)
    (all 10 TestBuildArgv subtests and all 8 TestBuildArgv_PermissionModeAlwaysExplicit subtests PASS)

$ make check-kb
go run ./tools/kb check
kb: 425 records, 23 features, 0 problem(s)
kb: all checks pass

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 909 references checked, 0 missing
```

No test files touched; no new files created for this follow-up (only edits to the two
existing files above). `docs/features/*/spec.md` globs are unaffected — no new file, no
moved file. Still not committed.

# Daemon Implementation: Maintainability Cleanup — Unit D4 (server transport helpers)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: not run for this unit — briefed directly by the team lead with the exact finding
IDs (b-M8/V1, b-m1, b-m13) and the cited line ranges from `review.maintainability.b-server.md`,
read in full.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/respond.go` | created | The transport home: `errorResponse` envelope (with optional `paths`), `msgInternalError`, `writeJSON`, `writeJSONError`/`writeJSONErrorPaths`, `sessionOr404`/`sessionGetter`, `writeDirectoryMissing`, `wireTime`/`wireTimePtr` (b-M8/V1, b-m1, b-m13) |
| `internal/server/auth.go` | modified | Moved `errorResponse`/`writeJSONError` out to respond.go; `handleHealthz` uses `writeJSON` |
| `internal/server/state.go` | modified | `handleState` uses `writeJSON`; dropped now-unused `encoding/json` |
| `internal/server/browse.go` | modified | Added `log zerolog.Logger` field/param; its one 500 now logs and uses `msgInternalError`; success encode uses `writeJSON` |
| `internal/server/locate.go` | modified | Added `log` field/param; `handleLocateFile`'s id lookup uses `sessionOr404`; both `internal_error` sites now log and use `msgInternalError`; success encode uses `writeJSON`; `writeLocateAmbiguous` now calls the shared `writeJSONErrorPaths` instead of re-declaring the envelope |
| `internal/server/prefs.go` | modified | Added `log` field/param; the two 500s (`json.Marshal`, `KVSet`) now log and use `msgInternalError` |
| `internal/server/repos.go` | modified | 500 uses `msgInternalError`; success encode uses `writeJSON`; wire time uses `wireTime` |
| `internal/server/reader.go` | modified | Both id-or-404 sites use `sessionOr404`; the directory-missing site uses `writeDirectoryMissing`; success encode uses `writeJSON`; `writtenAtWire` uses `wireTime` |
| `internal/server/shells.go` | modified | `handleCreateShell`'s id-or-404 uses `sessionOr404`; its directory-missing uses `writeDirectoryMissing`; success encode uses `writeJSON` |
| `internal/server/sessions.go` | modified | Removed local `msgInternalError` (moved to respond.go); its two ad-hoc 500 phrases ("pinning session", "setting rail order") now use `msgInternalError`; four success encodes use `writeJSON`; `paneSnapshotWire`'s time uses `wireTime` |
| `internal/server/issue.go` | modified | Two success encodes use `writeJSON`; all 6 wire-time sites in `buildIssueSnapshot` use `wireTime`/`wireTimePtr` |
| `internal/server/update.go` | modified | Two success encodes use `writeJSON`; `checkAvailability`'s `at` uses `wireTime`; its ad-hoc 500 phrase ("starting update apply failed") uses `msgInternalError` |
| `internal/server/sessionwire.go` | modified | 4 wire-time sites use `wireTime`/`wireTimePtr`; dropped now-unused `time` import |
| `internal/server/usagewire.go` | modified | 5 wire-time sites use `wireTime`/`wireTimePtr`; dropped now-unused `time` import |
| `internal/server/ingest.go` | modified | `newIngestFeature`'s logger moved to the last parameter (was 2nd of 4) |
| `internal/server/server.go` | modified | Updated the four call sites (`newLocateFeature`, `newBrowseFeature`, `newPrefsFeature`, `newIngestFeature`) for the added logger params / reordered ingest params |

## Decisions

- Every REQ this unit owns (b-M8/V1, b-m1, b-m13) is covered above; nothing deliberately skipped.
- design: `writeJSON(w, status, v)` is the one success-JSON writer replacing the 16
  hand-rolled `Header/WriteHeader/Encode` triples (V1's list). `rg -n "json.NewEncoder(w)"
  internal/server` before this change showed exactly those 16 non-test sites plus the two
  error-envelope writers (auth.go's `writeJSONError`, locate.go's `writeLocateAmbiguous`);
  after, only `respond.go`'s own `writeJSON` and `wireTime` (its `.Format` call) remain.
- design: `errorResponse` keeps its two required fields (`code`, `message`) and adds one
  `Paths []string \`json:"paths,omitempty"\`` rather than a second struct — matches the
  finding's ask verbatim ("optional extra field so locate's paths needs no second
  struct"). `omitempty` keeps the wire shape byte-identical for every caller that never
  sets it (confirmed no test asserts raw JSON bytes for a non-ambiguous error; all query
  `resp.Error.Code`/`.Message`, `grep -rn "Error.Message\|internal_error" *_test.go`).
- design: `sessionOr404` takes a narrow `sessionGetter` interface (`Get(id int64)
  (*session.Session, bool)`), not `*session.Manager` directly, because `readerFeature`
  holds the narrower `readerManager` interface (reader.go:105) rather than the concrete
  manager — Go's interface-to-interface assignability (readerManager's method set is a
  superset) makes one helper serve locate/shells' concrete `*session.Manager` and reader's
  interface alike. No existing helper did this: `rg -n "func.*Get\(id int64\)" internal/server`
  before this change had no shared lookup, each site rolled its own.
- design: `writeDirectoryMissing(w, dir)` unifies the two byte-identical
  `"%s no longer exists"` sites (reader.go, shells.go) only. sessions.go's Resume path
  (`directoryMissing`, a `*launchError` constructor with a different, fixed message
  "session directory no longer exists") is a different pattern (builds an error value
  returned up the call stack, not a direct `ResponseWriter` write) and answers the same
  code with different text — per plan D4 scope ("if two sites use different message text
  for the same code today, keep each site's text") it is left as-is, not merged.
- design: `wireTime(t time.Time) string` / `wireTimePtr(t *time.Time) *string` replace all
  19 sites Minor 13 names (issue.go ×6, usagewire.go ×5, sessionwire.go ×4, one each in
  repos.go, reader.go, update.go, sessions.go) — recounted before and after:
  `grep -n "UTC().Format(time.RFC3339)" *.go | grep -v _test.go` returned exactly those 19
  lines before this change and zero after (only `respond.go`'s own definition remains).
- design: `msgInternalError` moved from sessions.go to respond.go, since after this change
  eight features across seven files share it (sessions, shells, browse, locate, prefs
  ×2, repos, update), not just the launch/resume vocabulary it used to sit beside.
  sessions.go's other four fixed phrases (`msgEndFailed`, `msgRemoveFailed`,
  `msgLaunchFailed`, `msgShellSpawnFailed`) stay put — each has exactly one call site, all
  in sessions.go/shells.go's launch domain.
- Six ad-hoc 5xx phrases named in Minor 1 ("pinning session", "setting rail order",
  "encoding prefs", "locating file" ×2, "could not list repos", "starting update apply
  failed") are replaced with `msgInternalError`. Checked against `docs/protocol.md`
  before changing: none of these routes' error sections pin an exact 500 message text —
  `sessions.pin`/`sessions.order`/`prefs.put` don't document a 500 case at all, `repos.list`
  has no Errors section, `sessions.locate`'s 500 only says "the walk failed..." with no
  exact string, and `update.apply`'s Errors list stops at 409 (no 500 documented). Left
  untouched: `browse.go`'s "could not determine home directory" text is now
  `msgInternalError` too (same category, same absence of a pinned message) but was not one
  of the six named — included because V2/Minor 1 both cite `browse.go:53` by name as the
  same-category silent-500 bug this fix must close. `issue.go:569`'s "generating capture
  id" was left as its own ad-hoc phrase: not named in Minor 1's six, `issue.go` is D7's
  scope, and G4/Note 3 already treats that whole random-hex-id family as dead code on the
  pinned Go version (`crypto/rand.Read` never errors) — not mine to touch.
- `newIngestFeature`'s logger moved to last position (was `(st, log, size, token)`, now
  `(st, size, token, log)`) — the only constructor Minor 1 names as out of order.
  `newIngestQueue(st, log, size)` (also logger-not-last) was left alone: Minor 1's finding
  text names only `newIngestFeature`, and `rg -n "newIngestQueue\(" internal/server`
  shows 4 test call sites (`ingest_test.go`) that a signature reorder would break for no
  finding-cited reason.
- Verified no test breakage from any signature change I made: `grep -rn
  "newLocateFeature(\|newBrowseFeature(\|newPrefsFeature(\|newIngestFeature("
  internal/server/*_test.go` returned nothing — none of these constructors are called
  directly by any test.

## Handoff

**Build status**: `go build ./...` exits 0 (verified after the concurrent `internal/session`
unit's edits landed — see below).

**Note on a concurrent-unit compile wobble (not mine, already resolved):** partway through
this unit, `go build ./...` failed with `internal/session/reconcile.go` errors and later
`internal/server/server.go:169: unknown field SessionKiller in struct literal of type
session.Config` — this was the D3 daemon agent's in-progress rename of
`session.Config.SessionKiller` → `TmuxSessions` (`internal/session`, `internal/store`,
`internal/tmux` are explicitly their scope per the team lead's brief). It resolved itself
once D3's edit to `server.go`'s Manager-wiring block (lines 164-177, outside anything I
touched) landed. Re-verified clean: `go build ./...` exits 0.

**Outstanding test-file breakage — not mine, cannot fix, blocks `go test`/`go vet`/full
`golangci-lint` for this package right now:**
`internal/server/sessions_test.go:789,856,1147` and a stale comment in
`internal/server/fakes_test.go:271,606` still reference `session.Config.SessionKiller`,
which D3's rename removed in favour of `TmuxSessions`. This is a test file I did not touch
and am not permitted to fix (not an import-path fix from my own refactor — the field
belongs to a struct D3 renamed). Confirmed the only affected identifier:
```
$ grep -n "SessionKiller" internal/server/fakes_test.go internal/server/sessions_test.go
fakes_test.go:271: // comment only
sessions_test.go:606: // comment only
sessions_test.go:789,856,1147: session.Config{..., SessionKiller: ...}
```
Whoever runs D3's own test pass (or the daemon-tests agent) needs to update these three
call sites to `TmuxSessions:`. Because of this, right now:
- `go vet ./internal/server/...` fails at typecheck on those three lines (not gofmt/vet
  issues in my diff — same three lines, same error, in all three).
- `go test -race -count=1 ./internal/server/...` fails to build for the same reason.
- `golangci-lint run ./internal/server/...` fails at typecheck for the same reason.

**Evidence my own diff is clean despite that:** `golangci-lint run --tests=false
./internal/server/...` (production code only, sidesteps the broken test files) is clean
except two pre-existing findings I did not introduce and am not scoped to fix (Minor 5,
`b-m5`, someone else's unit): `issue.go:535` `(*Server).buildIssueSnapshot` unused,
`prefs.go:195` `(*Server).loadPrefs` unused — both already documented in
`review.maintainability.b-server.md` Minor 5 as test-only production surface, both present
before this unit's changes (I did not touch either function's signature or callers).

```
$ gofmt -l internal/server/
(no output)

$ go build ./...
(exit 0)

$ golangci-lint run --tests=false ./internal/server/...
internal/server/issue.go:535:18: func (*Server).buildIssueSnapshot is unused (unused)
internal/server/prefs.go:195:18: func (*Server).loadPrefs is unused (unused)
2 issues:
* unused: 2
```

**Test files needing changes I was not allowed to make:** `internal/server/sessions_test.go`
(3 call sites) and `internal/server/fakes_test.go` (comment only, cosmetic) —
`SessionKiller` → `TmuxSessions`, caused by the concurrent D3 unit's rename, not by
anything in this unit's diff.

Once that rename lands in the test files, re-run: `go vet ./internal/server/...`,
`go test -race -count=1 ./internal/server/...`, `golangci-lint run ./internal/server/...`,
`make size-warn` (already run — only pre-existing warnings, all documented in
`review.maintainability.b-server.md`'s Files table and Note 1; nothing new from this
unit's respond.go, which is 90 lines).

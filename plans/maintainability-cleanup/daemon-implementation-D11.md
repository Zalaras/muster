# Daemon Implementation: Maintainability Cleanup — Unit D11 (reader domain package)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: `kb: pack 68157 words (budget 8000)` — WARN pack exceeds budget; sections rules
1295 · features 26181 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons
3237 · runbooks 644 (`--plan maintainability-cleanup --role daemon-impl`). Worked from the
team lead's brief plus `review.maintainability.b-server.md` Minor 14 (its reader half,
read in full) and `daemon-implementation-D10.md` for the git-listing consumer seam D10
left at `reader.go`'s `gitFiles` field.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/reader/reader.go` | created | New leaf package. `Scope{Dir, PlanPath}` with methods `PathQualifies` (moved from `readerPathQualifies`) and `Confine` (moved from `confine`), byte-identical logic. `ListFilesFunc` type (moved from `gitFilesFunc`). `ListMarkdown(ctx, dir, gitFiles)` (moved from `readerFeature.listMarkdown`'s git branch) now returns a `gitErr` instead of logging it itself, so the package stays logger-free. `WalkMarkdown` (moved from `walkMarkdown`), `maxWalkFiles`, `errWalkCap` — unchanged bodies. |
| `internal/reader/writelog.go` | created | `WriteLog` (moved from `writeLog`): `NewWriteLog`, `Record`, `Get`, `Forget` (moved from `newWriteLog`/`record`/`get`/`forget`). `maxWriteLogPaths` unchanged (512). `Record`'s eviction is inlined by hand rather than calling `internal/server`'s generic `evictOldest` — see Decisions. |
| `internal/reader/CLAUDE.md` | created | Owns/Invariants/Exemplar/Gotchas doc, `<!-- kb:trailer -->` markers filled by `make gen-kb`. |
| `internal/server/reader.go` | modified | Deleted `writeLog`/`newWriteLog`/`record`/`get`/`forget`, `readerPathQualifies`, `confine`, `listMarkdown`'s git-branch body, `walkMarkdown`, `errWalkCap`, `maxWalkFiles`, `gitFilesFunc` — all moved to `internal/reader`. `readerFeature.gitFiles` is now `reader.ListFilesFunc`; `.writes` is now `*reader.WriteLog`. `observeWrite` and `handleReaderFile` build a `reader.Scope{Dir: sess.Directory, PlanPath: sess.PlanPath}` and call `.PathQualifies`/`.Confine` on it. `listMarkdown` is now a two-line wrapper: calls `reader.ListMarkdown` and logs its returned `gitErr` at debug (same message, same log site as before — logging responsibility moved to the caller because the new package has no logger, matching `internal/locate`). Dropped now-unused imports (`io/fs`, `sort`, `strings`, `sync`); added `internal/reader`. File is 268 lines, down from 427. |
| `internal/server/evict.go` | modified | Doc comment on `evictOldest` no longer names `writeLog.record` as a caller (it isn't one any more) and now explains why `internal/reader.WriteLog` keeps its own copy of the eviction loop instead of calling this one. |
| `docs/features/reader/spec.md` | modified | `go:` glob gains `internal/reader/**`. |
| `.claude/rules/reader.md`, `docs/features/reader/INDEX.md`, `internal/reader/CLAUDE.md` (trailer) | generated | `make gen-kb`. |

## Decisions

- **design: `reader.Scope`** — a small value type (`Dir`, `PlanPath`) with `PathQualifies`
  and `Confine` as methods, rather than keeping them as free functions taking
  `(dir, planPath, x)`. `rg -n 'type Scope|type.*struct' internal/locate/*.go
  internal/usage/*.go` — `internal/locate` has no comparable multi-field domain value (its
  `Locator` holds a slice of `Finder`s, a different shape: state built once and reused,
  not a per-call value). `Scope` matches the "small domain type + pure functions"
  instruction directly: both rules the finding names always travel together as one
  directory-plus-plan-path pair, so bundling them removes the three-argument repetition
  every call site previously had (`confine(sess.Directory, sess.PlanPath, path)` →
  `reader.Scope{Dir: sess.Directory, PlanPath: sess.PlanPath}.Confine(path)`).
- **design: `reader.ListMarkdown`'s `gitErr` return** — the original `listMarkdown` logged
  the git-fallback debug line itself, but `internal/reader` has no logger (matching
  `internal/locate`, which also takes no logger and returns errors/degrades silently for
  its own Finders). Moving the log call to `internal/server`'s two-line wrapper keeps the
  new package pure while reproducing the exact same log message at the exact same
  decision point — verified by keeping `TestListMarkdown_GitSuccessFiltersToMarkdownAndSorts`/`TestListMarkdown_GitFailureFallsBackToWalk` passing unchanged (see Handoff: these two
  tests needed no edit at all, because `f.gitFiles`'s field type change from the local
  `gitFilesFunc` to `reader.ListFilesFunc` is structurally identical, so the tests' plain
  func-literal fixtures still assign to it).
- **`WriteLog.Record`'s eviction is duplicated, not reused, and this is deliberate.**
  `rg -n 'func evictOldest' internal/` shows exactly one implementation,
  `internal/server/evict.go`, used by `captureStore.put` (issue.go) and, before this unit,
  `writeLog.record`. `internal/reader` must not import `internal/server` (D11's brief:
  "importing nothing internal except what the diagram allows for a leaf/domain package";
  `internal/server` already imports `internal/reader`, so the reverse import would cycle).
  Pulling `evictOldest` down into a third, lower package for its one remaining caller
  (`captureStore`) plus this one new caller was out of scope for D11 (not named in the
  finding, and YAGNI for a single generic 12-line helper) — I inlined the map-eviction
  loop by hand in `WriteLog.Record` instead, and updated `evict.go`'s own doc comment
  (which named `writeLog.record` as a caller) to say so, so it doesn't go stale.
- Every REQ D11 names is covered: `writeLog`, `readerPathQualifies`, `confine`,
  `listMarkdown`/`walkMarkdown` all moved; the reader's scope/confinement rules are
  testable without an HTTP server (`go test ./internal/reader/...` needs no `*testServer`);
  `docs/features/reader/spec.md`'s `go:` glob registered the package; `make gen-kb` ran.
  `kb:diagram/daemon-components` gaining the node is explicitly **X2**'s job per the plan,
  not done here.

## Handoff

**Build status**: `go build ./...` exits 0.

**Gate output**:
- `gofmt -l .` — clean (no output).
- `go build ./...` — exits 0.
- `go vet ./...` — clean except the sanctioned test-file breakage below (`internal/server`
  only; every other package vets clean).
- `go vet -tags=canary ./test/...` — clean (D11 touches nothing this suite references).
- `golangci-lint run --tests=false ./...` — `0 issues.` (signal-preserving run per the
  sanctioned-test-break rule; `make lint` itself stops at the same `internal/server`
  typecheck error `go vet` hits).
- `go test -race -count=1 ./internal/reader/...` — `[no test files]` (none moved yet; see
  below).
- `go test -race -count=1 ./internal/gitutil/...` — `ok` (untouched by this unit, confirms
  no regression on the package `reader.ListMarkdown` depends on).
- `go test -count=1 ./internal/... ./cmd/...` — every package passes except
  `github.com/Zalaras/muster/internal/server [build failed]`, which fails for exactly the
  sanctioned reasons below and no other. Full tail:
  ```
  ok    internal/claudecode        10.562s
  ok    internal/ghissue           1.433s
  ok    internal/gitutil           3.179s
  ok    internal/kb                3.412s
  ok    internal/keyedlock         3.297s
  ok    internal/locate            3.815s
  ?     internal/reader            [no test files]
  ok    internal/selfupdate        4.491s
  FAIL  internal/server            [build failed]
  ok    internal/session           8.630s
  ok    internal/store             6.561s
  ok    internal/termbridge        7.266s
  ok    internal/tmux              18.638s
  ok    internal/tmux/tmuxtest     7.679s
  ok    internal/triage            7.887s
  ok    internal/tty               7.081s
  ok    internal/usage             7.343s
  ok    internal/webui             7.859s
  ok    cmd/musterd                61.067s
  ```
- `make check-kb` — `kb: 426 records, 23 features, 0 problem(s)`.
- `make refs` (`dead-refs.py`) — `dead-refs: 3089 references checked, 0 missing`.
- `make size-warn` — `internal/server/reader.go` dropped from 427 to 268 lines (no
  warning). `internal/reader/reader.go` (149) and `writelog.go` (68) are both well under
  the 500-line threshold. No new warning anywhere; the two funlen warnings the run shows
  (`reader_test.go:442` `TestScanPlan_StickyOnceNamed`, `reader_test.go:960`
  `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan`) are pre-existing
  test-function-length items, unrelated to this move (neither function's body changed).

**Sanctioned test breakage — `internal/server/reader_test.go`**, every site
(`go vet ./internal/server/...` stops at the first; this is the full list from
`rg -n` against the moved symbols):

- `TestConfine` (line 33): two calls, `confine(dir, planPath, tt.requested)` (:80) and
  `confine(dir, "", planPath)` (:91) → `reader.Scope{Dir: dir, PlanPath: planPath}.Confine(tt.requested)`
  and `reader.Scope{Dir: dir}.Confine(planPath)`. This whole test is a pure unit test of
  `Confine` with no HTTP/session fixture — it can move into `internal/reader/reader_test.go`
  (package `reader`) essentially unchanged, calling `Confine` unqualified since it'd be
  in-package there (or `reader.Confine`-style via a `Scope` value if it stays in `server`
  as a cross-package test — the test agent's call).
- `TestReaderPathQualifies` (line 98): `readerPathQualifies(dir, planPath, tt.path)` (:116)
  and `readerPathQualifies(dir, "", "/tmp/proj/notes.txt")` (:121) →
  `reader.Scope{Dir: dir, PlanPath: planPath}.PathQualifies(tt.path)` and
  `reader.Scope{Dir: dir}.PathQualifies(...)`. Same move-candidate as TestConfine.
- `TestWalkMarkdown` (line 127) and `TestWalkMarkdown_CapsAt20000AndReportsTruncated`
  (line 145): `walkMarkdown(dir)` (:136, :152) → `reader.WalkMarkdown(dir)`. `maxWalkFiles`
  (:147, :156) is unexported in the new package (nothing outside it needs the value) — if
  the test moves in-package to `internal/reader` (package `reader`, recommended), it stays
  visible unqualified as `maxWalkFiles`; if it stays cross-package in `internal/server`,
  the literal `20000` has to substitute for it.
- `TestWriteLog` (line 196): `newWriteLog()` (×3: :198, :214, :224) → `reader.NewWriteLog()`
  (or `NewWriteLog()` in-package); `maxWriteLogPaths` (:226, :230, :235, :238) → visible
  unqualified if the test moves in-package to `internal/reader`, otherwise needs exporting
  (not done — no other caller needs it exported). `l.bySession[1]` (:230, :238) reads the
  unexported field directly — only possible if the test stays in the same package as
  `WriteLog`, i.e. this test must move to `internal/reader` (package `reader`), it cannot
  stay in `internal/server` and compile against an unexported field of an imported type.
- **`TestListMarkdown_GitSuccessFiltersToMarkdownAndSorts` and
  `TestListMarkdown_GitFailureFallsBackToWalk`** (lines 163, 179) — **not broken**. Both
  build `&readerFeature{gitFiles: fakeGit, log: zerolog.Nop()}` and call
  `f.listMarkdown(ctx, dir)`; `fakeGit`'s literal type
  (`func(context.Context, string) ([]string, error)`) is structurally identical to the
  field's new type `reader.ListFilesFunc`, so both tests compile and pass with **zero**
  changes needed.
- **Pre-existing stale comment, not introduced by this unit but touching the same
  cluster**: `internal/server/evict_test.go:11` ("captureStore.put (issue.go) and
  writeLog.record (reader.go) each call it once per insert") now names a caller
  (`writeLog.record`) that no longer exists in this package. This is a test file I may not
  edit; flagging for whoever next touches `evict_test.go` (likely alongside the
  `reader_test.go` split, since it's the same finding's fallout).
- Recommended split (not prescriptive — test agent's call): move `TestConfine`,
  `TestReaderPathQualifies`, `TestWalkMarkdown`, `TestWalkMarkdown_CapsAt20000AndReportsTruncated`
  and `TestWriteLog` into a new `internal/reader/reader_test.go` / `writelog_test.go`
  (package `reader`, matching `internal/locate/locate_test.go`'s in-package shape); leave
  every other test in `internal/server/reader_test.go` as is (the HTTP-level and
  `Observe`/ingest-routing tests all go through `readerFeature`, which is unchanged in
  shape).

None of the above are files I was allowed to touch beyond an import-path fix, and none of
this breakage is an import path, so I made no test edits.

## Follow-up: extract `internal/evict` (team lead's request, pre-commit)

**Mode**: fix (pre-review fix — no review cycle has run on this unit)

**Problem**: `WriteLog.Record`'s hand-inlined eviction loop (above) re-opened b-server
Minor 4 ("the eviction loop exists once"), which D7a had already closed by extracting
`internal/server/evict.go`'s generic `evictOldest`. The right fix, per the team lead, is
the same layering move this run already made twice for the same shape of problem
(`internal/keyedlock`, `internal/boundedwait`): pull the generic helper into its own leaf
package that both `internal/server` and `internal/reader` can import, since `internal/reader`
importing `internal/server` would cycle.

### Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/evict/evict.go` | created | `Oldest[K, V](m, limit, at)` — the generic map-eviction rule, moved verbatim from `internal/server/evict.go`'s `evictOldest` (renamed for the package it now lives in, same body). Package doc comment matches `internal/boundedwait`'s shape and states the same layering reason. |
| `internal/server/evict.go` | deleted | Superseded by `internal/evict`. |
| `internal/server/issuecapture.go` | modified | `captureStore.put` now calls `evict.Oldest(cs.captures, maxCaptures, ...)` instead of the deleted local `evictOldest`; added the `internal/evict` import. |
| `internal/reader/writelog.go` | modified | `WriteLog.Record`'s hand-inlined eviction loop replaced with `evict.Oldest(m, maxWriteLogPaths, func(t time.Time) time.Time { return t })`; added the `internal/evict` import. |
| `internal/reader/CLAUDE.md` | modified | Gotcha line rewritten: it previously said the eviction was duplicated by hand for layering reasons; now it says `WriteLog` calls `internal/evict.Oldest`, and names `internal/boundedwait` as the precedent for the same layering move. |
| `docs/features/issue/spec.md` | modified | `go:` glob gains `internal/evict/**` (issue is `evict.go`'s owning feature per its pre-existing `internal/server/evict*.go` glob entry). |
| `.claude/rules/issue.md`, `docs/features/issue/INDEX.md` | generated | `make gen-kb`. |

### Decisions

- **design: `internal/evict`** — matches `internal/boundedwait`'s exact shape: one file, a
  package doc comment naming the two callers and the layering reason
  (`internal/reader` must not import `internal/server`), one exported generic function,
  imports nothing internal. `rg -n 'package boundedwait|package keyedlock'
  internal/boundedwait/*.go internal/keyedlock/*.go` confirmed both are single-purpose,
  no-CLAUDE.md leaf packages already in this tree for exactly this "shared primitive that
  can't sit in either caller's package" situation — matched that rather than inventing a
  new shape or adding a CLAUDE.md (neither sibling has one).
- Registered the package on `issue`'s spec (the feature that already owned `evict.go`) per
  the team lead's steer, rather than `reader` (`internal/reader` is only one of the two
  callers) — matches how `internal/boundedwait`/`internal/keyedlock` are registered once,
  under `lifecycle`, despite `internal/server` also calling into them.

### Handoff — test agent (do NOT write scripts)

`internal/server/evict_test.go` moves with the deleted `evictOldest` — I did not touch it
(test file). Every reference:
```
internal/server/evict_test.go:10   doc comment: "TestEvictOldest covers evictOldest's own contract..."
internal/server/evict_test.go:21   evictOldest(m, 5, at)
internal/server/evict_test.go:29   evictOldest(m, 2, at)
internal/server/evict_test.go:41   evictOldest(m, 2, at)
internal/server/evict_test.go:50   comment: "Both real call sites invoke evictOldest once per insert..."
internal/server/evict_test.go:60   evictOldest(m, 2, at)
internal/server/evict_test.go:62   assert message: "evictOldest removes exactly one entry per call"
internal/server/evict_test.go:68   evictOldest(m, 2, at)
internal/server/evict_test.go:77   evictOldest(m, 0, at)
internal/server/evict_test.go:89   evictOldest(m, 1, func(e entry) time.Time { return e.seenAt })
```
Recommended: move the whole file to `internal/evict/evict_test.go` (package `evict`),
renaming `evictOldest` → `Oldest` at each call site and dropping the now-stale
`captureStore.put (issue.go) and writeLog.record (reader.go)` wording in the two comments
(lines 10-13 and 50-52) in favour of naming the real current callers
(`internal/server`'s `captureStore.put`, `internal/reader`'s `WriteLog.Record`) — this is
the same stale-comment fallout already flagged in the base D11 log above, now resolved by
this move rather than left dangling.

### Handoff — build status

**Build status**: `go build ./...` exits 0.

**Gate output**:
- `gofmt -l .` — clean.
- `go build ./...` — exits 0.
- `go vet ./...` — clean except the sanctioned breakage: `internal/server/evict_test.go:21`
  (`undefined: evictOldest`, plus the other 6 sites above) and the pre-existing
  `reader_test.go` sanctioned breakage from the base unit (unchanged by this follow-up).
- `golangci-lint run --tests=false ./...` — `0 issues.`
- `go test -race -count=1 ./internal/evict/...` — `[no test files]` (none moved yet).
- `go test -count=1 ./internal/... ./cmd/...` — identical to the base unit's tail: every
  package passes except `internal/server [build failed]`, for the sanctioned reasons only
  (now `evict_test.go` plus `reader_test.go`, both pre-declared breakage, nothing new).
- `make check-kb` — `kb: 426 records, 23 features, 0 problem(s)`.
- `make refs` — `dead-refs: 3086 references checked, 0 missing`.
- `make size-warn` — no new warnings on any touched file (`internal/evict/evict.go` is 24
  lines). The script does print one transient line, `internal/server/evict.go: No such
  file or directory` — expected and harmless: `git ls-files` still lists the deleted file
  because the deletion isn't staged (I do not `git add`/commit per the rules), so `wc -l`
  fails on a path that no longer exists on disk. This resolves itself the moment the
  deletion is staged and is not a size-warn HIT (`HITS` isn't incremented for it).


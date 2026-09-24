# Daemon Tests: Maintainability Cleanup — Unit D11 (test relocation only)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: `kb: pack 67323 words (budget 8000)` — WARN pack exceeds budget; sections rules
885 · features 26181 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons
2813 · runbooks 644 (`--plan maintainability-cleanup --role daemon-tests`).

## Summary

This is a pure relocation task per `daemon-implementation-D11.md`'s Handoff: `internal/reader`
(Scope.PathQualifies/Confine, ListMarkdown/WalkMarkdown, WriteLog) and `internal/evict`
(`Oldest[K,V]`) are new leaf packages the daemon-impl agent moved logic into; the tests that
covered that logic in `internal/server` needed to move with it. No new test logic was
written — every moved test's body, table, and assertions are unchanged; only package,
identifiers, and two stale comments changed.

Tests created: 0 new | Tests moved: 6 (verbatim) | Passing: all | Failing: 0

Test function count: **29 before, 29 after** (exact match — see table below).

| Location | Before | After |
|---|---|---|
| `internal/server/reader_test.go` | 28 | 23 |
| `internal/server/evict_test.go` | 1 | 0 (deleted) |
| `internal/reader/reader_test.go` | — | 4 |
| `internal/reader/writelog_test.go` | — | 1 |
| `internal/evict/evict_test.go` | — | 1 |
| **Total** | **29** | **29** |

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/reader/reader_test.go` | `TestConfine` | `Scope.Confine`'s D11/INV-2 confinement rules (traversal, symlinks, plan-path exception) | pass |
| `internal/reader/reader_test.go` | `TestReaderPathQualifies` | `Scope.PathQualifies`'s lexical change-signal scope test | pass |
| `internal/reader/reader_test.go` | `TestWalkMarkdown` | `WalkMarkdown`'s dot-dir skip, case-insensitive `.md`, sort | pass |
| `internal/reader/reader_test.go` | `TestWalkMarkdown_CapsAt20000AndReportsTruncated` | `WalkMarkdown`'s 20,000-file cap and `truncated:true` | pass |
| `internal/reader/writelog_test.go` | `TestWriteLog` (3 subtests) | `WriteLog.Record/Get/Forget` round-trip, per-session scoping, 512-entry eviction | pass |
| `internal/evict/evict_test.go` | `TestOldest` (7 subtests) | `Oldest[K,V]`'s eviction contract: below/at/over limit, ties, zero limit, generic key/value | pass |
| `internal/server/reader_test.go` | (unchanged, 23 functions) | HTTP-level reader routes, `Observe`/ingest wiring, plan-scan invariants, `listMarkdown`'s git-branch wrapper | pass |

Renames applied (logic byte-identical, per the Handoff's own mapping):
- `confine(dir, planPath, x)` → `Scope{Dir: dir, PlanPath: planPath}.Confine(x)`
- `readerPathQualifies(dir, planPath, x)` → `Scope{Dir: dir, PlanPath: planPath}.PathQualifies(x)`
- `walkMarkdown(dir)` → `WalkMarkdown(dir)`; `maxWalkFiles` stays visible unqualified in-package
- `newWriteLog()` → `NewWriteLog()`; `l.record/get/forget` → `l.Record/Get/Forget`; `l.bySession`,
  `l.mu` stay visible unqualified in-package (same-package access to unexported fields, matching
  `internal/locate/locate_test.go`'s shape)
- `evictOldest(m, limit, at)` → `Oldest(m, limit, at)`; test function `TestEvictOldest` →
  `TestOldest` (mirrors the exported name, matching `TestConfine`/`TestWalkMarkdown`'s
  named-after-the-function convention already in this file)

Two stale comments fixed at the same sites the Handoff named:
- `internal/evict/evict_test.go`'s doc comment and one subtest comment no longer name
  `writeLog.record (reader.go)` as a caller (that method no longer exists under that name);
  they now name `internal/reader`'s `WriteLog.Record` and `internal/server`'s
  `captureStore.put`, the real current callers.
- `internal/server/reader_test.go`'s banner comment above the two surviving
  `TestListMarkdown_*` tests no longer describes the file as covering "confine,
  readerPathQualifies, walkMarkdown, writeLog, listMarkdown" (four of those five moved out);
  it now says what actually remains — `listMarkdown`'s HTTP-adjacent git-branch wrapper — and
  points at the two files the rest moved to.

## Additional fix beyond the Handoff's named list

The Handoff's sanctioned-breakage list named five moved symbols but missed one call site that
also broke from the same rename: `internal/server/reader_test.go`'s
`TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` (a test that stays in
`internal/server` per the Handoff's own recommendation — it drives the real ingest pipeline)
called `srv.reader.writes.get(...)`. `WriteLog`'s method is now the exported `Get`, so this
one line needed the same identifier-only fix:
```
- _, ok = srv.reader.writes.get(sess.ID, filepath.Clean(staleWrite))
+ _, ok = srv.reader.writes.Get(sess.ID, filepath.Clean(staleWrite))
```
`go vet ./...` caught this (`srv.reader.writes.get undefined ... does have method Get`) —
confirmed by re-running vet clean after the fix. No logic changed, same category of fix as the
Handoff's own named list (an unexported-to-exported rename following the type's move).

Also fixed two stale mentions of the pre-move type name `gitFilesFunc` in
`TestListMarkdown_GitSuccessFiltersToMarkdownAndSorts`'s doc comment (the field's type is now
`reader.ListFilesFunc`; the comment named the old local type, which no longer exists under
that name in this package) — this is the same test's own doc comment, in a file I was already
editing for the sanctioned split, not a separate change.

## Doc/registry fix required by the file move

`make check-kb` failed after deleting `internal/server/evict_test.go` (the last file in
`internal/server` matching `docs/features/issue/spec.md`'s `internal/server/evict*.go` glob
entry — `internal/server/evict.go` itself was already deleted by daemon-impl, and the test file
was this glob's only remaining match): `internal/server/evict*.go matches no file`. Removed that
now-dead glob entry (the feature's `internal/evict/**` entry, added by daemon-impl's follow-up,
already covers the new location). Ran `make gen-kb` to regenerate the two files this touched
(`.claude/rules/issue.md`, `docs/features/issue/INDEX.md`); `make check-kb` is clean.

## Gate Output

```
$ go build ./...
(exits 0, no output)

$ go vet ./...
(exits 0, no output — after the .writes.get → .writes.Get fix)

$ make lint
golangci-lint run
0 issues.

$ make test-race
go test -race -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	73.294s
?   	github.com/Zalaras/muster/internal/boundedwait	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	15.963s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/evict	1.664s
ok  	github.com/Zalaras/muster/internal/ghissue	7.846s
ok  	github.com/Zalaras/muster/internal/gitutil	9.630s
ok  	github.com/Zalaras/muster/internal/kb	6.504s
ok  	github.com/Zalaras/muster/internal/keyedlock	2.439s
ok  	github.com/Zalaras/muster/internal/locate	3.089s
ok  	github.com/Zalaras/muster/internal/reader	7.198s
ok  	github.com/Zalaras/muster/internal/selfupdate	4.562s
ok  	github.com/Zalaras/muster/internal/server	112.165s
ok  	github.com/Zalaras/muster/internal/session	39.256s
ok  	github.com/Zalaras/muster/internal/store	15.101s
ok  	github.com/Zalaras/muster/internal/termbridge	10.708s
ok  	github.com/Zalaras/muster/internal/tmux	22.414s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	8.903s
ok  	github.com/Zalaras/muster/internal/triage	8.900s
ok  	github.com/Zalaras/muster/internal/tty	9.263s
ok  	github.com/Zalaras/muster/internal/usage	12.110s
ok  	github.com/Zalaras/muster/internal/webui	8.103s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failapi	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/kb	5.909s
ok  	github.com/Zalaras/muster/tools/triage	6.791s
ok  	github.com/Zalaras/muster/tools/versions	10.404s

$ make check-kb
go run ./tools/kb check
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass

$ make refs
python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
dead-refs: 3088 references checked, 0 missing
(plus pre-existing, unrelated "ignored (gitignored by design)" notices for
.claude/settings.local.json and web/dist across the tree)
```

## Files Touched

| File | Action |
|------|--------|
| `internal/reader/reader_test.go` | created — `TestConfine`, `TestReaderPathQualifies`, `TestWalkMarkdown`, `TestWalkMarkdown_CapsAt20000AndReportsTruncated`, moved verbatim from `internal/server/reader_test.go` |
| `internal/reader/writelog_test.go` | created — `TestWriteLog`, moved verbatim |
| `internal/evict/evict_test.go` | created — `TestEvictOldest` (renamed `TestOldest`), moved verbatim from `internal/server/evict_test.go` |
| `internal/server/reader_test.go` | modified — the five moved tests deleted, banner comment above the two surviving `TestListMarkdown_*` tests rewritten, the `gitFilesFunc` comment updated, `.writes.get` → `.writes.Get` fixed |
| `internal/server/evict_test.go` | deleted — fully moved to `internal/evict/evict_test.go` |
| `docs/features/issue/spec.md` | modified — dropped the now-dead `internal/server/evict*.go` glob entry |
| `.claude/rules/issue.md`, `docs/features/issue/INDEX.md` | regenerated (`make gen-kb`) |

Not committed per instructions — the team lead or a later step owns `git add`/`git commit`.

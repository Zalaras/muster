# Daemon Tests: file-drop-fix

**Plan**: file-drop-fix
**Verdict**: pass

## Fix Attempt (review cycle 1)

Fixed all three `[daemon-tests]` issues from `plans/file-drop-fix/review.md`. No
implementation code was touched; only `internal/server/locate_test.go` and
`internal/locate/spotlight_test.go` changed.

- **Major 2 (D16 data-dir half never tested)**. Three sub-gaps, all in
  `internal/server/locate_test.go`:
  1. Added `dataDirSnapshot(t, srv)`, which walks `filepath.Dir(srv.dbPath)` and records
     the **file set only** (no size, no hash) — deliberately, since the SQLite WAL the
     store keeps open there legitimately grows mid-request and a size/content-keyed
     snapshot would flake. Called before/after the handler call in all four
     `TestHandleLocateFile_OutcomesMatchLocatorResult` subtests (200, 404 no-match, 404
     same-size-different-bytes, 409 ambiguous) and in
     `TestHandleLocateFile_NeverWritesUploadToDisk`. Every code path that reaches
     `handleLocateFile` and returns is now covered on the data-dir side: the four
     `Locator`-outcome branches plus the pre-Locator 400/413/404-unknown-session
     branches.
  2. `dirSnapshot` (the walk-root/session-dir snapshot) previously keyed on
     `map[string]int64` (relative path → size), which cannot distinguish an unmodified
     file from an in-place same-size rewrite — INV-2 forbids "creates or modifies", not
     just "creates or resizes". Changed it to `map[string]string` keyed on a SHA-256
     content hash. Mutation-checked directly (see Evidence below): a same-size,
     different-content in-place rewrite now flips the snapshot.
  3. The "404 not_located: same name and size but different bytes" subtest previously
     took no before/after snapshot at all, unlike its three siblings. Added both
     `dirSnapshot` and `dataDirSnapshot` before/after around its handler call.
- **Minor 4 (no server-side test for the `500 internal_error` branch)**. Added
  `TestHandleLocateFile_FinderErrorReturnsInternalError`: builds a real `locate.New()`
  Locator, chmods the session directory itself to `0o000` after creating the session
  (so `WalkFinder.Find` hits a genuine "root unreadable" error rather than "nothing
  found" — Spotlight degrades to `(nil, nil)` regardless, so the walk finder's real
  error is what reaches `Locate` either way), and asserts the handler answers `500`
  with `internal_error`. Skips under `root` (`os.Geteuid() == 0`), matching the existing
  convention in `internal/locate/walk_test.go`. Mutation-checked (see Evidence).
- **Minor 5 (`TestBuildQuery`'s "non-ASCII" case was pure ASCII)**. `"Bildschirmfoto.png"`
  duplicated the plain-name case in all but name. Replaced with
  `"Bildschirmfoto 📸.png"` (a genuine multi-byte UTF-8 character, per the plan's own
  edge case 14 example), asserting `BuildQuery` passes it through byte-for-byte
  unescaped.

**Evidence — mutation checks (all reverted before the final gate run below):**

- 500 branch: changed `handleLocateFile`'s `default:` case to answer
  `404 not_located` instead of `500 internal_error`. Re-ran only the new test —
  it failed as expected (`expected: 500`, `actual: 404`), confirming the assertion is
  load-bearing, not vacuous. Reverted, confirmed `go build ./...` clean again.
- Data-dir snapshot: added a throwaway test that writes a file into
  `filepath.Dir(srv.dbPath)` between two `dataDirSnapshot` calls — the snapshots
  differed as expected. Removed the throwaway test afterward.
- Content-hash snapshot: added a throwaway test that overwrites a file in place with
  different content of the same size between two `dirSnapshot` calls — the snapshots
  differed as expected (this is exactly what the old size-only snapshot would have
  missed). Removed the throwaway test afterward.

## Summary

Tests created: 34 | Modified: 5 (4 `OutcomesMatchLocatorResult` subtests +
`NeverWritesUploadToDisk`) + 1 (`TestBuildQuery`'s non-ASCII case) | Added: 1
(`TestHandleLocateFile_FinderErrorReturnsInternalError`) | Passing: 35 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/locate/locate_test.go` | TestLocate_ReturnsPathForSingleVerifiedCandidate | D4: single byte-identical candidate returns its resolved path | pass |
| `internal/locate/locate_test.go` | TestLocate_ReturnsNotLocatedWhenSameNameSizeDifferentBytes | D5: same name+size, different bytes → ErrNotLocated | pass |
| `internal/locate/locate_test.go` | TestLocate_ReturnsAmbiguousWithSortedPaths | D6: two identical copies → ErrAmbiguous with sorted Paths | pass |
| `internal/locate/locate_test.go` | TestLocate_DedupesSameFileReachedViaSymlink | D7: same file via two paths counts once | pass |
| `internal/locate/locate_test.go` | TestLocate_FallsThroughToNextFinderWhenFirstYieldsNoVerifiedCandidate | REQ-5: Spotlight-miss falls through to the next Finder | pass |
| `internal/locate/locate_test.go` | TestLocate_FallsThroughWhenFirstFinderCandidateFailsByteCompare | a raw candidate that fails byte-compare still lets the next Finder try | pass |
| `internal/locate/locate_test.go` | TestLocate_StopsAtFirstFinderThatYieldsAnyVerifiedCandidateEvenIfAmbiguous | REQ-5: an ambiguous result from Finder 1 short-circuits Finder 2 | pass |
| `internal/locate/locate_test.go` | TestLocate_ReturnsNotLocatedWhenNoFinderYieldsAnything | every Finder empty → ErrNotLocated | pass |
| `internal/locate/locate_test.go` | TestLocate_WrapsAndReturnsARealFinderError | a genuine Finder error (unreadable dir) is wrapped and returned, not swallowed | pass |
| `internal/locate/locate_test.go` | TestLocate_VerifyCandidatesDropsVanishedCandidateInsteadOfErroring | a candidate that vanishes before verification is dropped silently | pass |
| `internal/locate/locate_test.go` | TestLocate_NeverWritesToDisk/{found,not_located,ambiguous,absent} | INV-2 at the `Locate` level: directory snapshot unchanged across every outcome | pass |
| `internal/locate/spotlight_test.go` | TestBuildQuery/* | D10: exact mdfind query shape, incl. `it's.png` quote-escaping and non-ASCII passthrough | pass |
| `internal/locate/spotlight_test.go` | TestSpotlightFinder_Find_NoCandidatesNoErrorWhenMdfindAbsent | D11: missing `mdfind` binary degrades to (nil, nil) | pass |
| `internal/locate/spotlight_test.go` | TestSpotlightFinder_Find_NoCandidatesNoErrorWhenRunFails | D11: any mdfind failure degrades to (nil, nil) | pass |
| `internal/locate/spotlight_test.go` | TestSpotlightFinder_Find_TimesOutAndDegradesRatherThanBlocking | D11: Find returns promptly once its own timeout context fires | pass |
| `internal/locate/spotlight_test.go` | TestSpotlightFinder_Find_ParsesOneCandidatePerLineAndSkipsBlankLines | mdfind output parsing | pass |
| `internal/locate/spotlight_test.go` | TestSpotlightFinder_Find_NoOutputYieldsNoCandidates | empty mdfind output → nil candidates | pass |
| `internal/locate/spotlight_test.go` | TestSpotlightFinder_Find_UsesBuildQueryAsTheSoleArgument | Find invokes mdfind with exactly `BuildQuery`'s string | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_FindsMatchingBasenameAndSize | basename+size filter, ignores same-name/wrong-size and same-size/wrong-name | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_FindsMultipleCandidatesOfTheSameNameAndSize | multiple raw candidates returned for Locate to verify | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_SkipsGitDirectories | D8: a `.git` copy is never visited | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_StopsAtEntryCapAndReportsNotFoundRatherThanErroring | D9: cap hit → empty result, no error | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_RespectsContextCancellationWithoutErroring | Edge Case 11: cancelled ctx stops the walk without erroring | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_EmptyDirYieldsNoCandidatesNoError | empty `dir` argument short-circuits | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_UnreadableRootIsARealError | an unreadable walk root is a genuine error (protocol 500 case) | pass |
| `internal/locate/walk_test.go` | TestWalkFinder_UnreadableSubdirectoryIsSkippedNotFatal | one bad subtree doesn't fail the whole walk | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_RequiresCookie | 401 with no `muster_auth` cookie | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_UnknownSession | D14: 404 `unknown_session` | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_MissingFilePart | D12: 400 `invalid_request`, no `file` part | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_NotMultipartBody | 400 `invalid_request`, non-multipart body | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_BadFilename | Edge Case 13 (empty-filename half): 400 `invalid_request` | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_TooLarge | D13: 413 `too_large`, streamed over-cap body | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_OutcomesMatchLocatorResult/{200,404×2,409} | D15: every locate outcome mapped to its Protocol Contract status/body, incl. `paths` on 409; each subcase now asserts INV-2 on **both** the session dir (content-hash) and the data dir (file-set) — review cycle 1, Major 2 | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_NeverWritesUploadToDisk | D16/INV-2 across 400/413/404 branches that never reach the Locator, now on both the session dir and the data dir — review cycle 1, Major 2 | pass |
| `internal/server/locate_test.go` | TestHandleLocateFile_FinderErrorReturnsInternalError | the Protocol Contract's `500 internal_error` branch, via a real `Locator` against an unreadable session directory — review cycle 1, Minor 4 | pass |

## Implementation Bugs

None. All 35 tests pass against the implementation as written.

**One finding, not treated as an implementation bug** (documented in the test file's own
comment, `internal/server/locate_test.go`'s `TestHandleLocateFile_BadFilename`): the
Protocol Contract's "filename... contains a path separator → 400" clause is not
reachable in practice. Go's `mime/multipart.Part.FileName()` unconditionally runs
`filepath.Base()` over the Content-Disposition `filename` parameter before
`readFilePart` ever sees it (RFC 7578 §4.2's "directory path information must not be
used" — `go doc -src mime/multipart.Part.FileName`), for every request that reaches this
handler via `net/http`'s own `multipart.Reader`, regardless of how the client encoded
the header. Confirmed empirically: a request built with filename `sub/dir.txt` reads
back as `dir.txt` inside the handler and proceeds to `Locator.Locate`, never hitting the
`strings.Contains(filename, "/")` branch in `internal/server/locate.go`. The observable
contract ("no path component from the client is ever trusted") is still met — just via
net/http's own normalization rather than the handler's explicit check — so this is a
harmless, unreachable defensive branch, not a functional gap, and doesn't affect any
acceptance criterion (D12 as written only requires the missing-file-part case). Only the
empty-filename half of Edge Case 13 is tested as a result.

## Test Run Output (review cycle 1 fix wave)

```
$ go build ./...
(clean)

$ go test ./internal/locate/... ./internal/server/... -run 'TestLocate|TestBuildQuery|TestSpotlightFinder|TestWalkFinder|TestHandleLocateFile' -v -count=1
... (all 35 subtests pass)
ok  	github.com/Zalaras/muster/internal/locate	0.792s
ok  	github.com/Zalaras/muster/internal/server	1.442s

$ go test -count=1 -p 1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	10.759s
ok  	github.com/Zalaras/muster/internal/claudecode	0.695s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	0.663s
ok  	github.com/Zalaras/muster/internal/gitutil	1.594s
ok  	github.com/Zalaras/muster/internal/locate	0.383s
ok  	github.com/Zalaras/muster/internal/server	13.538s
ok  	github.com/Zalaras/muster/internal/session	1.889s
ok  	github.com/Zalaras/muster/internal/store	0.977s
ok  	github.com/Zalaras/muster/internal/termbridge	1.448s
ok  	github.com/Zalaras/muster/internal/tmux	7.656s
ok  	github.com/Zalaras/muster/internal/usage	0.897s
ok  	github.com/Zalaras/muster/internal/webui	0.662s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.
```

`go test -count=1 -p 1 ./...` is the accepted gate this cycle per the fix-wave
instructions (the reviewer measured plain `make test` red on `main` too, under default
parallelism, on the pre-existing tmux-preflight/subprocess-contention flakes documented
in the original run above and in `plans/file-drop-fix/daemon-implementation.md`) — it
passed clean, every package, on this run.

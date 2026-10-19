# Daemon Tests: daemon-internals-fixes

**Plan**: daemon-internals-fixes
**Verdict**: pass
**Pack**: kb: pack 20570 words (budget 30000)

## Summary

Red-first mode. Tests created: 7 test functions (11 runs with subtests) | Red: 3 functions (the two plan Proof tests and the oversized-log test) | Green guards: 2 functions (`BodyAtLimitPersists` x2 kinds, `FailedRenameLeavesNoTempFile`).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/ingest_test.go` | TestHandleIngest_OversizedBodyReturns200AndPersistsNothing/{hook,status} | REQ-1: 20 MiB + 1 body gets 200, empty reply, no event persisted (checked behind a FIFO sentinel post) | red (Proof 1) |
| `internal/server/ingest_test.go` | TestHandleIngest_BodyAtLimitPersists/{hook,status} | REQ-1 / Edge 1: exactly 20 MiB persists on both endpoints | green guard |
| `internal/server/ingest_test.go` | TestHandleIngest_OversizedBodyLogsKindAndLimitButNoPayload | REQ-1 / Edge 3: exactly one warn line naming `"kind":"hook"` and the limit; no payload text in the log | red |
| `internal/selfupdate/apply_test.go` | TestInstallBinary_StaleFixedTempNameDoesNotBlockInstall | REQ-2: a directory at `.musterd-<tag>.tmp` does not block the install | red (Proof 2) |
| `internal/selfupdate/apply_test.go` | TestInstallBinary_FailedRenameLeavesNoTempFile | REQ-2 / Edge 4: a failed rename leaves only the occupied install path | green guard |

Edge case 2 (oversized status post dropped too) is the `status` subtest of the first row.

## Handoff Received

None

## Notes

- `TestInstallBinary_*` drive `installBinary` through `Apply` rather than calling it directly: the plan lets `installBinary`'s `tag` parameter go, and a direct call would stop compiling the moment impl drops it (impl may not edit tests). `Apply`'s signature is stable.
- The log test asserts a warn line carrying `"kind":"hook"` and `20971520` or `20 MiB`, since the plan fixes neither the field name nor the unit for the limit.
- The ordinary-mode `internal/atomicfile/atomicfile_test.go` is not written (package does not exist yet).
- Each 20 MiB body is built once per subtest (a presized `strings.Builder`, no copy).

## Test Run Output

```
go test -count=1 -run 'TestHandleIngest_(Oversized|BodyAtLimit)' ./internal/server/
--- FAIL: TestHandleIngest_OversizedBodyReturns200AndPersistsNothing/hook
    ingest_test.go:286: expected: 0  actual  : 1
    ingest_test.go:287: expected: 1  actual  : 2   (only the sentinel may be persisted)
--- FAIL: TestHandleIngest_OversizedBodyReturns200AndPersistsNothing/status
    ingest_test.go:286: expected: 0  actual  : 1
    ingest_test.go:287: expected: 1  actual  : 2
--- PASS: TestHandleIngest_BodyAtLimitPersists (hook, status)
--- FAIL: TestHandleIngest_OversizedBodyLogsKindAndLimitButNoPayload
    ingest_test.go:330: "[]" should have 1 item(s), but has 0
    log was: {"level":"info",...,"message":"reconciled sessions"}

go test -count=1 -run 'TestInstallBinary_' ./internal/selfupdate/
--- FAIL: TestInstallBinary_StaleFixedTempNameDoesNotBlockInstall
    Error: writing new binary: open .../.musterd-v0.11.0.tmp: is a directory
--- PASS: TestInstallBinary_FailedRenameLeavesNoTempFile

make lint: 0 issues.
```

---

# Ordinary-mode run (after daemon-impl)

**Verdict**: pass (supersedes the red-first `authored` above; the five red-first tests are now green in `make test`).

## Summary

Added 7 test functions (12 runs with subtests) in `internal/atomicfile` | Passing: all | Failing: 0. `go build ./...` exit 0; `make test` all `ok`; `make lint` 0 issues. Package coverage 73.1%, the uncovered statements being the practically unreachable `Chmod`, `Write` and `Sync` error branches.

## Tests (added)

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/atomicfile/atomicfile_test.go` | TestWrite_ReplacesByRenameAndFdKeepsReadingOldContent | fd opened before a rewrite still reads old content; fresh open reads new; no temp left | pass |
| `internal/atomicfile/atomicfile_test.go` | TestWrite_UnchangedContentLeavesInodeAndMtimeUntouched | same content: `os.SameFile`, same mtime, no temp | pass |
| `internal/atomicfile/atomicfile_test.go` | TestWrite_FreshPathIsWrittenAtTheGivenMode/{executable,owner_only,owner_executable} | fresh path holds content at 0755/0600/0700 regardless of umask | pass |
| `internal/atomicfile/atomicfile_test.go` | TestWrite_ChangedContentTakesTheGivenModeOverTheOldOne | rewrite with a new mode lands the new mode | pass |
| `internal/atomicfile/atomicfile_test.go` | TestWrite_FailureLeavesNoTempFile/{target_is_a_directory,directory_refuses_a_new_file} | early read failure and temp-create failure leave only the pre-existing target | pass |
| `internal/atomicfile/atomicfile_test.go` | TestWrite_FailedWriteLeavesTheOldContentIntact | a failed write keeps the old bytes | pass |
| `internal/atomicfile/atomicfile_darwin_test.go` | TestWrite_FailedRenameLeavesNoTempFileAndTheOldContent | final rename fails (target flagged `UF_IMMUTABLE`) after the temp was written: error names "renaming", temp removed by the defer, old content kept | pass |

## Notes

- The existing `TestWriteScriptAtomically_*` tests in `internal/claudecode/settings_test.go` are left in place; the three plan behaviours are asserted here against `atomicfile.Write` directly. The wrapper-mode `0o700` assertion stays with them.
- A non-empty directory at the path fails at the initial read, before any temp exists, so it does not reach the rename (the `selfupdate` guard `TestInstallBinary_FailedRenameLeavesNoTempFile` uses that same setup). The rename-failure cleanup is reached only by the darwin-only test with `chflags uf_immutable` (`golang.org/x/sys/unix`, already a direct dependency; it skips if the flag cannot be set, and its cleanup clears the flag so `t.TempDir` can remove the file). The read-only-directory cases skip when the user is not bound by directory permissions.
- No `dupl` warning names the new files (`make size-warn | grep atomicfile` is empty).
- `make test` waited on the shared gate lock behind other worktrees' exclusive runs, then ran with no failures.

## Handoff Received

None (the impl handoff names no broken test file).

---

# Fix wave: review cycle 2

**Verdict**: pass

## Issue 1: `TestInstallBinary_FailedRenameLeavesNoTempFile` was vacuous

The test put a non-empty directory at `exePath`, which fails at `atomicfile.Write`'s initial read before any temp file exists, so the `ReadDir` assertion could not catch a leaked temp.

- `internal/selfupdate/apply_darwin_test.go` (new): `TestInstallBinary_FailedRenameLeavesNoTempFile` now marks the installed binary `UF_IMMUTABLE` (skips if the flag cannot be set; cleanup clears it). The temp file is created, written and closed, then the final rename fails. It asserts the error contains "renaming", that only `musterd` is left in the directory, and that its old content is unchanged. This is the Edge Case 4 guard at the `selfupdate` level (D2).
- `internal/selfupdate/apply_test.go`: the old test is renamed `TestInstallBinary_DirectoryAtInstallPathFailsAndLeavesNoTempFile`, named for the failure it actually exercises (the pre-temp read failure). The shared Apply setup is extracted to `applyNewBinary(t, exePath)`, which both tests use.

Mutation check: with `atomicfile.Write`'s `defer os.Remove(tmpPath)` disabled, the new test fails (`"[.musterd.tmp-3084390673 musterd]" should have 1 item(s), but has 2`). The impl was restored afterwards (`git status` shows only the two test files).

```
$ go test -count=1 -run 'TestInstallBinary_' ./internal/selfupdate/
ok  	github.com/Zalaras/muster/internal/selfupdate	0.549s
$ make lint
0 issues.
```

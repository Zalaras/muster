# Correctness review: daemon-internals-fixes

**Plan**: daemon-internals-fixes
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 33116 words (budget 30000)

Delta re-review. `git diff 276c3524..HEAD` (commits `8be63015`, `99f9c20d`, `541301fb`) changes only `internal/selfupdate/apply_test.go`, a new `internal/selfupdate/apply_darwin_test.go`, `daemon-tests.md` and orchestration state. No non-test file under `internal/`, `cmd/` or `web/src/` changed, so §3–§6 carry over from cycle 1 unchanged. §1, §2 and the verdict were redone against this cycle's gate run.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes (unchanged since cycle 1: `internal/server/ingest.go`, 20 MiB `MaxBytesReader`, warn line and a bare `200`) | Yes (D1 green, `17-D1.log`) | pass |
| REQ-2 | Yes (unchanged: `installBinary` is `atomicfile.Write(exePath, data, 0o755)`) | Yes. Edge Case 4 now has a real `selfupdate`-level guard: `TestInstallBinary_FailedRenameLeavesNoTempFile` (`apply_darwin_test.go`) reaches the post-temp rename failure. D2 green (`18-D2.log`) | pass |
| REQ-3 | Yes (unchanged: `internal/atomicfile.Write`, callers at `0o700`/`0o600`) | Yes (D3 green, `19-D3.log`) | pass |
| DIAG | `kb:diagram/daemon-components` and `kb:diagram/one-launch-end-to-end`. This cycle changed no source file, so the cycle 1 result stands | — | pass |

## Build & Tests

E2E tests: skipped (E2E Scope none, so the run has no e2e line) · Daemon tests (race): pass (`02-test.log`, every package `ok`, including `internal/selfupdate` and `internal/atomicfile`) · Web tests: pass (2761) · Daemon build: pass (`01-build.log` empty) · Web build: pass · Lint: pass (0 issues). All of these were read from `$GATES_LOG_DIR` (`/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-daemon-internals-fixes-c2`). These baseline lines also passed: web-lint, contrast (54 pairs ×3, 0 failures), features-inventory, versions, e2e-honest, kb-check (610 records, 0 problems), e2e-lint, features, comments and comment-ledger (4 blocks, all kept). size: WARN, 3 hits, the same pre-existing three as cycle 1. That line belongs to review-maintainability, which was skipped this cycle.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestHandleIngest_' ./internal/server/` | pass (`17-D1.log`) |
| D2 | `go test -count=1 -run 'TestInstallBinary_' ./internal/selfupdate/` | pass (`18-D2.log`) |
| D3 | `go test -count=1 ./internal/atomicfile/ ./internal/claudecode/ ./internal/selfupdate/` | pass (`19-D3.log`) |
| D4 | `! rg -n 'func AtomicWriteFile' internal/` | pass (`20-D4.log`, empty) |
| D5 | `! rg -n 'os\.WriteFile\(tmpPath' internal/selfupdate/` | pass (`21-D5.log`, empty) |
| D6 | `make lint` | pass (deduped to the baseline lint line, `03-lint.log`: 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Nothing has changed since cycle 1: the TODO entries are already moved, there are no `deviation:` lines, and the fix wave added no `doc-delta:` line. The Doc Delta still holds against unchanged code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `internal/atomicfile` imports nothing internal; `internal/selfupdate` does not import `internal/claudecode` | pass | No non-test import changed this cycle. The new test file imports only `os`, `path/filepath`, `testing`, testify and `golang.org/x/sys/unix`. The cycle 1 `go list` evidence stands |
| RV2 | The oversized-body log line is at warn, names the kind and the limit, and nothing from the body | pass | `ingest.go` is unchanged since cycle 1 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (no source change; the new test holds no Claude Code knowledge) |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass |
| 4 | Bare tmux | pass (no tmux in the delta) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | n/a |
| 7 | Session identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (the new test launches no binary; it uses the existing fake release server) |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Minor 1 `[daemon-tests]` "`TestInstallBinary_FailedRenameLeavesNoTempFile` no longer makes a rename fail, so it cannot catch the defect it is named for" | `99f9c20d` | Diff read. The test now lives in `apply_darwin_test.go`. It marks the installed binary `UF_IMMUTABLE` and skips only if `Chflags` fails; the cleanup that clears the flag is registered after `t.TempDir`, so it runs first. Then it runs the full signed `Apply` through the new `applyNewBinary` helper. `atomicfile.Write`'s initial read succeeds, and `CreateTemp`, `Chmod`, `Write`, `Sync` and `Close` all succeed in the writable directory. Only `os.Rename` fails, and the test asserts that with `ErrorContains(err, "renaming")`, which matches the `atomicfile.go` wrap `"renaming %q to %q: %w"`. It then asserts that `musterd` is the only directory entry and that it still has its old bytes. A local `go test -v -run TestInstallBinary_` shows `--- PASS` with no `SKIP` for all three tests, so the guard really runs on this machine. The mutation evidence in `daemon-tests.md` (with the deferred remove disabled, the test fails with two entries) is consistent with that. The vacuous test was renamed `TestInstallBinary_DirectoryAtInstallPathFailsAndLeavesNoTempFile`, and its doc comment now names the pre-temp failure it actually exercises. The only other change is the extracted `applyNewBinary` helper that both tests share, and no non-test file changed. This satisfies both halves of the fix the Minor asked for |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The `selfupdate` Edge Case 4 guard is darwin-only (the `_darwin_test.go` suffix plus `UF_IMMUTABLE`). That matches the `atomicfile` guard and the macOS-only product, and the cross-platform test now covers only the pre-temp failure it is named for. No change requested.
2. **[note]** The review pack is still 33,116 words against a 30,000 budget (as in cycle 1).

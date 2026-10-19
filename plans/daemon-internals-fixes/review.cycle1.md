# Review: daemon-internals-fixes

**Plan**: daemon-internals-fixes
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: daemon-internals-fixes

**Plan**: daemon-internals-fixes
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 33116 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `internal/server/ingest.go`: `maxIngestBodyBytes = 20 << 20`, `http.MaxBytesReader` before `io.ReadAll`; on `*http.MaxBytesError` one warn line (`kind`, `limitBytes`), then a bare `200` with nothing enqueued. Exactly 20 MiB is within `MaxBytesReader`'s inclusive limit | Yes. `TestHandleIngest_OversizedBodyReturns200AndPersistsNothing/{hook,status}` (limit+1 gets 200, empty body, 0 events; FIFO sentinel then total = 1, so nothing was enqueued), `TestHandleIngest_BodyAtLimitPersists/{hook,status}` (exactly the limit persists), `TestHandleIngest_OversizedBodyLogsKindAndLimitButNoPayload` | pass |
| REQ-2 | Yes. `internal/selfupdate/apply.go`: `installBinary(exePath, data)` is `atomicfile.Write(exePath, data, 0o755)`, so a fresh `os.CreateTemp` name in the binary's directory, `Sync` before `Rename`, and a deferred remove of the temp on every path. The `tag` parameter is gone | Yes. `TestInstallBinary_StaleFixedTempNameDoesNotBlockInstall` (a directory at `.musterd-v0.11.0.tmp`, install succeeds with the new bytes). The "no temp left on failure" half is covered substantively only by `internal/atomicfile`'s darwin rename-failure test. See Minor 1 | pass (test-honesty Minor) |
| REQ-3 | Yes. `internal/atomicfile/atomicfile.go` `Write` has the same body as the removed `claudecode.AtomicWriteFile`, line for line. `claudecode.writeScriptAtomically` calls it at `0o700` and `server.writeSettings` at `0o600`, so both modes are unchanged. `rg AtomicWriteFile` outside `plans/` finds nothing | Yes. `internal/atomicfile/atomicfile_test.go` covers the open fd still reading the old content, an unchanged write keeping the same inode and mtime, fresh-path modes 0755/0600/0700, a mode change on rewrite, failures leaving no temp, and a failed write keeping the old content. `atomicfile_darwin_test.go` covers a rename failure after the temp was written. The existing `TestWriteScriptAtomically_*` tests are still green (D3) | pass |
| DIAG | `kb:diagram/daemon-components` (named by `kb for` on all five changed source files) and `kb:diagram/one-launch-end-to-end` (launcher.go) | — | pass. daemon-components now draws the `atomicfile` component and its three edges, and its prose says what `go list` shows: `atomicfile` has no internal imports, while `claudecode` and `selfupdate` each import only `atomicfile` from inside the repo. one-launch-end-to-end names no writer (step "MergeSettings into .claude/settings.local.json"), so it is unaffected |

## Build & Tests

E2E tests: skipped (E2E Scope none; no e2e log in the gate run) · Daemon tests (race): pass (`02-test.log`, every package `ok`, including `internal/atomicfile`) · Web tests: pass (2761) · Daemon build: pass · Web build: pass · Lint: pass (0 issues). All read from `$GATES_LOG_DIR` (`/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-daemon-internals-fixes-c1`). Baseline lines web-lint, contrast, features-inventory, versions, e2e-honest, kb-check, e2e-lint, features, comments and comment-ledger all passed. size: WARN (3 hits; review-maintainability's area, and that reviewer was skipped this cycle).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestHandleIngest_' ./internal/server/` | pass (`17-D1.log`) |
| D2 | `go test -count=1 -run 'TestInstallBinary_' ./internal/selfupdate/` | pass (`18-D2.log`) |
| D3 | `go test -count=1 ./internal/atomicfile/ ./internal/claudecode/ ./internal/selfupdate/` | pass (`19-D3.log`) |
| D4 | `! rg -n 'func AtomicWriteFile' internal/` | pass (`20-D4.log`, empty) |
| D5 | `! rg -n 'os\.WriteFile\(tmpPath' internal/selfupdate/` | pass (`21-D5.log`, empty) |
| D6 | `make lint` | pass (deduped to the baseline lint line, `03-lint.log`: 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Both TODO entries were ticked and moved to `docs/history/todo-done.md` under the same heading. There are no `deviation:` lines, so no ADR is owed. No fact was learned. The diagram was updated in `b8d3af0f`, and `internal/atomicfile/**` was added to ingest's `go:` globs (`92201fd3`). Every Doc Delta line holds against the code; see Notes 1–2 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `internal/atomicfile` imports nothing internal; `internal/selfupdate` does not import `internal/claudecode` | pass | `go list -f '{{.Imports}}'`: atomicfile imports `bytes fmt os path/filepath` only. selfupdate's only `muster/internal` import is `internal/atomicfile` |
| RV2 | The oversized-body log line is at warn, names the kind and the limit, and nothing from the body | pass | `ingest.go`: `f.log.Warn().Str("kind", string(kind)).Int64("limitBytes", tooLarge.Limit).Msg("dropping ingest post over the body limit")`. Nothing derived from `body` reaches the logger, and `TestHandleIngest_OversizedBodyLogsKindAndLimitButNoPayload` asserts there is no prompt marker or padding in the log and exactly one warn line |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. `internal/atomicfile` is generic file I/O with no Claude Code format knowledge. The move takes generic code out of `internal/claudecode`, not Claude Code knowledge out of it |
| 2 | Terminal-output state parsing | pass. Nothing touched reads pane text |
| 3 | Blocking hook handler | pass. The request path still only reads the body (now bounded) and enqueues. No hook timeout changed |
| 4 | Bare tmux | pass. No tmux invocation touched |
| 5 | Payload logging | pass. The new warn line carries kind and limit only (RV2) |
| 6 | Empty-gauge dishonesty | n/a. No rendering path touched |
| 7 | Session identity on `session_id` | pass. Not touched |
| 8 | Settings trespass | pass. `writeSettings` still writes only the project-scoped `.claude/settings.local.json`, now through `atomicfile.Write` at the same `0o600` |
| 9 | Real `claude` outside canary/probes | pass. The new tests launch no binary |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-tests]** `TestInstallBinary_FailedRenameLeavesNoTempFile` (`internal/selfupdate/apply_test.go`) no longer makes a rename fail, so it cannot catch the defect it is named for. The test puts a non-empty directory at `exePath`. Since `installBinary` became `atomicfile.Write`, that fails at the first `os.ReadFile(path)` ("is a directory"), before any temp file exists. The `ReadDir` assertion would therefore pass even if a failed install leaked its temp file. daemon-tests' own ordinary-mode note confirms it ("fails at the initial read, before any temp exists, so it does not reach the rename"). The plan maps Edge Case 4 ("a failed install leaves no temp file in the binary's directory") to D2. The only D2 test that names it is vacuous at the `selfupdate` level, and the real guard sits in `internal/atomicfile/atomicfile_darwin_test.go` (D3). What a fix must make true: either the D2 test reaches a failure *after* `installBinary`'s temp file has been written (for example a target the rename cannot replace, as the atomicfile darwin test sets up) and still asserts that only the binary is left in the directory, or the test is renamed to the failure it actually exercises, and Edge 4's selfupdate-level guard is then provided by a test that reaches the post-temp failure.

### Notes

1. **[note]** The impl log's `doc-delta:` line (the fixed `.musterd-<tag>.tmp` name is gone) needs no doc edit. `rg` finds no doc, spec, README or package CLAUDE.md naming that temp file. `docs/features/update/spec.md` line 39 ("extracts the binary beside the running one and renames it over the resolved path") names no temp file and is still true. That matches the plan's conditional update bullet: since the spec names no temp file, the "synced, under a fresh temp name" wording does not apply.
2. **[note]** The ingest Doc Delta claims are supported by the code. `docs/protocol.md` §ingest ("Malformed JSON is still `200` (logged, dropped)") and `docs/features/ingest/spec.md`'s handler paragraph can take the over-20-MiB clause for doc-reconcile verbatim. "Payload bodies are never logged" stays true.
3. **[note]** For review-maintainability (skipped this cycle): `16-size.log` warns on `launcher.go` at 625 lines and on `Resume` (42 statements). The impl log says this was already over the threshold before the plan, which added one import line. It also warns on the pre-existing `TestApply_RefusalsLeaveTheBinaryByteIdentical`.
4. **[note]** One behaviour change comes with REQ-2 that the plan did not spell out. `atomicfile.Write` reads the existing target first, so an install now reads the whole running binary into memory, and an install whose bytes equal the current binary is a no-op (no rename). Neither contradicts REQ-2 or the trust-root ADR: the binary stays byte-identical on every failure.
5. **[note]** When a post is oversized, `http.MaxBytesReader` also marks the connection to close after the `200`. A client still streaming a body past 20 MiB may see the connection drop rather than read the `200`. The wrapper script exits 0 either way, so Claude Code is never asked to retry (`kb:anchor/ingest`). No change requested.
6. **[note]** The review pack is 33,116 words against a 30,000 budget.

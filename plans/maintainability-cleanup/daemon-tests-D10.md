# Daemon Tests: Maintainability Cleanup — Unit D10 (adapters) test repair

**Plan**: maintainability-cleanup
**Mode**: repair (fix every test the D10 Handoff's sanctioned-breakage list names, plus the two
named coverage gaps)
**Verdict**: pass

## Summary

This was a repair pass, not fresh authoring: `daemon-implementation-D10.md`'s Handoff names every
test site its Major 1/Major 2/Minor 1/Minor 2/Minor 3/Minor 10 changes broke, with the exact
injection shape each site needs. Fixed every one of them, plus:

- Moved `TestCheckVersion`'s six classification rows (c-adapters Minor 2) off forked stub scripts
  onto `versionChecker`'s new run seam.
- Added coverage for the two new seams/wrappers the Handoff flagged as uncovered:
  `gitutil.ListFiles` parsing and the ingest-route declaration being what `server.mount` actually
  registers.

Tests changed: 15 files, 0 new test files. Cases before/after: unchanged everywhere except the two
places the Handoff explicitly sanctions a dropped assertion (a field that no longer exists) and the
version.go classification rows (relocated 6-for-6 from `TestCheckVersion` to a new
`TestVersionChecker_InstalledVersion`, net zero). Six net-new tests added (three `gitutil.ListFiles`
seam/integration cases, one `versionChecker` table absorbing the six relocated rows counts as one
new function not six, one `TestMount_RegistersRoutesAtClaudecodeIngestPathDeclaration`). No
assertion was weakened; no implementation file was touched.

Passing: all. Failing: none.

## Tests

| File | Test / Change | What It Tests | Status |
|------|------|---------------|--------|
| `internal/claudecode/credentials_test.go` | 7× `KeychainTokenReader("bob", run)` → `(&keychainReader{user: "bob", run: run}).read` | Mechanical: Major 1 dropped the exported seam parameter | pass |
| `internal/claudecode/credentials_test.go` | `RunCommand(...)` → `runCommand(...)`, comment prose fixed | Mechanical rename | pass |
| `internal/claudecode/modelcheck_test.go` | 5× `CheckModel(ctx, run, ...)` → `(&modelChecker{run: run}).check(ctx, ...)` | Mechanical: same Major 1 shape | pass |
| `internal/claudecode/modelcheck_test.go` | 6× `RunModelCheck(...)` → `runModelCheck(...)`, stale `RunModelCheck`/`ModelCheckRun` prose fixed | Mechanical rename | pass |
| `internal/claudecode/status_test.go` | Deleted `assert.Equal(t, "subscription", got.Account.Source)` | Sanctioned: `StatusAccount.Source` field removed (Minor 10); the wire default is covered unbroken by `internal/server/usagewire_test.go`/`state_test.go`/`ws_test.go` per the Handoff | pass |
| `internal/claudecode/version_test.go` | New `TestVersionChecker_InstalledVersion` (6 subtests: run-error, unparseable, below/equal-floor/equal-ceiling/above) | The exec-output→version-or-error mapping, off the seam, no subprocess | pass |
| `internal/claudecode/version_test.go` | `TestCheckVersion` reduced to its one no-fork case (`missing binary`); `writeVersionStub` deleted | CheckVersion's own INV-1/INV-2 composition for the one branch reachable without a subprocess; the other branch and the classification math are covered by the new test above plus `TestClassifyAgainst`/`TestClassify_UsesEmbeddedRecord` (see Decisions) | pass |
| `internal/ghissue/ghissue_test.go` | 11× `GhCLITokenReader(lookPath, run\|nil)` → `(&ghTokenReader{lookPath: lookPath, run: ...}).read` | Mechanical: same Major 1 shape | pass |
| `internal/ghissue/ghissue_test.go` | `RunCommand(...)` → `runCommand(...)`, comment prose fixed | Mechanical rename | pass |
| `internal/selfupdate/exeversion_test.go` | 3× `ProbeVersion(ctx, run, path)` → `(&versionProber{run: run}).probe(ctx, path)` | Mechanical: same Major 1 shape | pass |
| `internal/selfupdate/exeversion_test.go` | 2× `RunVersionProbe(...)` → `runVersionProbe(...)`, stale comment fixed | Mechanical rename | pass |
| `internal/gitutil/gitutil_test.go` | New `TestGitRunner_ListFiles_ParsesNulSeparatedOutput`, `..._EmptyOutputIsNilNotEmptySlice`, `..._RunErrorPropagates` | `gitRunner.listFiles`'s NUL-split/trim logic against a fake run, no subprocess | pass |
| `internal/gitutil/gitutil_test.go` | New `TestListFiles_ReturnsTrackedUntrackedButNotGitignoredFiles`, `TestListFiles_ErrorForANonGitDirectory` | `ListFiles`'s real `git ls-files -co --exclude-standard -z` argv against a real fixture repo (previously uncovered — new function per Minor 1) | pass |
| `internal/server/reader_test.go` | 2× `&readerFeature{runGit: fakeGit}` (NUL-byte fixture) → `&readerFeature{gitFiles: fakeGit}` (plain `[]string` fixture); unused `strings` import dropped | Mechanical: Minor 1 moved the reader's seam to the neutral `gitFilesFunc` shape | pass |
| `internal/server/update_test.go` | New `writeMusterdVersionStub` helper; 3 tests' `c.ExeRun = func(...)` closures → real `#!/bin/sh` executables at `c.ExePath` | `checkSwap` now really execs `exePath -version` via `selfupdate.ProbeVersion`'s own unexported seam (Major 1 removed `updateManagerConfig.ExeRun` entirely) | pass |
| `internal/server/ingest_test.go` | New `TestMount_RegistersRoutesAtClaudecodeIngestPathDeclaration` | Major 2: `mount`'s routes are built from `claudecode.IngestHookPath`/`IngestStatusPath`, not a second hand-spelled literal (previously uncovered structurally — every existing ingest test posts a hardcoded literal that would keep passing even if `mount` silently drifted from the declaration) | pass |
| `internal/tmux/activity_test.go` | `fakeActivityExec`'s `exec` field and the one direct override in `TestListPaneActivity_RealTmux_OneInvocationCoversEveryPane` widened to the 3-return `(stdout, stderr []byte, err error)` shape | Mechanical: Minor 3's `Client.exec` signature change; the ~14 `fn` closures under `fakeActivityExec` are untouched (still `([]byte, error)`) | pass |
| `internal/tmux/tmux_test.go` | `TestKillSession_PostKillRecheckStillThereReturnsTheOriginalKillError`'s direct `Client{exec: ...}` literal split into an explicit stderr-only capture for `kill-session`, `(out, nil, nil)` for `list-panes`/default | Same Minor 3 signature change, for the one test that fabricates a real `*exec.ExitError` by hand | pass |
| `cmd/musterd/main_test.go` | Deleted `assert.NotNil(t, cfg.Update.ExeRun, ...)` | Sanctioned: `UpdateConfig.ExeRun` field removed (Major 1); nothing left to guard | pass |
| `test/canary/live_test.go` | `KeychainTokenReader(u.Username, claudecode.RunCommand)` → `KeychainTokenReader(u.Username)` | Mechanical: Major 1 | pass |
| `test/canary/harness_test.go` | 2× `CheckModel(ctx, claudecode.RunModelCheck, ...)` → `CheckModel(ctx, ...)`; stale `RunModelCheck`/pair-of-symbols prose fixed | Mechanical: Major 1 | pass |

## Decisions

- **CheckVersion's success-branch composition is not re-proven against a real subprocess.**
  `CheckVersion` itself has no run seam — only `InstalledVersion`/`versionChecker` does (c-adapters
  Minor 2 asked only for the latter). Its own body is two lines: `Installed: &installed, Status:
  ClassifyAgainst(installed, ObservedVersions())`, no branching. The team lead's brief was explicit
  ("keep only the single WaitDelay-with-descendant test on a real process"), so rather than adding
  one more forked stub script to re-prove this two-field literal, I relied on: (1)
  `TestVersionChecker_InstalledVersion` (this unit, no subprocess) proving the exec-output→version
  mapping for exactly the same content strings the old rows used (`1.0.0`, `Floor()`, `Verified()`,
  `99.0.0`), and (2) `TestClassifyAgainst`/`TestClassify_UsesEmbeddedRecord` (pre-existing, unchanged)
  proving `ClassifyAgainst`/`ObservedVersions()` classify those same strings correctly against the
  real embedded record. `TestCheckVersion` keeps exactly the one branch reachable with no
  subprocess at all (a nonexistent path — `exec.CommandContext` fails before any process starts,
  so this is not the "fork of a freshly written script" cost the lesson is about), which still
  proves INV-1/INV-2's error branch through CheckVersion's own code. Net effect: identical scenario
  coverage (7 before, 7 after — 1 in `TestCheckVersion` + 6 in `TestVersionChecker_InstalledVersion`),
  zero stub-script forks instead of 6.
- **`writeVersionLeakStub`/`TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup`
  untouched.** This is the one test the Handoff/review explicitly keep on a real process (the
  WaitDelay-vs-a-descendant-holding-stdout assertion is inherently process-observable — no fake
  `run` closure can reproduce a real OS pipe staying open past the parent's exit).
- **`gitutil.ListFiles` gets both a seam-level and a real-git test.** The seam-level table
  (`TestGitRunner_ListFiles_*`) covers the NUL-split/trim/empty-output logic cheaply; the two
  `ListFiles`-level tests (real `initRepoWithOneCommit` fixture, matching this file's existing
  pattern for `IsRepo`/`Branch`/`IsWorktree`) prove the actual `git ls-files -co --exclude-standard
  -z` argv produces the tracked/untracked/not-ignored split `reader.go`'s `listMarkdown` depends on
  — this is real git, not a stub-script fork, and matches the file's own established convention for
  every other function here.
- **`TestMount_RegistersRoutesAtClaudecodeIngestPathDeclaration` deliberately does not replace the
  existing hardcoded-literal tests.** Those tests (`TestHandleIngest_*`) are correctly testing
  handler behaviour once a request arrives; swapping their literals for
  `claudecode.IngestHookPath(...)` calls would only cosmetically change what they assert, since
  they'd still pass whether or not `mount` derives its pattern from that function. The new test is
  the one that actually ties the route *registration* to the declaration Major 2 introduced — it is
  the only test in the file that would fail if `mount`'s pattern and `claudecode.IngestHookPath`'s
  output ever diverged.
- **`internal/server/update_test.go`'s three `checkSwap` tests write real, short-lived `#!/bin/sh`
  scripts** (echo-then-exit for success/failure, `sleep 30` for the deadline case) at `c.ExePath`
  rather than the previous fake `ExeRun` closures, since `updateManagerConfig.ExeRun` no longer
  exists — `checkSwap` calls `selfupdate.ProbeVersion(probeCtx, m.exePath)` directly now, which
  really execs `exePath -version`. This is the same pattern `claudecode/version_test.go`'s
  `writeVersionStub` and `selfupdate/exeversion_test.go`'s real-subprocess tests already use, named
  explicitly in the Handoff. The swap-detection stat comparison (`info.Size() ==
  prev.Size() && info.ModTime().Equal(prev.ModTime())`) is satisfied by the script's size alone
  differing from the placeholder `"original"`/`"changed"` content written first, so no mtime-
  resolution flakiness is introduced.
- **c-m12 (dead `claudecode.Classify`)**: the D10 Handoff already recorded this as NOT done (a real
  canary caller exists, `test/canary/canary_test.go:59`) — no test change needed or made here;
  `TestClassify_UsesEmbeddedRecord` is unchanged.

## Gate Output

- `go build ./...` — exits 0.
- `go vet ./...` — clean, 0 output.
- `go vet -tags=canary ./test/...` — clean, 0 output.
- `make lint` — `golangci-lint run` → `0 issues.`
- `make refs` — `dead-refs: 3084 references checked, 0 missing`.
- `make test-race` (`go test -race -count=1 ./...`, whole tree) — every package `ok`, tail below.

```
$ go vet ./...
$ go vet -tags=canary ./test/...
$ make lint
golangci-lint run
0 issues.
$ make refs
python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
... (18 gitignored-by-design lines omitted, all pre-existing)
dead-refs: 3084 references checked, 0 missing
$ make test-race
go test -race -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	69.714s
?   	github.com/Zalaras/muster/internal/boundedwait	[no test files]
ok  	github.com/Zalaras/muster/internal/claudecode	9.517s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	5.277s
ok  	github.com/Zalaras/muster/internal/gitutil	3.737s
ok  	github.com/Zalaras/muster/internal/kb	7.844s
ok  	github.com/Zalaras/muster/internal/keyedlock	6.040s
ok  	github.com/Zalaras/muster/internal/locate	4.608s
ok  	github.com/Zalaras/muster/internal/selfupdate	7.350s
ok  	github.com/Zalaras/muster/internal/server	116.220s
ok  	github.com/Zalaras/muster/internal/session	37.849s
ok  	github.com/Zalaras/muster/internal/store	15.834s
ok  	github.com/Zalaras/muster/internal/termbridge	8.025s
ok  	github.com/Zalaras/muster/internal/tmux	21.412s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	8.134s
ok  	github.com/Zalaras/muster/internal/triage	8.358s
ok  	github.com/Zalaras/muster/internal/tty	8.617s
ok  	github.com/Zalaras/muster/internal/usage	11.032s
ok  	github.com/Zalaras/muster/internal/webui	8.103s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failapi	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/kb	7.176s
ok  	github.com/Zalaras/muster/tools/triage	7.362s
ok  	github.com/Zalaras/muster/tools/versions	9.894s
```

## Files Touched

Test files only (no implementation file was edited):

- `internal/claudecode/credentials_test.go`
- `internal/claudecode/modelcheck_test.go`
- `internal/claudecode/status_test.go`
- `internal/claudecode/version_test.go`
- `internal/ghissue/ghissue_test.go`
- `internal/gitutil/gitutil_test.go`
- `internal/selfupdate/exeversion_test.go`
- `internal/server/reader_test.go`
- `internal/server/update_test.go`
- `internal/server/ingest_test.go`
- `internal/tmux/activity_test.go`
- `internal/tmux/tmux_test.go`
- `cmd/musterd/main_test.go`
- `test/canary/live_test.go`
- `test/canary/harness_test.go`

## D10b (checkSwap tests moved onto the `probeVersion` consumer port)

**Mode**: repair (fix, per team-lead brief; no review cycle)
**Verdict**: pass

### Summary

D10b's implementation pass gave `updateManager` its own `probeVersion probeVersionFunc` field
(defaulted to `selfupdate.ProbeVersion` in `newUpdateManager`), closing the gap this file's own
Decisions section above had accepted: the three `checkSwap` tests forking real `#!/bin/sh` stub
executables. Moved all three onto the new field per the team lead's brief and
`daemon-implementation-D10.md`'s D10b Handoff — no executable stub remains anywhere in
`internal/server/update_test.go`.

### Changes

| File | Change | What It Tests | Status |
|------|--------|---------------|--------|
| `internal/server/update_test.go` | Deleted `writeMusterdVersionStub` (no remaining caller) | — | — |
| `internal/server/update_test.go` | `TestUpdateManager_CheckSwap_DetectsAnExternalSwap`: `m.probeVersion = func(context.Context, string) (string, error) { return "0.11.0", nil }`; stub-script write replaced with `os.WriteFile(exePath, []byte("changed"), 0o644)` | Success half of D24: stat change + successful probe sets `Installed` | pass |
| `internal/server/update_test.go` | `TestUpdateManager_CheckSwap_ProbeFailureOrTimeoutLeavesInstalledNull`/"probe returns an error": `m.probeVersion = func(context.Context, string) (string, error) { return "", errors.New("boom") }`; stub replaced with a plain rewritten file | Probe error leaves `Installed` nil | pass |
| `internal/server/update_test.go` | Same test/"probe hangs past its deadline": `m.probeVersion = func(ctx context.Context, _ string) (string, error) { <-ctx.Done(); return "", ctx.Err() }`, blocking on the short-deadline `ctx` `checkSwap` passes in; stub replaced with a plain rewritten file | Probe timeout leaves `Installed` nil, no real subprocess or `sleep 30` | pass |
| `internal/server/update_test.go` | Added `"errors"` import (newly needed by the second test above); no other import changed — `fmt` stays, still used by the checksum line and nowhere else in this section | — | — |

Each test still writes a plain file at `c.ExePath` before flipping `m.probeVersion` — the
stat-diff branch `checkSwap` checks before probing only compares size/mtime against the
construction-time stat, so an ordinary non-executable rewrite (`0o644`, content `"changed"`)
triggers it exactly as the executable stub previously did. No assertion changed from the prior
version of these three tests.

Confirmed no stub or `exeRun`/`ExeRun` residue remains:

```
$ rg -n '#!/bin/sh|os.Chmod.*0o7|writeMusterdVersionStub' internal/server/update_test.go
(no output)
$ rg -n 'exeRun|ExeRun' --glob '!plans/**'
docs/adr/process-adapter-run-seam-constructor-default.md:18:...historical mention only, in the ADR's own decision prose...
```

### Gate Output

```
$ go vet ./internal/server/...
(clean)

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/server/...
ok  	github.com/Zalaras/muster/internal/server	107.911s
```

### Files Touched

- `internal/server/update_test.go` (only)

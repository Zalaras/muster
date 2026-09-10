# Daemon Tests: version-claude-interface

**Plan**: version-claude-interface
**Verdict**: pass

## Summary

Tests created/added: 62 top-level `func Test*` (many table-driven with further subtests) |
Passing: all | Failing: 0

Gates run from the repo root, all green:
- `go build ./...` — clean
- `go vet ./...` and `go vet -tags=canary ./test/canary/...` — clean
- `make test` (`go test -count=1 ./...`) — all packages `ok`
- `make lint` (`golangci-lint run`) — `0 issues.`
- `go run ./tools/versions check` — `versions: all fragments fresh` (my fixtures never touch the real tree; only `t.TempDir()` roots)
- D6 check (`grep` over `observed_versions.txt`) — still exactly the two plan-specified rows
- `MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v ./test/canary/...` — static tier + `TestSkipDecision` pass, harness/live tiers `SKIP` as expected (D18 shape)

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/version_test.go` | `TestParseObservedVersions_ValidRowsCommentsAndBlankLines` | comments/blanks skipped, rows parsed | pass |
| `internal/claudecode/version_test.go` | `TestParseObservedVersions_NoteMayContainSpaces` | note field keeps embedded spaces | pass |
| `internal/claudecode/version_test.go` | `TestParseObservedVersions_RejectsDuplicateVersion` | D7: duplicate version errors | pass |
| `internal/claudecode/version_test.go` | `TestParseObservedVersions_RejectsMalformedRow` (4 subtests) | D7: non-semver, missing date, missing note, bad date shape all error | pass |
| `internal/claudecode/version_test.go` | `TestParseObservedVersions_EmptyRecordErrors` | empty record is an error, not empty range | pass |
| `internal/claudecode/version_test.go` | `TestRangeOf_MinMaxIndependentOfRowOrder` (3 subtests) | D7/INV-6: ascending/descending/shuffled rows → same floor/ceiling | pass |
| `internal/claudecode/version_test.go` | `TestRangeOf_SingleRow_FloorEqualsVerified` | single-row record: floor == verified | pass |
| `internal/claudecode/version_test.go` | `TestRangeOf_EmptyRowsYieldsEmptyStrings` | empty input → empty strings, not a panic | pass |
| `internal/claudecode/version_test.go` | `TestRangeOf_ComparesNumericallyNotLexically` | `2.1.9` vs `2.1.267` sorts numerically | pass |
| `internal/claudecode/version_test.go` | `TestFloorAndVerified_MatchEmbeddedRecord` | D6: embedded file's floor/ceiling are 2.1.246/2.1.267 | pass |
| `internal/claudecode/version_test.go` | `TestObservedVersions_EmbeddedFileParsesWithoutPanicking` | embedded file is valid, exactly 2 rows | pass |
| `internal/claudecode/version_test.go` | `TestFormatRange` (2 subtests) | D27: distinct → en-dash range, equal → single version | pass |
| `internal/claudecode/version_test.go` | `TestClassifyAgainst` (11 subtests) | D8: unknown (empty/garbage), below, verified (floor/ceiling/intermediate/suffixed), above, suffixed-below | pass |
| `internal/claudecode/version_test.go` | `TestClassifyAgainst_SingleRowRange_EqualIsVerifiedNeighboursAreNot` | single-observed-version edge | pass |
| `internal/claudecode/version_test.go` | `TestClassify_UsesEmbeddedRecord` | `Classify` wires to the real embedded record | pass |
| `internal/claudecode/version_test.go` | `TestCheckVersion` (7 subtests) | D9: INV-1/INV-2 across missing binary, non-zero exit, unparseable output, below/at-floor/at-ceiling/above | pass |
| `internal/claudecode/version_test.go` | `writeVersionLeakStub` (fixed) | uses `Verified()` instead of removed `PinnedVersion` | pass |
| `cmd/musterd/preflight_test.go` | `TestRun_VersionFlagSucceedsWithTmuxAbsent` (extended) | D10: `-version` output contains "Claude Code verified " | pass |
| `cmd/musterd/main_test.go` | `TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel` (3 subtests) | D11: below/verified/above map to `ClaudeCodeInfo`, info-vs-warn level, "update Claude Code" wording | pass |
| `cmd/musterd/main_test.go` | `TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup` | D12/INV-3: missing binary → nil Installed, populated Floor/Verified, status unknown, no error surfaces | pass |
| `cmd/musterd/onexit_test.go` | stub script (fixed) | uses `claudecode.Verified()` instead of removed `PinnedVersion` | pass |
| `internal/server/ws_test.go` | `TestHandleWS_SendsHelloThenSnapshot` (updated) | protocol 2, `{installed,floor,verified,status}` shape | pass |
| `internal/server/ws_test.go` | `TestHandleWS_ClaudeCodeInstalledNullWhenVersionCheckFailed` (renamed/updated) | installed null, floor/verified populated on `unknown` | pass |
| `internal/server/ws_test.go` | `TestHandleWS_ClaudeCodeKeySetExactAndInstalledNullIffUnknown` (4 subtests) | D13: exact 4-key wire object + INV-1 across unknown/below/verified/above, off raw JSON bytes | pass |
| `internal/server/issue_test.go` | `TestClaudeCodeCell` (6 subtests) | D14: cell text for verified/above/below/unknown, plus single-version-range both branches | pass |
| `internal/server/issue_test.go` | `TestBuildIssueSnapshot_DashboardScope_KeySetExactly` (updated) | D4/D14: exact `claudeCode.{installed,floor,verified,status}` keys | pass |
| `internal/server/issue_test.go` | `TestBuildIssueSnapshot_SessionScope_KeySetMatchesAllowlistExactly` (updated) | same, session scope | pass |
| `internal/server/issue_test.go` | `TestRenderSnapshotMarkdown_SessionScope_RowOrderAndAllConditionalRowsPresent` (updated) | Claude Code row renders the protocol's own `above` example | pass |
| `internal/server/issue_test.go` | `TestRenderSnapshotMarkdown_UnknownRendering` (updated subtest) | installed nil ignores whatever status is set | pass |
| `internal/server/issue_test.go` | `TestRenderSnapshotMarkdown_SessionScope_FullyPopulated_MatchesExpectedFormat` (updated) | byte-exact full markdown incl. new Claude Code cell | pass |
| `internal/server/auth_test.go` | `TestHandleHealthz` (fixed fixture) | `ClaudeCodeInfo{Pinned:...}` → `{}` (compile fix, flagged by daemon-impl as unlisted) | pass |
| `tools/versions/main_test.go` | `TestCmdGen_FillsEveryFragmentInEveryListedFile` | D15: gen fills range/table/floor/verified fragments in all 3 files | pass |
| `tools/versions/main_test.go` | `TestCmdGen_TableSortedAscendingRegardlessOfRecordOrder` | D7/D15: unsorted record → ascending table | pass |
| `tools/versions/main_test.go` | `TestCmdCheck_ExitsNonZeroNamingOnlyTheStaleFile` | D15: check names exactly the stale file | pass |
| `tools/versions/main_test.go` | `TestCmdGenAndCheck_FailNamingAFileWithNoFragmentMarkerAtAll` | D15: markerless file fails both gen and check, named | pass |
| `tools/versions/main_test.go` | `TestCmdBump_OfflineEditsNothing` | D16: offline → no edits, `runCmd` never called | pass |
| `tools/versions/main_test.go` | `TestCmdBump_InsideRangeEditsNothing` | D16: inside-range install → no edits, no git call | pass |
| `tools/versions/main_test.go` | `TestCmdBump_AboveAppendsAndRegenerates` | D16: above → append, gen, `git status`+`git diff` calls, commit hint | pass |
| `tools/versions/main_test.go` | `TestCmdBump_BelowAppendsAndRegenerates` | D16: below → floor moves down | pass |
| `tools/versions/main_test.go` | `TestCmdBump_RefusesOnDirtyRecord` | D16: dirty `git status` on the record refuses, no edits | pass |
| `tools/versions/main_test.go` | `TestCmdBump_RefusesWhenGitFails` | D16: `git status` erroring refuses, no edits | pass |
| `tools/versions/main_test.go` | `TestCmdBump_RefusesWhenGitDiffFails` | second git call failing still surfaces an error | pass |
| `tools/versions/main_test.go` | `TestRun_WrongArgCountErrorsBeforeTouchingTheFilesystem` | CLI usage error, no filesystem touch | pass |
| `tools/versions/main_test.go` | `TestRun_NoGoModErrorsNamingTheRemedy` | `repoRoot()` failure names `go.mod` | pass |
| `tools/versions/main_test.go` | `TestRun_UnknownSubcommandErrors` | dispatch rejects an unknown subcommand | pass |
| `test/canary/skip_test.go` | `TestSkipDecision` (7 subtests) | D17: skip iff installed==verified with force/offline both unset | pass |
| `test/canary/skip_test.go` | `TestSkipDecision_ReasonNamesTheForceEnvVar` | printed reason names `MUSTER_CANARY_FORCE` | pass |

## Implementation Bugs

None. Every discrepancy found while writing tests was a test-fixture-only compile break
from the `Pinned`/`Drift` → `{installed,floor,verified,status}` field rename, exactly as
the daemon-impl handoff predicted and listed (plus the one unlisted fixture,
`internal/server/auth_test.go:119`, which daemon-impl's Handoff explicitly flagged as
required-but-unassigned — fixed here).

## Decisions / notes for the reviewer

- **`tools/versions` `cmdBump` has no injectable seam for the `claude` binary.** Per the
  plan's own Affected Files text, it calls `claudecode.InstalledVersion(ctx, "claude")`
  with the bare binary name — unlike `InstalledVersion` itself (which takes `bin` as a
  parameter) or `cmdBump`'s own `git` calls (which go through the injectable `runFunc`
  seam, docs/conventions.md §Testing), there is no way to make `cmdBump` observe a
  chosen "installed" version other than by controlling what `claude --version` resolves
  to on `$PATH`. To exercise D16's above/below/inside-range/dirty-record/git-failure
  branches without launching the real `claude` (CLAUDE.md hard rule) or depending on
  whatever Claude Code happens to be installed on the machine running the tests (which
  would make the classification-dependent tests non-deterministic across machines), I
  set `PATH` for the duration of each such test (`t.Setenv`) to a directory containing
  only a synthetic one-line `claude` stub script that echoes a chosen `--version` line —
  never the real binary. This is the one place these tests depart from "never a $PATH
  shim": the departure is scoped to a fake script standing in for a boundary the
  implementation itself did not expose as injectable, not a fork of a real system tool.
  Not filed as an implementation-bug verdict because the call shape matches the plan's
  own Affected Files text verbatim; flagging here in case the reviewer wants
  `cmdBump`/`InstalledVersion`'s bin threaded through as a follow-up for testability.
- `internal/server/auth_test.go:119`'s fixture fix (`ClaudeCodeInfo{Pinned: "2.1.233"}` →
  `ClaudeCodeInfo{}`) was not listed under daemon-tests in the plan's Affected Files, but
  daemon-impl's Handoff explicitly flagged it as required and unassigned. Fixed as part
  of this step; noting it here since it's a file the plan itself never named for either
  agent.
- Every new/updated fixture in `internal/server/issue_test.go` that needed a concrete
  `installed`/`status` pair uses the Protocol Contract's own worked example
  (`2.1.270 installed · verified 2.1.246–2.1.267 · above`) rather than an invented one, so
  the test doubles as a check that the daemon's rendering matches the documented example
  byte-for-byte.
- `tools/versions/main_test.go` never touches the real repo tree: every `cmdGen`/
  `cmdCheck`/`cmdBump` test builds its own `t.TempDir()` fixture root and calls the
  package's `root`-parameterized functions directly, bypassing `repoRoot()`/`run()`'s
  `os.Getwd()` — confirmed after the fact via `go run ./tools/versions check` still
  reporting the real tree's fragments fresh and `git status --porcelain` showing no
  incidental edits to `internal/claudecode/observed_versions.txt`, `README.md`,
  `spikes/canary-fields.md` or `docs/claude-code-versions.md`.

## Fix Attempt 1 (review cycle 1)

**Failure addressed**: review.md Major 3 (`[daemon-tests]`), blocked on daemon-impl's Major 2
(landed in commit `6e1df27`, which added a `claudeBin string` fifth parameter to `cmdBump`,
signature now `func cmdBump(ctx context.Context, root string, stdout io.Writer, runCmd
runFunc, claudeBin string) error`).

Removed `stubClaudeOnPath` (the `t.Setenv("PATH", dir)` shim) from
`tools/versions/main_test.go` entirely and replaced it with
`writeClaudeVersionStub(t, output string) string`, which writes the same fake `claude`
script under `t.TempDir()` but returns its absolute path instead of mutating `PATH` —
matching `cmd/musterd/onexit_test.go`'s `-claude-bin` stub pattern that the review cited as
precedent. All seven `TestCmdBump_*` call sites now pass a fifth `claudeBin` argument:
- The six tests that previously called `stubClaudeOnPath` (`TestCmdBump_InsideRangeEditsNothing`,
  `TestCmdBump_AboveAppendsAndRegenerates`, `TestCmdBump_BelowAppendsAndRegenerates`,
  `TestCmdBump_RefusesOnDirtyRecord`, `TestCmdBump_RefusesWhenGitFails`,
  `TestCmdBump_RefusesWhenGitDiffFails`) now call `writeClaudeVersionStub` and pass the
  returned path straight into `cmdBump`.
- `TestCmdBump_OfflineEditsNothing` never reaches `InstalledVersion` (offline short-circuits
  first), so per daemon-impl's handoff it passes a placeholder string
  (`"unused-placeholder-claude-bin"`) rather than building a stub it never invokes.

No assertions changed — only how the installed version is supplied, per the review's
instruction ("The assertions themselves are good and should not change").

`rg -n 'stubClaudeOnPath|t.Setenv\("PATH"' tools/versions/main_test.go` → no matches (was 7:
the helper definition plus its 6 call sites).

**Verification (this cycle)**:
- `go build ./...` → exit 0.
- `make test` → all packages pass, including `tools/versions` (18.807s).
- `make lint` → `0 issues.`
- `go test ./tools/versions/... -run 'TestCmdBump_' -v` → all 7 subtests PASS individually
  (pasted below), confirming the six rebuilt tests still exercise D16's branches through the
  new seam.

```
$ go build ./...

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	22.127s
ok  	github.com/Zalaras/muster/internal/claudecode	23.412s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	3.191s
ok  	github.com/Zalaras/muster/internal/gitutil	3.314s
ok  	github.com/Zalaras/muster/internal/locate	1.699s
ok  	github.com/Zalaras/muster/internal/server	27.744s
ok  	github.com/Zalaras/muster/internal/session	6.733s
ok  	github.com/Zalaras/muster/internal/store	6.313s
ok  	github.com/Zalaras/muster/internal/termbridge	7.518s
ok  	github.com/Zalaras/muster/internal/tmux	16.552s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.353s
ok  	github.com/Zalaras/muster/internal/usage	8.313s
ok  	github.com/Zalaras/muster/internal/webui	7.804s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/versions	18.807s

$ make lint
golangci-lint run
0 issues.

$ go test ./tools/versions/... -run 'TestCmdBump_' -v
=== RUN   TestCmdBump_OfflineEditsNothing
--- PASS: TestCmdBump_OfflineEditsNothing (0.00s)
=== RUN   TestCmdBump_InsideRangeEditsNothing
--- PASS: TestCmdBump_InsideRangeEditsNothing (0.27s)
=== RUN   TestCmdBump_AboveAppendsAndRegenerates
--- PASS: TestCmdBump_AboveAppendsAndRegenerates (0.27s)
=== RUN   TestCmdBump_BelowAppendsAndRegenerates
--- PASS: TestCmdBump_BelowAppendsAndRegenerates (0.27s)
=== RUN   TestCmdBump_RefusesOnDirtyRecord
--- PASS: TestCmdBump_RefusesOnDirtyRecord (0.29s)
=== RUN   TestCmdBump_RefusesWhenGitFails
--- PASS: TestCmdBump_RefusesWhenGitFails (0.29s)
=== RUN   TestCmdBump_RefusesWhenGitDiffFails
--- PASS: TestCmdBump_RefusesWhenGitDiffFails (0.27s)
PASS
ok  	github.com/Zalaras/muster/tools/versions	1.993s
```

## Test Run Output

```
$ go build ./...
(clean)

$ go vet ./... && go vet -tags=canary ./test/canary/...
(clean)

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	14.867s
ok  	github.com/Zalaras/muster/internal/claudecode	14.111s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	3.108s
ok  	github.com/Zalaras/muster/internal/gitutil	1.742s
ok  	github.com/Zalaras/muster/internal/locate	2.296s
ok  	github.com/Zalaras/muster/internal/server	21.505s
ok  	github.com/Zalaras/muster/internal/session	4.086s
ok  	github.com/Zalaras/muster/internal/store	3.788s
ok  	github.com/Zalaras/muster/internal/termbridge	5.137s
ok  	github.com/Zalaras/muster/internal/tmux	12.187s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	4.581s
ok  	github.com/Zalaras/muster/internal/usage	5.259s
ok  	github.com/Zalaras/muster/internal/webui	4.008s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/versions	9.559s

$ make lint
golangci-lint run
0 issues.

$ go run ./tools/versions check
versions: all fragments fresh

$ MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v ./test/canary/...
=== RUN   TestInstalledVersionClassifies
    canary_test.go:54: installed 2.1.267, verified range 2.1.246–2.1.267, classified verified
--- PASS: TestInstalledVersionClassifies (0.03s)
[...harness/live tiers SKIP as expected...]
=== RUN   TestSkipDecision
--- PASS: TestSkipDecision (0.00s)
    [7/7 subtests pass]
=== RUN   TestSkipDecision_ReasonNamesTheForceEnvVar
--- PASS: TestSkipDecision_ReasonNamesTheForceEnvVar (0.00s)
=== RUN   TestInstalledBinaryCarriesInterfaceStrings
--- PASS: TestInstalledBinaryCarriesInterfaceStrings (0.16s)
PASS
ok  	github.com/Zalaras/muster/test/canary	0.852s
```

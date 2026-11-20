# Correctness review: diff-viewer

**Plan**: diff-viewer
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 66389 words (budget 30000)

Delta re-review: the change under review is `git diff 32d3eb69..HEAD` (`d3ead8a0` … `5739c92f`). The gate run is `gates-diff-viewer-c2` (every line) and `gates-diff-viewer-c2b` (= `$GATES_LOG_DIR`, the re-run of the red line plus the two warn lines). No gate was re-run by this reviewer.

## Requirements

Only the rows that changed this cycle, or whose evidence changed, are restated. REQ-1 to REQ-23 and REQ-28 stand as in cycle 1; their tests are green in this cycle's gate.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-24 no comment in an issue snapshot, nothing logged | Yes | D10: `TestBuildIssueSnapshot_CarriesNoReviewText` (`internal/server/diffreview_test.go:271`). It checks the snapshot JSON and markdown for the comment body, quoted line and tick, and checks that no key path names review, comments or ticks | pass |
| REQ-25 reading never writes the repository | Yes. `trackedFiles` runs both porcelain `diff` calls against a scratch copy of the index (`GIT_INDEX_FILE`, original mtime kept), `internal/gitdiff/tracked.go:47–94`. Every other reader call is `rev-parse` / `merge-base` / `symbolic-ref` / `ls-files`, none of which write | D3: `TestRead_NeverWritesTheRepository` now ages the index 10 s and sets `a.txt`'s mtime explicitly, in 3 rows. `daemon-tests.md` records 6/6 failures on the pre-fix tree and passes at HEAD. Green in `c2/22-D1.log` and `c2/23-D4.log` | pass |
| REQ-26 never cut off | Yes | D7: `TestRead_TrackedFileOverThreeThousandLinesIsListedWhole` (3,500 lines; counts and every hunk line) | pass |
| REQ-27 counts only for the focused session, in Focus, not while hidden | Yes | W4: `web/src/features/diff.test.ts`. No `diff/summary` request while `document.hidden`, one on `visibilitychange` back to visible, a 5 s cadence while visible, none in grid or with no focused session | pass |
| DIAG | `kb:diagram/store-schema` (0021 `diff_review` column, range 0001–0021), `kb:diagram/domain-model` (Session gains the diff review line), `kb:diagram/daemon-components` (`internal/gitdiff` adapter, `server → gitdiff`, `gitdiff → gitutil`, gitutil described as "the one lock-free git runner") | — | pass. All three now match what shipped. The gitutil description is true of `gitutil.Exec` |

## Build & Tests

E2E tests: pass (336, scoped to 30 files, `c2/21-e2e.log`) · Render tests: pass (550, `c2/08-render-test.log`) · Daemon tests (race): pass (28 packages ok, `c2/23-D4.log`) · Web tests: pass (3373 in 119 files, `c2/05-web-test.log`) · Daemon build: pass (`c2/01-build.log` empty) · Web build: pass · Lint: pass (0 issues) · Render fixtures: **FAIL** (`c2/06-render-fixtures.log` and `c2b/01-render-fixtures.log`, Critical 1) — all read from the gate run. `WARN size` and the e2e-level census are review-maintainability's to read.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (`c2/22-D1.log`) |
| D2 | `go build ./...` | pass (`c2/01-build.log`) |
| D3 | `make lint` | pass (`c2/03-lint.log`, 0 issues) |
| D4 | `make test-race` | pass (`c2/23-D4.log`) |
| D5 | `make check-render-fixtures` | **FAIL**, red in both runs. In `c2`: stale `moved-to-worktree-compact`, `-expanded`, `focus-header-short`, `added-dirs-two`. In `c2b`: stale `moved-to-worktree`. This is the gate rig's own intermittent fault, which `main` fixed after this branch forked (Critical 1) |
| W1 | `make web-build` | pass (`c2/04-web-build.log`) |
| W2 | `make web-test` | pass (3373) |
| W3 | `make web-lint` | pass |
| R1 | `make render-test` | pass (550) |
| E1 | `make e2e` | pass (scoped, 336) |
| K1 | `make check-kb` | pass (717 records, 0 problems) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**: `TODO.md:63` "Code diff viewing" is still `- [ ]` and has not moved to `docs/history/todo-done.md`. Everything else passes. The diagrams are applied, and both `deviation:` arrows name their `proposed` ADRs (`kb:adr/process-render-fixtures-record-diff-opt-in`, `kb:adr/process-render-harness-diff-writes-default-404`). `kb:adr/diff-read-only-git-cli` has one `supersedes`, its `files`/`tests` filled in, and a decision that states the scratch-index mechanism. The daemon log's new `doc-delta:` line ("no byte under the git directory changes and no lock is taken") is REQ-25, which the plan's diff Doc Delta already promotes, and the spec cites the ADR that carries the mechanism. The Doc Delta's REQ-25 claim is now true of the code. `**Touches**` gained `launch`, and that is right: gitutil's runner change reaches launch's git calls without changing any launch behaviour that spec describes |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | no `any` in this cycle's web source changes (`diffshape.ts`, `diffmodel.ts`, `diffcomments.ts` and the rest). Test files cast `as never` only |
| V2 | no innerHTML with interpolated text | pass | the delta adds none. `writeText` is replaced by `dom.setText` |
| V3 | no diff, file or comment text to a logger | pass | the delta adds no log call. `diffreview.go` changes only the context |
| V4 | every git invocation carries a timeout and `WaitDelay` | pass | every reader call goes through `gitutil.Exec` (`internal/gitutil/gitutil.go:193`): `context.WithTimeout(30 s)` and `cmd.WaitDelay = 2 s`. The `rev-parse --git-path index` call that fetches the scratch index takes the same path |
| V5 | viewer matches the prototype | structure unchanged from cycle 1. Split's layout fix is review-browser's to measure | |
| V6 | size row: button flush right, note at left | pass (no change this cycle) | |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The delta adds no Claude Code field names |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass. No hook path touched |
| 4 | Bare tmux | pass. The delta adds no tmux invocation |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass. No branch in the delta renders `0`/empty for absent data |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass. Extra env travels only as `GIT_INDEX_FILE` through `gitutil.WithEnv` |
| 9 | Real `claude` outside canary | pass |

## Delta

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Critical 1 `[daemon-impl]` `internal/gitdiff/tracked.go:trackedFiles:porcelain-diff-refreshes-index` | resolved | `d3ead8a0` | Diff read. `trackedFiles` copies the index at `rev-parse --git-path index` (so linked worktrees work), keeps its mtime so racy-clean reads stay the same, and points `GIT_INDEX_FILE` at the copy for both `--raw` and `--patch`. A refresh lands on the copy, which is removed afterwards. Summary and both scopes all reach `trackedFiles`, and `allFilesAdded` (the no-HEAD path) runs only `ls-files`. The raw/patch pairing is unchanged, so a stat-only change yields no raw entry and no fingerprint move. Measured edge case: in a `core.splitIndex` repo with a touched unchanged file, `GIT_INDEX_FILE=<copy> git --no-optional-locks diff -M HEAD --raw -z` exits 0, `.git/index` has the same sha before and after (`8e20602f…`), and no new `sharedindex.*` file appears. The fix also turned gitutil's `runGit` into the shared lock-free `Exec`, which was maintainability Major 1. That change gives gitutil's other callers (launch, reporefresh, reader, browse) `--no-optional-locks`, `-c core.quotepath=off`, `GIT_OPTIONAL_LOCKS=0` and a 30 s cap. Their outputs are unaffected: `rev-parse --show-toplevel`, `--abbrev-ref` and `ls-files -z` are not quotepath-sensitive |
| Major 1 `[daemon-tests]` `internal/gitdiff/gitdiff_test.go:TestRead_NeverWritesTheRepository:nondeterministic` | resolved | `2469c313` | Diff read. 3 rows, index aged −10 s, `a.txt` mtimes set to +2 s, −1 h and +3 s (the last beside a real change and an untracked file). It no longer depends on a second boundary. `daemon-tests.md` § Notes now states the real cause, and the "probe saw none" sentence is gone |
| Major 2 `[daemon-tests]` `internal/gitdiff+internal/server:D7-D10:untested` | resolved | `2469c313` | D7: 3,500 changed lines; additions, deletions and the hunk line total = 7,000. It fails if a tracked file were capped. D10: sentinel comment body, quote and tick are absent from snapshot JSON and markdown, and no key path names review/comments/ticks. It fails if `buildIssueSnapshot` carried `DiffReview` |
| Major 3 `[web-tests]` `web/src/features/diff.ts:polling:hidden-pause-untested` | resolved | `f197d2bb` | Diff read. `document.hidden` is stubbed, 20 s of fake timers pass with no `fetchDiffSummary` call, then `visibilitychange` back to visible gives exactly one call with the focused id |
| Major 4 `[orchestrator]` `docs/diagrams:store-schema+domain-model+daemon-components:stale` | resolved | `47cb710b` | All three fences read against what shipped (DIAG row) |
| Major 5 `[orchestrator]` `plans/diff-viewer:deviation-arrows:pending` | resolved | `6fdda6f2`, `47cb710b` | Both arrows name existing `proposed` ADRs with `refs: [plan:diff-viewer]` (`kb ls --feature diff --status proposed`) |

## Issues

### Critical
1. **[orchestrator]** Gate line D5 `make check-render-fixtures` is red. The cause is a rig flake that `main` has fixed but this branch does not carry, not this plan's code. The renderfix rig generates all 125 scenarios at once. In it, `renderRig.repoTick` (`internal/server/renderfix.go:448`) is a single `repoRefresh.tick`. When a scenario's git reads overrun `repoReadTimeout` (5 s) under that load, `readRepoState` returns `ok=false` and the reading is silently dropped. The fixture then records `claudeLocation: null`, or an added directory without its repo. Reproduced in a `git archive HEAD` copy under the scratchpad (not the worktree). In 1 of 10 `renderfix gen` runs (load average ~40–55, single git execs up to 732 ms), `moved-to-worktree-expanded.json` came out as:
   ```
   <                 "claudeLocation": {
   <                     "directory": "/home/bob/projects/epsilon/.claude/worktrees/rail-polish",
   <                     "repo": { "branch": "plan/rail-polish", "isWorktree": true, "name": "rail-polish" }
   ---
   >                 "claudeLocation": null,
   ```
   `main` fixed exactly this in `fc7599f4` (2026-11-20 08:10, after this branch's merge base `10d57f78`). Its `repoTick` retries a reading that did not finish, up to `renderRepoReadAttempts = 5`, with the comment "every scenario runs at once, so git can stall past repoReadTimeout". `git log -S renderRepoReadAttempts 10d57f78..HEAD` is empty, and `git diff main...HEAD -- internal/server/renderfix.go` does not touch `repoTick`, so this plan neither caused nor removed the retry. This also explains the orchestrator's measurements: intermittent here, 12/12 on `main`, and a clean `gen` afterwards. The fixtures are right, so no pipeline agent can fix this by regenerating them. A fix must make D5 pass deterministically on this branch. Bringing `main` (with `fc7599f4`) into `plan/diff-viewer` and re-running the gate does that, without porting the retry by hand and creating a second copy to conflict at `/land`.
   id: internal/server/renderfix.go:renderRig.repoTick:branch lacks main's retry | confidence: 85

### Major

### Minor

### Notes
1. **[note]** The gitutil runner change in `d3ead8a0` widens the blast radius beyond the diff reader: launch, the repo poll, the docs reader and browse now run git lock-free with a 30 s cap. Their outputs are unaffected (see the Delta row). The change is listed here so the completion summary carries it, and `**Touches**` now includes `launch` accordingly.
2. **[note]** The plan has no Critical or Major on files outside this delta. Prior Minors (ADR frontmatter, `TODO.md` tick) are the orchestrator's to verify. The ADR one is fixed. The `TODO.md` one is the DOC row above.

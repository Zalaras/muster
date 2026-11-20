# Review: diff-viewer

**Plan**: diff-viewer
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: diff-viewer

**Plan**: diff-viewer
**Part verdict**: needs-changes
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

## Browser review

# Browser review: diff-viewer

**Plan**: diff-viewer
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 14037 words (budget 30000)
**Rig**: `make web-build build` at 5739c92f (`bin/musterd` v0.30.4-38-g5739c92f, clean tree); per-test scratch daemons from `web/e2e/helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-*` (contains a space), tmux socket `<data dir>/tmux.sock` (killed by the fixture teardown), the shared E2E stub `claude`; headless Chromium 1280×720 (and 900×600), driven by a throwaway spec `web/e2e/zz-browser-review.spec.ts`, now deleted. Real git checkouts built with the committed helpers (`standardRepo`, `tickRepo`, `commentRepo`, plus a 200/400/1000-change file built the same way). Gates log `gates-diff-viewer-c2b`: `render-fixtures` red (stale `web/render/fixtures/moved-to-worktree.json`, which this branch does not touch; see Note 2), `size` and `e2e-level` warnings only. The app I drove is the one built from this tree.

## Delta

| Prior issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Critical 1: Split laid file sections side by side | 87f88bdc (`dv-files dv-view-<view>`) | Split on `standardRepo` plus a ~190-character line, measured at 1280×720 and 900×600 | **fixed**. `.dv-files` class `dv-files dv-view-split`, display `block`. Five sections all at left 300, tops 131/206/325/573/673 (stacked, no overlap). Every `.dv-srow` is 700 px wide (= the scroll body). Cells are 350/350, the shortest row is 18.4 px (Unified 18.4), and the long line is 110.6 px. At 900×600: body 320, cells 160/160, rows 320, no page scroll (scrollHeight 600 = innerHeight) |
| Major 1: change map clipped marks past ~105 | 87f88bdc (`.dv-map` overflow-y auto, no gap, `min-height: 0`, 1 px separator border) | real repos with 200, 400 and 1000 changes, Review, 1280×720 | **fixed up to ~530 changes, not beyond**. 200 and 400: all marks inside the box (scrollHeight 532 = clientHeight), and a pointer click on mark 200/400 at its own centre hits it (`elementFromPoint` = `Go to change 400`) and makes change 399 current. 1000: see browser Major 1 |
| Major 2: a change reached by `j`/`k`/map never folded on tick | 87f88bdc (`applyTicks` clears `reopened`) | `tickRepo`, Review: keyboard and pointer | **fixed**. `j j x`: `1 / 3`, folded 1. Clicking the folded row reopens it (folded 0, still 1/3). Map click on change 3, then a pointer click on its tick: `2 / 3`, folded 1. After 1.5 s it is unchanged and the oracle `/diff/review` holds 2 ticks. Reset, then `k k k x j x j x`: `3 / 3`, folded 3, oracle 3. After a reload: 3/3, folded 3 |
| Major 3: R9/R25 could not catch a squashed Split | a1a922ed | read `web/render/diff.spec.ts` R9 "stacks the file sections…" and R25 "a long line wraps…" | **fixed**. R9 now asserts one shared left edge, ordered non-overlapping tops, row width ≥ scroll body − 40 and each cell > half − 60 at four widths. Each assertion fails against cycle 1's 128 px columns. R25 now uses a 110-character line and asserts ≤ 3 line heights and a cell > 300 px |

## Matrix

Only the cells whose surface `git diff 32d3eb69..HEAD` touches: `render/diffbody` (Split class, heads, folded row), `style.css` (`.dv-map`/`.dv-mark`), `diffreviewui` (ticks, fold, post chain), `diffchrome` (toolbar `aria-pressed`), `diffcomments` (write tracking, upsert), `diffside` (Files row), `diffbutton` (count text). Hosts: **focus**, **tiles**, pop-out. States: **data**, **daemon-down**. No-data cells are untouched by the delta.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-12 | focus | data | Split: old left, new right, sections stacked, readable | pass | see Delta, Critical 1 |
| REQ-12 | focus | data (900×600) | Split contained, no page scroll | pass | rows 320 = body, cells 160/160, viewer 300–900 × 126–574, page 600 = innerHeight |
| REQ-15 | focus | data | every tick folds (key, tick button, after map/`j`) | pass | see Delta, Major 2 |
| REQ-15 | focus | data | settled after a render pass and reload, oracle agrees | pass | 1.5 s later the counts are unchanged, `/diff/review` ticks = progress (2, then 3), reload 3/3 folded 3 |
| REQ-16 | focus | data (200, 400) | one mark per change inside the map, reachable by pointer | pass | 200: marks 2.6 px, 0 outside the 162–694 box. 400: 1.3 px, 0 outside. Pointer click on the last mark → change 199 / 399 current, top 628 within scroll 162–694 |
| REQ-16 | focus | data (200, 400) | mark state shown | pass | after `x`: `reviewed` 1, `unreviewed` 199 / 399 |
| REQ-16 | focus | data (1000) | one visible, reachable mark per change inside the box | **FAIL** | marks 1 px, all border; scrollHeight 1008 > clientHeight 532; 472 marks outside the box; map painted blank (Major 1) |
| REQ-10 | focus | data | only segment and tab buttons carry `aria-pressed` | pass | `Uncommitted=true Branch=false Unified=true Split=false Review=false Files=true Comments (0)=false`; Reset, Refresh, ×, Edit, Resolve carry none |
| REQ-3/9 | focus | data | counts text unchanged by `signedCounts` | pass | button `1 file +8 −0 · View diff ›`, summary `1 file · +8 −0 · against HEAD (bb9a251)` (U+2212) |
| REQ-11/19 | focus | data | Files row: path, counts, open-comment count | pass | `review.txt +8 −0 💬 1` with 1 open and 1 resolved comment |
| REQ-17/18 | focus | data | a save followed straight away by Refresh leaves no duplicate card | pass | two saves, the second followed by Refresh: 2 cards (`Line 4`, `Line 7`), oracle 2 comments, `Comments (2)` |
| REQ-18/19 | focus | data | Resolve then Refresh keeps the resolve | pass | `Comments (1)`, 1 `✓ Resolved` row, oracle `[4,true],[7,false]`, button `… · 💬 1 · Close diff ×` |
| REQ-28/EC21 | focus | daemon-down | tick write fails visibly; the change stays folded | pass | banner `musterd unreachable — …` 0–1280 × 46–78 display block; tools `1 / 1 changes reviewed Reset Not saved, musterd unreachable`, folded 1 |
| REQ-28 | focus | daemon-down → back | the tick chain posts again after a failed post | pass | after `daemon.restart()`, `x` posted. `Not saved` cleared, progress 0/1 = oracle 0 ticks (`x` toggles, browser Note 2 of cycle 1) |
| REQ-23 | tiles | data | no diff button, size row hidden | pass | 0 buttons, `#sizerow` display none |
| REQ-2..21 | tiles | — | viewer surfaces | N/A — plan § Views: Tiles has no way into the diff | |
| all | pop-out | — | — | N/A — there is no `/doc.html` host for the viewer (plan § Views) | |
| §6/§7 | focus/tiles | all | honesty and terminal rules | pass | no cost and no "Done"; daemon-down banner shown; nothing in the delta touches the terminal |

## Issues

### Critical

### Major
### Minor

### Notes
1. **[note]** The R16 render test ("with 200 changes every mark lies inside the map…") cannot see Major 1: at 200 a mark is still 2.6 px. A test at a count above the box height in pixels (for example 1000 at 720 px) is where the defect shows. This is not filed as `[e2e-specs]` because the fix's shape decides what the test should assert.
2. **[note]** The gate's red `render-fixtures` line names `web/render/fixtures/moved-to-worktree.json`. The fixture was last committed in 31fd7095 on main, before this branch, and this branch does not touch it. Whether the branch's `internal/gitutil` change altered that fixture's generated output is `review-work`'s to say. The app I drove was built from this tree, so the red line does not change what was measured.
3. **[note]** Outside the delta: the cycle 1 notes (button counts keep no age while daemon-down; `x`/`Shift+X` toggle; `#mainhead .ended-at` `[hidden]` leak) were not re-measured. No-data cells and light theme were not re-measured either: neither the cycle's diff of `style.css` (only `.dv-map`/`.dv-mark`) nor any loading path touches them.
4. **[note]** In Split at 900×600 the side panel leaves the diff body 320 px, so each column is 160 px and the ~190-character line wraps to 331 px. That is the layout working as designed at a narrow width, not a regression. It is recorded in case the developer wants Split to fall back to Unified below some width.

## Maintainability review

# Maintainability review: diff-viewer

**Plan**: diff-viewer
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 19913 words (budget 30000)
**Scope**: delta, 21 non-test files from `git diff 32d3eb69..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Delta

| Prior issue | Fix commit | Verified how |
|---|---|---|
| Major 1: `internal/gitdiff` had a second git runner and copied the `ls-files` and `rev-parse --show-toplevel` argv | d3ead8a0 | Fixed. `rg -n 'rev-parse.*--show-toplevel\|"ls-files"\|func runGit\|func Exec\|splitNul' internal cmd --glob '!*_test.go'` finds `gitutil.go:61` (show-toplevel), `gitutil.go:175` (the one `ls-files` argv, `-co`/`-o` passed as `which`) and `gitutil.go:193 func Exec`. `gitdiff` has no runner, no argv and no `splitNul` of its own. The only other `ls-files` hits are in `internal/commentpass`, a dev tool that was already exempt in cycle 1. `ErrNotRepo` survives as `gitutil.ErrNotRepo` (exit 128 → `Root`, `gitutil.go:64`), and `gitdiff.ErrNotRepo` re-exports it. The lock-free env, the timeout and WaitDelay now sit in the one runner. The shape the fix chose has its own Minor, Minor 1 below. |
| Major 2: `writeText` was a copy of `dom.setText` | 87f88bdc | Fixed. `rg -n writeText web/src` returns nothing. `features/diff.ts`, `diffcomments.ts`, `diffreviewui.ts` and `diffviewer.ts` import `setText` from `../dom`. |
| Major 3: `render/` imported from `features/` | 87f88bdc | Fixed. `rg -n 'from "\.\./features/' web/src/render` returns only the pre-existing test files `masthead.test.ts:22` and `update.test.ts:22`, none of them diff code. The shapes moved to the new `render/diffshape.ts`. `entryLine` is gone: `Entry.line` and `Entry.sign` are computed in `features/diffmodel.ts flatten` (l.43–44), and `Change.counts`, `FileModel.path` and `FileModel.counts` are computed in `closeChange`/`buildFileModel`. The builders read those fields. The new module has a `design:` line naming `render/reader.ts` as precedent. render → `api/` type imports have precedent on main (`render/launch.ts:8`, `render/update.ts:12`). |

Prior Minors 1–7 are the orchestrator's to verify. In passing: Minor 1 (`context.WithoutCancel` at `diffreview.go:69/81/102`), Minor 2 (the `design: size:` line for `restoreChangedFields`, whose reason holds), Minor 5 (the `FocusDeps.diff`/ResizeObserver `design:` line) and Minor 7 (the `.dv-btn` `design:` line, whose reason, the accepted look and amber meaning only Needs-Input, holds) all read as addressed. Minor 6 is addressed for comments and tick order. One new tick interleaving remains in the new `applyReview`, filed as Minor 3 below.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/gitdiff/gitdiff.go | gitutil.go, tracked.go, untracked.go | yes (fix attempt 1 "one git runner") | none | Minor 1 |
| internal/gitdiff/tracked.go | gitutil.go, internal/atomicfile/atomicfile.go | yes (fix log names the scratch index) | none | pass |
| internal/gitdiff/untracked.go | gitutil.go | yes | none | pass |
| internal/gitutil/gitutil.go | gitdiff.go, reader/reader.go (its consumer), claudecode/modelcheck.go (seam comment) | yes | none | Minor 1, Minor 2 |
| internal/server/diffreview.go | note.go, rename.go, effort.go | n/a (context rule now matches siblings) | none | pass |
| web/src/features/diff.ts | dom.ts | n/a | none | pass |
| web/src/features/diffbutton.ts | diffmodel.ts | n/a | none | note 2 |
| web/src/features/diffcomments.ts | diffviewerstate.ts, diffviewer.ts | yes (Minor 6 fix) | none | pass |
| web/src/features/diffmodel.ts | diffbutton.ts, render/diffshape.ts | yes | none | note 2 |
| web/src/features/diffplace.ts | diffcomments.ts | n/a | none | pass |
| web/src/features/diffreviewui.ts | diffviewerstate.ts, diffviewer.ts | yes (`flushing` chain) | none | pass |
| web/src/features/diffviewer.ts | diffreviewui.ts, diffcomments.ts | yes | none | Minor 3 |
| web/src/features/diffviewerstate.ts | notespanelstate.ts | yes (writers named per field) | none | pass |
| web/src/features/diffwords.ts | render/diffshape.ts | n/a | none | pass |
| web/src/render/diffbody.ts | diffrows.ts, diffside.ts | n/a | none | Minor 4 |
| web/src/render/diffchrome.ts | diffrows.ts, diffcomment.ts | n/a | none | pass |
| web/src/render/diffcomment.ts | diffrows.ts | n/a | none | Minor 4 |
| web/src/render/diffrows.ts | dom.ts, diffchrome.ts, diffcomment.ts | n/a | none | Minor 4 |
| web/src/render/diffshape.ts | render/reader.ts (precedent), launch.ts | yes | none | pass |
| web/src/render/diffside.ts | diffbody.ts, diffrows.ts | n/a | none | Minor 4 |
| web/src/style.css | `.dv-map` block | n/a (layout fix) | none | pass |

Size: the gates' size log (`02-size.log`) shows no new hit on a delta file. `restoreChangedFields` (61 > 60) now has a reason that holds. `gitdiff`/`gitutil` files are 89–245 lines.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** Extra env reaches the runner as a context value: `gitutil.WithEnv` (`internal/gitutil/gitutil.go:44`) stores it, and `Exec` reads `ctx.Value(envKey{})` (`:199`). It is the only `context.WithValue` in the daemon:
   ```
   $ rg -n 'context.WithValue|ctx.Value\(' internal --glob '!*_test.go'
   internal/gitutil/gitutil.go:45:	return context.WithValue(ctx, envKey{}, env)
   internal/gitutil/gitutil.go:199:	extra, _ := ctx.Value(envKey{}).([]string)
   ```
   The `design:` line's reason is "so the existing `run` seam signature, and both packages' tests, stay as they are". That reason concerns test churn, not the code. It also undercuts the seam's purpose (conventions § Design: "seams where a test needs one", § Testing's run-func seam). `RunFunc` no longer carries everything a call depends on, so a fake runner cannot see that `trackedFiles` points git at a scratch index (`tracked.go:92`). Only the real-git test can see it. Conventions § Design "Match the siblings": no other adapter seam (`claudecode` execFunc, `tmux` preflighter, `locate.SpotlightFinder.run`) carries an input outside its signature. After the fix, a git call's environment is visible at the seam a test fakes, or the `design:` line gives a reason that is about the code.
   id: internal/gitutil/gitutil.go:WithEnv:env passed as context value | confidence: 70

2. **[daemon-impl]** `gitutil` now has two public surfaces for one runner. The fix added the only two type aliases in the daemon:
   ```
   $ rg -n '^type \w+ = ' internal cmd --glob '!*_test.go'
   internal/gitdiff/gitdiff.go:75:type runFunc = gitutil.RunFunc
   internal/gitutil/gitutil.go:36:type Git = gitRunner
   ```
   `Git` is an exported alias of the unexported `gitRunner`, which has two constructors (`NewGit(run)` at `:48`, `newGitRunner()` at `:52`). Its methods are a mix of exported and unexported names, and one query now has three names: the package func `ListFiles` (`:166`), the method `ListFiles` (`:80`), and `listFiles` (`:170`), which calls `files` (`:174`). `Root` (`:60`) and `topLevel` (`:120`) are the same pairing. `gitdiff.Reader` wraps its `run` in a fresh `gitutil.NewGit(r.run)` at four call sites (`gitdiff.go:86,94`, `untracked.go:15,23`). The `runFunc` alias at `gitdiff.go:75` is named by no test (`rg runFunc internal/gitdiff/*_test.go` is empty). Conventions § Design: "One owner per concept" and "Match the siblings". A newcomer sees no other aliased adapter type in the tree. After the fix, `gitutil` has one named type for its runner and one name per query, and `gitdiff` reaches it without an alias.
   id: internal/gitutil/gitutil.go:Git:alias and doubled surface | confidence: 70

3. **[web-impl]** `applyReview` (`web/src/features/diffviewer.ts:118–127`) can revert a tick made while a load is in flight. That is the tick half of the guard the comment half now has. Interleaving: on Refresh with the same scope, the old body stays shown (`load` only clears it on a scope change, `:133`). `load` awaits `flushPending` (`:138`) and then sends `fetchDiff` and `fetchDiffReview` together (`:140`). The daemon serves the review read first, and the diff read, which runs git, is still going. The developer presses `x`: `applyTicks` adds the key to `s.ticks` and `s.pendingAdd`, and `flush` posts it right away (`diffreviewui.ts:109`, the chain is empty). The post succeeds and removes the key from `pendingAdd` (`:101`). Then `Promise.all` resolves, and `applyReview` sets `s.ticks` to the review read, which predates the post and lacks the key. The pending overlay is empty by then. The change shows unticked, and progress drops by one, until the next load, though the daemon holds the tick. Comments are protected against the same window by `commentWrites.started` (`:122`). Ticks are not. Conventions § Design: "Shared state names its writers and its guard". `diffviewerstate.ts:50` names the load as a writer of `ticks` but no guard for this case. After the fix, a tick or untick made after a load's review read was sent is not undone when that read lands.
   id: web/src/features/diffviewer.ts:applyReview:tick during load reverted | confidence: 70

4. **[web-impl]** The fix for cycle-1 Minor 3 added a shared `button(text, className)` builder (`web/src/render/diffrows.ts:3`). Eight diff builders in delta-touched files still spell out its body, `el("button", …)` followed by `.type = "button"`:
   ```
   $ rg -n -A1 'el\("button"' web/src/render
   web/src/render/diffbody.ts:41   fold      web/src/render/diffbody.ts:139  tick
   web/src/render/diffbody.ts:150  folded    web/src/render/diffcomment.ts:82 row
   web/src/render/diffrows.ts:45   plus      web/src/render/diffside.ts:15   jump
   web/src/render/diffside.ts:42   node      web/src/render/diffside.ts:54   mark
   ```
   (each followed by `<name>.type = "button";`). `diffrows.ts:45 plusButton` is in the same file as the builder. `diffbody.ts:150` was edited in this delta. Conventions § Design: "Reuse before add ... reused or generalised, never copied". After the fix, every diff `<button>` is made through the one builder.
   id: web/src/render/diffrows.ts:button:builder bypassed at eight sites | confidence: 80

### Notes

1. **[note]** For `review-work` (doc truth in a code comment): the `gitRunner` doc comment (`internal/gitutil/gitutil.go:18–29`) still says "production always runGit". `runGit` is now `Exec`. It also says "none of gitutil's functions carry any per-call config beyond ctx and dir", but `WithEnv` now carries env in ctx.
2. **[note]** `features/diffmodel.ts:3` imports `MINUS` and `signedCounts` from `features/diffbutton.ts`, which now owns all of the viewer's composed counts and summary text. Cycle-1 note 8 said the module name undersells it. That is now more visible, because the file model depends on a "button" module.
3. **[note]** For `review-work`: the gates' `render-fixtures` line failed on `web/render/fixtures/moved-to-worktree.json` being stale (`01-render-fixtures.log`).
4. **[note]** `kb:diagram/daemon-components` now draws `internal/gitdiff` and the `gitdiff → gitutil` edge (l.64–65, 117), so cycle-1 note 1 is resolved.
5. **[note]** `scratchIndex` (`internal/gitdiff/tracked.go:47`) copies a file with `ReadFile`/`WriteFile`/`Chtimes`. `rg 'func copyFile|io\.Copy\(' internal` finds no existing copy helper (`internal/atomicfile` only replaces by rename), so this is not a duplicate.

## Below threshold

_Confidence under review-scale.md's bar; not routed. The orchestrator carries each to proposed-backlog.md._

- browser Major: 1. **[web-impl]** The change map still fails above about 530 changes (cycle 1's Major 1, fixed only up to that count). `.dv-mark` is `flex: 1 1 0; min-height: 0` with a 1 px `border-bottom` in `--bg-raised` and `background-clip: padding-box` (`web/src/style.css` `.dv-mark`). Once the map's 532 px share drops below 1 px a mark, two things happen. First, every mark is its 1 px border and nothing else, painted in the map's own background colour (rgb 23,26,36), so the map draws blank: no unreviewed marks, and no reviewed or comment state either (screenshot at 1000 changes: an empty strip; at 400 the marks are a faint 0.3 px line each). Second, the marks stop shrinking. With 1000 changes the content is 1008 px against a 532 px box, so 472 marks lie outside it and mark 1000 sits at y 1165, off the 720 px page. They are reachable only by wheel-scrolling a map with a hidden scrollbar (`scrollbar-width: none`), which shows no sign that it scrolls. The wheel did scroll it (scrollTop 476, after which mark 1000 is clickable). A fix must keep every mark's state painted and inside the box at any count. For example, give marks a minimum painted height and let the map scroll with a visible cue, or merge adjacent marks into one pixel row, keeping the most significant state.

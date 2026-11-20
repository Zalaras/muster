# Maintainability review: diff-viewer

**Plan**: diff-viewer
**Verdict**: approved
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

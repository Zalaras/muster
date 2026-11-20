# Minor check — diff-viewer

Each agent-tagged or orchestrator Minor, checked by reading the diff since its cycle's review commit
against the issue's "what a fix must make true" (kb:adr/process-minors-verified-not-re-reviewed).

## Cycle 1 (review_commits[1] = 32d3eb69)

| Minor | Commit | Satisfied how |
|---|---|---|
| code Minor 1 `[orchestrator]` ADR frontmatter | 47cb710b | `docs/adr/diff-read-only-git-cli.md` has one `supersedes`, and `files: [internal/gitdiff/*.go, internal/gitutil/gitutil.go]` / `tests: [TestRead_NeverWritesTheRepository]` |
| code Minor 2 `[orchestrator]` `TODO.md` tick | 4853ebeb | ticked after cycle 3 approved (no tick before `review.md` says approved); see cycle 3's DOC row |
| maintainability Minor 1 `[daemon-impl]` request ctx | d3ead8a0 | `internal/server/diffreview.go` passes `context.WithoutCancel(r.Context())` to all three writes, like `note.go:57` |
| maintainability Minor 2 `[daemon-impl]` funlen reason | 6fdda6f2 | `daemon-implementation.md` `design: size:` gives the flat-list reason for `restoreChangedFields` 61 > 60 and corrects the "no funlen hit" claim; not split |
| maintainability Minor 3 `[web-impl]` two `button()` builders | 87f88bdc | one `export function button` in `web/src/render/diffrows.ts`; the cycle-2 bypass at eight sites is cycle 2's Minor 4, routed in cycle 3 |
| maintainability Minor 4 `[web-impl]` text composed twice | 87f88bdc | `MINUS`/`signedCounts` in `features/diffbutton.ts`, `lineLabel`/`commentHeading` in `features/diffplace.ts`; no second `MINUS`, `countsLabel` or `headingFor` remains |
| maintainability Minor 5 `[web-impl]` focus seam, refit | 87f88bdc | `web-implementation.md` `design:` line 67 says why focus asks diff for the slot root and why the refit sits on a `ResizeObserver`, with what it matched |
| maintainability Minor 6 `[web-impl]` comment/tick ordering | 87f88bdc | comment writes upsert by id and a load keeps an overlapped write; tick posts are chained (`ViewerState.flushing`); the tick-during-load half reopened as cycle 2's Minor 3, routed in cycle 3 |
| maintainability Minor 7 `[web-impl]` second button family | 87f88bdc | `web-implementation.md` `design:` line 68 states the reason (the accepted prototype's look; amber `.btn.key` would break "amber only means Needs-Input") |

## Cycle 2 (review_commits[2] = febf5415)

| Minor | Commit | Satisfied how |
|---|---|---|
| maintainability Minor 1 `[daemon-impl]` env as a context value | 195b94ea | `gitutil.RunFunc` is `func(ctx, dir, env []string, name, args...)`; `WithEnv` is gone and `rg 'context.WithValue\|ctx.Value(' internal cmd` (non-test) is empty; `TestReader_RunSeam` (54c3ba84) asserts at the fake seam that only the two tracked diffs carry `GIT_INDEX_FILE` |
| maintainability Minor 2 `[daemon-impl]` alias and doubled surface | 195b94ea | `rg '^type \w+ = ' internal cmd` (non-test) is empty; `gitutil` has one `type Git struct` built only by `NewGit`; `listFiles`/`topLevel`/`newGitRunner` are gone; `gitdiff` calls `NewGit` once (`gitdiff.go`, in `NewReader`) |
| maintainability Minor 3 `[web-impl]` tick during a load reverted | 9b5a1b9d | `applyReview` returns without replacing `s.ticks` when `s.tickWrites` moved since the load began (`diffviewer.ts:124`); the load records it before `flushPending` (`:139`); render test in 27326de5 keeps a tick made between the review and diff reads |
| maintainability Minor 4 `[web-impl]` button builder bypassed | 9b5a1b9d | `rg 'el\("button"\|\.type = "button"'` over `web/src/render/diff*.ts` and `web/src/features/diff*.ts` finds only the builder in `diffrows.ts` |

## Cycle 3 (review_commits[3] = 871e8623, approved — the Minor wave and check)

| Item | Commit | Satisfied how |
|---|---|---|
| browser Minor 1 `[web-impl]` Escape under an open Terminals menu | 9733b859 | `features/diff.ts` `dismissOpenPopover()` hands Escape to an open `body > .menu` panel and returns before closing the viewer; render test "Escape closes the open Terminals menu first, then the viewer" (3fa49fff) passes here and failed on a build of 871e8623 |
| code Minor 2 `[render-tests]` close never asserted | 3fa49fff | the rename-and-close test awaits `page.waitForRequest` for `DELETE …/shells/1` before `stillOpen()`; the dead `confirm.isVisible()` branch is removed |
| code Minor 1 `[orchestrator]` "nine diff scenarios" | 3e0b6111 | `kb:adr/process-render-fixtures-record-diff-opt-in` reads "The `diff*` scenarios set it" |
| code Major 1 `[orchestrator]` Terminals doc-delta not staged | 4853ebeb | `plans/diff-viewer/doc-delta.md` carries the surfaces sentence amended for the Terminals menu (pick/create closes, open/rename/close keeps) |
| code Major 2 `[orchestrator]` web-components counts | 3e0b6111 | `kb:diagram/web-components`: main inits 24 controllers; features 62 (23 stateful, 9 sub-controllers incl. diff's three, 26 helpers), render 55, api 12 — each counted from the tree |
| code DOC row `[orchestrator]` `TODO.md` tick | 4853ebeb | "Code diff viewing" ticked and moved to `docs/history/todo-done.md` § Features with ✅ 2026-11-20 |

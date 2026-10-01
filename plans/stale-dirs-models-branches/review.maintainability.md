# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Verdict**: approved
**Cycle**: 6
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: delta. `git diff 4b61a60..HEAD -- cmd internal web/src` is empty (0 lines). The only commit after `review_commits[5]` is `4cc7970`, which archives the review files and updates `orchestration-state.json`. The fix for cycle 5 Minor 1 is a docs-only change to `plans/stale-dirs-models-branches/web-implementation.md`, in commit `949f640`, with the related ADR and trailer change in `f0e2a4e`. Both commits are older than `4b61a60`: they landed while the cycle 5 review was running, so they are not in the delta range. I verified them directly against the current tree.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| Minor 1 **[web-impl]**: the JS fit (`fitMainheadMeta`, `ResizeObserver` in `features/focus.ts`) had no `design:` line; Decisions `:85`/`:135` said "CSS only"/"rather than a JS fit"; the `:137` limit said CSS has no `min(8ch, max-content)` | `949f640` (+ `f0e2a4e` for the ADRs and regenerated trailer hashes) | `web-implementation.md:152` is now a `design:` line for the fit. It covers every point the Minor asked for. It names the problem CSS cannot solve: `.loc`'s width follows the window continuously while the `↳` block shows or hides whole, and the floor cannot follow a short folder line. It says why the pane is observed (`section.main` is `flex: 1; min-height: 0`, so its size never depends on the header and refitting cannot loop). It states the render-state rule (the cap is cleared before every measurement) and gives the precedent check (`rg -n 'ResizeObserver' web/src` found none before; the fit is the first). The two old lines are now marked: `:85` "superseded in part by Fix Attempt 5's `design:` line" and `:135` "the 'rather than a JS fit' part is superseded by Fix Attempt 5". The known-limits bullet (`:136`) is marked "both closed by Fix Attempt 5's `--loc-cap`". Running `rg -n 'ResizeObserver' web/src --glob '!*.test.ts'` today still finds only `features/focus.ts:120`, which matches the line. The `f0e2a4e` changes to `web/src/{features,render}/CLAUDE.md` touch only the generated `kb:hash` and record-count lines, which follow from the ADR edits. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| (no non-test source file changed in `4b61a60..HEAD`) | — | — | `15-size.log` is unchanged from cycle 5: funlen `parseFlags`/`run`/`New`/`applyInput` and filelen `main.go`/`claudecodetest.go`/`launcher.go`/`manager.go`, all judged in cycles 4–5 | n/a |
| web/src/features/focus.ts | (cycle 5) | yes, now `web-implementation.md:152` | — | pass (Minor 1 closed) |
| web/src/render/mainhead.ts | (cycle 5) | yes, now `web-implementation.md:152` | — | pass (Minor 1 closed) |
| web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | (generated trailer) | n/a | — | pass (hash and count lines only, from `make gen-kb`) |

The other 31 files keep their cycle 5 result.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Cycle 5 Notes 2 to 4 and 6 still apply as written. They cover the forced synchronous layout on every `renderMainhead` pass, the unnamed `- 1` tolerance at `mainhead.ts:76`, the `100vw`/`none` fallbacks for `--loc-cap`, and the cycle 2 carry-overs (`resolvePath`/`resolveTranscriptDir` copies, `checkoutState` placement, a double `isDir`, per-host ellipsis rules). None of the files they cite changed.
2. **[note]** Process: the fix commits for cycle 5's Minor came before `review_commits[5]`, so the delta range (`4b61a60..HEAD`) cannot show them. I verified the fix against the current tree instead.

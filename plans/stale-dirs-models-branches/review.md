# Review: stale-dirs-models-branches

**Plan**: stale-dirs-models-branches
**Verdict**: approved
**Cycle**: 6
**Gates**: 0 failed
**Parts**: code, maintainability | skipped: browser
**Part verdicts**: code approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: approved
**Cycle**: 6
**Pack**: kb: pack 57977 words (budget 20000)

This is a §0 delta cycle. Cycle 5's only open agent-tagged issue was maintainability Minor 1 `[web-impl]`, and my own part had one `[orchestrator]` Minor. Both fix commits, `949f640` and `f0e2a4e`, are ancestors of `review_commits[5]` (`4b61a60`): they landed while the cycle 5 parts were being written. So `git diff 4b61a60..HEAD` touches only `orchestration-state.json` and the archive renames, and I verified the two fixes with `git show` on each commit instead.

`git diff --name-only dcd5b17..HEAD -- web/src internal cmd` names only `web/src/features/CLAUDE.md` and `web/src/render/CLAUDE.md`. Both diffs touch only the GENERATED `kb:trailer` (the hash and the record count, 50→52 and 38→40), produced by `make gen-kb` for the ADR `files:` edit. No source changed beyond a Minor's scope, so I did not re-read §3–§6. Requirement, diagram and hard-rule results carry over from cycle 5.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-17 | Yes (no source change since cycle 5) | Yes (gate run green) | pass (carried over from cycle 5) |
| DIAG | `kb:diagram/web-components`: no source file changed this cycle | — | pass |

## Build & Tests

E2E tests: pass (603 passed, 4.7m) · Daemon tests (race): pass (24 packages `ok`, 0 FAIL) · Web tests: pass (77 files, 1993 tests) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web lint 266 files). All of these are read from `gates-stale-dirs-models-branches-c6`, which has 0 failed lines.

Baseline lines: contrast pass (43 pairs × 3 themes, 0 failures) · versions fresh · e2e-honest pass (empty log) · kb-check pass (492 records, 0 problems) · dead-refs 0 missing · e2e-lint clean · features pass · comments clean · size WARN, 16 hits (review-maintainability's). This cycle repairs no flaky spec, so I ran no soak.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race; 0 FAIL) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (603 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Both focus ADRs now list `files: [web/src/style.css, web/src/render/mainhead.ts, web/src/features/focus.ts]`. `kb for web/src/render/mainhead.ts` and `kb for web/src/features/focus.ts` both surface `kb:adr/focus-mainhead-wraps-to-second-row-when-narrow` and `kb:adr/focus-model-never-truncates-name-blocks-give-way`. The regenerated trailers ride the same commit, and kb-check is green. `doc-delta.md`, design-system §5, the focus spec and both ADRs no longer describe the give-way as CSS only (grep for "CSS only" finds no hit on the Focus header). The cycle 5 Doc Delta verdict stands. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | no source change since cycle 5 |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | no source change since cycle 5; contrast 0 failures |
| W11 | Card, Focus header and tile header match `c-long-names.html` | pass | no source change since cycle 5 (the rendered comparison is review-browser's; it was skipped this cycle with no `web/src` change) |
| D15 | No git subprocess under the manager lock | pass | no Go change |
| D16 | Working-directory keys only under `internal/claudecode/` | pass | no Go change |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (no source change) |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass |
| 4 | tmux via `-L muster` / sizing | pass |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass |

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 5 correctness Minor 1 `[orchestrator]`: both focus ADRs' `files:` named only `web/src/style.css` | `f0e2a4e` | Diff read: both ADRs gained `web/src/render/mainhead.ts` and `web/src/features/focus.ts`, and nothing else in them changed. Ran `kb for` on both paths, and both ADRs are listed. The other changes are only the two generated trailers. |
| cycle 5 maintainability Minor 1 `[web-impl]`: no `design:` line for the JS fit, and lines `:85`/`:135`/`:137` contradicting it | `949f640` | Diff read. Fix Attempt 5 adds a `design:` line that covers each point asked for: why CSS cannot do it (a `↳` block that shows or hides whole leaves room, and there is no `min(8ch, max-content)`); why the observer watches the pane, not the header (the pane's size never depends on the header, so no loop); and the precedent check (`rg -n 'ResizeObserver' web/src` found none before). Line `:85` is marked superseded in part, `:135`'s "rather than a JS fit" is marked superseded, and the `:137` known limits are marked closed by `--loc-cap`. The commit edits only the plan log. Its claims match the code I read in cycle 5 (`fitMainheadMeta`, the `section.main` observer, the test doubles' null `offsetParent`). |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Both fixes came before `review_commits[5]`, so the §0 diff range `4b61a60..HEAD` is empty for them. I verified them with `git show <sha>`. The orchestrator may want to record a review commit before fix commits land, so that the delta range covers them.
2. **[note]** The only file I wrote is this one. `git status --porcelain` was clean when I started.

## Maintainability review

# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Part verdict**: approved
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

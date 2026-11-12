# Render Tests: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: pass
**Pack**: kb: pack 20820 words (budget 30000)

## Summary

Review cycle 1, wave 2: +9 tests in `reader-scratch.spec.ts` on `reader-docs-scratch-large` (Focus 900/600/360: Files tree, Outline and scratch rows each non-zero and scrollable to both ends; populated-tree check; scratch share keeps a row at 900/600/360) and 1 on `reader-docs-scratch-tiles-3x2` (Files header path clamped to one line, 600px tall). Earlier tests kept. Unused imports cleared (`tsc --noEmit` clean). Final full run recorded below.

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `reader-scratch.spec.ts` | folded by default ... (R1, REQ-7, REQ-8, INV-3) | R1 | folded row, `plan` and `3 tmp` chips, no rows in DOM | pass |
| `reader-scratch.spec.ts` | unfolded: plan row then scratch rows ... (R2, REQ-9, REQ-13) | R2 | order = listing order, tmp badge, age, title = absolute path, non-md absent | pass |
| `reader-scratch.spec.ts` | row ages come from the recorded modification times (R2, W4) | R2 | clock +10 min: each row reads its own `Nm ago` | pass |
| `reader-scratch.spec.ts` | no plan chip dimmed ... (R3) | R3 | `no plan` chip opacity 0.45, no tmp chip, `no plan yet` | pass |
| `reader-scratch.spec.ts` | an ended session keeps the claude section (R4, REQ-12) | R4 | section present, plan and scratch rows open | pass |
| `reader-scratch.spec.ts` | opening a scratch row ... (R6, REQ-10) | R6 | docbar `tmp` badge, absolute path, one aria-current row, dashed border | pass |
| `reader-scratch.spec.ts` | one scratch file and no plan (R7) | R7 | `no plan` and `1 tmp` | pass |
| `reader-scratch.spec.ts` | whole summary row toggles, fold remembered (REQ-8, W1) | REQ-8 | chip click toggles; fold survives reload | pass |
| `reader-scratch.spec.ts` | claude section above Files (R2) | R2 | vertical order | pass |
| `reader-scratch.spec.ts` | at 1440/1100/900/700/560px rows fit ... (R5, REQ-9) | R5 | no overflow, ellipsis, title, no horizontal scroll | pass |
| `reader-scratch.spec.ts` | at 1440/1100/900px in a compact 3x2 tile the claude section fits ... (R5, REQ-9) | R5 | nav toggled open, rows inside nav, no scroll, title, ellipsis | pass |
| `reader.spec.ts` | E3/E4/E22 updated | existing | unfold first; section present on ended session | pass |

## Fixtures used

- `reader-docs-scratch`: live, plan, three scratch files (one nested)
- `reader-docs-scratch-ended`: same, ended
- `reader-docs-scratch-only`: live, no plan, one scratch file
- `reader-docs-scratch-tiles-3x2`: scratch state in Tiles at 3x2
- `reader-docs`: no plan, no scratch (null block)

## Implementation Bugs

None. The cycle-1 bug (unfolded section starving Outline/scratch rows to 0 in a 3x2 tile at 600px) is fixed (commit 40bf9844); its test passes.

## Handoff

- needs-scenario: reader-docs-scratch-large-tiles-3x2 — `reader-docs-scratch-large` (plan, three scratch files, ~21 project .md files) recorded with prefs `view: "tiles"`, `density: "3x2"`, so the populated Files tree can be asserted in a compact tile. The large fixture is Focus-only and the view switch needs an unmocked PUT (404), so tile coverage of the tree/outline/scratch trio is not reachable; the tile tests keep the existing 3x2 fixture (empty tree).
- The large fixture holds three scratch files, not four as the wave brief said.

## Notes

- Reachability is asserted by scrolling each box to both ends (first/last row edge-aligned, part of the row inside), not whole-row-inside: measured at 600px Focus the outline box is 12px against 21px rows, at 360px 1px (tree 22, scratch 22). Non-zero and scrollable as the ADR (no floor) accepts; a 1px outline at 360 is worth a look by the reviewers but is not a failure of the stated property.

- The tmp badge is dashed-neutral, not teal (proposed kb:adr/reader-scratch-badge-neutral-not-teal); asserted as `border-top-style: dashed`.
- Scratch row age is the bare bucket (`7m`, `now`) per the row-age-text decision; the plan row keeps `ageAgo`. All fixture rows read `now` at the pinned epoch, so the age test advances the clock.
- `planHeaderRow` in helpers/reader.ts is now unused by render tests (web-impl/shared helper, left alone).

## Test Run Output

```
make render-test (render-lint clean): 493 passed (2.8m); npx tsc --noEmit clean
```

## Fix Attempt (review cycle 1, wave 2)

Added `reader-scratch.spec.ts`: "unfolded in a compact 3x2 tile at 600px tall the Files tree, Outline and scratch rows each keep a scrollable row (R5, REQ-9)" against `reader-docs-scratch-large-tiles-3x2`. It unfolds the claude section, selects the plan, and runs `expectAllSectionsReachable` (clientHeight > 0, first and last row reachable by scrolling) on `.tree`, `.outline` and the scratch rows. Result: pass. Full `make render-test`: 494 passed. `npx tsc --noEmit`: clean.

Measured in the tile ([clientHeight, scrollHeight]): tree [24, 315], outline [2, 21], scratch rows [22, 63]. The outline box is 2px tall, far less than one row, but it scrolls to both ends. The property holds as written; the margin is thin.

Out of scope: the ~450px tile (kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope).

## Fix Attempt (review cycle 2, wave 2)

**Verdict**: pass. `make render-test`: 499 passed; `npx tsc --noEmit` clean. Decision: kb:adr/reader-nav-scrolls-as-one-column.

**Rewritten (wrong by decision, not weakened)** in `web/render/reader-scratch.spec.ts`: `expectReachable`/`expectAllSectionsReachable` and the per-height "keep a scrollable row" tests (Focus 900/600/360, tile 600); `expectSharedColumn`, the 40% cap and the scratch `overflow-y: auto` check (the unfolded 900/600/450 and tile 900/600 tests, now natural height plus nav scroll); the compact `sizes` annotation test (folded into the tile loop); "tight nav keeps at least one scratch row" (22px floor, overflow auto; removed, the decision has no floor); the one-line `.dir` clamp test (now "wraps rather than clamping", Focus and tile, #67). In `web/render/reader.spec.ts` the cycle-2 Critical 1 block (tree/outline `overflow-y: auto` and per-section scrollTop) now asserts natural height and that scrolling `.rnav` brings the last tree row and the last outline row into view, each scrolled to in turn because that fixture's tree is taller than the nav, so the two are not in view together.

**New**: helpers `expectSectionsNaturalHeight` (`.tree .outline .plan-slot .scratch-rows` clientHeight == scrollHeight, no overflow-y auto|scroll, `.rnav` scrolls), `expectNavReachesEveryRow` in `helpers/reader-scratch.ts`. Large fixture, folded and unfolded: Focus 900/600/360, 3x2 tile 600/450 (nav end holds last tree and outline rows; top holds the summary row; folded `.scratch-rows` is 0px). An unfolded session with nothing to list leaves a 0px strip (`reader-docs`). Folder path wraps in Focus and tile.

**Handoff**: None.

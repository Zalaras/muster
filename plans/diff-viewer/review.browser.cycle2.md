# Browser review: diff-viewer

**Plan**: diff-viewer
**Verdict**: needs-changes
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
1. **[web-impl]** The change map still fails above about 530 changes (cycle 1's Major 1, fixed only up to that count). `.dv-mark` is `flex: 1 1 0; min-height: 0` with a 1 px `border-bottom` in `--bg-raised` and `background-clip: padding-box` (`web/src/style.css` `.dv-mark`). Once the map's 532 px share drops below 1 px a mark, two things happen. First, every mark is its 1 px border and nothing else, painted in the map's own background colour (rgb 23,26,36), so the map draws blank: no unreviewed marks, and no reviewed or comment state either (screenshot at 1000 changes: an empty strip; at 400 the marks are a faint 0.3 px line each). Second, the marks stop shrinking. With 1000 changes the content is 1008 px against a 532 px box, so 472 marks lie outside it and mark 1000 sits at y 1165, off the 720 px page. They are reachable only by wheel-scrolling a map with a hidden scrollbar (`scrollbar-width: none`), which shows no sign that it scrolls. The wheel did scroll it (scrollTop 476, after which mark 1000 is clickable). A fix must keep every mark's state painted and inside the box at any count. For example, give marks a minimum painted height and let the map scroll with a visible cue, or merge adjacent marks into one pixel row, keeping the most significant state.
   id: web/src/style.css:.dv-mark:marks unpainted and outside the box past ~530 changes | confidence: 72

### Minor

### Notes
1. **[note]** The R16 render test ("with 200 changes every mark lies inside the map…") cannot see Major 1: at 200 a mark is still 2.6 px. A test at a count above the box height in pixels (for example 1000 at 720 px) is where the defect shows. This is not filed as `[e2e-specs]` because the fix's shape decides what the test should assert.
2. **[note]** The gate's red `render-fixtures` line names `web/render/fixtures/moved-to-worktree.json`. The fixture was last committed in 31fd7095 on main, before this branch, and this branch does not touch it. Whether the branch's `internal/gitutil` change altered that fixture's generated output is `review-work`'s to say. The app I drove was built from this tree, so the red line does not change what was measured.
3. **[note]** Outside the delta: the cycle 1 notes (button counts keep no age while daemon-down; `x`/`Shift+X` toggle; `#mainhead .ended-at` `[hidden]` leak) were not re-measured. No-data cells and light theme were not re-measured either: neither the cycle's diff of `style.css` (only `.dv-map`/`.dv-mark`) nor any loading path touches them.
4. **[note]** In Split at 900×600 the side panel leaves the diff body 320 px, so each column is 160 px and the ~190-character line wraps to 331 px. That is the layout working as designed at a narrow width, not a regression. It is recorded in case the developer wants Split to fall back to Unified below some width.

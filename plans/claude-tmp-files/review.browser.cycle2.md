# Browser review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 12898 words (budget 30000)
**Rig**: `make web-build build` at 4f8c504c; scratch daemon from `web/e2e/helpers/fixtures.ts` (data dir `TMPDIR/muster e2e-<id>-*`, space-bearing, private `-tmux-socket` inside it, killed and removed at teardown); stub `claude` (`helpers/daemon.ts`); headless Chromium via a throwaway spec (2 tests, foreground, 46 s, spec deleted; the working tree shows nothing of this reviewer).

Gates log read, not re-run: 0 failed lines; `04-web-build` green, `21-e2e` 272 passed. The app driven is the one that ships.

Scenario: a session directory holding the 20-file large tree plus `0-outline.md` (30 headings, opened so the Outline is full), a transcript-located plan, and a scratchpad of 30 `.md` files aged now / 2 min / 1 h / 2 d / older. A second session starts with an empty scratchpad and no plan, then gets one file by hook. "Reach" below = a real mouse wheel over the box, then the last row is measured inside the box and `elementFromPoint` at its centre hits it. Box figures are clientHeight/scrollHeight in px.

## Delta

| Prior issue | Fix commit | Verified how |
|---|---|---|
| browser Major 1 (unfolded claude section starves tree and Outline to 0) | 47129db8, 40bf9844 (bar amended by d70a0143, kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope) | Fixed for the zero-height case: in every in-scope host the tree, Outline and scratch rows each keep a non-zero box whose last row is reached by wheel and hit-tested (matrix rows "Major 1 re-measure"). Not usable in every in-scope host: a 2x2 or 3x2 tile in a 600 px window leaves the tree 8 px against 15 px rows (browser Major 2). Folded, a new empty 22 px strip takes height from both (browser Major 1). |
| browser Note 1 (rows read `3m ago`) | 44d58ad8 decision, 47129db8 | Rows read bare `now`, `2m`, `1h`, `2d`, `7d` in Focus, 2x2 and 3x2; plan row `now`. |

## Matrix

Surfaces touched since e304d5f0: `.rnav` section heights (`style.css` plan slot, scratch rows, compact padding, one-line Files header), the tmp chip from the template (`index.html`, `doc.html`, `render/reader.ts`), bare row age, the scratch loading row helper.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| Major 1 re-measure | focus 900 | data, unfolded | tree, Outline, scratch each keep a scrollable box | pass | nav 773; tree 240/441, Outline 354/651, scratch 22/690; last row of each reached, 21/21/22 px visible, hit true |
| Major 1 re-measure | focus 600 | data, unfolded | same | pass | nav 473; tree 119/441, Outline 175/651, scratch 22/690; all reached, hit true |
| Major 1 re-measure | focus 360 | data, unfolded | same | pass (one row each) | nav 233; tree 22/441 (one 21 px row), Outline 32/651 (1.5 rows), scratch 22/690; all reached, hit true |
| Major 1 re-measure | pop-out 900 / 600 / 360 | data, unfolded | same | pass | tree 279 / 158 / 61, Outline 413 / 234 / 91, scratch 22 each; all reached, hit true |
| Major 1 re-measure | tiles 2x2 900, 3x2 900 | data, unfolded | same | pass | nav 314; tree 57/315, Outline 118/651, scratch 22/630; all reached |
| Major 1 re-measure | tiles 2x2 750, 3x2 750 | data, unfolded | same | pass | nav 239; tree 33/315 (2 rows of 15), Outline 68/651, scratch 22/630; all reached |
| Major 1 re-measure | tiles 2x2 600, 3x2 600 | data, unfolded | tree and Outline usable | FAIL | nav 164 (fixed rows 138, so in scope); tree 8/315 against 15 px rows, Outline 17/651 against 21 px rows; reachable by wheel, but no row is ever fully visible (browser Major 2) |
| Major 1 re-measure | tiles 3x2 600 | data, folded | folded section leaves its height to tree and Outline | FAIL | `.scratch-rows` 22/22 with 0 children still occupies y 172-194; tree 15/315, Outline 31/651 (browser Major 1) |
| Major 1 re-measure | focus 900 | data, folded | same | FAIL | `.scratch-rows` 22 px tall, 0 children, between summary row (127-156) and Files header (191) |
| Major 1 re-measure | focus 600 | empty scratchpad, unfolded | no empty scratch box | FAIL | `.scratch-rows` 22/22, 0 children, under `no plan yet` |
| Major 1 re-measure | tiles 3x2 600 | daemon-down | | N/A - out of scope by kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope (Note 2) | banner pushes the tile: tree 8 to 0, Outline 17 to 0, 30 scratch rows kept |
| REQ-9 amended | focus, tiles 2x2, tiles 3x2 | data | bare age | pass | first rows `now`, `2m`, `1h`, `2d`, then `7d`; plan row `now`; no `ago` anywhere |
| REQ-9 amended | focus | one late file | bare age on a hook-added row | pass | `late.md` row reads `now` |
| REQ-9 | focus 900 / 600 | data, unfolded | scratch row fully visible in its box | FAIL (1 px) | row 23 px in a 22 px box: 22 of 23 px visible; a single scratch file scrolls by 1 px (sh 23, ch 22) (browser Minor 1) |
| REQ-7 | focus | data | chips `plan` then `30 tmp` | pass | `["plan","30 tmp"]` |
| REQ-7 | focus | empty scratchpad, no plan | dimmed `no plan`, no tmp chip in the DOM | pass | chips `[no plan, class chip off, display block]`; `[data-role=tmp-chip]` count 0 |
| REQ-7/REQ-11 | focus | first scratch file by hook | tmp chip appears after the plan chip | pass | `["no plan","1 tmp"]` |
| REQ-8 | focus | data, unfolded | keyboard focus on a scratch row survives a render tick | pass | Tab to `f-00.md` row; same connected node after 1.2 s |
| Files header | focus, pop-out, tiles | data | long directory clamped to one line, full path kept | pass | `.hd .dir` 11 px tall (scrollHeight 44); full path in `title`; header 25 px (Focus), 19 px (compact) |
| compact padding | tiles 2x2, 3x2 | data | trimmed fixed rows inside nav | pass | summary 23 px, header 19 px (Focus 29 / 25) |
| daemon down | tiles 3x2 | daemon-down | surfaced loudly, rows kept | pass | `#banner` display block, `musterd unreachable - hook output ...`; 30 scratch rows still rendered |
| no data yet (loading row) | all | listing in flight | | N/A - outside the delta in behaviour (helper renamed only); not re-driven (Note 3) | |
| design-system 6 | all | all | no 0% track, cost, Done or unaged stale state | pass | every scratch and plan row carries its age; nothing added |
| design-system 7 | all | all | | N/A - no terminal surface touched | |

## Issues

### Critical

### Major
1. **[web-impl]** An empty `.scratch-rows` keeps a 22 px blank strip whenever it holds no rows: with the section folded (the default), and unfolded on a session with no scratch files. It sits between the summary row and the Files header and takes its height from the tree and the Outline, which are the boxes that are short: folded in a 3x2 tile at 600 px the tree gets 15 px (exactly one row) and the Outline 31 px with 22 px of that nav blank above them. Measured: Focus 900 folded `.scratch-rows` 22/22 with 0 children at y 156-178; tiles 3x2 600 folded 22/22 at 172-194; Focus 600 empty scratchpad unfolded 22/22. Cause: the `min-height: 22px` on `.rnav .scratch-rows` applies to the empty container. `web/src/style.css:2088`. A fix must make true: with no scratch row rendered (folded, or nothing to list) `.scratch-rows` has a 0 px box in every host, and the one-row floor applies only while rows exist. No committed render test could have failed for this: the large-fixture cases measure the unfolded state.
   id: web/src/style.css:.rnav .scratch-rows:empty strip when folded | confidence: 95
2. **[orchestrator:decision]** In a 2x2 or 3x2 tile in a 600 px window, which the amended bar keeps in scope (nav 164 px, fixed rows 138 px), the unfolded section leaves the tree 8 px against 15 px rows and the Outline 17 px against 21 px rows. Both are non-zero and reachable by wheel, which meets the letter of the amendment, but neither ever shows one whole row, so neither can be read. render-tests saw the same host with the Outline at 2 px. At 750 px the same tiles give tree 33 and Outline 68, which is usable. The no-floor ADR (kb:adr/reader-nav-sections-shrink-without-floor) stays binding either way.
   - **Option A - accept**: widen kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope to "a nav too short to give each section one whole row", covering the 600 px tile, and leave it to the tile-view overhaul.
   - **Option B - one whole row**: make the bar "tree and Outline each show at least one whole row in every tile at 600 px or taller, section unfolded", and win the space back from fixed rows without a floor (Major 1 frees 22 px folded only; unfolded needs more, such as the plan row and scratch rows sharing one compact scroller in tiles).
   id: web/src/style.css:.rnav compact:tree and outline under one row at 600px tiles | confidence: 85

### Minor
1. **[web-impl]** The scratch floor is 22 px but a Focus and pop-out scratch row is 23 px, so the visible row is clipped by 1 px and a session with exactly one scratch file gets a 1 px scrollable box (scrollHeight 23, clientHeight 22). Compact rows are 21 px, so the same floor is fine there. `web/src/style.css:2088`. A fix must make true: the floor equals one row in each host (Focus/pop-out and compact).
   id: web/src/style.css:.rnav .scratch-rows:min-height below row height | confidence: 90

### Notes
1. **[note]** In Focus at 900 px, with the 30-heading document open, the unfolded scratch list shows exactly one of 30 rows (22 px box) while the tree has 240 px and the Outline 354 px. This is the shipped rule doing what it says (`flex: 0 1000 auto`, scratch yields first, per the context of kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope), and its `max-height: 40%` never comes into play while either other section overflows. No change requested here; if the developer wants the scratch list readable in Focus, that is a separate placement decision.
2. **[note]** Daemon-down in a 3x2 tile at 600 px: the banner shortens the tile and the tree and Outline both go from 8 / 17 px to 0. The nav is then shorter than its fixed rows, which the amended bar puts out of scope; recorded, not filed.
3. **[note]** Not re-driven: the scratch loading row (listing held in flight) and the ended pop-out. The loading row change is a helper rename (`buildLoadingRow`) with the same class and text; cycle 1 measured both states.
4. **[note]** 2x2 and 3x2 with one session give the same tile box (host 346 / 271 / 196 px at 900 / 750 / 600), so the two densities share every figure above.

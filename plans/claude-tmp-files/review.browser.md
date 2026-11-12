# Browser review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 12898 words (budget 30000)
**Rig**: `make web-build build` at 8988afec; scratch daemon from `web/e2e/helpers/fixtures.ts` (data dir `TMPDIR/muster e2e-849ef7dd-Yknzbm`, space-bearing, private `tmux.sock` inside it, killed and removed at teardown, socket confirmed gone); stub `claude` (`helpers/daemon.ts`); headless Chromium 1280 px wide via one throwaway spec (foreground, 3.1 min, deleted; `git status --porcelain` shows nothing of this reviewer).

Gates log read, not re-run: 0 failed lines; `04-web-build` green, `08-render-test` 499 passed, `21-e2e` 272 passed. The app driven is the one that ships.

Scenario: session `rb-full` in a deep directory with two long segments (to force the Files header path to wrap), the 20-file large tree plus `0-outline.md` (30 headings, open, so the Outline is full), a transcript-located plan, and 30 scratch `.md` files aged now / 2 min / 1 h / 2 d / older. Session `rb-empty` has an empty scratchpad and no plan. "Reach" = a real mouse wheel over `.rnav` from scroll top until the last row of the section sits wholly inside the nav box, then `elementFromPoint` at the row's centre hits it. Box figures are clientHeight/scrollHeight in px.

## Delta

| Prior issue | Fix commit | Verified how |
|---|---|---|
| browser Major 1 (empty `.scratch-rows` keeps a 22 px strip, folded or with nothing to list) | 2b3ee0ff | `.scratch-rows` is 0/0 with 0 children folded in every host (Focus 900/600/360, pop-out 900/600/360, 2x2 and 3x2 at 900/600/450) and unfolded on `rb-empty` (Focus 600; tiles 2x2/3x2 at 900/600/450): the Files header follows the plan row directly. |
| browser Major 2 `[orchestrator:decision]` (tree 8 px, Outline 17 px in a 600 px tile) | 0d94e5b9 (decision C, kb:adr/reader-nav-scrolls-as-one-column), 2b3ee0ff | Settled as "nav scrolls as one column". Every section measures at natural height with computed `overflow-y: visible` (tree 441/441 Focus, 315/315 compact; Outline 651/651; scratch 690/690 Focus, 630/630 compact; plan 23 / 21); `.rnav` is the only scroller (`overflow-y: auto`). The last scratch, tree and Outline row is reached by wheel and hit-tested in every host and height in the matrix, down to a 51 px nav. |
| browser Minor 1 (22 px floor clips a 23 px row) | 2b3ee0ff | Moot: no floor remains; a Focus/pop-out scratch row is 23 px inside a 690/690 box, compact 21 px inside 630/630; last row 23/23 and 21/21 px visible. |

## Matrix

Surfaces touched since ef28dc19: `web/src/style.css` only — `.rnav .tree/.outline/.plan-slot/.scratch-rows` to `flex: none` with no own overflow, `.scratch-rows` floor/cap removed, `.rnav .hd .dir` clamp removed.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| one column | focus 900 | data, folded | sections natural, nav the one scroller, every row reachable | pass | nav 773/1314 auto; plan 0, scratch 0/0; tree 441/441, Outline 651/651 visible; last tree row 21/21 visible hit, last Outline row 21/21 at scrollTop 541 = max, hit |
| one column | focus 900 | data, unfolded | same | pass | nav 773/2027; plan 23, scratch 690/690; last scratch 23/23, tree 21/21 (scrollTop 600), Outline 21/21 (1254 = max); all hit |
| one column | focus 600 | data, folded / unfolded | same | pass | nav 473/1314 and 473/2027; all three last rows wholly inside and hit; max scrollTop 841 / 1554 |
| one column | focus 360 | data, folded / unfolded | same | pass | nav 233/1314 and 233/2027; all last rows wholly inside and hit; max 1081 / 1794 |
| one column | pop-out 900 / 600 / 360 | data, folded | same | pass | nav 871 / 571 / 331 of 1314; tree and Outline last rows inside and hit |
| one column | pop-out 900 / 600 / 360 | data, unfolded | same | pass | nav 871 / 571 / 331 of 2027; scratch 690/690; scratch, tree, Outline last rows inside and hit |
| one column | tiles 2x2 and 3x2, 900 | data, folded / unfolded | same | pass | tile 346 tall; nav 314/1149 and 314/1800; tree 315/315 (15 px rows), Outline 651/651, scratch 630/630; all last rows inside and hit |
| one column | tiles 2x2 and 3x2, 600 | data, folded / unfolded | same (cycle 2 Major 2 host) | pass | tile 196; nav 164/1149 and 164/1800; last tree row 15/15 at scrollTop 320 / 1000, Outline 21/21 at max 985 / 1636, scratch 21/21; all hit |
| one column | tiles 2x2 and 3x2, 450 | data, folded / unfolded | same (back in scope) | pass | tile 121; nav 89/1149 and 89/1800; tree, Outline, scratch last rows wholly inside and hit at scrollTop 400 / 1060 (folded), 600 / 1040 / 1711 (unfolded) |
| one column | tiles 3x2, 600 and 450 | daemon-down | same, rows kept | pass | banner shortens the nav to 126 and 51 px; 30 scratch rows kept; last scratch, tree, Outline rows inside and hit at both heights |
| empty scratch is 0 px | focus 600 | empty, folded / unfolded | no strip | pass | `.scratch-rows` 0/0, 0 children; unfolded plan slot 19 px (`no plan yet`), scratch top 172 = plan bottom |
| empty scratch is 0 px | tiles 2x2 and 3x2, 900 / 600 / 450 | empty, folded / unfolded | no strip | pass | `.scratch-rows` 0/0, 0 children in all 12 cells; unfolded plan 15 px |
| empty scratch is 0 px | every data host above | data, folded | no strip | pass | `.scratch-rows` 0/0, 0 children, plan 0 |
| keyboard focus into view | focus 900 / 600 / 360, pop-out 900 / 600 / 360, tiles 2x2 and 3x2 900 / 600 | data, unfolded | each Tab-focused nav row wholly inside the nav box | pass | 86 Tab stops from the summary row to `Section 30`, 0 out of view in each of 10 cells |
| keyboard focus into view | tiles 2x2 and 3x2, 450 | data, unfolded | same | pass (rows); header see Note 1 | 86 stops, 85 inside; the one not wholly inside is the Files header control (107 px) in an 89 px nav |
| keeps focus | focus 600, tiles 3x2 600 | data, unfolded | Tab-focused last tree row stays the active node over a render tick | pass | `file-20.md` active before and after 1.2 s, connected, inside the nav |
| scroll-spy | every host, unfolded | data | current Outline entry brought into view | not brought into view — Note 2 | after wheeling the body to its end, current entry `Section 20`–`29` sits 1674–1964 px below the nav top with `.rnav` scrollTop 0 |
| Files header wraps (#67) | focus, pop-out, tiles 2x2 / 3x2 | data | long folder path wraps, not clamped | pass | `.rnav .hd .dir` 99/99 px (clientHeight = scrollHeight), `-webkit-line-clamp: none`, `overflow: visible`; header 113 px (Focus), 107 px (compact) |
| daemon down | tiles 3x2 600 | daemon-down | surfaced loudly | pass | `#banner` display block, opacity 1, `musterd unreachable — hook output in open panes is Muster's absence…` |
| design-system 6 | all | all | no 0% track, cost, Done or unaged stale state | pass | nothing added by the delta; rows keep their ages |
| design-system 7 | all | all | | N/A — no terminal surface touched | |
| scratch loading row | all | listing in flight | | N/A — untouched by the delta (CSS sizing only); not re-driven | |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** In a 450 px window's 2x2 or 3x2 tile (nav 89 px) the Files header control is 107 px tall with a deliberately long two-segment folder path wrapped to 99 px, so it can never sit wholly inside the nav: its top is visible at scroll top, and keyboard focus on it scrolls it partly into view. Every file, Outline and scratch row is still reachable. This follows from the developer's #67 wrap and decision C together; no change requested.
2. **[note]** Scroll-spy moves `aria-current` in the Outline but never scrolls the nav to the current entry; with one column the current entry sits below the whole tree (up to ~1960 px down in a 164 px tile nav). Nothing in the delta or before it scrolled the Outline to its current entry (no `scrollIntoView` in `web/src`), so this is not a regression; it belongs with the filed TODO "Revisit the reader nav's scrolling" if the developer wants the current heading kept in view.
3. **[note]** 2x2 and 3x2 with these two sessions give the same tile height (346 / 196 / 121 px at 900 / 600 / 450), so the two densities share every height figure; only the width differs (636 vs 423 px).

# Browser review: diff-viewer

**Plan**: diff-viewer
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 13103 words (budget 30000)
**Rig**: `make web-build build` at 3943a416 (`bin/musterd` v0.30.4-27-g3943a416-dirty, dirty = the orchestrator's untracked plan files only); per-test scratch daemons from `web/e2e/helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-0ddb5980-*` (contains a space), tmux socket `<data dir>/tmux.sock`, the shared E2E stub `claude`; headless Chromium 1280×720 (plus 900×600 and 1280×500), through a throwaway spec `web/e2e/zz-browser-review.spec.ts` that has since been deleted. The gates log (`gates-diff-viewer-c1d`) is all green: size, e2e-level, e2e 259 passed.

## Matrix

Hosts: **focus** (main slot plus size row), **tiles**, **pop-out**. States: **no data** (summary answers held by a route), **data**, **daemon-down** (scratch daemon SIGTERMed).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/9 | focus | no data | no button, row holds the note alone | pass | `#diff-button` display none; `#sizerow` 694–720 (h 26), text = size note only |
| REQ-1 | focus | data | button appears after a file change, no reload | pass | `1 file +1 −1 · View diff ›` once the held summary was released; `/api` summary uncommitted 1/+1/−1 |
| REQ-9 | focus | data | button flush right, row no taller | pass | row 300–1280 × 694–720 (h 26) in every state measured: note only, note+button, note+button+💬, open, docs (button only), ended (button only). Button right 1264 = row right − 16 px padding; note left 316 |
| REQ-9 | focus | data | hover title states both scopes | pass | `Uncommitted: 1 file +1 −1 · Branch: 1 file +1 −1` |
| REQ-9 | focus (docs) | data | row shows holding only the button | pass | `#sizenote` display none; row h 26, text `1 file +1 −1 · 💬 1 · View diff ›` |
| REQ-9 | focus (ended) | data | row shows holding only the button | pass | `#dead-surface` 95–694; row h 26 with the button alone |
| REQ-22 | focus | data | terminal refits, no clipped row, no page scroll | pass | `terminalFitProblems` = [] with the button and with 💬; size note 130×24 = tmux `window_width`/`window_height` 130×24; page scrollHeight 720 = innerHeight |
| REQ-2 | focus | data | viewer replaces the pane inside its host | pass | `section[aria-label=Diff]` 300–1280 × 95.4–694: top = `#mainhead` bottom 95.4, bottom = `#sizerow` top 694; no page scroll at 1280×720 or 900×600 |
| REQ-2 | focus | data | button reads Close diff ×; close by button/×/Escape | pass | `… · 💬 1 · Close diff ×`; the button closed it and `claude` was re-selected; Escape closed it (E.finalEscape, J.esc2) |
| REQ-10 | focus | data | no segment looks selected while open | pass | open: all three `aria-pressed=false`, bg `rgba(0,0,0,0)`, colour 166,171,188. Closed: claude bg 28,32,41, colour 232,230,225 |
| REQ-3 | focus | data | scopes, default scope, base stated | pass | `5 files · +4 −5 · against HEAD (8dd2da0)` = oracle base; Branch `6 files · +6 −5 · against main @ 2d2e1df` = oracle, plus `src/committed.txt` |
| REQ-11 | focus | data | file heads status/path/counts, rename, binary, fold, Files list | pass | heads match `/diff` oracle file by file (`renamed src/old-name.txt → src/new-name.txt +0 −0`); `Binary file not shown` ×1; fold → `aria-expanded=false`, 0 rows; side panel lists all 5 |
| REQ-11 | focus | no data | viewer reading shows Loading… | pass | with `/diff?scope=` held: `.dv-loading` 131–178, text `Loading…` |
| REQ-12 | focus | data | Unified: one column, both numbers, red/green | pass | `.dv-row.del` bg 58,26,32; `.dv-row.add` bg 22,48,31; row h 18.4 |
| REQ-12 | focus | data | Split: old left, new right, rows lined up, readable | **FAIL** | every file section is a 128 px column side by side (`.dv-files.split` computed `display:flex`); cells 64 px wide, code wraps one character per line, split row h 129 vs Unified 18.4 (Critical 1) |
| REQ-13 | focus | data | word highlight stronger, in every view | pass | Unified `<del>diff</del>` bg 107,42,51 on row 58,26,32; `<ins>code</ins>` 31,90,51 on 22,48,31; one `ins` in Split and in Review |
| REQ-14 | focus | data | Review after/before flip, placeholder | pass | labels `after`×5; a pointer click on the last change → `before`; a pure removal shows `nothing here after the change` placeholder |
| REQ-15 | focus | data | pointer tick folds; folded row reopens | pass | click `Mark change reviewed` → `✓ reviewed · +1 −1`, `1 / 5 changes reviewed`; click on the folded row → unfolded, still 1/5 |
| REQ-15 | focus | data | tick by `x` folds the change | **FAIL** | `j j x`: progress 1/5 → 2/5, `.dv-folded` count stays 0 (Major 2) |
| REQ-15 | focus | data | file tick box, mixed, fold, unfold without unticking | pass | tick app.txt → `aria-expanded=false`, checked, 5/5; unfold → expanded true, still checked, 3 folded changes; Reset → 0 |
| REQ-16 | focus | data (3 changes) | one mark per change, state | pass | 3 marks of 14 px inside the map 131–694; after the file tick: `unreviewed`,`reviewed`,`reviewed` |
| REQ-16 | focus | data (200 changes) | every mark reachable | **FAIL** | map 162.4–694 (h 531.6), `overflow:hidden`, scrollHeight 1006; marks 106–200 lie below the box (mark 200 top 1161) and cannot be reached by pointer (Major 1) |
| REQ-17 | focus | data | `+` shown on hover only, box heading | pass | `.dv-plus` opacity 0 → 1 on hover, `Comment on line 4`; box `Commenting on line 4` |
| REQ-17 | focus | data | number click + shift-click selects, tinted apart | pass | `Commenting on lines 2–4`; selected rows bg 43,58,94 (≠ add 22,48,31 / del 58,26,32) |
| REQ-17 | focus | data | comment box keeps focus and text across a poll | pass | `activeElement` was the same textarea (probe attribute kept) after 6.5 s; value `hello there` |
| REQ-18 | focus | data | card, gutter bar, resolve row, expanded Delete | pass | `Lines 2–4 Edit Resolve`; rows carry an inset 3 px 110,168,254 bar; `✓ Resolved · Line 15 · jump here` `aria-expanded` false → true showing `Delete`+`Reopen`; Delete → 0 rows, oracle 0 comments |
| REQ-19 | focus | data | Comments (n) counts open only; list; jump unfolds | pass | `Comments (1)` → after Resolve `Comments (0)`, `Resolved (1)`, button drops `💬`; entry `src/app.txt:15` click into a folded file → card in view (406 within 131–694) |
| REQ-20 | focus | data | j/k/Space/x/Shift+X, Escape order | pass (see Notes 2) | j/k move `.current`; Space → `before` and back; Escape: box first, then selection (sel 0, viewer still open), then the viewer |
| REQ-4 | focus | data | bar pinned under toolbar, lines move by bar height only | pass | bar 131.4–169.4 = toolbar bottom 131.4, unchanged after a further 1500 px scroll; the probe row went 179.25 → 217.25 (= bar h 38); scrollTop 3000 kept |
| REQ-4 | focus | data | Refresh keeps scroll, removes bar, keeps ticks/comments | pass | scrollTop 4500 → 4500, bar gone, new file listed; summary oracle 2 files +161 −160 |
| REQ-5/6/8 | focus | data | comment and ticks after reload, restart, second window | pass | `2 / 4 changes reviewed`, 2 folded, `Comments (1)`, `💬 1` in all four reads (saved, reload, `daemon.restart()`, new context) |
| REQ-6 | focus | data | a change whose lines changed comes back unticked | pass | after both ticked changes were edited: `0 / 4 changes reviewed` |
| REQ-7 | focus | data | comment follows its line; outdated when gone | pass | moved down 2 → card `Line 5` on `charlie three`; line deleted → list `review.txt:3 outdated charlie three follow me`, 0 cards |
| REQ-21 | focus | data | marking distinct in light and dark | pass | light add 220,243,224 / del 251,224,226 / ins 166,224,180 / sel #d4e1fa / comment #1f5fbf; dark 26,51,34 / 59,31,36 / 37,96,58 / #2d3f63 / #74adf5 |
| REQ-27/INV-5 | focus | data | the other session shows only its own | pass | B focused: no viewer, `1 file +3 −3 · View diff ›`; back to A: its viewer is still open |
| REQ-23 | tiles | data | no diff button; tile shows the terminal; viewer back in Focus | pass | 0 buttons, `#sizerow` display none, tile + terminal region 1 each; Focus → viewer 300–1280 × 95–694 again |
| REQ-2..21 | tiles | — | viewer surfaces | N/A — plan § Views: Tiles unchanged, no way into the diff | |
| all | pop-out | — | — | N/A — there is no `/doc.html` host for the viewer or the size row (plan § Views) | |
| REQ-28 | focus | daemon-down | button keeps counts; banner | pass | `#banner` 0–1280 × 46–78 `musterd unreachable — hook output…`; the button kept `2 files +5 −3 · Close diff ×` 6 s later |
| REQ-28 | focus | daemon-down | comment save fails keeping its box | pass | `Not saved, musterd unreachable` colour 232,207,90 = `--warn` #e8cf5a; textarea kept `survives down` |
| REQ-28/EC21 | focus | daemon-down | tick write fails | pass | `1 / 4 changes reviewed  Reset  Not saved, musterd unreachable`; change stays folded |
| REQ-28 | focus | daemon-down | Refresh fails with reason and Refresh | pass | `.dv-error` `Couldn't read the diff: musterd unreachable`, 1 Refresh button |
| §6/§7 | focus/tiles | all | honesty and terminal rules | pass | no cost, no "Done", the daemon-down banner is shown; the tile holds one terminal region; the size note equals tmux geometry |
| Hidden | focus/tiles | all | `[hidden]` computes `display:none` | pass for this plan | every leak found was `SPAN.ended-at` in `#mainhead` (Note 3), nothing of this plan's |

## Issues

### Critical
1. **[web-impl]** Split view does not work. `.dv-files` gets the view name as a class (`dv-files split`), which picks up the dashboard's existing global `.split { display: flex; flex: 1 }` (`web/src/style.css:721`). Every file section then sits side by side as a ~128 px column in the 700 px body. Measured on `standardRepo` at 1280×720: the `.dv-srow` grid columns are `64.0156px 64.0156px`, file sections run across from left 300, the code wraps one character per line, and a split row is 129 px tall against Unified's 18.4 px (screenshot taken). REQ-12's Split ("old left and new right with a change's rows lined up") cannot be read. A fix must make file sections stack vertically in Split, as they do in Unified, with each `.dv-srow` spanning the body's width, so a short line is one row tall. Uncommitted, Branch and the Review/Unified views are unaffected.
   id: web/src/style.css:.dv-files.split:split files laid side by side | confidence: 97

### Major
1. **[web-impl]** The change map clips marks when there are many changes, and the clipped ones cannot be reached (REQ-16, plus the lead the previous attempt left). `.dv-map` has `overflow: hidden`, and `.dv-mark` has `min-height: 3px` with a 2 px gap. With 200 changes in one file (Review, 1280×720): the map box is 162.4–694 (531.6 px) but its content is 1006 px tall, and marks 106–200 lie below the box (mark 200 top 1161.4). No scrollbar exists and wheel scrolling is suppressed, so a pointer user cannot reach those marks. (Playwright's `click()` reached mark 200 only by scrolling the hidden overflow programmatically.) A fix must keep one clickable mark per change inside the map box at any change count, by scaling the marks or by letting the map scroll.
   id: web/src/style.css:.dv-map:marks clipped past ~105 | confidence: 92
2. **[web-impl]** A change reached by `j`/`k` (and, from the same path, a change-map click or a Comments jump) does not fold when it is ticked. `showChange` adds the change's key to `s.reopened` (`web/src/features/diffreviewui.ts`), and the fold rule is `isTicked && !reopened`. Measured: `j j x` moved progress from `1 / 5` to `2 / 5 changes reviewed`, but the `.dv-folded` count stayed 0. A pointer tick on a change never navigated to folds (`✓ reviewed · +1 −1`). REQ-15 says a change's tick folds it. A fix must make every tick (key `x`, the tick button, the file tick) fold the change, whether or not it was ever the current change. "Reopened" should last only until the next tick.
   id: web/src/features/diffreviewui.ts:showChange:visited change never folds | confidence: 88
3. **[render-tests]** R9 and R25 could not have failed for Critical 1. R9 checks only that the new cell's x is right of the old cell's midpoint and that their tops are level, and both hold inside a 128 px squashed column. R25 compares row heights on a row whose code is `}`, a single character that never wraps. The specs must assert that Split's file sections are stacked, with each `.dv-srow` as wide as the scroll body, and compare row heights on a line long enough to wrap if a column were squashed.
   id: web/render/diff.spec.ts:R9 R25:could not catch squashed split | confidence: 85

### Minor

### Notes
1. **[note]** While musterd is down, the button keeps its last counts without an age, as plan § States specifies. The daemon-down banner shows at the same time (0–1280 × 46–78), so this was not filed as a §6.8 violation. Raise it if the developer wants an age on the counts.
2. **[note]** `x` and `Shift+X` toggle rather than only tick. After `x` had ticked review.txt's only change, `Shift+X` dropped progress from 1/3 to 0/3 (`shiftX` passes `state !== "all"`). This matches the tick buttons' toggle, but the plan's wording is "ticks". No change requested unless the developer reads REQ-20 strictly.
3. **[note]** Outside this plan: `#mainhead .ended-at` carries `[hidden]` but computes a non-`none` display on a live session (kb:lesson/display-rule-overrides-hidden-attribute). This branch does not touch `.ended-at`.
4. **[note]** Not re-measured in the browser, and left to the existing specs: the Review keys while focus is in the terminal or a text field (INV-4: R22, R23), `directory_missing` (R29, D11), and the shell surface's refit (E16, green in the gates log). Two scratch data dirs `$TMPDIR/muster e2e-0ddb5980-Ls7RbZ` and `…-YCuWu9`, dated 2026-11-19 23:05, predate this review and were left alone.

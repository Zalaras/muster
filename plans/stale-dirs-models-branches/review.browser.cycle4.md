# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 4
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at fbf94a1, giving `bin/musterd` (`v0.19.1-65-gfbf94a1`). Each probe test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-…`, a path with a space) with its own `-tmux-socket` inside it, which the harness teardown kills. Each also got the E2E stub `claude` and `-repo-poll 200ms`. Driven in headless Chromium through one throwaway spec (`web/e2e/zz-rb-probe.spec.ts`) built on the committed helpers. The spec and its `test-results/` are deleted, no `musterd` or private tmux server is left running, and `git status --porcelain` shows nothing of mine (Note 6).

I read the gates log in `gates-stale-dirs-models-branches-c4` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 583.

The only shipped change since cycle 3's rig (02f7861) is `web/src/style.css` (061f424). `git diff --stat 02f7861..HEAD` lists no Go or `web/src/*.ts` source, so the daemon-side cells carry over from cycle 3 and say so.

Fixtures, all with the title `rework shift-swap approval` (206 px wide) unless named otherwise:
- **long**: a 60-character folder on an 80-character branch.
- **short**: `muster` on `main`.
- **moved**: a `.claude/worktrees/` worktree (60 characters with long names, `probewt` with short).
- **ended**: long and short names.
- **bypass**: long names, moved, with the chip kept by a bypass hook.
- **status line**: short names, model `Haiku 4.5`, then the daemon is SIGTERMed.
- **no data**: a plain non-git directory with no hooks.
- **tiny**: `api` on `main`, `ab` on `x`, and `api` moved into `wt`. These folder and branch lines are under the 8-character floor, the limit web-impl logged as inferred.
- **long title**: 66 characters, short names.
- **short title**: `ok`, long names, moved.

Sweep: every 4 px from 1440 down to 700, then every 16 px back up to 1440. That is 233 cells per fixture and 3,262 Focus-header cells in all, with a header screenshot at 10 widths.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **strip**: Tiles view, `#tiles-strip`.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 | focus | data, all 14 fixtures, 1440–700 and back | the repo block is on `.loc`'s first line at every width (cycle 3 Minor 2, decision B) | pass | 3,262 of 3,262 cells have `.repo` laid out and y-overlapping `.loc`'s box. The hit-test 4 px inside `.repo .rf` finds `.rf` in every cell |
| REQ-13 | focus | data, sweep down then up | narrowing never brings the repo back, and there is no hysteresis | pass | the repo block is never absent, so it cannot return. Every up-sweep cell matches the down-sweep cell at the same width (header height, `↳` shown, `.loc` blank and title width all agree) |
| REQ-13 | focus | data, all fixtures | the model is never truncated | pass | `.model` sw = cw in all 3,262 cells (169/169 for the id, 61/61 for `Haiku 4.5`, 34/34 for `haiku`). The hit-test inside `.model` finds `.model` in every cell |
| REQ-13 | focus | data, folder lines of 8 or more characters | no blank `.loc` beside an ellipsized title (cycle 3 Minor 1) | pass | 1,407 cells have an ellipsized title. Outside the tiny fixtures, blank is 0 to 0.1 px in every one. Examples: short moved at 1100 has the title 141/206 and `.loc` 467.4–540.2 ending at the repo block plus its margin; long title has 481/504 at 1440 and 289/504 at 1048, blank 0 |
| REQ-13 | focus | data, tiny (lines under 8 characters) | no blank `.loc` beside an ellipsized title | FAIL | `api / main`: `.repo` 532.4–566.3, but `.loc` runs to 605.2, a 20.3 px blank at every width. At 1100, 900 and 700 the blank sits beside an ellipsized title (141/206, 141/206, 118/206). `ab / x` gives 27.1 px. The text-to-model gap is 38.9 or 45.7 px, against 18.6 px for every other fixture (Minor 1) |
| REQ-13 | focus | data, moved, title whole | the model follows the visible location text | FAIL | short moved, with the `↳` block wrapped away: `.loc` ends 83 px past the repo block at 1248, 58.6 px at 1024, 34.6 px at 1000 and 11.5 px at 800, so the gap from the `·` to the model is up to 101.6 px. The 1024 screenshot shows `muster / ·`, a hole, then the model. tiny moved reaches 83.3 px at 1228. Unmoved fixtures read 18.6 px at every width (Minor 1) |
| REQ-13 | focus | data, moved | the `↳` block hides whole and does not come back as the window narrows | FAIL, decision | short title `ok`, long moved: the block shows at 1440–1136, is gone at 1132–1052, back at 1048–936 (header wraps to 80.4 px), gone at 932–852, back at 848–760 and gone at 756–700. Screenshots: one row at 1100 with no `↳`, two rows at 1024 with it. tiny moved: back at 1048–1032. bypass: back at 736–700 in the three-row header (Minor 3) |
| REQ-13 | focus | data, narrow | header wraps, controls on screen (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow) | pass | 49.4 px header, then 80.4 px from 1048 down (long and short, unmoved and moved), 1128 down (ended) and 940 down (status line). 105.4 px from 748 down (ended) and 736 down (bypass). End, Resume and Remove are inside the viewport and `scrollWidth` = viewport width in all 3,262 cells |
| REQ-13 | focus | data, wrap | the terminal refits when the header grows, settled | pass | after a 2.5 s settle: 1052 gives head bottom 95.4, tmux `99x28`, 28 xterm rows; 1048 gives 126.4, `99x26`, 26 rows, with `.xterm-screen` 126.4–750.4 inside the slot 126.4–774. Three-row bypass at 736 gives 151.4, `58x25`, 25 rows, screen 151.4–751.4. Returning to 760 and 1440 gives 26 and 28 rows again. A read about 150 ms after a resize was still stale (Note 3) |
| REQ-13 | focus | ended | ended age after the model | pass | `.ended-at` is shown and the model is whole at every width. The three-row header is reached at 748 px, as web-impl logged |
| REQ-13 | focus | bypass chip | chip, then meta, nothing overlapping | pass | chip visible at every width. No overlap between name, chip, meta, switch and actions; buttons on screen |
| REQ-13 | focus | no data | basename alone, model `haiku` | pass | `.rf` `muster-e2e-plain-…`, no `.rb`, blank 0 at every width. It wraps at 912 |
| REQ-13 | focus | daemon-down, 900 and 740 | last snapshot stays, banner shows | pass | `#banner` `display: block`, 0,46–900,78 (two lines at 740: 46–93). The header moves down to 78 (93), the repo block is on its first line, `Haiku 4.5` is 61/61, blank 0, and the buttons are on screen |
| REQ-17 | focus | data, wrapped (1000, 80.4 px) | keyboard focus survives a re-render | pass | `Tab` from `.rename` goes `claude`, `shell`, `docs`, `End`. After a real `git checkout -b kbd-new` re-rendered the branch and 1.5 s passed, the tagged `End` node was still `activeElement` |
| REQ-17 | focus | data, wrapped | operable by keys | pass | `Enter` on End opens `End session? … muster / kbd-new` with focus on Cancel. `Enter` on its End session button gives `/api/state` `alive: false`, `endedAt` set |
| REQ-14 | focus | moved / unmoved / ended / no data | hover lines | pass (cycle 3) | markup and TS are unchanged since 02f7861 (style-only change) |
| REQ-10 | rail | data, comfortable and expanded | two lines, each truncating on its own | pass | `.rf` 14–288 at 138.8 (sw/cw 420/274), `.rb` 14–288 at 151.8 (542/274), inside card 0–299 |
| REQ-11 | rail | data, compact | one line | pass | `.rf` 14–130.7 and `.rb` 137.4–288 share top 129.7, both clipped (420/117, 542/151) |
| REQ-12 | rail, strip | data, three densities | `↳` lines as tall as the repo lines | pass | comfortable: `.r2` 26 = `.r2c` 26. Compact 13 = 13. Expanded 26 = 26. Strip 26 = 26 (`.r2` 794.3, `.r2c` 822.3–848.3) |
| REQ-12 | rail, strip | data | glyph gap unchanged after `--lead-gap` | pass | `.lead` 14–25.8 with computed `padding-right: 5px` in all three densities and on the strip, and `.rf` from 25.8, the same as cycle 3 |
| REQ-12 | rail | unmoved | `.r2c` hidden | pass | computed `display: none` in all three densities |
| REQ-16 | rail | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` `rgb(178,182,195)` and `.rf` `rgb(166,171,188)`, the same as cycle 3 |
| REQ-16 | rail, focus | data, Light | same | pass (cycle 2) | not re-measured: no colour declaration changed (Note 4) |
| REQ-15 | tile | data, moved, 1280 / 900 / 700 | `.wh` one line, `↳` glyph inside `.thead` | pass | `.wh-claude` 1130.7–1137.5 in `.thead` 641.5–1278; 750.7–757.5 in 451.5–898; 550.7–557.5 in 351.5–698. `.nm` holds its 75 px. `.wh` is 13 px, one line |
| REQ-15 | tile | data, unmoved | glyph hidden | pass | `.wh-claude` computed `display: none` |
| REQ-12, REQ-15 | tiles | daemon-down | last snapshot stays | pass | after SIGTERM `#banner` `display: block` `musterd unreachable — …`, and the tile `.wh` still reads the long folder / branch |
| REQ-1 | rail | dead, racing checkout | keeps the last-known branch | pass (cycle 3) | daemon unchanged since 02f7861 |
| REQ-9 | focus | data | a bind with a different id shows the id | pass (cycle 3) | daemon and `render/*.ts` unchanged; every fixture here shows the SessionStart id `claude-haiku-4-5-20251001` until the status line's `Haiku 4.5` |
| §7.1 | tiles | data | one live client per session | pass | `tmux list-clients` returns `muster-2`, `muster-3`, `muster-4`, `muster-1` for 4 tiles, no duplicates |
| §6.7 | focus, tiles | daemon-down | daemon-down surfaced prominently | pass | `#banner` `display: block` in both views |
| Hidden | focus, rail, tile | toggled elements | `[hidden]` computes `display: none` | pass | `.claude-at` (unmoved, ended, no data), `.ended-at` (live), `.r2c` (unmoved) and `.wh-claude` (unmoved) are all `display: none` |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** In the Focus header, `.loc` keeps room for content it does not show, so the model sits apart from the location text, sometimes beside an ellipsized title.
   - Short lines: when the folder and branch lines are both under the 8-character floor (`api /` over `main`), `.loc` holds the floor. That leaves 20.3 px of blank at every width (27.1 px for `ab /` over `x`). At 1100, 900 and 700 the blank sits beside an ellipsized title (141/206, 141/206, 118/206), which is cycle 3 Minor 1's failure on a common repo name.
   - Moved, title whole: when the `↳` block has wrapped away, `.loc` still takes width up to its max-content. The blank is 83 px at 1248, 58.6 px at 1024, 34.6 px at 1000 and 11.5 px at 800 (short names), so the model jumps right by up to 101.6 px and back as the window narrows.
   - Every other fixture keeps the text-to-model gap at 18.6 px.
   - Both cases are what web-impl's Fix Attempt 4 logged as inferred limits. This is the measurement.
   - Where: `web/src/style.css`, `.mainhead .meta` grid track and `.mainhead .meta .loc`.
   - A fix must make this true: at every width, with the title whole or ellipsized and the session moved or not, `.loc`'s right edge is within 1 px of its last first-line block's right edge plus that block's `margin-right`, so the model starts one `--sep-gap` after the visible location text.
2. **[e2e-specs]** `blankProblems` in `web/e2e/helpers/card-location.ts` returns nothing unless the title is ellipsized. The spec also keeps every folder at 8 or more characters on purpose (its comment says so), so `card-location.spec.ts` could not have failed for either case of Minor 1.
   - A fix must make this true: the helper reports blank `.loc` width at every width, not only while the title is ellipsized. The width tests include a folder and branch both under 8 characters (for example `api` on `main`), unmoved and moved.
3. **[orchestrator:decision]** The `↳` block comes and goes as the window narrows. The repo block no longer does (decision B), but the `↳` block reappears whenever the header gains a row, because the meta then has more room.
   - Measured, title `ok`, long names, moved: shown at 1440–1136, gone at 1132–1052, back at 1048–936, gone at 932–852, back at 848–760, gone at 756–700.
   - Measured, `api` moved: back at 1048–1032.
   - Measured, bypass, long moved: back at 736–700, the three-row header.
   - With the 26-character title it hides once at 1248 and stays hidden.
   - **Option A**: accept it. The `↳` block shows wherever it fits, which costs this flicker in the Focus header. The rail card and the tile `↳` glyph always show the move.
   - **Option B**: once the `↳` block hides at a width, it stays hidden at every narrower width, so the Focus header's location readout never grows as the window narrows. The cost is that the `↳` block is hidden in the wrapped header even where it would fit (for the `ok` title, 1048–936 and 848–760).

### Notes

1. **[note]** Cycle 3's issues are fixed as measured. Minor 2 (decision B): the repo block is on the first line in all 3,262 cells and never returns. Minor 1: 0 blank cells beside an ellipsized title for folder lines of 8 or more characters. Minor 3: the helper now checks the blank, within the limits in Minor 2 above.
2. **[note]** Across the wrap, a wider window can show less of the title. Short or long names, unmoved: 1100 is one row with the title at 141/206, and 1024 is two rows with it whole. This follows from decision B and needs no change.
3. **[note]** The terminal refit trails a resize. In the 4 px sweep, a read about 150 ms after resizing to 1048–1032 found tmux and xterm both still at 28 rows under a header that had already grown. After 2.5 s every width was settled and correct (Matrix, wrap row). No change requested.
4. **[note]** Not re-measured, because the cycle changed no colour, xterm or pane-content code: REQ-16 in Light, §7.4 (`scrollback: 0`) and §7.5 (pane styling).
5. **[note]** A `↳` block that gives way is clipped, not removed (`.claude-at` keeps a laid-out box below `.loc`'s first line), so a screen reader still reads it. This carries over from cycle 3 Note 2. A fix for Minor 1 or decision Minor 3 that uses `display: none` would remove it.
6. **[note]** The working tree holds uncommitted edits that are not mine, from the concurrent reviewers or the orchestrator: `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md`, `docs/adr/focus-model-never-truncates-name-blocks-give-way.md`, `docs/design/design-system.md`, `plans/stale-dirs-models-branches/doc-delta.md`, and the untracked `review.code.md` and `review.maintainability.md`. The `$TMPDIR/muster-e2e-loc-*` dirs timed 14:52–15:47 pre-date this review; I left them alone.

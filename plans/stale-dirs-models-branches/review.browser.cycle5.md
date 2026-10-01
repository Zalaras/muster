# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: approved
**Cycle**: 5
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at dcd5b17, giving `bin/musterd` (`v0.19.1-72-gdcd5b17`). Each probe test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-…`, a path with a space) with its own `-tmux-socket` inside it, which the harness teardown kills. Each also got the E2E stub `claude` and `-repo-poll 200ms`. Driven in headless Chromium through one throwaway spec (`web/e2e/zz-rb-probe.spec.ts`) built on the committed helpers. The spec is deleted, no `musterd` or private tmux server is left running, and `git status --porcelain` shows nothing of mine (Note 5).

I read the gates log in `gates-stale-dirs-models-branches-c5` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 603.

The only shipped change since cycle 4's rig (fbf94a1) is fix dfb8100: `fitMainheadMeta` in `web/src/render/mainhead.ts`, a ResizeObserver on the Focus pane in `web/src/features/focus.ts`, and `--loc-cap` in `web/src/style.css`. All three touch only the Focus header (`.mainhead`). No Go source changed, so the daemon-side cells carry over from cycle 3. No rail or tile CSS changed, so those cells were spot-checked rather than swept.

Fixtures are the same 14 as cycle 4. All use the title `rework shift-swap approval` unless named otherwise:
- **long**: a 60-character folder on an 80-character branch.
- **short**: `muster` on `main`.
- **long moved**, **short moved**: a `.claude/worktrees/` worktree, with a 60-character name and with `probewt`.
- **ended**: long names and short names.
- **bypass**: long names, moved, launched in `bypassPermissions`, with the move hook carrying that mode.
- **status line**: short names, then a status-line post with model `Haiku 4.5`. Afterwards the daemon is SIGTERMed.
- **no data**: a plain non-git directory with no hooks.
- **tiny**: `api` on `main`, `ab` on `x`, and `api` moved into `wt`.
- **long title**: 66 characters, short names.
- **short title**: `ok`, long names, moved.

Sweep: every 4 px from 1440 down to 700, then every 16 px from 716 back up to 1440, giving 232 cells per fixture and 3,248 Focus-header cells in all. In each cell I took two reads:
- read A after two animation frames;
- read B 250 ms later, plus the committed `mainheadFitProblems` helper.

Both reads record:
- **blank**: `.loc`'s right edge minus the furthest first-line block's right edge plus its `margin-right`. This is cycle 4 Minor 1's criterion.
- **gap**: from the last visible block's text to the model.
- whether `↳` is shown, the `--loc-cap` value, the header height, the title's and the model's `scrollWidth`/`clientWidth`, and the document's `scrollWidth`.
- **errors**: an init script adds a `window` `error` listener, so a ResizeObserver loop error would be counted.

I took header screenshots at 8 widths per fixture.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.
- **strip**: Tiles view, `#tiles-strip`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 | focus | data, all 14 fixtures, 1440–700 and back | `.loc` ends within 1 px of its last visible block plus that block's margin (cycle 4 Minor 1) | pass | 0 of 3,248 cells have blank > 1 px in read A or read B. The largest blank is 0. The `--loc-cap` is set in 2,830 cells (every cell where `↳` is not on the first line) |
| REQ-13 | focus | data, tiny (`api`/`main`, `ab`/`x`) | no floor room beside an ellipsized title | pass | blank 0 at all 232 widths each, with the title ellipsized in 92 and 91 cells. The text-to-model gap is 18.6 px everywhere, down from 38.9 and 45.7 px in cycle 4. The `api / main` screenshot at 900 shows `rework shift-swap …` then `api / main · claude-haiku-4-5-20251001` with no hole. The cap is 52.5 px |
| REQ-13 | focus | data, moved, title whole (short moved, tiny moved, long moved, short title) | the model follows the visible text once `↳` has wrapped away | pass | gap 18.6 px in every cell of all four fixtures (cycle 4: up to 101.6 px). The short moved screenshot at 1024 shows `muster / main · claude-haiku-…` with no hole |
| REQ-13 | focus | data, all fixtures | the text-to-model gap is one `--sep-gap` | pass | the distinct gap values across all 3,248 cells are exactly {18.6} |
| REQ-13 | focus | data, sweep down then up | no hysteresis | pass | every up-sweep cell matches the down-sweep cell at the same width (header height, `↳` shown, `.loc` box and cap) in 12 fixtures. The two ended fixtures differ only as their ended age ticks over (Note 2), and their blank is still 0 |
| REQ-13 | focus | data, every cell | settled: no change between 2 frames and 250 ms after a resize | pass | read A equals read B in `.loc` box, header height, cap, `↳` and model in 3,246 cells. The 2 that differ are the ended fixtures at 1084 and 1004, where the ended-age text changed between the reads. Both reads have blank 0 |
| REQ-13 | focus | data, idle at 15 widths (1300–740) × 3 sessions | no flicker, no cap oscillation | pass | sampled every animation frame for 3 s: 181–182 frames per sample, and exactly 1 distinct (`.loc` right, model left, header height, cap) tuple in all 45 samples. Render passes rewrite the `style` attribute up to 6 times in 3 s with the same value (Note 3) |
| REQ-13 | focus | data, every cell and idle sample | no ResizeObserver loop error | pass | the `window` `error` count is 0 in all 3,248 sweep cells, all 45 idle samples and all 64 content-change reads |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after switching sessions | pass | the switches go tiny `api` → long moved → short moved → tiny → short moved. At each step the cap matches the session: 52.5 px for `api`, none or 72.8 / 119.3 px for the moved sessions as `↳` fits or not. Blank 0 and gap 18.6 in read A (2 frames) and in read B (1.3 s later) |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after a rename | pass | renaming to `c`, then the 66-character title, then back: at 1440 and 1100, `↳` comes back for `c` and the cap clears, the long title sets the cap at 72.8 px, and the original title clears it again. Blank 0 in every read |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after a status-line model change | pass | after `Opus 5.5 (1M context) extended`, the model is 203/203, and at 1100 `↳` gives way with the cap set. After `H` (7/7), `↳` returns and the cap clears. Blank 0 throughout |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after an unmove, a move or a branch change | pass | an unmove sets the cap and a move again clears it where `↳` fits. A real `git checkout -b` to a 36-character branch at 1000 moves the cap 72.8 → 78.4 px, and a short branch moves it back. Blank 0 |
| REQ-13 | focus | data, Tiles round trip | no stale cap after resizing while the Focus pane is hidden | pass | resizing in Tiles and returning to Focus at a different width gives the cap for the new width (for example, at 1100 `↳` is shown and there is no cap, and at 900 the cap is 72.8 px). The values match the plain-resize cells |
| REQ-13 | focus | data, moved | `↳` block reappears on wrap | pass, decided | short title: shown at 1440–1136 and 1048–936 and 848–760, gone elsewhere. Tiny moved: back at 1048–1032. Bypass: back at 736–700. This is the same pattern as cycle 4. The developer decided option A (`decisions/claude-at-may-reappear-on-wrap`) |
| REQ-13 | focus | data, all fixtures | the repo block is on the first line and the model is never truncated | pass | `mainheadFitProblems` returns `[]` in all 3,248 cells. The model `scrollWidth` equals `clientWidth` in every cell: 169/169 for the id and 61/61 for `Haiku 4.5` |
| REQ-13 | focus | data, narrow | the header wraps, controls stay on screen, no horizontal scroll | pass | 49.4 → 80.4 px at 1048 (long, short, long title, tiny moved), 1028 (`api`), 1020 (`ab`), 1112 (bypass), 1128 (ended), 940 (status line) and 912 (no data). It reaches 105.4 px at 748 (ended) and 736 (bypass). Document `scrollWidth` equals the viewport width in every cell. End, Resume and Remove are on screen (helper) |
| REQ-13 | focus | data, header height changed by content | the terminal refits | pass | at 1000, the bound id header is 126.4 px at the bottom, tmux is `93x26`, xterm has 26 rows and the screen is 126.4–750.4 in the slot 126.4–774. After a status line `H` unwraps the header: bottom 95.4, `93x28`, 28 rows, screen 95.4–767.4. Read after 2.5 s |
| REQ-13 | focus | ended | ended age after the model | pass | the long and short ended fixtures have blank 0, gap 18.6 and the model whole at every width |
| REQ-13 | focus | bypass chip | chip, then meta, nothing overlapping | pass | the helper's overlap check is `[]` in 232/232 cells. Gap 18.6 |
| REQ-13 | focus | no data | basename alone | pass | blank 0 at every width, with the cap set (no `↳`). It wraps at 912 |
| REQ-13 | focus | daemon-down, 900 and 740 | last snapshot stays, banner shows | pass | `#banner` is `display: block` at 46–78 (900) and 46–93 (740), text `musterd unreachable — …`. The header is pushed down (`.loc` top 87 / 102), `Haiku 4.5` is 61/61, blank 0, helper `[]`, and read A equals read B |
| REQ-17 | focus | data, wrapped (1000) | keyboard focus survives a re-render | pass | `Tab` from `.rename` lands on `claude`, which I tagged. After a real `git checkout -b kbd-new` re-rendered the branch and 1.5 s passed, the tagged node was still `activeElement` |
| REQ-17 | focus | data | operable by keys | pass (cycle 4) | no button or dialog code changed |
| REQ-14 | focus, rail, tile | moved / unmoved | hover lines | pass (cycle 3) | markup and the hover code are unchanged since 02f7861. The tile `title` read here carries all 4 lines |
| REQ-10 | rail | data, comfortable | two lines, each truncating on its own | pass | `.rf` 14–288 at 138.75 (420/274), `.rb` 14–288 at 151.75 (542/274), inside card 0–299 |
| REQ-11 | rail | data, compact | one line | pass (cycle 4) | no rail CSS changed |
| REQ-12 | rail | data, comfortable | `↳` lines as tall as the repo lines | pass | `.r2` 26 = `.r2c` 26. `.lead` 14–25.8, `.r2c .rf` from 25.8 |
| REQ-12 | strip, rail compact/expanded | data | same | pass (cycle 4) | no rail or strip CSS changed. My strip read did not run because one session leaves no strip (Note 4) |
| REQ-16 | rail | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` is `rgb(178,182,195)` and `.rf` is `rgb(166,171,188)` |
| REQ-15 | tile | data, moved, 1000 | `.wh` one line, `↳` glyph inside `.thead` | pass | `.wh-claude` 351.2–358.0 is computed `display: block`, inside `.thead` 2–498.5. `.wh` is 13 px tall (one line) and reads `<long folder> / kbd-new` |
| REQ-1, REQ-9 | rail, focus | daemon facts | branch kept, id shown | pass (cycle 3) | daemon unchanged. Every bound fixture showed `claude-haiku-4-5-20251001` until the status line's `Haiku 4.5` |
| §7.1 | tiles | data | one live client per session | pass | `totalAttachedClients()` is 1 for 1 session after the Focus → Tiles switch |
| §6.7 | focus | daemon-down | daemon-down surfaced prominently | pass | `#banner` `display: block`, full width, above the header |
| Hidden | focus | unmoved | `.claude-at[hidden]` has no box | pass | in every unmoved cell `.claude-at` has `hidden` and no client rects. Its computed `display` was measured as `none` in cycle 4, and no display rule has changed since |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes

1. **[note]** Cycle 4's issues, as measured:
   - **Minor 1 is fixed.** Blank is 0 in all 3,248 cells, including the tiny fixtures and the moved fixtures with the title whole, and the text-to-model gap is 18.6 px everywhere.
   - **Minor 2 is closed.** The committed sweep now covers `api` on `main`, unmoved and moved, and `blankProblems` reports blank at every width. That is `review-work`'s to confirm.
   - **Minor 3 is settled as option A** and behaves as decided.
2. **[note]** The ended fixtures' up-sweep differs from their down-sweep at 13 and 23 widths, and two cells differ between read A and read B. The ended-age text changes over the run, which changes how much room the meta gets. The cap followed it every time, with blank 0 in every read, so this is the age ticking, not instability.
3. **[note]** Each render pass clears and re-sets `--loc-cap`, up to 6 `style` writes in 3 s at a fixed width, with the same value each time. That costs a forced layout per pass. In 45 three-second per-frame samples no painted frame differed, so there is no visible effect. This is observation only. Whether the extra layout is worth avoiding is `review-maintainability`'s call.
4. **[note]** Not re-measured, because the cycle changed no code they depend on:
   - the strip's `↳` line height and the rail in compact and expanded density;
   - REQ-16 in Light, and §7.4 (`scrollback: 0`) and §7.5 (pane styling);
   - keyboard operation of End.
   Cycle 4 measured all of these as passing.
5. **[note]** Not mine, left alone:
   - the untracked `review.code.md` and `review.maintainability.md` in the working tree, which are the concurrent reviewers' files;
   - the `$TMPDIR/muster-e2e-loc-*` directories timed 14:52–15:47 and `muster e2e-stub-…` at 13:22. These pre-date this run, which started at 19:13.

# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at 02f7861, giving `bin/musterd`. Each test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-XXXX`, a path with a space) and its own `-tmux-socket` inside that dir, which the harness teardown kills. Each also got the E2E stub `claude` via `-claude-bin` and `-repo-poll 200ms`. Driven in headless Chromium through one throwaway spec built on the committed helpers. The spec is deleted, and so are the 12 filler repos my probe left in `$TMPDIR`. `git status --porcelain` shows nothing of mine (see Note 6).

I read the gates log in `gates-stale-dirs-models-branches-c3` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 561.

This cycle's web fixes are 4e465fe and 4f5d64d. They make the Focus model never truncate (decision A), let the name blocks give way whole, wrap the header below about 976 px, and fix the card's `↳` line height. I measured them first, then re-drove the matrix.

Fixtures:
- **Long names**: a 60-character launch folder on an 80-character branch, moved into a `.claude/worktrees/` worktree with a 60-character name.
- **Short names**: `muster` on `main`, moved into `probewt`.
- **Bypass**: the long-named session with `bypassPermissions` kept by its hooks, so the header carries the `bypass` chip.
- **Ended**: an ended session.
- **No data**: a plain non-git directory with no hooks.
- **Dead**: a tmux window killed, and a checkout racing the kill.
- **Model**: a `sonnet` launch rebound to `claude-sonnet-5-5`.
- **Titles**: `rework shift-swap approval`, which is 206 px wide at its natural width.
- **Widths**: 1440, 1280, 1100, 1024, 1000, 976, 975, 960, 900, 800 and 700 px, and then back to 1280.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **strip**: Tiles view, `#tiles-strip`.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 | focus | data, all 7 fixtures, 1440–700 | the model never truncates (cycle 2 Major 2, decision A) | pass | at every one of 77 width × fixture cells `.model` has sw = cw (169/169 for the id, 34/34 for `haiku`), and `elementFromPoint` 2 px inside each end hits `.model`. Examples: 960 is 599.8–769.2, 800 is 439.8–609.2, 700 is 516.7–686 |
| REQ-13 | focus | data, moved and unmoved, long and short | no `.rf`/`.rb` paints over a `·` or the model (cycle 2 Major 1) | pass | every block on the first line has its `.rf`/`.rb` inside the block, and the centre hit-test finds the line itself. A block that gives way sits wholly below `.loc` and is clipped (1024: repo block top 85.4 = `.loc` bottom 85.4; hit-test misses). A visible `·` glyph never overlaps a line box |
| REQ-13 | focus | data | blocks give way whole, `↳` first, then repo | pass | long moved: 1280 shows both; 1100 shows repo only (`↳` block at 85.4–115.8, below the clip); 1024 shows neither. The committed ADR text says repo first; an uncommitted working-tree edit corrects it (Note 6) |
| REQ-13 | focus | data, 976–1024 and 800 | no blank space while the title is ellipsized | FAIL | 1024 long moved: `.name` 314–404 (cw 90, `rework sh…`) while `.loc` 416–464.2 holds no visible block, a 48 px blank strip. Short unmoved at 1024: the same 48 px, with `muster / main` hidden though it is only 54 px wide. Also 24 px at 1000, 32.6 px at 900 once the status line shortens the model, 59.6 px with the bypass chip at 1100 and 44.5 px ended at 1100 (Minor 1) |
| REQ-13 | focus | data, resize sweep | widening the window never shows less | FAIL, decision | short unmoved: 1100 shows the repo and a 141 px title; 1024–976 show no repo and a 90 px title; 975 shows the repo and the full 206 px title. Long moved: both blocks, repo, none, both, repo, none, repo from 1280 down to 700. At 900, after the status line arrives (model `Haiku 4.5`, 61 px), the header stays on one row with no repo (Minor 2) |
| REQ-13 | focus | data, narrow | header wraps, controls on screen (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow) | pass | 976 gives a 49.4 px header; 975 gives 80.4 px (46–126.4) with End/Resume/Remove on row 2 (773.4–961, y 91.4–116.4). Every button is inside the viewport at every width; `scrollWidth` = viewport width at every width |
| REQ-13 | focus | data, wrap | the terminal refits when the header grows | pass | 976 has tmux `89x28` and 28 xterm rows; 975 has tmux `89x26` and 26 xterm rows. The slot starts at the header bottom (95.4 or 126.4) |
| REQ-13 | focus | data, bypass chip | chip, then meta, nothing overlapping | pass, with the Minor 1 blank | chip 416.4–468.9, `.meta` from 480.9; the model is whole at every width |
| REQ-13 | focus | ended | ended age after the model, no `↳` | pass | 1280: `.model` 640.5–809.8, then `.ended-at` 809.8–889.5 `·ended now`; `.claude-at` `display: none`; the hover is two lines |
| REQ-13 | focus | no data | basename alone, model `haiku` | pass | `.rf` `muster-e2e-plain-…` 416–571.8, no `.rb`; `.claude-at` `display: none`. It too gives way at 900 (Minor 1 blank, 59.7 px) |
| REQ-13 | focus | daemon-down, 900 | the last snapshot stays and the banner shows | pass | `#banner` 0,46–900,78; the header moves to 78–127.4; the model `Haiku 4.5` 448.6–509.5 is whole |
| REQ-13 | focus | back to 1280 | settled after a narrow pass | pass | every fixture re-measures identically to its first 1280 read |
| REQ-14 | focus | data, moved / unmoved / ended / no data | `.loc` title has 4 / 2 / 2 / 2 lines | pass | moved short: `muster / main`⏎`<dir>`⏎`Claude is in <wt>`⏎`on worktree-probewt`. Ended keeps 2 lines (`claudeLocation` null when dead). No data: basename⏎dir |
| REQ-10 | rail | data, comfortable and expanded | two lines, each truncating on its own | pass | `.rf` 14,138.8–288,151.8 (sw/cw 420/274) over `.rb` 151.8–164.8 (542/274), inside card 0–299 |
| REQ-11 | rail | data, compact | one line | pass | `.rf` 14–130.7 and `.rb` 137.4–288 share top 129.7, both clipped |
| REQ-12 | rail, strip | data, three densities | `↳` lines as tall as the repo lines (cycle 2 Minor 1) | pass | comfortable: `.r2` 26, `.r2c` 26, every line 13 px. Compact 13 / 13. Expanded 26 / 26. Strip 26 / 26 (`.r2` 794.3–820.3, `.r2c` 822.3–848.3) |
| REQ-12 | rail, strip | data | glyph gap unchanged after 4f5d64d | pass | `.lead` 14–25.8 (5 px padding inside), `.rf` from 25.8; cycle 2 had the lead at 14–21 and `.rf` at 26 |
| REQ-12 | rail | daemon-down / no data / dead | carried over | pass (cycle 2) | not re-driven on the rail; 4e465fe/4f5d64d change only the `.r2c` grid tracks and padding, which the data rows above re-measure |
| REQ-12 | strip | daemon-down | the last snapshot stays | pass | after SIGTERM the banner is 0,46–700,93 with `display: block`, and the strip `.r2c` is still `grid` |
| REQ-15 | tile | data, moved, 1280 / 900 / 700 | `.wh` one line, `↳` glyph inside `.thead` | pass | `.wh-claude` 850–856 in 642–1278; 660–666 in 452–898; 551–557 in 352–698; `.nm` holds its 75 px floor. `.wh` title has the 4 hover lines |
| REQ-15 | tile | data, unmoved | glyph hidden | pass | `.wh-claude` computed `display: none`; the title has 2 lines |
| REQ-16 | rail | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` `rgb(178,182,195)`, `.rf`/`.rb` `rgb(166,171,188)`, the same values cycle 2 matched to the tokens |
| REQ-16 | rail, focus | data, Light | same | pass (cycle 2) | not re-measured: no colour rule changed this cycle (Note 3) |
| REQ-17 | focus | data, 900 (wrapped) | keyboard focus survives a re-render | pass | `Tab` from `button.rename` goes `claude`, `shell`, `docs`, `End`. After a real `git checkout -b kbd-new` re-rendered the repo block and 1.5 s passed, the same tagged `End` node was still `activeElement` |
| REQ-1 | rail | dead | keeps the last-known branch | pass | `kill-window`, then checkout `after-death`: API `repo.branch` `main`, `.rb` `main`, `alive: false`, `claudeLocation: null` |
| REQ-1 | rail | dead, checkout racing the kill | UI and API agree | pass | both read `racing` and `alive: false`. Whether the checkout landed before death is not separable from outside (Note 4) |
| REQ-9 | focus | data | a bind with a different id shows the id | pass | `sonnet` changes to `claude-sonnet-5-5` in the DOM; API `{id, displayName}` both `claude-sonnet-5-5` |
| §7.1 | tiles | data | one live client per session | pass | `tmux list-clients` returns `muster-3`, `muster-4`, `muster-5`, `muster-2` for 4 tiles, no duplicates |
| §6.7 | focus, tiles | daemon-down | daemon-down surfaced prominently | pass | `#banner` `display: block`, `musterd unreachable — hook output…`, in both views |
| Hidden | focus, rail, tile | every toggled element | `[hidden]` computes `display: none` | pass | `.claude-at` (unmoved, ended, no data), the first `.loc > .sep`, `.ended-at` and `.wh-claude` are all `display: none` while hidden |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** In the Focus header, when no name block fits on the first line, `.loc` still keeps the width it would give them as blank space, and the title stays ellipsized beside it.
   - Measured: at 1024 (long or short names, moved or not), `.name` is 314–404 (cw 90 of its 206 px natural width, `rework sh…`) and `.loc` 416–464.2 holds nothing visible: a 48 px blank strip before the model. The same happens at 1000 (24 px), at 900 once the status line arrives (32.6 px, model `Haiku 4.5`), at 900 with no data (59.7 px), at 1100 ended (44.5 px) and at 1100 with the bypass chip (59.6 px). The screenshot at 1024 shows `rework sh…`, a gap, then `claude-haiku-4-5-20251001`.
   - Cause: the meta grows ahead of the title (grow 1000 against 1) up to its max-content, which counts blocks that then wrap under the clip.
   - Where: `web/src/style.css`, `.mainhead .name` / `.mainhead .meta` / `.mainhead .meta .loc`.
   - A fix must make this true: whenever `.name` is ellipsized (scrollWidth > clientWidth), `.loc`'s box is no wider than its visible blocks plus their separators, with a 1 px tolerance.
2. **[orchestrator:decision]** The Focus header's location readout comes and goes as the window narrows, because the header wraps only when the model alone no longer fits. Wider windows can show less.
   - Measured, short names, unmoved: 1100 shows `muster / main` and a 141 px title; 1024–976 show no repo and a 90 px title; 975 wraps and shows the repo and the whole 206 px title.
   - Measured, long names, moved: from 1280 down to 700 the header shows both blocks, then repo only, none, both, repo, none, repo.
   - In the steady state, after the status line confirms a short display name, the 900 px header stays on one row with no repo at all.
   - kb:adr/focus-model-never-truncates-name-blocks-give-way accepts "may show no repo readout". It does not address the readout returning at a narrower width.
   - **Option A**: accept it. The header stays one row whenever the model and actions fit, and the name blocks are what give way. The cost is the flicker above, and no repo on a 976–1024 px window. The rail card still shows the repo.
   - **Option B**: the header wraps as soon as the repo block would drop below its floor. The repo readout then shows at every width where a second row can hold it, and narrowing never brings it back. The cost is that the header is 80 px instead of 49 px over a wider band (measured: 31 px less terminal, 2 rows at 975), which includes the 1024 px window.

3. **[e2e-specs]** `mainheadFitProblems` (`web/e2e/helpers/card-location.ts`) checks overlap, containment and the viewport. It never compares blank `.loc` width against a truncated title, so the narrow-width tests (card-location.spec.ts, 6 widths × 3 states) could not have failed for Minor 1.
   - A fix must make this true: the helper reports a `.loc` wider than its visible blocks while `.name` is ellipsized.

### Notes

1. **[note]** Cycle 2's issues are fixed as measured:
   - Major 1: no overpaint at any width.
   - Major 2 (decision A): the model is whole at every width, 1440 down to 700.
   - Minor 1: the card's `↳` lines are 13 px, the same as the repo lines, in all three densities and on the strip.
2. **[note]** A name block that gives way is clipped, not removed. It keeps a laid-out box below `.loc` and stays in the accessibility tree, so a screen reader reads a repo or `↳` line the eye cannot see. web-impl recorded this as a known limit of the CSS-only approach. It would go away under any fix for Minor 1 or decision Minor 2 that hides blocks with `display: none`.
3. **[note]** REQ-16 in Light was not re-measured. 4e465fe and 4f5d64d change no colour declaration, and cycle 2 measured it.
4. **[note]** In a checkout run concurrently with `kill-window`, the dead card reads `racing` in both the DOM and `/api/state`. The checkout most likely completed before the window died, so this is consistent with ff19fac (a reading taken before death is dropped only when it was in flight at death), but a browser probe cannot separate the order.
5. **[note]** §7.4 (`scrollback: 0`) and §7.5 (pane styling) were not re-measured. The plan touches neither xterm nor pane contents.
6. **[note]** The working tree holds uncommitted edits I did not make: `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md` and `docs/design/design-system.md` §5 now say the `↳` block hides before the repo block. That matches what I measured, and the committed text says the reverse. Statement accuracy is review-work's. `$TMPDIR/muster-e2e-loc-FO3g6A` (14:52) and the 15:33–15:47 `muster-e2e-loc-*` dirs pre-date this review; I left them alone.

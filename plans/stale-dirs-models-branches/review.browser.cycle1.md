# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: `make web-build build` at 4968c2d → `bin/musterd`, per-test scratch `-data-dir` `$TMPDIR/muster e2e-XXXX` (space-bearing), `-tmux-socket` inside it (killed by the harness teardown), E2E stub `claude` via `-claude-bin`, `-repo-poll 200ms`; headless Chromium 1280×800 through two throwaway specs on the committed helpers (deleted; `git status --porcelain` shows only the two sibling review parts)

Gates log read, not re-run: `web-build` and `e2e` green (540 passed); the one red line is `comments` (`web/src/style.css:2429`), which is review-work's.

Fixtures used: a 60-character launch folder on an 80-character branch, moved into a `.claude/worktrees/` worktree with a 44-character folder name on an 83-character branch; a short-named repo moved into `lightwt`/`stripwt`; a non-git launch directory with no hooks posted (no data yet); six sessions so the Tiles strip holds two cards.

## Matrix

Hosts: **rail** (Focus view `#sessions`), **strip** (Tiles view `#tiles-strip`, same card template), **focus** (`#mainhead`), **tile** (`article.tile .thead`). The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-10 | rail | data | two lines, folder over branch, each truncates on its own, comfortable | pass | `.rf` 14,139–288,152, `.rb` 14,152–288,165 (below it); both `text-overflow: ellipsis`, sw/cw 420/274 and 542/274; both inside card 0–299 |
| REQ-10 | rail | data | same, expanded | pass | same boxes; `.rf` sw/cw 420/274, `.rb` 542/274 |
| REQ-10 | strip | data | two lines, comfortable/expanded | pass | `.rf` 14,694–629,707, `.rb` 14,707–629,720 inside card 0–640 |
| REQ-10 | rail | no data | `repo: null` → one line, basename, no slash | pass | `.r2` = `.rf` only, text `muster-e2e-plain-…` (no `/`), `.rb` count 0; API `repo: null` |
| REQ-10 | strip | no data | same | N/A — a single session is tiled, so the strip holds no card | |
| REQ-10 | rail, focus | daemon-down | last snapshot keeps the two lines | pass | after SIGTERM: `.rf`/`.rb` still 274 px wide at y 171/184, beside `#banner` 0,46–1280,78 |
| REQ-11 | rail | data | compact keeps one line, inside the card | pass | `.r2` height 13 (130–143), `.rf` 14–131 and `.rb` 137–288 on the same top, `.rb` right 288 = `.r2` right, both clipped (sw 420/542 > cw 117/151) |
| REQ-11 | strip | data | compact one line | pass | `.r2` 749–762, `.rf` 14–170, `.rb` 177–258 on the same top |
| REQ-12 | rail | data | `↳` block after the repo block, same two-line shape | pass | `.r2c` display `grid`, 14,167–288,193 below `.r2` (165); `.lead` `↳` 14–21; `.rf` `worktree-… /` and `.rb` branch, each at x 26–288, ellipsized |
| REQ-12 | rail | data, compact | `↳` block one line | pass | `.r2c` 145–158 (13 px), display `flex` |
| REQ-12 | strip | data | `↳` block in each density, inside the card | pass | comfortable 722–748, compact 764–777; the strip card's children end at 790 inside a 641–800 card; the unmoved neighbour's card in the same row is the same height |
| REQ-12 | rail | no data / dead | hidden | pass | `.r2c` `[hidden]` with computed `display: none` (no data, dead, and dead + daemon-down); API `claudeLocation: null` once dead |
| REQ-12 | rail | daemon-down, moved | last snapshot stays | pass | `.r2c` still `grid` and visible, `#banner` visible (see Note 4) |
| REQ-13 | focus | data | folder capped at 30ch, branch at 44ch, model not truncated, 1280 | pass | unmoved long names: `.rf` cw 203 (30ch), `.rb` cw 298 (44ch); `.model` sw/cw 115/115, right 848 < `.meta` right 848 ≤ `.surfseg` left 902 |
| REQ-13 | focus | data, moved | `↳` block between repo and model; model never truncates | pass | at 1280: `.loc > .sep` 580–586, `.claude-at` 592–756, `.model` 774–890 sw=cw 115; at 1024: `.model` 518–634 sw=cw 115 while the name blocks shrink (Note 2) |
| REQ-13 | focus | dead | ended age after the model | pass | `.ended-at` visible 810–890, text `· ended now`; `.claude-at` `display: none` |
| REQ-13 | focus | no data | basename alone, no `↳`, model is the launch value | pass | `.rf` `muster-e2e-plain-…`, no `.rb`; `.loc > .sep` and `.claude-at` `[hidden]` with `display: none`; `.model` `haiku` |
| REQ-14 | focus | data | `.loc` title = lines 1–2 unmoved, 1–4 moved | pass | moved: `<repo> / <branch>`⏎`<dir>`⏎`Claude is in <wt dir>`⏎`on <wt branch>`, matching `/api/state` `directory`, `repo` and `claudeLocation` read in the same pass |
| REQ-14 | focus | no data | lines 1–2 | pass | `muster-e2e-plain-…`⏎`/private/var/…/muster-e2e-plain-…` |
| REQ-14 | rail, strip | data | `.r2` title = line 1; `.r2c` title = lines 3–4 | pass | `.r2` `<repo> / <branch>` one line; `.r2c` `Claude is in …`⏎`on …` |
| REQ-15 | tile | data | `.wh` one line with the REQ-14 title; `↳` glyph after it with hidden text | pass | `.wh` 59–482 one line, title is the four lines; `.wh-claude` display `block` 491–498, before `.ctxinfo` 507; `.sr-only` 1×1, text `Claude is in <wt dir>` |
| REQ-15 | tile | data, narrow tile (900 px viewport) | glyph not clipped | pass | `.wh-claude` 301–308 inside `.thead` 2–449, `.ctxinfo` from 317 |
| REQ-15 | tile | no data / dead / unmoved | glyph hidden | pass | `.wh-claude` `[hidden]` with computed `display: none` in all three |
| REQ-15 | tile | data, long names | session name still readable beside the long repo line | FAIL | `.nm` cw 21 of sw 61 (`r…`) beside `.wh` cw 423, at a 640 px tile; 12 px at a 450 px tile (Minor 1) |
| REQ-16 | rail, focus, tile, strip | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` and `.wh-claude` `rgb(178,182,195)` = `--fg-muted`; `.rf`/`.rb` `rgb(166,171,188)` = `--fg-dim`; neither equals `--rose`/`--amber` |
| REQ-16 | rail, focus, tile | data, Light | same | pass | `.lead`, `.wh-claude` `rgb(65,69,79)` = `--fg-muted`; `.rf`/`.rb` `rgb(73,77,92)` = `--fg-dim` |
| REQ-17 | focus | data | `button.rename` title = display title | pass | `title="rb-long"`, `"rb-br"`, `"rb-nodata"` |
| REQ-17 | focus | data | keeps keyboard focus across a re-render | pass | arrived by `Tab` from the previous tabbable (the rail pin button); after a `git checkout -b` upsert plus 1.5 s the same tagged node is still `activeElement`; `Enter` then opens `input.name-edit` |
| REQ-1 | rail, focus | data | the branch follows a checkout with no hook | pass | `.rb` → `kbd-branch` / `focus-branch` after a real `git checkout -b`, focus and rail both |
| REQ-1 | tile, strip | data | same | pass | tile `.wh` → `<repo> / tiles-branch`; strip `.r2 .rb` → `focus-branch` |
| REQ-1 | rail | dead | keeps the last-known branch | pass | the dead card keeps its long branch; API `repo` unchanged |
| REQ-5/12 | rail, focus, tile | data | `↳` only while Claude is in another checkout | pass | absent before the move, present after a main-agent `cwd` hook naming the worktree; API `claudeLocation.repo.isWorktree: true` |
| REQ-9 | focus | data | bind with a different id shows the id, then the status line's name | pass | launched `sonnet`, `SessionStart` `claude-sonnet-5-5` → `.model` `claude-sonnet-5-5`, API `displayName` = id; a status post → `.model` `Haiku 4.5` |
| REQ-9 | focus | no model (resumed from list) | `unknown`, then the id | not measured (Note 1) | |
| W11 | rail, focus | data, Instrument | matches `c-long-names.html` | pass | screenshots side by side: folder over branch, `↳` block indented under the glyph, model after the `·` |
| W11 | tile | data, long names | matches the mockup tile header | FAIL | the mockup keeps `rework shi…` beside the repo line; the app leaves 3 characters (Minor 1) |
| §7.1 | tiles, focus | data | one live client per session | pass | `totalAttachedClients` = 4 with 4 tiles of 6 sessions; 1 in Focus |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` full width 0,46–1280,78, `display: block`, text `musterd unreachable — hook output in open panes is Muster's …` |
| Hidden | rail, focus, tile | every toggled element | `[hidden]` computes `display: none` | pass | `.r2c` (comfortable and compact rules), `.claude-at`, `.loc > .sep`, `.ended-at`, `.wh-claude` all `display: none` while hidden |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** Tile header: with a long repo line, the session name all but disappears. `.thead .nm` and `.thead .wh` both shrink in proportion to their width, so an 80-character `<repo> / <branch>` leaves the title 21 px of 61 (`r…`) in a 640 px tile and 12 px in a 450 px tile, while `.wh` keeps 423 px. W11 binds the tile header to `c-long-names.html`, where the title keeps about 80 px (`rework shi…`) and the repo line is what truncates. The flex rules are older than this plan, but this plan's long-names edge case (24) is what exposes it. `web/src/style.css` `.thead .nm` / `.thead .wh`. A fix must make true: at a 420–640 px tile with edge case 24's names, `.nm` keeps a floor of several characters (for example the masthead title's `min-width: 6rem` pattern) and `.wh` gives up width first.

### Notes

1. **[note]** REQ-9 "no model" cell (a resumed-from-list session with a null model reads `unknown`, then the id) was not driven in the browser: it needs a past-session transcript fixture, and the rig's throwaway spec did not build one. The only evidence is that `card-location.spec.ts` E9 is green in the gate log.
2. **[note]** Focus header, moved with long names: once Claude has moved, both name blocks share what is left after the title, `.surfseg` and `.acts`. At 1280 each block is 131–158 px. At 1024 they fall to 22–32 px, close to their `2ch` floors. The model stays whole in both (sw = cw 115), as REQ-13 requires, and the mockup's narrow example shows the same trade-off. No change requested.
3. **[note]** The tile's `↳` glyph (`.wh-claude`) has no hover of its own. The hover sits on `.wh` beside it, as REQ-15 specifies.
4. **[note]** Daemon-down with a moved session: the `↳` block and its `Claude is in …` hover stay on screen from the last snapshot, carrying no age. The plan's States section says this ("the last snapshot stays on screen as today"), and the banner is up the whole time, so §6.8 is met through the banner.
5. **[note]** §7.4 (`scrollback: 0`) and §7.5 (pane styling) were not re-measured: the plan touches neither xterm nor pane contents.
6. **[note]** The gate log's red `comments` line (`web/src/style.css:2429`, a plan ID in a comment) belongs to review-work.

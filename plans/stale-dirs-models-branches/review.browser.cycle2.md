# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at 5fc71f1, giving `bin/musterd`. Each test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-XXXX`, a path with a space), its own `-tmux-socket` inside that dir (the harness teardown kills it), the E2E stub `claude` via `-claude-bin`, and `-repo-poll 200ms`. Driven in headless Chromium through throwaway specs built on the committed helpers. The specs are deleted; `git status --porcelain` shows only the two sibling review parts.

I read the gates log in `gates-stale-dirs-models-branches-c2` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 540.

This cycle's web fix is 627d509 (a floor for the tile title, and one shared layout for the `↳` block). I measured it first, then re-drove the whole matrix.

Fixtures:
- A 60-character launch folder on an 80-character branch. Two sessions sit in it: one moves into a `.claude/worktrees/` worktree with a 44-character folder on an 83-character branch, and the other stays put.
- A short repo named `muster`, moved into `probewt`.
- A plain directory that is not a git repo, with no hooks posted (the no-data state).
- One-character and three-character session titles.
- A launch directory renamed away while its session is alive (REQ-2).
- A tmux window killed after a checkout (the dead state).
- A resumed-from-list session with no model.
- Viewports of 1280, 1100, 1024, 960, 900, 800 and 700 px.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **strip**: Tiles view, `#tiles-strip`, the same card template as the rail.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-10 | rail | data | two lines, folder over branch, each truncates on its own (comfortable and expanded) | pass | `.rf` 14,139–288,152 and `.rb` 14,152–288,165, both ellipsized (sw/cw 420/274 and 542/274), inside card 0–299; same boxes in expanded |
| REQ-10 | strip | data | two lines | pass | `.rf` 14,690–629,703 and `.rb` 14,703–629,716, inside strip card 0,636–640,800 |
| REQ-10 | rail | no data | `repo: null` gives one line, the basename, no slash | pass | `.r2` holds only `.rf`, text `muster-e2e-plain-…`; `.r2c` `[hidden]` with computed `display: none` |
| REQ-10 | rail, focus | daemon-down | the last snapshot keeps both lines | pass | after SIGTERM, `.rf`/`.rb` are still 274 px wide at y 171/184 under `#banner` 0,46–1280,78; Focus `.rf` and `.claude-at` are still drawn |
| REQ-11 | rail | data, compact | one line, inside the card | pass | `.r2` is `flex`, 130–143; `.rf` 14–131 and `.rb` 137–288 on the same top, both clipped |
| REQ-11 | strip | data, compact | one line | pass | `.rf` 14–279 and `.rb` 286–629 on one 747–760 line |
| REQ-12 | rail | data | `↳` block after the repo block, **same two-line shape** | FAIL | `.r2c` 14,167–288,197 is `grid`, lead 14–21, `.rf`/`.rb` at x 26–288, all ellipsized. But its lines are 15 px tall (line-height 15.19 px) while the `.r2` lines above are 13 px (`normal`). In cycle 1 the block was 26 px; it is now 30 px (Minor 1) |
| REQ-12 | rail | data, compact | `↳` block on one line | pass, with the same line-height gap | `.r2c` is `flex`, 145–160 (15 px), against `.r2` 130–143 (13 px) |
| REQ-12 | strip | data, comfortable and compact | `↳` block inside the card | pass | comfortable 718–748 and compact 762–777, inside cards that end at 800 |
| REQ-12 | rail | no data, dead | hidden | pass | `.r2c` `[hidden]` with computed `display: none` in both; API `claudeLocation: null` for the dead session |
| REQ-12 | rail | daemon-down, moved | the last snapshot stays | pass | `.r2c` still `grid` at 199–229, banner visible |
| REQ-13 | focus | data, moved, 1280 | caps on each line; `↳` block between repo and model; model whole | pass | repo `.rf`/`.rb` cw 131; `.loc > .sep` 553–560; `.claude-at` 566–701 (`grid`, gap 5 px); `.meta > .sep` 707–714; `.model` 720–890 with sw = cw 169; `.surfseg` starts at 902 |
| REQ-13 | focus | data, moved, 1100 | same | pass | name blocks are 42 and 44 px; `.model` 540–710 whole; `.surfseg` starts at 722 |
| REQ-13 | focus | data, moved, 1024 | name blocks shrink without overpainting; model whole | FAIL | `.claude-at` box is 440–445 (cw 5), but its `.rf` is drawn at 452–465, on top of `.meta > .sep` 451–458 and 1 px into `.model` (464). The repo `.rf` (416–430) likewise covers `.loc > .sep` (427–434). In the screenshot, `l… · ↳ w…` runs into the `·` (Major 1). Model 464–634 is whole |
| REQ-13 | focus | data, moved or unmoved, ≤ 960 | model never truncates | FAIL | `.meta` has `overflow: hidden`. At 960 its right edge is 570 while `.model` spans 435–604, so 34 px are clipped. At 900, `.meta` ends at 510 and the model reads `claude-haik`; `elementFromPoint` at the model's centre hits `DIV.mainhead`. At 800, `.meta` cw is 0. This holds for the unmoved long session and for the short-named moved one too (Major 2) |
| REQ-13 | focus | dead | ended age after the model | pass (carried over) | not re-driven this cycle; no change since cycle 1 touches `.ended-at`. Its hidden state measured `display: none` |
| REQ-13 | focus | no data | basename alone, no `↳`, model is the launch value | pass | `.rf` `muster-e2e-plain-…` 416–572; `.loc > .sep` and `.claude-at` `[hidden]` with `display: none`; `.model` `haiku` |
| REQ-14 | focus, tile | data, moved | four-line title | pass | `.wh` title is `<repo> / <branch>`⏎`<dir>`⏎`Claude is in <wt dir>`⏎`on <wt branch>`, matching `/api/state` `repo` and `claudeLocation` read in the same test |
| REQ-14 | tile | data, unmoved | two-line title | pass | `.wh` title is `<repo> / <branch>`⏎`<dir>` |
| REQ-15 | tile | data, long names, 1280 / 900 / 700 | the title keeps a floor and `.wh` gives way first (the cycle 1 Minor) | pass | `.nm` stays at its 75 px floor at every width (sw 154 / cw 75, `rework-s…`), where cycle 1 measured 21 and 12 px. `.wh` shrinks 369, then 179, then 79 px. The `.wh-claude` glyph stays inside `.thead` (1131–1137 in 642–1278; 751–757 in 452–898; 551–557 in 352–698), and `.ctxinfo` follows inside |
| REQ-15 | tile | data, short titles | the floor adds nothing beyond the mockup | pass, see Note 2 | `a`, `nb0` and `vanisher` each get a 75 px `.nm` box, so `.wh` always starts at +84 px. `c-long-names.html` `.thead .nm` has the same `min-width: 5rem` |
| REQ-15 | tile | no data, unmoved | glyph hidden | pass | `.wh-claude` `[hidden]` with computed `display: none` |
| REQ-16 | rail, focus | data, Instrument | glyph is `--fg-muted`, text `--fg-dim` | pass | `.lead` `rgb(178,182,195)` = `--fg-muted`; `.rf`/`.rb` `rgb(166,171,188)` = `--fg-dim`; neither matches `--rose` or `--amber` |
| REQ-16 | rail, focus | data, Light | same | pass | `.lead` `rgb(65,69,79)` = `--fg-muted`; `.rf` `rgb(73,77,92)` = `--fg-dim` |
| REQ-17 | focus | data | `button.rename` title is the display title | pass | `title="kbd-focus"` |
| REQ-17 | focus | data | keeps keyboard focus across a re-render | pass | arrived by `Tab` from the previous tabbable (the rail `Pin` button). After a real `git checkout -b` re-rendered the header and 1.5 s passed, the same tagged node was still `activeElement`, and `Enter` opened `input.name-edit` |
| REQ-1 | rail, focus | data | the branch follows a checkout with no hook | pass | `.rb` changed to `kbd-branch` after a real `git checkout -b` |
| REQ-1 | tile | data | same | pass | `.wh` changed to `<repo> / tiles-branch` |
| REQ-1 | rail | dead | keeps the last-known branch | pass | after `kill-window` and then a checkout of `after-death`, the API `repo.branch` and `.rb` both still read `before-death`; `alive: false`; `claudeLocation: null` |
| REQ-2 | rail | data, launch dir renamed away | keeps the last-known repo (cycle 1 daemon fix 02c9493) | pass | `/api/state` `repo` is identical before and after 2.5 s (about 12 poll ticks) with the directory gone; `.rf`/`.rb` still show the long folder and branch |
| REQ-9 | focus | no model (resumed from list) | `unknown`, then the id | pass (closes cycle 1 Note 1) | API `model: null`, so `.model` reads `unknown`; after `SessionStart` names `claude-sonnet-5-5`, the DOM shows `claude-sonnet-5-5` and the API has `{id, displayName}` both set to the id |
| REQ-9 | focus | data, bind with a different id | the id shows | pass | `SessionStart` with `claude-haiku-4-5-20251001` after a `haiku` launch makes `.model` read the id (this is the 169 px readout Major 2 measures) |
| W11 | rail | data, Instrument | matches `c-long-names.html` | FAIL | the mockup's `.r2`/`.r2b` set no line-height, so both blocks share one rhythm; the app's `↳` lines are 2 px taller (Minor 1) |
| W11 | tile | data, long names | matches the mockup tile header | pass | `.nm` `flex: 0 1000 auto; min-width: 5rem`, as the mockup's `.thead .nm` |
| §7.1 | tiles, focus | data | one live client per session | pass | `tmux list-clients` shows `muster-1:0` and `muster-2:0` with two sessions tiled, and only `muster-1:0` in Focus |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` spans 0,46–1280,78, `display: block`, text `musterd unreachable — hook out…` |
| Hidden | rail, focus, tile | every toggled element | `[hidden]` computes `display: none` | pass | `.r2c`, `.claude-at`, `.loc > .sep`, `.ended-at` and `.wh-claude` are all `display: none` while hidden (the shared `.r2c[hidden], .mainhead .meta .claude-at[hidden]` rule) |

## Issues

### Critical

(none)

### Major

1. **[web-impl]** In the Focus header at a 1024 px window, with a moved session, the name blocks paint over the separators. `.mainhead .meta .loc .repo` and `.claude-at` shrink to cw 5 px. Their `.rf`/`.rb` keep their `min-width: 2ch` (14 px) floor and overflow, because nothing on the containers stops them shrinking below their children: `.claude-at` has `min-width: 0` from the shared rule.
   - Measured: `.claude-at .rf` 452–465 sits over `.meta > .sep` 451–458, and repo `.rf` 416–430 sits over `.loc > .sep` 427–434. The screenshot shows `l…` and `w…` colliding with the `·` glyphs.
   - Cycle 1 did not reach this state: its model was the 115 px display name. REQ-9 now shows the 169 px id (`claude-haiku-4-5-20251001`) until the status line arrives, which takes about 54 px from the name blocks.
   - Where: `web/src/style.css`, the `.mainhead .meta .loc` group.
   - A fix must make this true: at every width where the blocks are on screen, no `.rf`/`.rb` box extends past its container's box, and no box overlaps either `.sep` or `.model`. Either the containers keep the children's floor, or the blocks collapse together.
2. **[orchestrator:decision]** In the Focus header at ≤ 960 px (a half-screen window on a 1920 display), `.meta` (`overflow: hidden`) clips the model, which REQ-13 says never truncates.
   - Measured: at 960, 34 of 169 px are clipped; at 900 the model reads `claude-haik`; at 800 `.meta` is 0 px wide. This happens unmoved as well as moved, and with short names as well as long.
   - Edge case 24 and E11 bind 1280 only, so the e2e suite cannot see it. The masthead already accepts a truncated model at narrow widths (kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model).
   - **Option A**: REQ-13 holds at every width. Below the point where the meta's name blocks reach their floors, the blocks give way (hidden, or collapsed to the `↳` glyph) before the model loses a pixel. The title is already at its 6rem floor.
   - **Option B**: REQ-13 holds at ≥ 1024 px, the narrowest width at which the model still measures whole. Below that the model ellipsizes like the masthead's, and the plan and feature spec say so.

### Minor

1. **[web-impl]** On the rail card, the `↳` block's lines are taller than the repo block's. 627d509 moved `line-height: 1.35` into the shared `.r2c, .mainhead .meta .claude-at` rule, so on the card the `↳` lines are 15.19 px while `.r2`'s lines stay at `normal` (13 px).
   - Measured: comfortable `.r2c` is 167–197 (30 px), where cycle 1 measured 167–193 (26 px); compact `.r2c` is 15 px against `.r2`'s 13 px.
   - Why it fails: REQ-12 asks for "the same two-line shape", and the mockup's `.r2`/`.r2b` share one line height.
   - Where: `web/src/style.css`, the shared `.r2c` rule (about line 2173).
   - A fix must make this true: on the rail card and strip card, `.r2c`'s line boxes are the same height as `.r2`'s. The header's `.repo` and `.claude-at` already match each other at 15.19 px.

### Notes

1. **[note]** The cycle 1 Minor (the tile title squeezed to `r…`) is fixed. `.nm` holds its 75 px floor at 640, 450 and 350 px tiles, and `.wh` gives way first.
2. **[note]** The new 5rem floor also widens short titles. `a` and `nb0` each get a 75 px box, so the repo line starts about 50 px past the end of the text. `c-long-names.html` uses the same `min-width: 5rem`, so this matches the mockup. No change requested.
3. **[note]** I did not re-drive the daemon-down state in the Tiles view (tile and strip hosts) this cycle. Cycle 1 measured the banner and the rail/focus snapshot, and this cycle re-measured those. No change since cycle 1 touches the tile header's offline path.
4. **[note]** §7.4 (`scrollback: 0`) and §7.5 (pane styling) were not re-measured. The plan touches neither xterm nor pane contents.
5. **[note]** `$TMPDIR/muster-e2e-loc-FO3g6A` is a scratch repo dated 14:52, before this review's runs started (15:12). Some earlier run did not clean it up, and I left it alone.

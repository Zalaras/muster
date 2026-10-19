# Browser review: See added directories

**Plan**: see-added-dirs
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 12278 words (budget 30000)
**Rig**: `make web-build build` at 9f60d26b (`v0.22.2-29-g9f60d26b`, 17:42); per-test scratch daemons from `helpers/fixtures.ts` (`repoPoll: "200ms"`), space-bearing data dirs (`…/T/muster e2e-f58d7fd5-*`), a private tmux socket per daemon (torn down by the fixture), stub `claude` `2.0.0-e2e-stub`; headless Chromium driven by a throwaway `web/e2e/zz-review-browser.spec.ts` (deleted); real scratch git checkouts and plain dirs as the added directories.

Gates log `gates-see-added-dirs-c1b`: every line green (`17-e2e` 981 passed; `04-web-build` built). The app I drove is the one that ships.

## Matrix

Hosts: **focus** (`#mainhead`, the only surface that renders `addedDirs`), **tiles** (tile `.thead .wh`), **rail** (card `.r2`). **pop-out** (`/doc.html`) is the docs reader's host and carries no session header: N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 / INV-3 | focus | no data | no suffix | pass | `.rf` textContent `muster-e2e-loc-UcDHzE /`, class `rf`, no `span.plus` |
| REQ-6 / INV-3 | focus | data (3 dirs: 2 git, 1 plain) | `+N` = length, last child of `.rf` | pass | `.rf` reads `muster-e2e-loc-UcDHzE+3`; wire `addedDirs.length` 3 (`/api/state`, branches `main`,`feature-x`,`null`) |
| REQ-6 / R1 | focus | data | suffix in `--fg-muted` | pass | computed `rgb(178,182,195)` = `--fg-muted` (instrument); light `rgb(65,69,79)` = token; dark `rgb(193,197,204)` = token |
| REQ-6 | focus | data | visible | pass | `display:block`, `visibility:visible`, `opacity:1`; `elementFromPoint` at its right edge hits the suffix |
| REQ-6 | focus | data | suffix never ellipsized, name gives way first, 1280→600 px in 8 px steps | pass | 60-char folder +1: 86/86 widths suffix inside `.rf` and hit-tested, name ellipsized at 56 of them; at 600 name box 416–459, suffix 459–472.6, `.rf` right 472.6. Same sweep with `+2` and `+12`: 0 failures |
| REQ-6 | focus | data | header fit invariants hold with `+12`, 1280→600 px in 8 px steps | pass | `mainheadFitProblems` empty at all 86 widths |
| REQ-6 | focus | data | suffix keeps its node across a render tick | pass | same `span.plus` node after 1.3 s |
| REQ-6 | focus | data, plain launch dir | `<basename>+N` | pass | `muster-e2e-plain-2INQ2d+1` |
| REQ-6 | focus | moved (↳ shown) | suffix does not change when the ↳ block hides, 1920→1000 px in 40 px steps | pass | ↳ `hidden`/`display` identical with and without `+2` at every width (grid at 1920, none at 1000) |
| REQ-6 / INV-1 | focus | dead | no suffix | pass | after `/end`, settled 1.5 s: `.rf` `muster-e2e-loc-QTbnHn /`, no `.plus` |
| REQ-6 | focus | daemon-down | suffix kept with last snapshot | pass | `+1` still drawn 1.2 s after SIGTERM, hit-tested |
| REQ-4 / E4 | focus | data, after restart | `+N` and branches come back | pass | `+12` after restart + reload; panel rows carry `· main`; 4-dir case: wire repos null at t≈0, all read by t≈1 s |
| REQ-7 / W2 | focus | all states | `.loc` has no `title` | pass | `getAttribute("title")` null in no data, data, dead, daemon-down |
| REQ-7 | focus | no data | panel: Location + launch row only | pass | `LOCATION / muster-e2e-loc-UcDHzE · main / <path>`; no `Added` sub-heading |
| REQ-7 | focus | data | panel content, wire order, plain dir without branch | pass | `ADDED DIRECTORIES · 3`, rows `…LpEou8 · main`, `…I70QLW · feature-x`, `muster-e2e-plain-0YorJU` (no branch), each over its path |
| REQ-7 / W3 | focus | moved | `↳` row while `claudeLocation` non-null, then the added list | pass | `↳muster-e2e-loc-PeytmN · main` row between launch row and `ADDED DIRECTORIES · 2` |
| REQ-7 | focus | dead | panel Location only | pass | settled dead session: panel has no Added section |
| REQ-7 | focus | dead **while the panel is open** | a dead session never shows directories | FAIL | panel kept `ADDED DIRECTORIES · 2` and both rows 1.5 s after the session ended, while the header beside it had already dropped the suffix (Minor 1) |
| REQ-5 / E5 | focus | data, branch changed **while the panel is open** | panel shows the current branch | FAIL | wire `addedDirs[0].repo.branch` `while-open`; panel still read `· main` 1.2 s later (Minor 1) |
| REQ-7 | focus | data | placed under the readout, inside the viewport | pass | readout 499,55–673.4,85.4; panel 499,89.4–879,315.4 in 1280×800; at 600 px: 212–592 inside 600; at 480: 92–472 |
| REQ-7 | focus | data, 2-line paths ×15 (1280×800) / ×13 (720) / ×18 (900) | panel under the readout, not covering it | FAIL | panel flips to top 8: 499,8–879,726 overlaps the readout 55–85.4 and the session name (decision 1) |
| REQ-7 / edge 15 | focus | data, many dirs | every row visible | FAIL | 22 long-path dirs: panel 499,8–879,1281 in an 800 px viewport; 20 short-path dirs: bottom past 800; `pointer-events:none`, `overflow:visible` — rows past the bottom edge cannot be reached (decision 1) |
| REQ-7 | focus | data | rows wrap inside `.pop`'s max width | pass | 51-char unhyphenated folder and a 47-char branch: no child box outside the panel box, no child `scrollWidth > clientWidth` |
| REQ-7 | focus | data | visible | pass | `display:block`, `visibility:visible`, `opacity:1` |
| REQ-7 | focus | data | stays open across a render tick while hovered | pass | same tooltip node after 1.3 s |
| REQ-7 | focus | data | leave closes, pointerdown closes | pass | count 0 after `mouse.down()` on the readout; count 0 after moving to 0,0 |
| REQ-7 | focus | daemon-down | opens with last-known values | pass | banner `musterd unreachable — …` display block, box 0,46–1280,78; panel opened after 352 ms with `ADDED DIRECTORIES · 1` and the last-known rows, below the shifted readout (87–117.4 → panel top 121.4) |
| REQ-7 | focus → tiles | panel open | the panel does not survive a view switch | pass | Cmd+Backslash with the panel open: tooltip count 0 in Tiles |
| REQ-9 | focus | no data / data / daemon-down | hover delay = group popover's | pass | `mouseenter`→tooltip append measured 353 / 353 / 352 ms (`POPOVER_DELAY_MS` 350) |
| REQ-9 | focus | data | `pointer-events:none`, parent is `body`, `role=tooltip` | pass | computed `none`; `parentElement === document.body`; `pop loc-pop` |
| REQ-5 | focus | data, 1–24 dirs | branch reading arrives | pass (slow) | time to every `repo` set: 1 dir 546 ms, 4 dirs 970 ms, 12 dirs 2543 ms, 24 dirs 5707 ms (≈220 ms per directory) |
| REQ-5 / card-location branch | focus | data, 32 dirs | the session's own branch and the added readings refresh | FAIL | after `git checkout -b moved-launch` in the launch repo: wire `repo.branch` and header `.rb` still `main` 25 s later; 0 of 32 added dirs ever read (Major 1) |
| REQ-5a | focus | data | a not-yet-read / non-git dir shows folder + path | pass | plain dir row `muster-e2e-plain-0YorJU` over path, wire `repo:null` |
| REQ-8 | rail | data (+3) | no suffix, hover unchanged | pass | `.r2` text `muster-e2e-loc-UcDHzE /main`, `title` `muster-e2e-loc-UcDHzE / main`, 0 `.plus` |
| REQ-8 | tiles | data (+3) | no suffix, hover unchanged, no panel | pass | `.wh` `muster-e2e-loc-UcDHzE / main`, `title` launch line + path, 0 `.plus`; hovering `.wh` 800 ms opens no tooltip; no visible `.plus` anywhere in Tiles |
| REQ-8 | pop-out | any | unchanged | N/A — `/doc.html` hosts the docs reader, no session header | |
| REQ-6/7 | tiles | any | header suffix / panel | N/A — plan: rail card and tile header do not change | |
| Hidden | focus | all | `[hidden]` elements computed `display:none` | N/A — no element this plan adds is toggled by `hidden` (`.claude-at` pre-existing; measured `display:none` while `hidden`) | |
| §6 honesty | focus | daemon-down | daemon-down surfaced prominently | pass | `role=alert` banner full width at 46–78, visible computed |
| §6 honesty | focus | no data | absence of suffix is not an unknown-drawn-as-zero | pass | plan States: `[]` means nothing known added; no gauge or count drawn |
| §7 terminal | all | all | one live client, geometry, scrollback, pane styling | N/A — plan touches no terminal surface; not measured this cycle | |

## Issues

### Critical

(none)

### Major
1. **[daemon-impl]** With many added directories the repo poll's reading for the whole session is thrown away every tick, so the session's **own** branch stops refreshing. `internal/server/reporefresh.go` `readRepoState` reads every added directory (three git calls each, ≈220 ms per directory measured) inside the per-session `repoReadTimeout` (5 s), and a reading whose context expired is discarded (`ok` false). Measured: with 32 added directories, `git checkout -b moved-launch` in the launch checkout was still `main` on the wire and in the Focus header 25 s later, and none of the 32 directories ever got a `repo`; with 24 the reading only just completed (5.7 s). Because the loop is serial, each such session also holds every other session's refresh back by up to 5 s per tick. A fix must make true: the launch directory's branch, worktree flag and `claudeLocation` keep refreshing within one tick however many directories are added, and every added directory eventually gets its reading (or keeps its last-known one), never a permanent null. No spec covers a list this long; the regression test belongs with the fix wave's test agent.

### Minor
1. **[web-impl]** The open panel is a snapshot and never follows the session. With the mouse resting on the readout: (a) the session ended — the header dropped `+2`, but the panel kept `Added directories · 2` and both rows 1.5 s later, so a dead session shows directories (REQ-3, INV-1); (b) an added directory's branch changed to `while-open` on the wire — the panel kept `· main` 1.2 s later. The developer can end a session from the keyboard (`/exit` in the terminal) while the mouse sits on the header, so (a) is reachable. `web/src/render/locationpanel.ts` (built once in `show`), `web/src/features/focus.ts` (closes only on `focusChanged`). A fix must make true: while open, the panel shows what the focused session's latest upsert says (rebuilt, or closed on change), and never an Added section on a dead session.

### Decisions
1. **[orchestrator:decision]** How the location panel behaves when its rows do not fit under the readout. Measured at 1280 px wide with 83-character paths (each path wraps to two lines): the panel no longer fits below the readout at 15 directories (800 px tall), 13 (720) and 18 (900). `placeAnchored` then moves it to top 8, where it covers the readout and the session name. At 20+ directories it runs past the bottom of the viewport: 22 long paths give 8–1281 in an 800 px viewport. Because the panel is `pointer-events: none` with no overflow rule, the rows past the edge cannot be reached. Edge case 15 says "the panel lists all", and with this many rows that cannot be done inside the viewport without a scroll the panel cannot take.
   - **Option A — bound the panel:** cap the rows at what fits below the readout and end with a stated `+K more` line, so the panel never covers the readout or leaves the viewport. Cost: a new visible line and a plan amendment to edge case 15. It also means the full list is not shown anywhere.
   - **Option B — accept as is:** keep listing every row and record that past about 13–20 directories (depending on viewport height) the panel covers the header and drops rows off-screen. Cost: none now. The panel is wrong only at counts the developer is unlikely to reach.

### Notes
1. **[note]** Below the 600 px header floor the panel follows the header out of the viewport: at 360 px it spans 8–379.4 (the header itself already overflows at that width with no suffix, as the impl log measured). This is outside the supported range, so no change is asked.
2. **[note]** For review-work, wire values seen in passing that the panel does not show: an added directory that is a plain subdirectory of a checkout reads `isWorktree: true` (`…/muster-e2e-loc-xcJOjc/sub0` → `{name: "muster-e2e-loc-xcJOjc", branch: "main", isWorktree: true}`). The launch-directory reading for the same subdirectory names it `sub0` (`{name: "sub0", isWorktree: true}`), while the added-directory row names the checkout's top level. So the same directory reads as `sub0 · main` in the Location row and as `muster-e2e-loc-xcJOjc · main` in the Added list.
3. **[note]** §7 terminal rules were not measured. This plan changes no terminal surface, sizing or client path.
4. **[note]** Keyboard access to the panel was not measured, because the plan puts it out of scope (mouse only).
5. **[note]** Light and dark were measured by setting `data-theme` on the root (the theme control was not driven). They confirm only that the suffix resolves to each theme's `--fg-muted`. Contrast is gate `07-contrast` (green).
6. **[note]** `git status` shows `docs/diagrams/web-components.md` modified (module counts 41→42, 16→17, mtime 17:49). This review did not make that change. It is not part of this review's output.

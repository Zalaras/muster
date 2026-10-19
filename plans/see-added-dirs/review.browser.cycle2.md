# Browser review: See added directories

**Plan**: see-added-dirs
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 13214 words (budget 30000)
**Rig**: `make web-build build` at 99160192 (`v0.22.2-44-g99160192`); per-test scratch daemons from `helpers/fixtures.ts` (`repoPoll: "200ms"`, plus one `startDaemon({})` on the daemon's default 5 s poll for the Major 1 re-measure), data dirs with spaces in their paths (`…/T/muster e2e-*`), a private tmux socket per daemon (the fixture tears it down), stub `claude`; headless Chromium driven by a throwaway `web/e2e/zz-review-browser-c2.spec.ts` (deleted). The added directories are real scratch git checkouts, plain directories, subdirectories and a linked worktree.

Gates log `gates-see-added-dirs-c2`: 0 failed lines (`17-e2e` 987 passed; `04-web-build` built), so the app I drove is the one that ships. After the run, `git status --porcelain` shows nothing of mine (only the other reviewers' part files). No scratch daemon or tmux server is left running.

This cycle re-measured the cycle 1 defects (browser Major 1 and Minor 1), the shared hover lifecycle (`render/hovertip.ts`) that the location panel **and** the rail group popover now run on, the folder-name rule change (`folderName`, `partsOf` `slash`), and the full cycle 1 matrix against the new build. Decision 1 is settled as B. Its cells below confirm the behaviour the amended edge case 15 records. They do not re-raise it.

## Matrix

Hosts: **focus** (`#mainhead`, the only surface that renders `addedDirs`), **tiles** (tile `.thead .wh`), **rail** (card `.r2`, and the group header popover now on the shared controller). **pop-out** (`/doc.html`) hosts the docs reader and has no session header, so it is N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 / INV-3 | focus | no data | no suffix | pass | `.rf` textContent `muster-e2e-loc-Y7xGrV /`, 0 `.plus` |
| REQ-6 / INV-3 | focus | data (2 git, 1 plain) | `+N` = length | pass | `.rf` `muster-e2e-loc-9RMqFP+3`; wire `addedDirs` length 3, branches `main`, `feature-x`, `null` |
| REQ-6 / R1 | focus | data | suffix in `--fg-muted` | pass | computed `rgb(178, 182, 195)`, token `#b2b6c3`. `style.css` is unchanged since cycle 1, which measured light and dark |
| REQ-6 | focus | data | visible | pass | `display:block`, `visibility:visible`, `opacity:1`; `elementFromPoint` at its right edge hits the suffix |
| REQ-6 / W4 | focus | data, 60-char folder `+12`, 1280→600 px in 8 px steps | suffix never ellipsized, name gives way, header fit invariants hold | pass | 86 widths: suffix inside `.rf`, hit-tested, `scrollWidth ≤ clientWidth`, `mainheadFitProblems` empty at all of them. The name is ellipsized at 57 |
| REQ-7 / W2 | focus | no data / data | `.loc` has no `title` | pass | `getAttribute("title")` null in both |
| REQ-7 | focus | no data | panel: Location + launch row only | pass | `Location` / `…Y7xGrV · main` / path; 1 `.dr`, no `Added` |
| REQ-7 / R2 | focus | data | panel content, wire order, plain dir without branch, mockup structure | pass | `Added directories · 3`, rows `…DWUYdr · main`, `…KZ5VJG · feature-x`, `muster-e2e-plain-8FfEAk` (no branch), each over its path; children `ph, dr, sub, dr, dr`; row DOM `.dr > .df (folder <span.b> · main) + .dp path`, the same as `final.html`'s `row()`; screenshot compared side by side with the mockup's "two added, panel open" state |
| REQ-7 / W3 | focus | moved (↳) | `↳` row between launch row and added list | pass | `Location / sub0 · main / … ↳ muster-e2e-loc-ZcnKDe · main / … Added directories · 2 / …`, 4 rows, panel 499,89.4–879,315.4 under readout 55–85.4 |
| REQ-7 | focus | data | placed under the readout, inside the viewport | pass | readout 499,55–673.4,85.4; panel 499,89.4–879,315.4 in 1280×800; at 600: panel 212–592 inside 600; at 480: 92–472 |
| REQ-7 | focus | data | visible, `role=tooltip`, parent `body`, `pointer-events:none` | pass | computed `block`/`visible`/`1`/`none`; `parentElement === document.body` |
| REQ-7 | focus | data, hovered, nothing changes | open panel keeps its node across a render tick | pass | same node after 1.3 s (the `refresh` key is unchanged, so the panel is not rebuilt) |
| REQ-7 | focus | data | leave closes, pointerdown closes | pass | count 0 after `mouse.down()`; count 0 after moving to 0,0 |
| REQ-7 / REQ-5 (cycle 1 Minor 1b) | focus | data, added dir's branch changes **while open** | open panel shows the new branch | pass | `git checkout -b while-open`: the open panel read `· while-open` 851 ms later with no re-hover; tooltip count 1; still under the readout (89.4–274.4) |
| REQ-7 (cycle 1 Minor 1, other path) | focus | data, **launch** branch changes while open | open panel and header follow | pass | `launch-moved` in the panel 855 ms later; header `.rb` `launch-moved` |
| REQ-7 / REQ-1 | focus | data, shorter list posted while open | open panel follows the count | pass | `Added directories · 1` with the one remaining row; header `+1` |
| REQ-3 / INV-1 (cycle 1 Minor 1a) | focus | dead **while the panel is open** | no Added section on a dead session | pass | after `/end`, settled 1.5 s: open panel `Location / …4GAjQg · launch-moved / path` only, 1 `.dr`, box 89.4–168.4; header suffix gone; wire `addedDirs` `[]` |
| REQ-7 | focus | data, focus moved to another session by keyboard (⌥⌘1 / ⌥⌘2) with the panel open | no stale panel for the other session | pass | tooltip count 0 after each chord, settled 1.3 s (closed on `focusChanged`; no panel for the wrong session) |
| REQ-7 / edge 16 | focus | daemon-down, panel open when the daemon dies | no panel stranded over the shifted header | pass | the banner (0,46–1280,78) pushes the readout to 87–117.4, out from under the pointer, and the panel closes (count 0 after 1.5 s), so it never covers the banner at the old spot |
| REQ-7 / W5 / edge 16 | focus | daemon-down | opens with last-known values | pass | re-hover: panel 499,121.4–879,347.4 under the shifted readout, `Added directories · 3` with `feature-x`; header keeps `+3` |
| §6 honesty | focus | daemon-down | daemon-down surfaced prominently | pass | `role=alert` banner, full width at 46–78, `display:block`, `opacity:1` |
| REQ-4 / E4 | focus | data, after restart | `+N` and branches come back | pass | `+3` after `daemon.restart()` and reload; the panel carries `feature-x` again; wire branches `main`, `feature-x`, `null` |
| REQ-9 | focus | data | hover delay = group popover's | pass | real pointer move to `mouseenter`, then tooltip append: 353.4 ms (`POPOVER_DELAY_MS` 350) |
| REQ-5 (cycle 1 Major 1) | focus | data, 32 added checkouts, 5 s poll | launch branch refreshes within a tick; every added dir read | pass | all 32 read 1.9 s after the post; launch `checkout -b` reached the wire in 3963–4988 ms and the header 6 ms later; the last dir's new branch arrived in 4.9 s |
| REQ-5 (cycle 1 Major 1) | focus | data, 64 added checkouts | same | pass | all 64 read in 1.9 s; launch branch 5975 ms (one 5 s tick plus the read); last dir 4.96 s |
| REQ-5 (cycle 1 Major 1) | focus | data, 200 added checkouts | same | pass | all 200 read in 3.9 s; launch branch 4939 ms; the 200th dir's new branch 4.95 s |
| REQ-5 (correctness Major 1 of cycle 1) | focus | data, added subdir of an ordinary checkout, a linked worktree | worktree flag on the wire and in the panel | pass | `…/pkg` → `{name: muster-e2e-loc-ptkvVm, branch: main, isWorktree: false}`; `wt1` → `isWorktree: true`; panel rows `muster-e2e-loc-ptkvVm · main`, `wt1 · worktree-wt1` |
| REQ-5a | focus | data | a non-git dir shows folder + path | pass | `muster-e2e-plain-8FfEAk` over its path, wire `repo: null` |
| REQ-7 / edge 15 (amended) | focus | data, 15 dirs (800 px tall) | flips to the top, every row inside the viewport | pass | panel 8–726, 16 rows, last row bottom 719 |
| REQ-7 / edge 15 (amended) | focus | data, 22 dirs | every row listed, rows past the viewport are the recorded limit | pass (recorded limit) | panel 8–1013, 23 `.dr`, last row bottom 1006 > 800, as `kb:adr/focus-location-panel-lists-every-row` records |
| REQ-8 | rail | data (+3) | no suffix, hover unchanged | pass | `.r2` `muster-e2e-loc-9RMqFP /main`, `title` `muster-e2e-loc-9RMqFP / main`, 0 `.plus` |
| REQ-8 | tiles | data (+3) | no suffix, hover unchanged, no panel | pass | `.wh` `… / main`, `title` launch line + path, 0 `.plus`; hovering `.wh` for 800 ms opens no tooltip |
| REQ-7 | focus → tiles | panel open | the panel does not survive a view switch | pass | Cmd+Backslash with the panel open: tooltip count 0 |
| groups popover (shared `hovertip`) | rail | data (group of 2) | delay, visible, placement, identity, close paths unchanged | pass | delay 354.7 ms; `block`/`visible`/`1`/`pointer-events:none`, `role=tooltip`, parent `body`; box 8,152–228,236 under the header 114–148; same node after 1.3 s; pointerdown closes (count 0) |
| groups popover (shared `hovertip`) | rail | data | keyboard focus opens, keeps focus, blur closes | pass | Tab to the caret: focused and count 1; still focused after 1.3 s; Tab away: count 0 |
| REQ-8 | pop-out | any | unchanged | N/A — `/doc.html` hosts the docs reader, no session header | |
| REQ-6/7 | tiles | any | header suffix / panel | N/A — plan: the tile header does not change | |
| Hidden | focus | all | `[hidden]` elements computed `display:none` | N/A — no element this plan adds is toggled by `hidden` | |
| §6 honesty | focus | no data | no suffix is not unknown data drawn as zero | pass | plan States: `[]` means nothing known added; no gauge or count is drawn |
| §7 terminal | all | all | one live client, geometry, scrollback, pane styling | N/A — the plan touches no terminal surface | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes
1. **[note]** Cycle 1 browser Major 1 is closed. With 32, 64 and 200 added checkouts, the launch directory's branch reached the wire and the header within one 5 s poll tick plus the read (4.0–6.0 s). Every added directory got its reading (200 in 3.9 s). The last directory's branch change arrived within one tick.
2. **[note]** Cycle 1 browser Minor 1 is closed on every path I could reach with the mouse at rest: an added directory's branch, the launch branch, a shorter list and the session ending. A keyboard focus change closes the panel rather than rebuilding it for the new session. That is acceptable and shows no stale content.
3. **[note]** For review-work: cycle 1 Note 2's naming split remains, and it is by contract. A launch directory that is a subdirectory reads `sub0` in the Location row and the header (the session's `repo.name`). An added subdirectory reads its checkout's top level (`muster-e2e-loc-ptkvVm · main`), as the contract's "name = basename of that directory's checkout top level" says. The worktree flag is now correct (`false`).
4. **[note]** Light and dark were not re-measured this cycle, because `web/src/style.css` has no change since cycle 1 (`git diff 7a4e67ea..HEAD --stat` does not list it). Contrast is gate `07-contrast` (green).
5. **[note]** Keyboard access to the location panel was not measured. The plan puts it out of scope (mouse only).
6. **[note]** §7 terminal rules were not measured. This plan changes no terminal surface, sizing or client path.

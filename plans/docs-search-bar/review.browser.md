# Browser review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 6758 words (budget 30000)
**Rig**: `bin/musterd` built at f02d6b1e (`make web-build build`, dashboard embedded). Each test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a private `-tmux-socket` inside it, and the shared E2E stub `claude`. I drove it with two throwaway Playwright specs in headless Chromium at 1280×720, in the foreground: 8 tests, all ran to completion. Afterwards I deleted both specs and `test-results/`. Teardown removed the sockets and data dirs, no `musterd` from this worktree is left running, and `git status --porcelain` shows nothing of mine.

Gates log (cycle 4): all 18 lines are green, including `e2e` (956 passed), `web-build` and `contrast` (0 failures in all three themes). The app I drove is the one that ships.

Cycle 4's diff to shipped code is one change in `renderFindBar` (`web/src/render/readerfind.ts`). It now reads `scrollTop` before the bar flips and assigns the new value directly, where it used to add to it after layout. That change runs on every open and close in every host, so I re-measured the full matrix, not only the end of the body.

## Matrix

Coordinates are viewport px as `l,t,r,b`. "body" is `article.md`. "edge" is the nav's left border while the nav is open, or the reader's right edge while it is collapsed. "moved" is the change in content position (`padding-top − scrollTop`) from rest to after the flip, read after a ≥ 1.1 s render tick. "placement ok" is the committed `readHighlights` oracle. It checks the current match is inside the body's client box and every sideways-scrolling ancestor, is clear of the open bar, and is not covered at its centre. The five hosts are Focus, the pop-out, a 2×2 tile (nav open), a 3×2 tile with the nav collapsed, and a 3×2 tile with the nav open.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | no data | no icon; ⌘F not intercepted | pass | placeholder `nothing open — pick a file`; icon `[hidden]`, computed `display:none`; ⌘F in the body `defaultPrevented:false`, no bar |
| REQ-1 | tiles / pop-out | no data | no icon | N/A: same template and `available` path as Focus, and cycle 4 left that path unchanged. Cycles 1 and 2 measured these (pass) | |
| REQ-1 | focus | data | icon visible in the corner | pass | `flex/visible/1`, box 995,133,1024,158 inside body 300,127,1044,720; docbar bottom 127.4; gap 20 to edge 1044 |
| REQ-1 | pop-out | data | icon visible in the corner | pass | `flex/visible/1`, 995,35,1024,60 inside body 0,29,1044,720; gap 20 |
| REQ-1 | tile 2×2 | data | icon visible in the corner | pass | `flex/visible/1`, 402,153,431,178 inside body 2,149,449,373; gap 17.5 to the nav at 448.5 |
| REQ-1 | tile 3×2 collapsed / open | data | icon visible in the corner | pass | 378,153,407,178 (gap 18 to 425.3) / 188,153,217,178 (gap 18 to the nav at 235.3), both `flex/visible/1` |
| REQ-1/2, INV-3 | focus | data | open bar in the corner | pass | bar 757,133,1024,163, below the docbar, inside the body, gap 20; sw 265 = cw 265 |
| REQ-1/2, INV-3 | pop-out | data | open bar in the corner | pass | 757,35,1024,65, gap 20; sw 265 = cw 265 |
| REQ-1/2, INV-3 | tile 2×2 | data | open bar in the corner, no overflow | pass | 251,153,431,179 inside 2,149,449,373; sw 178 = cw 178 |
| REQ-1/2, INV-3 | tile 3×2 collapsed / open | data | open bar in the corner, no overflow | pass | 228,153,407,179 / 38,153,217,179; sw 178 = cw 178 in both |
| REQ-2 | focus / pop-out | data | nav toggle moves the open bar; query and count kept | pass | Focus: bar → 993,133,1260,163 against edge 1280 (gap 20), `quokka` and `2 of 3` kept. Pop-out: 993,35,1260,65, the same |
| REQ-2 | tile 2×2 / 3×2 collapsed / 3×2 open | data | nav toggle moves the open bar; query kept | pass | 441,153,621,179 (gap 17.5 to 638.5) / 38,153,217,179 (nav opened, gap 18 to 235.3) / 228,153,407,179 (nav collapsed, gap 18 to 425.3); `quokka`, `2 of 3` kept in every case |
| REQ-3 | all five hosts | data | click opens the bar, focuses the box, hides the icon | pass | the box is `document.activeElement`, and still is after 1.2 s; icon `[hidden]`, `display:none` |
| REQ-4, INV-2 | all five hosts | data | `quokka` is counted in the body only | pass | `1 of 3`; highlighted texts `quokka`, `QUOKKA`, `Quokka` (frontmatter, paragraph, code); 3 all-matches ranges, 1 current; placement ok |
| REQ-5, INV-1 | all five hosts | data | body DOM unchanged | pass | `innerHTML` identical before opening and after typing, 7 steps, a nav toggle and closing |
| REQ-6/8 | all five hosts | data | Enter / Shift+Enter, Next / Previous (pointer) wrap | pass | E, E, E, S-E, next, prev, prev gives `2, 3, 1, 3, 1, 3, 2 of 3` in every host |
| REQ-3 (cycle 3 Minor 1) | all five hosts | data, at the end of the body | open/close keep the text still; body still at its end | pass | Focus st 4012 (max 4012) → 4034 (max 4034) → 4012 (max 4012). Pop-out 3914 → 3936 → 3914. Tiles 4584 → 4612 → 4584; 3×2 nav open 8863 → 8891 → 8863. Moved 0 on open and on close, end gap 0. The same for click + Escape, click + Close search, and ⌘F + Escape |
| REQ-3 (cycle 3 Minor 1) | all five hosts | data, 10 px short of the end | open/close keep the text still | pass | Focus 4002 → 4024 → 4002; pop-out 3904 → 3926 → 3904; tiles 4574 → 4602 → 4574; 3×2 nav open 8853 → 8881 → 8853. Moved 0 both ways, by all three methods |
| REQ-3 | all five hosts | data, mid-document | open/close keep the text still | pass | Focus 2006 → 2028 → 2006; pop-out 1957 → 1979 → 1957; tiles 2292 → 2320 → 2292; 3×2 nav open 4432 → 4460 → 4432. Moved 0, by all three methods |
| REQ-3 | all five hosts | data, scrollTop 5 | open/close keep the text still | pass | 5 → 27 (tiles 33) → 5; moved 0, by all three methods |
| REQ-3 | all five hosts | data, opened at the top, scrolled to the end while open | close keeps the text still | pass | Focus 4034 (max 4034) → 4012 (max 4012); pop-out 3936 → 3914; tiles 4612 → 4584; 3×2 nav open 8891 → 8863. Moved 0, end gap 0 |
| REQ-8 | all five hosts | data | step to the last `needle`, scroll to the end, close | pass | `3 of 3` placement ok. Close at the end moved 0, end gap 0 in every host |
| REQ-11 | focus | data, at the end of the body, bar open | a Write-hook re-render does not scroll | pass | `needle` `1 of 3` kept; st 4034 (max 4034) → 4034; moved 0. Closing afterwards: 4034 → 4012 (max 4012), moved 0 |
| REQ-11 | tile 2×2 | data | a re-render keeps the query and does not scroll | pass | `filler` `1 of 77` → `1 of 76` after the edit; st unchanged; moved 0 |
| REQ-9 | all five hosts | data | Escape / Close search close the bar, clear highlights, show the icon | pass | the box is hidden; icon `flex/visible/1`; 0 ranges left; focus returns to `ARTICLE.md` |
| REQ-10 | all five hosts | data | ⌘F in the body opens the bar; again selects the query | pass | `activeElement` `md` before; both keydowns `defaultPrevented:true`; the second leaves selection 0–1 of `"x"` with the box focused |
| REQ-10, INV-4 | focus | data | ⌘F on a rail card is not intercepted | pass | `activeElement` `card s-start current`, `defaultPrevented:false`, no bar |
| REQ-10 | all | data | a real Chrome lets the page prevent ⌘F | not measured | Note 1 |
| INV-5 | two 2×2 tiles | data, both at the end of the body | opening and closing one bar leaves the other's bar alone | pass | the other tile: st 4612 → 4612 → 4612, `1 of 77`, 77 → 77 ranges, its bar still open; the closed tile's end gap is 0 |
| REQ-12, REQ-13, Edge-10, Edge-17 | all | data | file switch, tokens and contrast, theme re-render, long documents | N/A: cycle 4 changed only the scroll assignment in the flip branch, which none of these reads. Cycle 2 measured these cells (pass), and the gates log's `e2e` (956 passed, file-switch and token specs included) and `contrast` (0 failures) still cover them | |
| §6 daemon-down | focus | daemon-down | shown prominently | pass | `#banner` `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` at 0,46,1280,78, `block/visible`. `.reader-notice` `musterd unreachable — showing last render` at 300,159,1280,181. The bar moves down to 757,187,1024,217, inside the body (top 181) |
| §6 daemon-down | tile 2×2 / 3×2 collapsed / 3×2 open | daemon-down | shown prominently | pass | same banner; notice at the top of each tile's reader; bars 251,207 / 228,207 / 38,207 inside the body (top 203); sw 178 = cw 178 |
| §6 daemon-down | pop-out | daemon-down | shown | pass | `.reader-notice` `musterd unreachable — showing last render` at 0,29,1280,51, `block/visible`; bar 757,57 inside the body (top 51) |
| States | all five hosts | daemon-down | search works; text stays still at the end | pass | after SIGTERM, typing `needle` and Enter ×2 gives `3 of 3`, placement ok. Open/close at the end: Focus 4066 → 4088 → 4066 (max 4066), tiles 4622 → 4650 → 4622; moved 0 both ways in every host |
| §6 other | all | all | unknown / percentage / permission / Done / cost | N/A: the find bar shows none of these | |
| §7 terminal | all | all | one client, geometry, scrollback, pane styling | N/A: only the docs surface is touched | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes

1. **[note]** Still not measurable here: REQ-10's claim that the browser's own find does not open. Headless Chromium has no find UI, and CDP key events bypass Chrome's browser-level accelerators. `defaultPrevented:true`, measured in every host, is the strongest evidence available. The developer can confirm it on a real keyboard: press ⌘F in a reader body in Chrome and check that Chrome's find bar stays closed.
2. **[note]** Cycle 3 Minor 1 is fixed. Closing the bar at the end of the body, or within Δ of it, now leaves the text where it was and the body at its end, in all five hosts and by all three methods (Δ is the padding the open bar adds: 22 px in Focus and the pop-out, 28 px in tiles). The impl log names one limit it did not change. If the body is scrolled to between 0 and Δ px while the bar is open and the bar is then closed, the text moves by part of Δ, because `scrollTop` cannot go below 0. Opening the bar at st 5 and closing it again returns to st 5 with no movement, so normal open/close never hits this. Only a manual scroll into that band while the bar is open does. No change requested.
3. **[note]** Cycle 2 Notes 3 and 4 (the repaint cost of a step at very high match counts, and how the debounce scales on multi-MB documents) are untouched by this cycle's diff and were not re-measured.

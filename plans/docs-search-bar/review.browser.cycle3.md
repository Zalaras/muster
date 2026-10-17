# Browser review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 6758 words (budget 30000)
**Rig**: `bin/musterd` built at 8a0275aa (`make web-build build`, dashboard embedded). Each test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a private `-tmux-socket` inside it, and the shared E2E stub `claude`. I drove it with a throwaway Playwright spec in headless Chromium at 1440×900 (pop-out 1280×720), in the foreground: 8 tests, all ran to completion. Afterwards I deleted the spec and `test-results/`. Teardown removed the sockets and data dirs, no `musterd` of mine is left running, and `git status` shows nothing of mine.

Gates log (cycle 3): all 18 lines are green, including `e2e` (948 passed) and `web-build`. The app I drove is the one that ships.

## Matrix

Coordinates are viewport px as `l,t,r,b`. "body" is `article.md`. "placement ok" is the committed `readHighlights` oracle, run on the current match after every step. It checks the match is inside the body's client box and every sideways-scrolling ancestor, clear of the open bar, and that `elementFromPoint` at its centre is not covered. "gap" is the target edge (the nav's left border, or the reader's right edge) minus the element's right edge. Δ is the padding the open bar adds to the body: 22 px (Focus, pop-out), 28 px (tiles). For the cycle-3 fix, "moved" is the change in content position (`padding-top − scrollTop`) across a flip, read after a ≥ 1.1 s render tick.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | no data | no icon; ⌘F not intercepted | pass | placeholder `nothing open — pick a file`; icon `hidden`, `display:none`; ⌘F in the body `defaultPrevented:false`, no bar |
| REQ-1 | tile 2×2 | no data | no icon | pass | icon `hidden`, `display:none`, same placeholder |
| REQ-1 | tile 3×2 | no data | no icon | N/A: the same template and render path as 2×2; cycle 2 measured it and nothing on that path changed | |
| REQ-1 | pop-out | no data | no icon | N/A: a pop-out opens on a file. Cycle 1 measured the missing-file notice (icon `display:none`), and nothing on that path changed | |
| REQ-1 | focus | data | icon visible | pass | `flex/visible/1`, box 1155,133,1184,158 |
| REQ-1 | pop-out | data | icon visible | pass | `flex/visible/1`, box 995,35,1024,60 |
| REQ-1 | tile 2×2 / 3×2 / 3×2 nav open | data | icon visible | pass | `flex/visible/1`, boxes 482,153,511,178 / 432,153,461,178 / 242,153,271,178 |
| REQ-1/2 | focus | data, nav open | icon and bar in corner | pass | body 300,127,1204,900; docbar bottom 127; bar 917,133,1184,163, gap 20 to the nav at 1204; sw 265 = cw 265 |
| REQ-1/2 | pop-out | data, nav open | bar in corner | pass | 757,35,1024,65, gap 20 to 1044 |
| REQ-1/2 | tile 2×2 | data, nav open | bar in corner, no overflow | pass | 331,153,511,179 inside body 2,149,529,463 (gap 18); sw 178 = cw 178 |
| REQ-1/2 | tile 3×2 | data, nav collapsed / open | bar in corner, no overflow | pass | 281,153,461,179 (gap 18 to 479) / 91,153,271,179 (gap 18 to the nav at 289); sw 178 = cw 178 |
| REQ-2 | all hosts | data | nav toggle moves the bar, query kept | N/A: no code on that path changed since cycle 2, which measured all five hosts (pass) | |
| REQ-3 | all five hosts | data | click opens the bar, focuses the box, hides the icon | pass | `activeElement` is the query box; icon `hidden`, `display:none`; the same tagged node is still focused after 1.2 s |
| REQ-4 | all five hosts | data | `quokka` counts body only | pass | `1 of 3`, 3 ranges in all-matches, 1 current, placement ok |
| REQ-5 / INV-1 | all five hosts | data | body DOM unchanged | pass | `innerHTML` identical before opening and after typing, stepping and Escape |
| REQ-8 | all five hosts | data | Enter / Shift+Enter, Next / Previous (pointer) wrap | pass | E,E,E,S-E,next,prev,prev gives `2,3,1,3,1,3,2 of 3` in every host |
| REQ-8 | all five hosts | data | each `needle` step on tall.md is readable | pass | 4 steps (full wrap) from mid-document, placement `ok` every time |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, scrolled mid | opening and closing keep the text still | pass | Focus st 1916 → 1938 → 1916; pop-out 1957 → 1979 → 1957; tiles 2247 → 2275 → 2247 (3×2 nav open 3674 → 3702 → 3674). Moved 0 on open and on close, by click and by ⌘F |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, scrollTop 5 | open/close keep the text still | pass | st 5 → 27 (tiles 33) → 5; moved 0 |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, at the end of the body | open/close keep the text still | **FAIL** | Focus: st 3832 (max 3832) → open 3854 (max 3854) → close **3810** (max 3832). Moved 0 on open, **22 px down on close**, and the body is left 22 px short of its end. Pop-out 3914 → 3936 → 3892 (22). Tiles 4494 → 4522 → 4466 (28; 3×2 nav open 7347 → 7375 → 7319). The same by Escape, the close button and after ⌘F opening (Minor 1) |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, 10 px from the end | open/close keep the text still | **FAIL** | Focus st 3822 → 3844 → 3810: moved 12 px on close; tiles 4484 → 4512 → 4466: 18 px (Minor 1) |
| REQ-3 | all five hosts | data, at the end | repeated open/close drift | pass (bounded) | 5 open/close cycles at the end leave st at max − Δ (3810 Focus, 4466 tiles). The error is one Δ and does not accumulate |
| REQ-1 | all five hosts | data, scrollTop 0 | first line clear of the open bar | pass | Focus first element top 171 > bar bottom 163; pop-out 73 > 65; tiles 187 > 179 |
| REQ-7 | focus / tile 3×2 | data, scrollTop 5 | first-line match revealed past the bar | pass | opening at st 5 leaves the h1 at 144–179 under the bar (133–163) (Note 2); typing `tall doc` scrolls to st 0, placement ok |
| REQ-9 | all five hosts | data | Escape closes, clears highlights, shows the icon, focus on body | pass | bar `display:none`; icon `flex`; `activeElement` `ARTICLE.md`; 0/0 ranges |
| REQ-9 | all five hosts | data | Close search (pointer) | pass | bar hidden, icon back |
| REQ-10 | all five hosts | data | ⌘F in the body opens the bar; again selects the query | pass | both keydowns `defaultPrevented:true`; box focused, selection 0–6 of `quokka` |
| REQ-10 | focus | data | ⌘F on a rail card not intercepted | pass | activeElement `ARTICLE.card`, `defaultPrevented:false`, no bar |
| REQ-10 | all | data | a real Chrome lets the page prevent ⌘F | not measured | Note 1 |
| INV-5, REQ-11, REQ-12, REQ-13, Edge-10, Edge-17 | all | data | bystanders, re-render, file switch, tokens, theme, long docs | N/A: cycle 3 changed only `renderFindBar`'s flip branch, the `fileOpened` call order and the handle type. Cycle 2 measured these cells (pass); the gates log's `e2e` (948 passed) and `contrast` (0 failures) lines still cover them | |
| §6 daemon-down | focus | daemon-down | shown prominently | pass | `#banner` `musterd unreachable — hook output…` at 0,46,1440,78, `block/visible`; `.reader-notice` `musterd unreachable — showing last render`; bar moves down to 917,187 inside the body (top 181) |
| §6 daemon-down | tile 2×2 / 3×2 / 3×2 nav open | daemon-down | shown prominently | pass | same banner; bars 331,207 / 281,207 / 91,207 inside body top 203; sw 178 = cw 178 |
| §6 daemon-down | pop-out | daemon-down | shown | pass | `.reader-notice` `musterd unreachable — showing last render` at 0,29,1280,51; bar 757,57 inside body top 51 |
| States | all five hosts | daemon-down | search keeps working; mid-scroll stillness | pass | after SIGTERM, Enter stepped to `3 of 3`; open/close at mid-scroll moved 0 in every host |
| §6 other | all | all | unknown / percentage / permission / Done / cost | N/A: the find bar shows none of these | |
| §7 terminal | all | all | one client, geometry, scrollback, pane styling | N/A: only the docs surface is touched | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** Closing the bar at the end of a scrolled body still makes the text jump, and leaves the body short of its end. Cycle 2 Minor 1 is fixed mid-document: 0 px of movement in every host, both ways. The problem is in `renderFindBar` (`web/src/render/readerfind.ts`). It flips `bar.hidden` and then runs `body.scrollTop += topPadding(body) - before`. On close, the padding shrinks, and so does the scroll range. Reading `scrollTop` for the `+=` forces layout, so Chrome has already clamped it to the new maximum. The code then subtracts Δ on top of that clamp. Measured with the body at its end: Focus st 3832 → open 3854 → close 3810 against a max of 3832, so the text moves 22 px down and the last 22 px of the document leave the view. The pop-out is the same (22 px). Every tile density moves 28 px (4494 → 4466). Within Δ of the end the move is partial: 12 px (Focus) and 18 px (tiles) from 10 px short of the end. The error does not build up over repeated open/close. A fix must keep the content still across close at every scrollTop, including the last Δ px. One way is to read `scrollTop` before the flip and assign `before + (after − beforePadding)` afterwards, rather than `+=` after layout. **[e2e-specs]** The committed cycle-2 tests (`expectScrolledTextStillAcrossBar`, `reader-search.spec.ts`) scroll paragraph 15 to the centre only. They pass on this build and could not fail for this defect. A test that also scrolls the body to its end and closes the bar would fail here.

### Notes

1. **[note]** Still not measurable here: REQ-10's claim that the browser's own find does not open. Headless Chromium has no find UI, and CDP key events bypass Chrome's browser-level accelerators, so `defaultPrevented:true` (measured in every host) is the strongest evidence available. The developer can confirm it on a real keyboard: press ⌘F in a reader body in Chrome and check that Chrome's find bar stays closed.
2. **[note]** The fix makes a trade at small offsets. Opening the bar with the body scrolled a few px keeps the text still, so the first line stays under the bar. Measured at st 5 in Focus: the h1 is at 144–179 and the bar at 133–163. At st 0 the padding still clears it. A match in that line is never left hidden: typing scrolled to st 0 and the placement was ok. This follows from keeping the text still, so no change is requested.
3. **[note]** Cycle-2 Notes 3 and 4 (step repaint cost at very high match counts, the debounce scaling on multi-MB documents) are unchanged by this cycle's diff and were not re-measured.

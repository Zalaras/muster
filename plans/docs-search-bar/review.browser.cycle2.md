# Browser review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 6758 words (budget 30000)
**Rig**: `bin/musterd` built at e852f381 (`make web-build build`, dashboard embedded). Each test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a private `-tmux-socket` inside it, and the shared E2E stub `claude`. I drove it with a throwaway Playwright spec in headless Chromium at 1440×900 (pop-out 1280×720), in the foreground: 10 tests, all ran to completion. Afterwards I deleted the spec and `test-results/`. Teardown removed the sockets and data dirs, no `musterd` of mine is left running, and `git status` shows nothing of mine.

Gates log (cycle 2): all 18 lines are green, including `e2e` (944 passed) and `web-build`. The app I drove is the one that ships.

## Matrix

Coordinates are viewport px as `l,t,r,b`. "body" is `article.md`. "placement ok" is my own oracle, run on the current match after every step. The match's rect must sit inside the body's client box. It must sit inside the visible x range of every horizontally scrolling ancestor. It must not overlap the open bar's box. And `elementFromPoint` at its centre must land inside the body, not on `.find`. "gap" is the target edge (the nav's left border, or the reader's right edge) minus the element's right edge.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | no data | no icon; ⌘F not intercepted | pass | placeholder `nothing open — pick a file`; icon `hidden` + `display:none`; ⌘F in the body `defaultPrevented:false`, no bar |
| REQ-1 | tile 2×2 / 3×2 | no data | no icon | pass | icon `hidden`, `display:none`, same placeholder |
| REQ-1 | pop-out | no data | no icon | N/A: a pop-out opens on a file; cycle 1 measured the missing-file notice (icon `display:none`), and nothing on that path changed | |
| REQ-1 | focus | data | icon visible | pass | `flex/visible/1`, box 1155,133,1184,158 |
| REQ-1 | pop-out | data | icon visible | pass | `flex/visible/1`, box 995,35,1024,60 |
| REQ-1 | tile 2×2 / 3×2 / 3×2 nav open | data | icon visible | pass | `flex/visible/1`, boxes 482,153,511,178 / 432,153,461,178 / 242,153,271,178 |
| REQ-1/2 | focus | data, nav open | icon and bar in corner | pass | body 300,127,1204,900; docbar bottom 127; icon gap 20; bar 917,133,1184,163, gap 20 |
| REQ-1/2 | focus | data, nav collapsed | bar moves to the reader edge, query kept | pass | bar 1153,133,1420,163, gap 20 to 1440; `2 of 3` and value `quokka` kept |
| REQ-1/2 | pop-out | data, nav open / collapsed | bar in corner | pass | 757,35,1024,65 (gap 20 to 1044) / 993,35,1260,65 (gap 20 to 1280); `2 of 3` kept |
| REQ-1/2 | tile 2×2 | data, nav open / collapsed | bar in corner, no overflow | pass | 331,153,511,179 (gap 18 to 529) / 521,153,701,179 (gap 18 to 719); scrollWidth 178 = clientWidth 178 |
| REQ-1/2 | tile 3×2 | data, nav collapsed / open | bar in corner, no overflow | pass | 281,153,461,179 (gap 18 to 479) / 91,153,271,179 inside body 2,149,289,463 (gap 18 to the nav at 289); sw 178 = cw 178 |
| REQ-1 | focus / pop-out / tiles | data | bar stays put while the body scrolls | pass | midway.md (sh 4097 > ch 773 Focus; 4097 > 691 pop-out; 5076 > 314 tiles), scrollTop 1500 to the end: bar box identical (Focus 897,133; pop-out 737,35; tiles 306,153 / 256,153) |
| REQ-3 | all five hosts | data | click opens the bar, focuses the box, hides the icon | pass | `activeElement === .find-query`; icon `display:none`; the same tagged node is still focused after 1.2 s, and again after typing plus 1.2 s |
| REQ-4 | all hosts | data | `quokka` counts body only | pass | `1 of 3`, 3 ranges; an independent text-node oracle counts 3 (frontmatter cell, paragraph, code) |
| REQ-4 / Edge-7 | focus | data | diagram label match is in the SVG | pass (settled) | late-diagram.md opened with the bar open: `1 of 3`, current `inSvg:true`, placement ok at 725,733 |
| REQ-5 / INV-1 | all hosts | data | body DOM unchanged | pass | innerHTML identical (416 chars) before opening and after typing, stepping and Escape |
| REQ-5 | focus / tile | data | current match drawn more strongly | pass | screenshots in Light (Focus) and Instrument (tile): current has a stronger fill and an underline; SVG label highlighted |
| REQ-6 | all hosts | data | empty query gives an empty count; a miss gives `no matches` | pass | `""` with 0/0 ranges; `no matches` with 0/0 |
| REQ-7 | all hosts | data | typing then an immediate Enter lands on ordinal 2 | pass | `2 of 3` (the debounce flushes on a step) |
| REQ-8 | all hosts | data | Enter/Shift+Enter, Next/Previous (pointer) wrap | pass | E,E,E,S-E,next,prev,prev gives `2,3,1,3,1,3,2 of 3` in all five hosts |
| REQ-8 (cycle 1 Major 1) | focus / pop-out / tile 2×2 / 3×2 / 3×2 nav open | data | each of 40 `heron` heading matches readable | pass | crowd.md, 41 steps (full wrap), 0 bad placements in every host |
| REQ-8 (cycle 1 Major 1) | all hosts | data | frontmatter-cell match at the top readable | pass | frontline.md, 3 steps, 0 bad |
| REQ-8 (cycle 1 Major 2) | all hosts | data | code-line and wide-table match revealed sideways | pass | wide.md `far`, 4 steps (`codefar`, `tablefar`, wrap), 0 bad |
| REQ-8 | all hosts but 3×2 nav open | data | match at the far right of a wide mermaid LR diagram revealed | pass | widediag.md `Farlabel`: figure sw 3240 > cw 838/978/497/447, scrollLeft 2402/2262/2743/2793, placement ok |
| REQ-8 | all hosts but 3×2 nav open | data | 17 mid-document matches revealed below the bar | pass | midway.md `pelican`, 18 steps, 0 bad |
| REQ-3 | focus / pop-out / tiles | data, scrolled | opening the bar keeps the reading position | **FAIL** | midway.md at scrollTop 1500: the paragraph under the eye moves y 220 → 242 (Focus), 121 → 143 (pop-out), 230 → 258 (both tile densities) with scrollTop unchanged. Closing moves it back (Minor 1) |
| REQ-9 | all hosts | data | Escape closes, clears highlights, shows the icon, focus on body | pass | bar `display:none`; icon `flex`; `activeElement === body`; 0/0 ranges; padding back to 22px (10px compact) |
| REQ-9 | all hosts | data | Close search (pointer) | pass | focus on body, icon back, 0/0 ranges |
| REQ-10 | all hosts | data | ⌘F in the body opens the bar; again selects the query | pass | both keydowns `defaultPrevented:true`; box focused, selection 0–6 of `quokka` |
| REQ-10 | pop-out | data | dashboard page not affected | pass | the dashboard's key log is `[]` |
| REQ-10 | focus | data | ⌘F on a rail card not intercepted | pass | activeElement `ARTICLE.card`, `defaultPrevented:false`, no bar |
| REQ-10 | all | data | a real Chrome lets the page prevent ⌘F | not measured | Note 1 |
| INV-5 | tile 2×2 / 3×2 | data | tile B's search leaves tile A alone | pass | A `2 of 3`, 3/1 ranges, padding 38px before, during and after B's ⌘F, `alpha`, Enter×2 (`3 of 3`) and Escape; B's padding back to 10px; one ⌘F logged, prevented |
| REQ-11 | focus | data | docChanged keeps the ordinal, no scroll; clamps | pass | `2 of 3` at scrollTop 1913 → `2 of 3` at 1913, box still focused; a rewrite to one match gives `1 of 1` at 1913 |
| REQ-11 / Edge-10 | focus | data | theme change re-applies over the new SVG | pass | Light: `1 of 3`, 3 ranges, current `inSvg:true`, placement ok |
| REQ-12 | focus | data | file switch keeps the query, `1 of n`, scrolled | pass | `needle` into deep.md: `1 of 2`, scrollTop 2489, placement ok |
| REQ-12 | pop-out / tiles | data | file switch | pass | every fixture after the first was opened with the bar open in each host (frontline → `1 of 2` at once); placement ok |
| REQ-13 | focus / tile | data | tokens and highlight legible | pass | screenshots in Light and Instrument; no native clear glyph inside the box; `contrast` gate 54 pairs × 3, 0 failures |
| Edge-16 | focus | data | match inside `<details>` | N/A: cycle 1 found the sanitized body renders `<details>` content as a plain paragraph; nothing collapsed to test | |
| Edge-17 | focus | data | typing stays responsive | pass | 34 KB/600 matches: keys 3–8 ms, count 85 ms after the last key, 0 long tasks. 459 KB/10 000: keys 9–20 ms, 0 long tasks. 2.1 MB/10: keys 29–38 ms, one 56 ms task. 2.2 MB/80 000: keys 24–37 ms, then four tasks of ~575 ms after the pause (stepping cost: Note 3) |
| §6 daemon-down | focus | daemon-down | shown prominently | pass | banner `musterd unreachable — hook output…` at 0,46,1440,78, `block/visible/1`; the bar moves down with the layout (917,187) and stays inside the body (top 181) |
| §6 daemon-down | tile 2×2 / 3×2 | daemon-down | shown prominently | pass | same banner; bar 331,207 / 281,207 inside body top 203; sw 178 = cw 178 |
| §6 daemon-down | pop-out | daemon-down | shown | pass | `.reader-notice` `musterd unreachable — showing last render` at 0,29,1280,51 |
| States | all hosts | daemon-down | search keeps working | pass | after SIGTERM: Enter stepped (`2 of 3` Focus, `3 of 3` tiles); ⌘F reopened the bar in Focus and the pop-out and typed a new query to `1 of 1` / `1 of 3`; placement ok |
| §6 other | all | all | unknown / percentage / permission / Done / cost | N/A: the find bar shows none of these | |
| §7 terminal | all | all | one client, geometry, scrollback, pane styling | N/A: only the docs surface is touched | |

## Issues

### Critical

(none)

### Major

(none)

Cycle 1's Major 1 (the bar covered first-line matches in tiles) and Major 2 (no horizontal reveal) are fixed. My oracle found 0 bad placements in 41 crowd, 3 frontline, 4 wide, 1 wide-diagram and 18 mid-document steps, in every host. Cycle 1's Minor 1 (typing) and Minor 3 (the native clear button) are fixed too.

### Minor

1. **[web-impl]** Opening or closing the bar while the body is scrolled makes the text jump. The cycle 1 fix adds `padding-top` to `.md` while the bar is open (`web/src/style.css`, the `.reader:has(.find-bar:not([hidden])) .md` rules), and it leaves `scrollTop` alone. Measured on midway.md at scrollTop 1500: the paragraph under the eye moves down 22 px in Focus (y 220 → 242) and in the pop-out (121 → 143), and 28 px in both tile densities (230 → 258). Closing moves it back up by the same amount. The bar only needs the space at the top of the document, but the whole page of text shifts wherever the reader is. A fix must keep the body's content at the same viewport position across open and close at any scrollTop, while still keeping the first line clear of the bar at scrollTop 0. One way is to adjust `scrollTop` by the padding change in the same frame.

### Notes

1. **[note]** I could not measure REQ-10's claim that the browser's own find does not open. Headless Chromium has no find UI, and CDP key events bypass Chrome's browser-level accelerators, so `defaultPrevented:true` (measured in every host) is the strongest evidence available here. The developer can confirm it on a real keyboard: press ⌘F in a reader body in Chrome and check that Chrome's find bar stays closed.
2. **[note]** With the body scrolled, the bar overlays whatever line runs under the top-right corner (screenshot: `…adipiscing elit s[bar]` on paragraph 21). That follows from the plan's overlay design. A current match is never left under it: every reveal measured ok.
3. **[note]** Stepping cost grows with the number of matches, because every step re-paints every match range (`paintFind` deletes and re-adds the whole match set, `web/src/render/readerfind.ts`). Measured: 18 ms per step at 600 matches, 103 ms at 10 000, 1763 ms at 80 000 (2.2 MB, three ~570 ms long tasks). Escape at 80 000 takes 2009 ms. The plan sets no performance budget, and 80 000 hits is a pathological query, so this is not a defect. If it ever matters, the fix is to swap only the current highlight on a step.
4. **[note]** In a 2.1 MB document with 10 matches, the count settles 1.7 s after the last key. The main thread is not blocked during that time (one 56 ms task); this is the debounce scaling with the last run's cost. The count never showed a stale value.
5. **[note]** One cell is new this cycle: 3×2 with the nav open, a host INV-3 does not list. Icon, bar, quokka steps, 41 crowd steps and the wide steps all pass there.

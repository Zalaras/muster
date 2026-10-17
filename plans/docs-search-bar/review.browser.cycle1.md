# Browser review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 6758 words (budget 30000)
**Rig**: `bin/musterd` built at 9fe5c938 (`make web-build build`, dashboard embedded). Each test got a scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (path has a space), private `-tmux-socket` inside it, the shared E2E stub `claude` (`muster e2e-stub-<hash>/claude`). Driven by a throwaway Playwright spec in headless Chromium at 1440×900 (pop-out 1280×720), run in the foreground. Spec and `test-results/` deleted afterwards; teardown removed the sockets and data dirs; `git status` shows nothing of mine.

Gates log (cycle 1): every line green, including `e2e` (935 passed) and `web-build`, so the app I drove is the one that ships.

## Matrix

Coordinates are viewport px as `l,t–r,b`. "body" is `article.md`. "gap" is the target edge (the nav's left border, or the reader's right edge when the nav is collapsed) minus the element's right edge.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | no data | no icon | pass | placeholder visible; icon `hidden`, computed `display:none` |
| REQ-1 | tile 2×2 / 3×2 | no data | no icon | pass | `hidden`, `display:none`, placeholder visible |
| REQ-1 | pop-out | no data (missing file) | no icon | pass | "file no longer exists" notice; icon `display:none` |
| REQ-10 | focus / pop-out | no data | ⌘F not intercepted | pass | focus in body, `defaultPrevented:false`, no bar |
| REQ-1 | focus | data | icon visible | pass | `display:flex`, `visibility:visible`, `opacity:1`, box 1155,133–1184,158 |
| REQ-1 | pop-out | data | icon visible | pass | `flex`/visible/1, box 995,35–1024,60 |
| REQ-1 | tile 2×2 / 3×2 | data | icon visible | pass | `flex`/visible/1, box 482,153–511,178 / 432,153–461,178 |
| REQ-1/2 | focus | data, nav open | icon in corner | pass | inside body 300,127–1204,900, below docbar (bottom 127), gap 20 to the nav at 1204 |
| REQ-1/2 | pop-out | data, nav open | icon in corner | pass | inside body 0,29–1044,720, below docbar (bottom 29), gap 20 |
| REQ-1/2 | tile 2×2 | data, nav open | icon in corner | pass | inside body 2,149–529,463, gap 18 to the nav at 529 |
| REQ-1/2 | tile 3×2 | data, nav collapsed | icon in corner | pass | inside body 2,149–479,463, gap 18 to the reader edge at 479 |
| REQ-1 | focus | data | icon and bar stay put while the body scrolls | pass | tall.md, scrollTop 0→3832 (scrollHeight 4605 > clientHeight 773); icon y 133.4 and bar y 133.4 unchanged |
| REQ-1 | pop-out | data | stays put while scrolling | pass (spec) | measured only on find-fixture.md, which doesn't overflow (sh 691 = ch 691), so it says nothing; the committed pop-out corner spec covers tall.md (Note 1) |
| REQ-1 | tile 2×2 / 3×2 | data | bar stays put while scrolling | pass | many.md, sh 3623 > ch 314; bar box unchanged (306,153 / 256,153) |
| REQ-2 | focus | data, nav collapsed | bar moves to the reader edge, query kept | pass | bar 1153,133–1420,163, gap 20 to 1440; value `find-fixture.md` kept |
| REQ-2 | pop-out | data, nav collapsed | bar at the reader edge | pass | bar 973,35–1260,65, gap 20 to 1280 |
| REQ-2 | focus / pop-out | data, nav open | bar in corner, no overflow | pass | 917,133–1184,163 / 757,35–1024,65; scrollWidth 265 = clientWidth 265 |
| REQ-2 | tile 2×2 / 3×2 | data | bar in corner, no overflow | pass | 331,153–511,179 / 281,153–461,179; scrollWidth 178 = clientWidth 178 |
| REQ-2/6 | tile 2×2 / 3×2 | data | count `150 of 150` fits | pass | bar scrollWidth 202 = clientWidth 202, gap 18; count box 329–390 sits flush against the query box (Note 4) |
| REQ-3 | focus / pop-out / tiles | data | clicking the icon opens the bar and focuses the query box; icon hidden | pass | `activeElement === query` in all four hosts; icon `display:none`; box `display:block` |
| REQ-3 | focus / pop-out / tiles | data | query box keeps focus | pass | same tagged node after 1.2 s, and again after typing plus 1.2 s, in all four hosts |
| REQ-3 | focus | data | focus and selection survive a docChanged re-render | pass | Write hook on the open file; same tagged node, value `heron`, selection 4–5 kept |
| REQ-4 | focus | data | basename counted only in the body | pass | `find-fixture.md` gives `1 of 2` (body has 2); the docbar also contains it |
| REQ-4/5/6/7 | focus / pop-out / tiles | data | typing `quokka` gives `1 of 3` with 3 ranges; oracle 3 | pass | ranges `quokka`,`QUOKKA`,`Quokka`; oracle `body.textContent` count 3; current index 0 |
| REQ-4 / Edge-7 | focus | data | a diagram label match is in the SVG | pass (settled) | after the diagram rendered, `1 of 1`, range `inSvg:true`. Reading just after typing while the mermaid pass was still running showed the range in the fence source (`inSvg:false`). That is transient: it settled to the SVG |
| REQ-5 | focus / pop-out / tiles | data | the body's DOM is unchanged | pass | innerHTML identical (416 chars) before typing and after stepping, in all four hosts |
| REQ-5 | focus / pop-out / tiles | data | current match drawn more strongly | pass | screenshots in all three themes: current match has a stronger fill and an underline. Diagram label in Dark is highlighted on the SVG `<text>` |
| REQ-6 | all hosts | data | empty query gives an empty count; a miss gives `no matches` | pass | text `""` with 0 highlight sets; `no matches` |
| REQ-8 | focus / pop-out / tiles | data | Enter/Shift+Enter and ↑/↓ (pointer) wrap | pass | Enter ×3 gives `1 of 3`; Shift+Enter gives `3 of 3` (index 2); Next click gives `1 of 3`; Previous click gives `3 of 3`; button focus kept 1.2 s |
| REQ-8 | focus | data | step scrolls the current match into view (vertical) | pass | deep.md, scrollTop 2458, match 482,503 inside the body |
| REQ-7/8 | focus | data | current match far right in a code block is revealed | **FAIL** | `widgetfar` at x 4958–5027; the `pre`'s visible x range is 332–1172 (Major 2) |
| REQ-7/8 | focus | data | current match far right in a wide table is revealed | **FAIL** | `tablefar` at x 3689–3734; the body's visible x range is 300–1204 (Major 2) |
| REQ-8 | tile 2×2 / 3×2 | data | current match on the first line not hidden under the bar | **FAIL** | longh.md: matches 6–9 of 40 (2×2: 7–10) sit at y 161–180, under the bar 153–179, at scrollTop 0. `elementFromPoint` hits `.find`, so the body can't scroll them out (Major 1) |
| REQ-8 | focus | data | first-line matches not hidden | pass | Focus: long h1 (40 words) gives 0 of 40 covered, and 160 `zebra` steps give 0 covered. Focus padding (22 px) clears the bar's bottom (36 px) for h1 text centres. The bar does overlap the frontmatter table's top-right edge (Major 1) |
| REQ-9 | focus / pop-out / tiles | data | Escape closes the bar, shows the icon, focus on the body, highlights cleared | pass | bar `hidden` + `display:none`; icon `flex`; `activeElement === body`; 0 highlight sets in the host |
| REQ-9 | focus | data | Close search (pointer) | pass | bar `display:none`; focus on the body |
| REQ-10 | focus / pop-out / tiles | data | ⌘F in the body opens the bar, default-prevented, text selected | pass | `defaultPrevented:true`; selection 0–4 of `qqzz` |
| REQ-10 | focus | data | ⌘F on a rail card is not intercepted | pass | activeElement `ARTICLE.card`; `defaultPrevented:false`; bar stays hidden |
| REQ-10 | all | data | a real Chrome lets the page prevent ⌘F | not measured | Note 2 |
| INV-5 | tile 2×2 / 3×2 | data | a second tile's search leaves the first alone | pass | tile B ⌘F, `alpha` gives `1 of 3`, then Enter and Escape; tile A still `150 of 150` with 150 ranges before and after |
| REQ-11 | focus | data | docChanged keeps `2 of 3` and the scroll position | pass | scrollTop 1882 → 1882; count `2 of 3`; 3 ranges |
| REQ-11 / Edge-10 | focus | data | a theme change re-applies the highlight over the new SVG | pass | Light and Dark: `1 of 1`, the range is `inSvg:true`, 1 current |
| REQ-12 | focus | data | opening another file keeps the query and jumps to `1 of n` | pass | `needle`, deep.md gives `1 of 2`, scrollTop 2458, match in view. A diagram file reopened with the bar open settles in the SVG |
| REQ-12 | pop-out / tiles | data | file switch | pass (indirect) | tiles switched find-fixture.md → many.md → longh.md with the bar open and re-ran each time; pop-out not separately measured |
| REQ-13 | focus | data | tokens in every theme; highlight readable | pass, with one exception | the committed REQ-13 spec checks `--bg-raised`/`--edge`/mono. Screenshots in Instrument/Dark/Light show the highlight fill legible under `--fg`. The native search clear button (Minor 3) is the exception |
| Edge-16 | focus | data | match inside `<details>` | N/A | the rendered body showed the `<details>` text as a plain visible `<p>` (match at 332,216, top element `P`). Nothing collapsed to test against |
| Edge-17 | focus | data | typing stays responsive in a long document | **FAIL** | 230 KB / 3000 matches: 109–223 ms per key, long tasks 51–82 ms. 2.6 MB: first key 1721 ms, 9 more keys 12.2 s (Minor 1) |
| §6 daemon-down | focus | daemon-down | daemon-down shown prominently | pass | banner `musterd unreachable…`, block at 0,46–1440,78, visible; the bar moves down with the layout and stays inside the body |
| §6 daemon-down | tile 2×2 / 3×2 | daemon-down | daemon-down shown prominently | pass | same banner; bar 319,207–511,233 / 269,207–461,233, still in its corner |
| §6 daemon-down | pop-out | daemon-down | daemon-down shown | pass | status line `unreachable — showing last render` |
| States | focus / pop-out / tiles | daemon-down | search keeps working | pass | after SIGTERM: typed and stepped (`2 of 3`), Escape, reopened with the box focused (Focus); stepped to `2 of 3` (pop-out); stepped to `1 of 150` (tiles) |
| §6 other | all | all | unknown/percentage/permission/Done/cost | N/A | the find bar shows none of these |
| §7 terminal | all | all | one client, geometry, scrollback, pane styling | N/A | no terminal surface touched; the docs surface only |

## Issues

### Critical

(none)

### Major

1. **[web-impl]** In compact tiles the open find bar covers the body's first line of text, and a current match there can never be shown. Measured on a 40-word h1 in a 3×2 tile: matches 6–9 sit at y 161–180 under the bar (153–179) with scrollTop 0, so they cannot scroll out from under it. `elementFromPoint` at each match's centre returns `.find`. The same happens at 2×2 (matches 7–10). Screenshot: `heron heron heron heron heron he[bar]`. The reader shows the count as `7 of 40`, but the highlighted word is invisible. The cause: `.reader.compact .md` has 10 px top padding while the `.find` overlay is 4 px down and 26 px tall. `scrollRangeIntoView` (`web/src/render/readerfind.ts`) checks only a 32 px margin against the body box, never against the bar's own box. In Focus the 22 px padding just clears the bar for heading text. Even there the bar overlaps the frontmatter table's top-right border (bar bottom 163, table top ≈155). A fix must make the current match, after any step or type, sit outside the bar's box in every host. For example: reserve the bar's height as top scroll-padding/space while it is open, and reveal against the bar's bottom edge rather than the body's top.
2. **[web-impl]** Stepping never scrolls horizontally, so a match in an overflowing code block or wide table stays off-screen. Measured: `widgetfar` at the end of a 600-char code line sits at x 4958–5027 while its `pre`'s visible range is 332–1172. `tablefar` in a wide table sits at x 3689–3734 against the body's 300–1204. The count reads `1 of 1` and nothing visible is highlighted. `scrollRangeIntoView` adjusts only `body.scrollTop`. A fix must scroll each horizontal scroll container between the range and the body (`pre`, `figure.diagram`, the body itself) so the current match is inside its visible box. One way is `Element.scrollIntoView({block, inline:"nearest"})` on the range's parent element, or the same arithmetic per scroll ancestor.

### Minor

1. **[web-impl]** Typing is not responsive in long documents (Edge-17). Every keystroke re-walks the whole body and rebuilds every `Range` synchronously, with no debounce. Measured: a 230 KB document with 3000 matches costs 109–223 ms per key (long tasks 51–82 ms). At 2.6 MB (inside the 10 MiB cap) the first key blocks 1721 ms and nine more keys take 12.2 s. No characters were lost, and the final count was correct. A fix must keep a keystroke under one frame budget on typical plans and not block for seconds near the cap: debounce the re-run, or reuse the text-node list between keystrokes.
2. **[e2e-specs]** The suite could not have caught Major 1 or Major 2. `expectCurrentMatchInView` (`web/e2e/helpers/reader-search.ts`) compares only the match's top and bottom with the body box. It never checks the x axis, and never checks whether the bar covers the match. No fixture has a wide code line, a wide table, or a first line that runs under the bar in a tile. The helper needs an x-axis check against the nearest scroll container, plus an `elementFromPoint` check that the match is not under `.find`, and a fixture for each case.
3. **[web-impl]** The query box is a native `<input type="search">`, so Chrome draws its own clear (×) button inside it while it is focused and non-empty, right beside the bar's own `Close search` ×. In the Light theme the native glyph is Chrome's default blue, not a design token (screenshot `rb-focus-quokka-Light`). That is two × glyphs a few px apart with different effects. A fix must either hide `::-webkit-search-cancel-button` (Escape and Close already cover clearing), or style it from the tokens and make clicking it re-run the query. I didn't measure the click: my click at the box's right edge left the value `heron` unchanged, so I can't say whether I missed the glyph or it did nothing. That question stays open.

### Notes

1. **[note]** REQ-1 "pinned while scrolling" in the pop-out was measured only on find-fixture.md, which does not overflow (scrollHeight 691 = clientHeight 691), so that cell rests on the committed `reader-search.spec.ts` pop-out corner test (tall.md, nav open and collapsed). Focus and both tile densities were measured on overflowing documents and pass.
2. **[note]** REQ-10 says the browser's own find does not open. I couldn't measure that: headless Chromium has no find UI, and Playwright's CDP key events don't go through Chrome's browser-level accelerators, so `defaultPrevented:true` (measured in every host) is the strongest evidence available here. The plan leaves this for a real keyboard in a real Chrome (Carried-over measurements). It remains for the developer: press ⌘F in a reader body in Chrome and confirm Chrome's find bar stays closed.
3. **[note]** In a diagram document, a query typed while the first mermaid pass is still running briefly highlights the fence source text (`inSvg:false`). Once the pass settles (≤ 1.5 s) the highlight moves to the SVG label. Transient only. Recorded so a future spec reads the settled state (kb:adr/process-transient-displays-not-oracles).
4. **[note]** At `150 of 150` in a 3×2 tile the count (329–390) sits against the query box (259–327) with only the 2 px compact gap. Nothing overflows (scrollWidth = clientWidth = 202) and the query box shrinks to about 9 visible characters. No change requested.
5. **[note]** Edge case 16 (collapsed `<details>`) could not be set up. The rendered body showed the `<details>` content as an ordinary visible paragraph, so I had nothing collapsed to search into.

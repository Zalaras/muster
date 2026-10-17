# Review: docs-search-bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 16526 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. Icon in both `#reader-template` copies (`web/index.html`, `web/doc.html`). `hidden` is driven by `available = bodyRendered` (`features/readerfind.ts` `view()`), so it shows in every host | E2, no-document test, E14, E15, 2×2 tile, compact test | pass |
| REQ-2 | Yes. `.find` sits in `.md`'s grid cell (col 1, row 3, `justify-self: end`) as a sibling of `.md`, so it follows the nav's collapse | E2, E3, pop-out placement, E15, 2×2 tile | pass |
| REQ-3 | Yes. `open()` focuses and selects the query box. The bar holds the box, count, previous, next and close | E1, focus-identity test, E14 | pass |
| REQ-4 | Yes. A TreeWalker covers `refs.body` text nodes only (skips `style`/`script`/`title`/`desc`/`noscript`). Matching is per text node, literal and case-insensitive (`reader/find.ts`). The diagram modal is a sibling of `article.md`, so it is outside the walk | W1 (12 rows), E4, E5, literal test, E6 | pass |
| REQ-5 | Yes. `CSS.highlights` `find-match` (priority 0) and `find-current` (priority 1). Each reader adds and removes only its own `Range`s. No DOM write in the find path | E5, E6, E9, E17 | pass |
| REQ-6 | Yes. `countText`: empty, `no matches` or `<i> of <n>`. The count is also empty while the bar is closed | W3, E1, E5, live/no-matches test | pass |
| REQ-7 | Yes. `setQuery` → `refresh("first")` → ordinal 0 + `revealCurrent` | live/no-matches test | pass |
| REQ-8 | Yes. Enter / Shift+Enter in the box (`!isComposing`) and the buttons call `step(±1)`, which uses `stepIndex` (wraps) and then reveals the match | W3, E10, step/wrap test | pass |
| REQ-9 | Yes. Escape inside the bar or the close button runs `close()`: ranges cleared, repainted, icon back, `body.focus({preventScroll})` | E13, close-button test, E17 | pass |
| REQ-10 | Yes. Reader root `keydown` → `matchShortcut` `find` → `preventDefault` + `open()`, only while a document is rendered. The window listener in `features/shortcuts.ts` falls through `default: break`, so no `preventDefault` outside a reader | W2, E7, E8, no-document test, E14, E16 | pass |
| REQ-11 | Yes. A silent re-fetch runs `refresh("keep")`: ordinal clamped, no reveal. After each diagram pass (open and theme change) it runs `refresh("keep")` again, guarded by `seq` | E11 (theme path untested by plan decision, edge case 10) | pass |
| REQ-12 | Yes, with a gap when the new file has a diagram (Minor 1). A user-initiated open runs `refresh("first")` | E12 | pass, see Minor 1 |
| REQ-13 | Yes. `--bg-raised` ground, `--edge` border, mono `--fs-xs`/`--fs-2xs`. `--find-match`/`--find-current` exist in all three theme blocks. Contrast is 54 pairs, 0 failures ×3 | token test, `make contrast` | pass |
| DIAG | `kb:diagram/web-components` (the only diagram `kb for` names for any changed file). Checked against the tree: features/ 38, render/ 40, reader/ 11 non-test modules; 19+1+5+13 = 38; readerfind is listed as a sub-controller handed its refs by `reader.ts`, which is true | — | pass |

## Build & Tests

E2E tests: pass (935 passed, `17-e2e.log`) · Daemon tests (race): pass (`02-test.log`, every package `ok`) · Web tests: pass (2761, `05-web-test.log`) · Daemon build: pass (`01-build.log`, exit 0, no output) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci 0 issues, `03-lint.log`; biome clean, `06-web-lint.log`). All read from $GATES_LOG_DIR (0 failed lines). The other gate lines also passed: contrast (`07`), features-inventory (`08`, silent), versions (`09`), e2e-honest (`10`, silent), kb check (`11`), e2e-lint (`12`), features-scope (`13`), comments (`14`) and comment-ledger (`15`). `16-size.log` WARN is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-test` | pass (deduped to `05-web-test.log`: 96 files, 2761 tests) |
| W4 | `make web-build` | pass (deduped to `04-web-build.log`) |
| W5 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| E1 | `make e2e` | pass (deduped to `17-e2e.log`: 935 passed) |
| C1 | `make check` | pass (`18-C1.log`: lint, `go test`, contrast, e2e-lint, versions, kb check all green) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. Upkeep itself is in order: the logs have no `deviation:` lines, the three plan decisions are `proposed` ADRs with `refs: plan:docs-search-bar`, the #94 `TODO.md` move is scheduled at completion per the plan, and no fact record is due. Both Doc Delta assertions are supported by the code. What fails: an impl-log `doc-delta:` line (design-system § 1 tokens) is missing from the plan's Doc Delta (Major 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W6 | no `any` types in new web code | pass | `grep -nE '\bany\b'` over `reader/find.ts`, `render/readerfind.ts` and `features/readerfind.ts`, plus the added `web/src` diff lines: no hits |
| W7 | body never mutated by search | pass | The find path builds only `document.createRange()` objects and `Highlight` registry entries (`render/readerfind.ts:62-96`). No `<mark>`, `splitText`, `innerHTML`, `outerHTML` or `insertAdjacentHTML` anywhere in the three modules. E9 asserts `innerHTML` is identical across four source shapes |
| W8 | highlight/bar colours in all three themes | pass (tokens + gate) | `--find-match`/`--find-current` are defined in the instrument, dark and light blocks. They are used only in `::highlight()` rules. Hue is about 210–212° in all six values, outside the teal (165–195°) and violet (235–270°) bands. `--fg` on each is ≥ 4.5 by `make contrast`. The on-screen read is review-browser's |
| W9 | Cmd+F is a binding-table row | pass | `web/src/shortcuts.ts` `BINDINGS` has a `KeyF`/meta-only row → `{type:"find"}`. `features/readerfind.ts` `handleKeydown` dispatches only on `matchShortcut(event)?.type === "find"`, with no second key matcher. Escape/Enter use `event.key` as bar keys, as `render/rename.ts` does |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only diff. The added lines contain no `hook_event_name`, `rate_limits`, `permission_mode` or `session_id`) |
| 2 | Terminal-output state parsing | pass (no `capture-pane`, no pane text read) |
| 3 | Blocking hook handler | pass (no daemon change) |
| 4 | Bare tmux | pass (no tmux invocation) |
| 5 | Payload logging | pass (no logging added) |
| 6 | Empty-gauge dishonesty | pass (no gauge. With no document the icon is `hidden`; the count is empty only for an empty query) |
| 7 | Session identity on `session_id` | pass (find state is per `ReaderInstance`, never keyed on `session_id`) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (specs use synthesized `envelopedSessionStart` / `rawPostToolUse`, unchanged shapes) |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** An unreflected `doc-delta:` line. `web-implementation.md` says `docs/design/design-system.md` § 1's token table lacks `--find-match` / `--find-current`. The plan's `## Doc Delta` lists only reader and shortcuts. Meanwhile § 1 says "A component rule may reference **only these names**", and `web/src/style.css` now references two names the table does not define. Amend the Doc Delta, or the design-system table, with a row giving both tokens' role: the find highlight grounds, under `--fg` text, background only, no state meaning.

### Minor

1. **[web-impl]** REQ-12 breaks when the newly opened file has a mermaid diagram. In `openFile`, `this.find.refresh("first")` (`web/src/features/reader.ts:330`) runs before `renderDiagrams` replaces the fences. At that point the matches include text in the fence *source*, and the reveal scrolls to the first of them. When the diagram pass settles, `refindAfterDiagrams` (`:442-443`) always runs `refresh("keep")`, and `keep` never reveals (`features/readerfind.ts:53`). Two things can then go wrong:
   - If the first match was in the fence source, the current match silently becomes a different node (ordinal 0 of the new list) and is never scrolled to.
   - The SVG's height replaces the code block's, so a match revealed below the diagram can shift out of the body's visible box.

   The count also briefly reads a total that includes source-text matches, then changes. Fix: carry "this re-run follows a user-initiated open" through to the post-diagram refresh, and reveal again there, unless the user has stepped or typed since. Not covered by E12, whose fixtures have no diagram. Edge case 10 covers the theme path, not this one.
2. **[web-impl]** The hand-written **Owns** lists of two touched packages' `CLAUDE.md` files leave out the new modules:
   - `web/src/reader/CLAUDE.md:3-12` enumerates every pure module but not `find.ts`.
   - `web/src/render/CLAUDE.md:3` names the reader's DOM-half modules but not `readerfind.ts`.

   `features/CLAUDE.md` was updated only because the `features-inventory` gate forced it. Add one clause to each. `find.ts` can join `slug.ts`/`zoom.ts` as a pure exemplar in `reader/CLAUDE.md`'s invariant line.
3. **[orchestrator]** The three proposed ADRs' `files`/`tests` fields don't name where the decisions shipped, so `go tool kb for web/src/features/readerfind.ts` and `kb for web/src/render/readerfind.ts` surface none of them.
   - `reader-find-highlights-via-css-highlight-api` lists `render/reader.ts` and `features/reader.ts`, but the highlights live in `web/src/render/readerfind.ts`.
   - `reader-find-overrides-cmd-f-inside-reader` lists `features/reader.ts`, but the dispatch is in `web/src/features/readerfind.ts`. Its `tests: [web/e2e/shortcuts.spec.ts]` names a spec with no find or `KeyF` case (`grep -ci 'keyf\|find'` → 0). The guards are `web/e2e/reader-search.spec.ts` and `web/src/shortcuts.test.ts`.
   - `reader-find-query-follows-file-switch` has `tests: []`, but E11 and E12 in `reader-search.spec.ts` guard it.

### Notes

1. **[note]** Stale comment: `web/src/features/shortcuts.ts:3`, "This is the one `window` keydown listener for every bound chord". ⌘F is now a bound chord dispatched from each reader root's own listener, and this listener ignores it. The impl log's second `doc-delta:` line names the same comment; it is a code comment, so it is the comment pass's, not the Doc Delta's.
2. **[note]** Edge case 17 (10 MiB document, typing stays responsive). The plan assigned this to the reviewer's read. Every keystroke re-walks every body text node, lower-cases each node's text, and creates one `Range` per match, with no debounce and no match cap. It then deletes every previous range from the global highlight and adds the new ones (`render/readerfind.ts:62-96`, `features/readerfind.ts:48-55`). This is fine at plan-document sizes. A one-character query on a multi-MB file would build a range for every occurrence on each key. No budget is set, so nothing is requested. If one is set later, a match cap is a product choice.
3. **[note]** For review-browser: the find buttons inherit `.arr, .fbtn`'s `font-size: 14px` (`web/src/style.css:1237-1240`), and the compact rule changes only their padding. So in a tile the ↑ ↓ × glyphs stay at Focus size while the query box drops to `--fs-2xs`. Whether that reads as "compact: smaller" is an observed question.
4. **[note]** Cmd+F while the reader's diagram `<dialog>` is open is deliberately not intercepted (`features/readerfind.ts` `claimFindChord`), so the browser's find opens over the modal. This is logged in the impl Decisions, and it is consistent with the shortcuts Doc Delta's "otherwise left to the browser".

## Browser review

# Browser review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: needs-changes
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

## Maintainability review

# Maintainability review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 10753 words (budget 30000)
**Scope**: 9 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only; no Go touched)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/reader/find.ts | slug.ts, zoom.ts, tree.ts, mermaid.ts, reader/CLAUDE.md | yes | none | pass |
| web/src/render/readerfind.ts | reader.ts, diagramdialog.ts, diagrams.ts, frontmatter.ts, render/CLAUDE.md | yes | none | Minor 3 |
| web/src/render/reader.ts | diagramdialog.ts, diagrams.ts, frontmatter.ts | yes (wiring only) | filelen 566 (was 544), reason holds | Minor 2, Minor 4 |
| web/src/features/readerfind.ts | launchgroup.ts, launchresume.ts, groupsselect.ts, groupsdialogs.ts, connection.ts, features/CLAUDE.md | yes | none | Minor 1 |
| web/src/features/reader.ts | launch.ts, groups.ts (owners of sub-controllers) | yes (wiring only) | filelen 694 (was 674), reason holds | pass |
| web/src/shortcuts.ts | features/shortcuts.ts (its only dispatcher) | yes (dispatch from reader, stated) | none | pass |
| web/src/style.css | `.rnav .filter`, `.arr`, `.seg-btn`, `.btn` rules in the same file | yes (`fbtn`) | n/a (contrast-gate file) | Minor 5 |
| web/src/features/CLAUDE.md | render/CLAUDE.md, reader/CLAUDE.md | n/a | none | pass |
| web/src/render/CLAUDE.md | features/CLAUDE.md | n/a (trailer recount only) | none | pass |

Duplicate searches run (all from `web/src`, `--glob '!*.test.ts'`):

```
$ rg -n "\+ (count|n|len|length)\) %|% (count|length|n)\b|\.length\) %" .
./reader/find.ts:57:  return (index + direction + count) % count;
./render/menu.ts:113:  else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
./features/launch.ts:666:        entries[(activeIndex + 1 + entries.length) % entries.length]?.focus();
./features/launch.ts:669:        entries[(activeIndex - 1 + entries.length) % entries.length]?.focus();
$ rg -n "Math\.max\(0, Math\.min|function clamp" .
./reader/zoom.ts:28:export function clampZoom(zoom: number): number {
./reader/find.ts:60:export function clampIndex(index: number, count: number): number {
$ rg -n "CSS\.highlights|new Highlight" .          -> only render/readerfind.ts
$ rg -n "createTreeWalker|SHOW_TEXT" .              -> only render/readerfind.ts
$ rg -n '"noscript"|"desc"|localName' .             -> only render/readerfind.ts
$ rg -n "scrollTop|getBoundingClientRect|scrollIntoView" reader render features
render/reader.ts:564-565  (heading-to-top scroll for the outline; different rule from centring a range)
render/readerfind.ts:100-106
```

No existing helper does what `stepIndex`, `clampIndex`, `findInTexts`, `findRanges`, `paintFind` or `scrollRangeIntoView` do: the wrap idiom in `menu.ts`/`launch.ts` is inline, not a helper, and `clampZoom` clamps a zoom range rather than an index. No duplicate helper found.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `createReaderFind` is shaped unlike the four sub-controllers it names as precedent. See `web/src/features/readerfind.ts:14-30`. Its design line says "a reader sub-controller named `<owner><concern>.ts` (precedent `launchgroup.ts`, `launchresume.ts`); closure-over-state `create…` function". But every sibling sub-controller is `init<Owner><Concern>(elements: <Name>Elements, …): <Name>Handle`:
   - `features/launchgroup.ts:45`: `export function initLaunchGroup(elements: LaunchGroupElements): LaunchGroupHandle`
   - `features/groupsselect.ts:50`: `initGroupsSelect(` taking `GroupsSelectElements`, returning `GroupsSelectHandle`
   - `features/groupsdialogs.ts:48`: the same shape
   - `features/launchresume.ts:88`: the same shape

   The new module diverges in three ways. It is `createReaderFind`, not `initReaderFind`. It returns `ReaderFind`, not `ReaderFindHandle`. And it takes the owner's whole `ReaderRefs` (a type from `render/reader.ts`) where its siblings take a `<Name>Elements` interface listing only the elements they use. Through that whole-refs parameter it reads `refs.diagramDialog.open` (line 88), an element that belongs to `render/diagramdialog.ts`'s concern. `kb:diagram/web-components` describes the five sub-controllers as "handed their elements by their owner", and `features/CLAUDE.md` says "`deps` is typed structurally with the exact methods it calls". A fix must make one of two things true. Either the module matches its siblings' `init…`/`…Elements`/`…Handle` shape, with the dialog check reaching it as an element or a structural dep it names. Or the design line states why it diverges, and stops citing as precedent the modules it differs from.

2. **[web-impl]** The find bar's listener wiring sits in `render/reader.ts:197-202` (`wireFind`). The same concern's sibling keeps its wiring in its own module: `render/diagramdialog.ts:9` imports `type { ReaderRefs } from "./reader"` and exports `wireDiagramDialog(refs)`, which `buildReader` calls in one line. `render/readerfind.ts` already holds the find bar's refs, builder and painter, so a reader looking for the find bar's listeners would look there first. No design line gives a reason for the split. The extra lines also land in a file already over 500 lines (566). A fix must make one of two things true: the find wiring lives with the rest of the find DOM half, as `wireDiagramDialog` does, or the design line states why it stays in `render/reader.ts`.

3. **[web-impl]** The `CSS.highlights` entries `find-match` and `find-current` are shared, document-wide state, but the code does not say so where they are declared (`web/src/render/readerfind.ts:4-5`, and `registered()` at line 78). Every `ReaderInstance` on the page writes to these two entries: the focus reader and every tile reader. Each one adds and deletes only its own `Range`s, and the first caller fixes the priority. This breaks conventions § Design: "Shared state names its writers and its guard … says so where it is declared." The only place the rule appears today is the Decisions log ("each reader adds and removes only its own `Range` objects", INV-5). It is not a race: I found no interleaving that breaks it, because each instance passes its own previous paint to `paintFind`, so one reader's repaint never deletes another's ranges. A fix must make the declaration say that the registry is shared across reader instances, and state the rule that keeps them apart.

4. **[web-impl]** `renderFindBar(refs.find, vm.find);` was inserted at `web/src/render/reader.ts:497`, between the `aria-busy` comment (lines 492-495) and the three lines it explains (498-500). A reader now takes that comment, about removing `aria-busy` rather than setting it to `"false"`, as describing the find bar. A fix must put the call where it no longer separates that comment from the code it explains.

5. **[web-impl]** `.find-query` (`web/src/style.css:1533-1544`) repeats the reader's other text box, `.rnav .filter` (`style.css:1670-1680`), declaration for declaration: `border: 1px solid var(--edge)`, `border-radius: 3px`, `padding: 3px 7px`, `background: var(--well)`, `color: var(--fg)`, `font-family: var(--mono)`. Only `font-size` and the flex sizing differ. The same branch's `fbtn` fix shares `.arr`'s base rules through a selector list (`.arr, .fbtn`) so the two do not drift. The query box is a second copy of the filter's look instead (conventions § Design "Reuse before add"). A fix must give the reader's two text boxes one shared source for their common declarations, so changing the filter's look changes the find box too. Alternatively, the design line states why they should be free to drift.

### Notes

1. **[note]** Size warnings: `web/src/features/reader.ts` is 694 lines (was 674) and `web/src/render/reader.ts` is 566 (was 544). Both were over 500 before this branch, and the stated reason holds: the matcher, the DOM half and the controller went into three new modules, and the additions to the two big files are callbacks, the VM field, refresh calls and the `refindAfterDiagrams` guard. The one exception is `wireFind`, raised as Minor 2.
2. **[note]** ⌘F is in `shortcuts.ts`'s binding table but is dispatched from the reader's root keydown, not `features/shortcuts.ts`'s window listener, which drops it in `default: break`. The design line gives the reason, and it holds: the pop-out never runs `features/shortcuts.ts`. That module's header still says it is "the one `window` keydown listener for every bound chord". That is doc truth and belongs to review-work; the impl log already raises it as a doc-delta.
3. **[note]** For review-work (doc truth): `web/src/reader/CLAUDE.md`'s **Owns** list does not name `find.ts`, and `web/src/render/CLAUDE.md`'s **Owns** list does not name `readerfind.ts`. Only `features/CLAUDE.md` was updated, because only it has an inventory gate.
4. **[note]** For review-work (DIAG): `kb:diagram/web-components` labels the `render → reader` edge "tree types". `render/readerfind.ts` now value-imports `findInTexts` over that edge. The label was already narrower than the code before this branch: `render/diagrams.ts` imports `reader/mermaid` and `render/diagramdialog.ts` imports `reader/zoom`.
5. **[note]** `ReaderCallbacks.onKeydown` (`web/src/render/reader.ts:106`) is a generic name on an interface whose other members say what they do (`onToggleFiles`, `onFindStep`). Today only find handles root keydowns. No change requested.
6. **[note]** The new modules carry no header or doc comments, unlike most of their neighbours (`render/diagramdialog.ts`, `reader/zoom.ts`). Comments are owned by the comment pass (kb:adr/process-comment-pass-owns-code-comments), so this is not filed.

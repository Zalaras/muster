# Re-levelling batch: reader-find (reader-search.spec.ts)

Render spec `web/render/reader-find.spec.ts`, helper `web/render/helpers/reader-find.ts`;
scenarios in `internal/server/renderfix_scenarios_reader_find.go`. The find-bar locators, the
`CSS.highlights` oracle, the corner geometry, the Meta+F key log, the focus-identity tags and
the find documents themselves (`FIND_FILES`, `FIND_DOCUMENTS`, `tallBody`) moved out of
`web/e2e/helpers/reader-search.ts` into the render helper, which the E2E helper re-exports;
what stays in the E2E helper is `writeFindFixtures`, the one thing a render test never does
(writing the documents to disk). Counts are Playwright `--list` counts.

## `reader-search.spec.ts` — 50 tests → 6 E2E, 45 render, 0 vitest

44 of the 50 moved; the render spec adds one test of its own, the fixture identity (below).
Every port keeps the original title, the same real key presses (`Meta+KeyF`, `Enter`,
`Shift+Enter`, `Escape`, `Space`, one key per typed character), the same geometry oracles
(`barMetrics`, `expectInCorner`, `expectCurrentMatchInView`, `readHighlights` through
`CSS.highlights`), the same host views and the same stays-unchanged checks (`settleFor`
advances the installed clock). The view, the density and the theme are the fixture's prefs
(`withPrefs`), never a click on a segment or a radio: the dashboard adopts all three only from
the prefs broadcast, which the harness never sends.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| clicking Search document opens the bar with the query box focused, the icon hidden and the other controls present | E1, REQ-3, REQ-6 | **property** | bar state after a click — `find-docs` |
| with the nav open the search icon sits inside the reading area below the docbar, left of the nav's border, and stays put while the body scrolls | E2, REQ-1, REQ-2, INV-3 | **property** | icon geometry |
| collapsing and reopening the nav moves the open bar between the nav's border and the reader's right edge, keeping the query and count | E3, REQ-2, INV-3 | **property** | bar geometry across the nav toggle (client state) |
| with no document rendered there is no search icon and Cmd+F is left to the browser, and opening a file brings the icon | REQ-1, REQ-10, States | **property** | the placeholder state and a real key |
| searching the open file's basename counts only the occurrences in the body, not the docbar or the nav | E4, INV-2, REQ-4 | **property** | match scope against the recorded document |
| a query present in a frontmatter value, a paragraph in another case and a code block reads 1 of 3 with three highlight ranges and one current | E5, REQ-4, REQ-5, REQ-6 | **property** | highlights for a document |
| a query of regex metacharacters matches as literal text, case-insensitively | REQ-4, edge cases 1-2 | **property** | matching logic through the display |
| a query present only in a rendered mermaid node label reads 1 of 1 and highlights the SVG text | E6, REQ-4, REQ-5 | **property** | the mermaid chunk is served from the bundle |
| clicking in the body and pressing Cmd+F opens the bar, and pressing it again refocuses the query box with its text selected, both default-prevented | E7, REQ-10, INV-4 | **property** | real key, capture-phase log |
| Cmd+F with focus on a rail card or on the page body is not default-prevented and opens no bar | E8, REQ-10, INV-4 | **property** | real key outside the reader |
| opening, typing, stepping and closing the bar leave the body's innerHTML identical for every source shape | E9, INV-1, REQ-5 | **property** | four recorded documents, `settleFor` for the stays-unchanged check |
| the open bar keeps its viewport position when the body scrolls, and each step scrolls the current match into the body's visible box | E10, INV-3, REQ-8 | **property** | geometry and scroll |
| Enter and Next match step forward, Shift+Enter and Previous match step back, both wrapping at the ends and keeping the current match in view | REQ-8 | **property** | stepping |
| typing scrolls the first match into the body, counts update per key, an empty query clears the highlights and reads No results, and so does a miss | REQ-6, REQ-7 | **property** | live counts |
| with the bar open the first line of the body sits below it, returns when the bar closes, and every match of a heading that wraps is readable in Focus | E10, REQ-7, REQ-8 | **property** | clearance geometry |
| a heading of forty matches is readable at every step in a 3×2 tile, where the first lines run under the bar without the clearance | E15, REQ-7, REQ-8 | **property** | `find-docs-tiles-3x2` |
| a heading of forty matches is readable at every step in a 2×2 tile | E15, REQ-7, REQ-8 | **property** | `find-docs-tiles-2x2` |
| a match in the frontmatter table at the very top of the body is readable in Focus and in a 3×2 tile, not under the bar | REQ-7 | **property** | placement at scrollTop 0 |
| a match in the frontmatter table at the top of a 3×2 tile's body is readable, not under the bar | REQ-7 | **property** | `find-docs-tiles-3x2` |
| stepping scrolls sideways to a match at the end of a long code line and of a wide table, and back, in Focus | REQ-8 | **property** | horizontal scroll containers |
| stepping scrolls sideways to a match at the end of a long code line and of a wide table in a 3×2 tile | REQ-8, E15 | **property** | `find-docs-tiles-3x2` |
| opening a file with a diagram under an open bar reveals the first match inside the diagram once it has rendered | E12, REQ-12 | **property** | a file switch is a recorded GET; the diagram renders client-side |
| the query box shows no native clear button, where a plain search input does | E1, REQ-3 | **property** | pixel oracle on the built bundle |
| each find control keeps keyboard focus on the same node across activation by a real key and a one-second tick | REQ-3, REQ-8, REQ-9, E13 | **property** | real keys, `settleFor` ticks, node identity |
| Escape closes the bar, empties both highlights, shows the icon and leaves focus on the body | E13, REQ-9 | **property** | real key |
| clicking Close search closes the bar, clears the highlights and returns the icon, and reopening starts from the last query's matches | REQ-9 | **property** | bar state |
| rewriting the open file with a Write hook re-runs the query, keeps the ordinal when it fits, clamps it when it does not, reads No results at zero, and never scrolls the body | E11, REQ-11 | journey | a hook POST re-renders the document mid-search |
| opening another file with the bar open keeps the bar and query, re-runs them against the new file at 1 of n and scrolls to the first match | E12, REQ-12 | **property** | a file switch is a recorded GET |
| the pop-out shows the icon, opens the bar on click and on Cmd+F, and highlights as in Focus | E14, REQ-1, REQ-3, REQ-10, INV-4 | journey | pop-out: a second page the harness cannot serve (Notes) |
| in the pop-out the icon and the open bar hug the reading area's corner with the nav open and collapsed, and stay put while the body scrolls | INV-3 | journey | pop-out |
| in Focus the opened bar's count reads No results, and the bar keeps one width across an empty query, a count and a miss | search-bar-text-length REQ-1, REQ-3 | **property** | bar width |
| in a 3×2 tile the bar keeps one width across an empty query, a count and a miss | search-bar-text-length REQ-1, REQ-3 | **property** | `find-docs-tiles-3x2` |
| in a 3×2 tile with the nav collapsed the icon and the open bar sit inside the tile's reading area with no horizontal overflow | E15, REQ-1, REQ-2, INV-3 | **property** | tile geometry |
| in a 2×2 tile with the nav open the icon and the open bar sit left of the nav's border inside the reading area | INV-3 | **property** | tile geometry |
| a tile's find bar carries the same controls as Focus's at a smaller type size | REQ-1 | **property** | two fixtures opened in turn (deliberate difference 1) |
| with two tile readers, clicking in one body and pressing Cmd+F opens that tile's bar only, default-prevented | E16, REQ-10, INV-4 | **property** | `find-docs-pair-2x2` |
| with two tile readers searching different queries, stepping or closing one leaves the other's count and highlight ranges unchanged | E17, INV-5, REQ-5, REQ-9 | **property** | `find-docs-pair-2x2` |
| the open bar's ground, border and type follow the design tokens in the instrument, dark and light themes | REQ-13 | **property** | `find-docs-{instrument,dark,light}` (deliberate difference 2) |
| opening and closing the bar with the body scrolled keeps a paragraph at the same viewport y in Focus | Browser Minor 1, INV-3 | **property** | scroll geometry across the bar |
| … in the pop-out | Browser Minor 1, INV-3 | journey | pop-out |
| … in a 2×2 tile | Browser Minor 1, INV-3 | **property** | `find-docs-tiles-2x2` |
| … in a 3×2 tile | Browser Minor 1, INV-3 | **property** | `find-docs-tiles-3x2` |
| closing the bar with the body {at the end, 10 px short of the end} of its body keeps the last paragraph at the same viewport y in Focus (×2) | Browser Minor 1, INV-3 | **property** | scroll geometry at the end |
| … in the pop-out (×2) | Browser Minor 1, INV-3 | journey | pop-out |
| … in a {2×2, 3×2} tile (×4) | Browser Minor 1, INV-3 | **property** | `find-docs-tiles-*` |

**Deliberate differences**

1. "a tile's find bar carries the same controls as Focus's at a smaller type size": the E2E
   measured Focus, pressed Cmd+\ and measured the same session's tile. The view toggle is a
   pref PUT whose broadcast the dashboard waits for, so the render test measures Focus on
   `find-docs` and then opens `find-docs-tiles-2x2` on the same page (the harness allows a
   second `open`) and measures the tile. Both numbers are still read from the live layout and
   compared.
2. "the open bar's ground, border and type follow the design tokens in the instrument, dark and
   light themes": the E2E checked each theme's Settings radio; the theme is adopted only from
   the broadcast, so the test opens `find-docs-instrument`, `-dark` and `-light` in turn and
   asserts `<html data-theme>` equals each fixture's pref before reading the tokens. The token
   assertions are unchanged.
3. The E2E openers waited on the body's `h1` with a 15 s timeout (a daemon round-trip and a
   mermaid render); the render openers use the config's 15 s expect timeout, which is the same
   bound.
4. One test is new: "every find-docs fixture records each document in FIND_FILES with the
   bytes the E2E helper writes (fixture identity)" proves, for all seven fixtures, that each
   session's recording lists exactly the twelve documents and that every body equals
   `FIND_DOCUMENTS[key]` — the Go transcription of the TypeScript builder is checked rather
   than trusted.

## Scenarios added

| Scenario | Holds | Used by |
|---|---|---|
| `find-docs` | one idle session `find` on a checkout holding every document in `FIND_FILES`, Focus view | every Focus test |
| `find-docs-tiles-2x2`, `find-docs-tiles-3x2` | the same session under `view: tiles` at each density | the tile tests |
| `find-docs-pair-2x2` | two such sessions, `find-a` and `find-b`, each on its own checkout, Tiles 2×2 | E16, E17 |
| `find-docs-{instrument,dark,light}` | the same session under each theme pref | REQ-13 |

The scenario file transcribes the twelve documents into Go byte for byte; the identity test
above is what holds the two copies together.

## Deleted Tests

Every row moved to `web/render/reader-find.spec.ts` under the same title.

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `reader-search.spec.ts` | clicking Search document opens the bar… (E1, REQ-3, REQ-6) | bar opens, focus, icon hidden, controls present | `web/render/reader-find.spec.ts`, same title |
| `reader-search.spec.ts` | with the nav open the search icon sits inside the reading area… (E2, REQ-1, REQ-2, INV-3) | icon in the corner, fixed while scrolling | same title |
| `reader-search.spec.ts` | collapsing and reopening the nav moves the open bar… (E3, REQ-2, INV-3) | bar follows the nav edge, query and count kept | same title |
| `reader-search.spec.ts` | with no document rendered there is no search icon and Cmd+F is left to the browser… (REQ-1, REQ-10, States) | placeholder state, chord not prevented | same title |
| `reader-search.spec.ts` | searching the open file's basename counts only the occurrences in the body… (E4, INV-2, REQ-4) | match scope | same title |
| `reader-search.spec.ts` | a query present in a frontmatter value, a paragraph in another case and a code block reads 1 of 3… (E5, REQ-4, REQ-5, REQ-6) | three ranges, one current | same title |
| `reader-search.spec.ts` | a query of regex metacharacters matches as literal text… (REQ-4, edge cases 1-2) | literal matching | same title |
| `reader-search.spec.ts` | a query present only in a rendered mermaid node label reads 1 of 1… (E6, REQ-4, REQ-5) | SVG text highlighted | same title |
| `reader-search.spec.ts` | clicking in the body and pressing Cmd+F opens the bar, and pressing it again refocuses… (E7, REQ-10, INV-4) | chord inside the reader, selection, default-prevented | same title |
| `reader-search.spec.ts` | Cmd+F with focus on a rail card or on the page body is not default-prevented… (E8, REQ-10, INV-4) | chord outside the reader | same title |
| `reader-search.spec.ts` | opening, typing, stepping and closing the bar leave the body's innerHTML identical… (E9, INV-1, REQ-5) | body never mutated, four shapes | same title |
| `reader-search.spec.ts` | the open bar keeps its viewport position when the body scrolls, and each step scrolls the current match… (E10, INV-3, REQ-8) | bar fixed, steps scroll | same title |
| `reader-search.spec.ts` | Enter and Next match step forward, Shift+Enter and Previous match step back… (REQ-8) | stepping and wrapping | same title |
| `reader-search.spec.ts` | typing scrolls the first match into the body, counts update per key… (REQ-6, REQ-7) | live counts, empty and miss | same title |
| `reader-search.spec.ts` | with the bar open the first line of the body sits below it, returns when the bar closes… (E10, REQ-7, REQ-8) | clearance, wrapped heading readable | same title |
| `reader-search.spec.ts` | a heading of forty matches is readable at every step in a 3×2 tile… (E15, REQ-7, REQ-8) | readable in the compact tile | same title |
| `reader-search.spec.ts` | a heading of forty matches is readable at every step in a 2×2 tile (E15, REQ-7, REQ-8) | readable in the tile | same title |
| `reader-search.spec.ts` | a match in the frontmatter table at the very top of the body is readable in Focus… (REQ-7) | top-of-body match | same title |
| `reader-search.spec.ts` | a match in the frontmatter table at the top of a 3×2 tile's body is readable… (REQ-7) | top-of-body match in a tile | same title |
| `reader-search.spec.ts` | stepping scrolls sideways to a match at the end of a long code line and of a wide table, and back, in Focus (REQ-8) | horizontal scroll | same title |
| `reader-search.spec.ts` | stepping scrolls sideways… in a 3×2 tile (REQ-8, E15) | horizontal scroll in a tile | same title |
| `reader-search.spec.ts` | opening a file with a diagram under an open bar reveals the first match inside the diagram… (E12, REQ-12) | late diagram reveal | same title |
| `reader-search.spec.ts` | the query box shows no native clear button, where a plain search input does (E1, REQ-3) | no clear button | same title |
| `reader-search.spec.ts` | each find control keeps keyboard focus on the same node across activation… (REQ-3, REQ-8, REQ-9, E13) | focus identity per control | same title |
| `reader-search.spec.ts` | Escape closes the bar, empties both highlights, shows the icon and leaves focus on the body (E13, REQ-9) | Escape closes | same title |
| `reader-search.spec.ts` | clicking Close search closes the bar, clears the highlights and returns the icon… (REQ-9) | close button | same title |
| `reader-search.spec.ts` | opening another file with the bar open keeps the bar and query, re-runs them… (E12, REQ-12) | query follows a file switch | same title |
| `reader-search.spec.ts` | in Focus the opened bar's count reads No results, and the bar keeps one width… (search-bar-text-length REQ-1, REQ-3) | one width | same title |
| `reader-search.spec.ts` | in a 3×2 tile the bar keeps one width… (search-bar-text-length REQ-1, REQ-3) | one width in a tile | same title |
| `reader-search.spec.ts` | in a 3×2 tile with the nav collapsed the icon and the open bar sit inside the tile's reading area… (E15, REQ-1, REQ-2, INV-3) | tile geometry, no overflow | same title |
| `reader-search.spec.ts` | in a 2×2 tile with the nav open the icon and the open bar sit left of the nav's border… (INV-3) | tile geometry | same title |
| `reader-search.spec.ts` | a tile's find bar carries the same controls as Focus's at a smaller type size (REQ-1) | controls and type size | same title (deliberate difference 1) |
| `reader-search.spec.ts` | with two tile readers, clicking in one body and pressing Cmd+F opens that tile's bar only… (E16, REQ-10, INV-4) | chord per tile | same title |
| `reader-search.spec.ts` | with two tile readers searching different queries, stepping or closing one leaves the other's… (E17, INV-5, REQ-5, REQ-9) | independence of two readers | same title |
| `reader-search.spec.ts` | the open bar's ground, border and type follow the design tokens in the instrument, dark and light themes (REQ-13) | tokens per theme | same title (deliberate difference 2) |
| `reader-search.spec.ts` | opening and closing the bar with the body scrolled keeps a paragraph at the same viewport y in Focus (Browser Minor 1, INV-3) | scroll held | same title |
| `reader-search.spec.ts` | … in a 2×2 tile (Browser Minor 1, INV-3) | scroll held in a tile | same title |
| `reader-search.spec.ts` | … in a 3×2 tile (Browser Minor 1, INV-3) | scroll held in a tile | same title |
| `reader-search.spec.ts` | closing the bar with the body {at the end, 10 px short of the end} of its body… in Focus (Browser Minor 1, INV-3) ×2 | end of body held | same titles |
| `reader-search.spec.ts` | closing the bar with the body {at the end, 10 px short of the end} of its body… in a {2×2, 3×2} tile (Browser Minor 1, INV-3) ×4 | end of body held in a tile | same titles |

## Borderline, left in place

- None. Every test fell cleanly on one side: the Write hook is a journey, the pop-out is a
  page the harness cannot serve, and everything else is a property of the display.

## Notes

- **The pop-out stays E2E for a harness reason, not a level reason.** Its six tests (E14, the
  INV-3 corner, Browser Minor 1 and the two end-of-body cases) are properties of the display,
  but the pop-out is a second page (`doc.html`), and `installRoutes` registers its routes on
  the first page only. Measured: the popup lands on `chrome-error://chromewebdata/` with an
  empty body. A `context.route` in the harness would let them move; that is web-impl's file
  and out of this batch's scope.
- `expectCurrentMatchInView`, `expectFindState` and `readHighlights` run unchanged against the
  recorded documents: the identity test is what makes "the same document the E2E searched" a
  checked fact rather than a comment.
- Spec-level composition (`openBar`, `typeQuery`, `bodyParagraph`,
  `expectScrolledTextStillAcrossBar`) is defined in each spec rather than in the shared helper:
  the two tiers' `settleFor` differ (a real wait against a daemon, a clock advance against a
  fixture), so the scrolled-text oracle must bind to its own tier's. The geometry it calls
  (`distanceFromEnd`, `boxOf`, `bodyScrollTop`) is shared.
- `make gen-render-fixtures` in this tree also rewrote `effort-warned-dark.json` and
  `effort-warned-instrument.json` (one `lastLaunchedAt` each, 00:00 → 00:03), which are the
  focus batch's; both were reverted here and are not part of this commit. If
  `check-render-fixtures` names them on `plan/e2e-audit`, the generator's launch alignment
  (`e78eafc9`) has not settled those two scenarios.

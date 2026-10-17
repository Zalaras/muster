# E2E Test Specs: Docs Search Bar

**Plan**: docs-search-bar
**Mode**: fix (attempt 3, review cycle 3)
**Pack**: kb: pack 9794 words (budget 30000)
**Verdict**: pass
**Tests created**: 48 (27 + 9 added in fix attempt 1 + 4 added in fix attempt 2 + 8 added in fix attempt 3)
**Live run**: 48/48 passing (own spec); reader.spec.ts 60/60 (108 passed across both files, 1.1m); soak 480/480

## Tests

All 27 are in `web/e2e/reader-search.spec.ts` and assert new behaviour, so each is `collection-only`. Each fails today on a named assertion (the icon, bar or searchbox does not exist yet). No test is a regression pin.

| Test Name | Requirement | What It Verifies | Live run |
|-----------|-------------|------------------|----------|
| clicking Search document opens the bar with the query box focused, the icon hidden and the other controls present | E1, REQ-3, REQ-6 | Icon click opens the bar, searchbox focused, icon hidden, count empty, prev/next/close present | collection-only |
| with the nav open the search icon sits inside the reading area below the docbar, left of the nav's border, and stays put while the body scrolls | E2, REQ-1, REQ-2, INV-3 | Icon box inside `article.md`, below docbar, right edge within 24 px of the nav's left border, same viewport position after scrolling | collection-only |
| collapsing and reopening the nav moves the open bar between the nav's border and the reader's right edge, keeping the query and count | E3, REQ-2, INV-3 | Bar placement nav open / collapsed / reopened, query and `1 of 3` unchanged, icon at the right edge when collapsed | collection-only |
| with no document rendered there is no search icon and Cmd+F is left to the browser, and opening a file brings the icon | REQ-1, REQ-10, States | Placeholder state has no icon, Cmd+F not default-prevented, no bar; opening a file shows the icon | collection-only |
| searching the open file's basename counts only the occurrences in the body, not the docbar or the nav | E4, INV-2, REQ-4 | Basename on screen in docbar and nav; count is `1 of 2`, equal to the body-text oracle | collection-only |
| a query present in a frontmatter value, a paragraph in another case and a code block reads 1 of 3 with three highlight ranges and one current | E5, REQ-4, REQ-5, REQ-6 | `1 of 3`; `CSS.highlights` holds 3 ranges (table, paragraph, code) and 1 current | collection-only |
| a query of regex metacharacters matches as literal text, case-insensitively | REQ-4, edge cases 1-2 | `a.c`, `a*c`, `(x)` match literally | collection-only |
| a query present only in a rendered mermaid node label reads 1 of 1 and highlights the SVG text | E6, REQ-4, REQ-5 | `1 of 1`, the range sits in an SVG text node | collection-only |
| clicking in the body and pressing Cmd+F opens the bar, and pressing it again refocuses the query box with its text selected, both default-prevented | E7, REQ-10, INV-4 | Cmd+F from the body opens the bar; again selects the whole query; from inside the box re-selects; every keydown default-prevented | collection-only |
| Cmd+F with focus on a rail card or on the page body is not default-prevented and opens no bar | E8, REQ-10, INV-4 | Cmd+F outside any reader is left to the browser | collection-only |
| opening, typing, stepping and closing the bar leave the body's innerHTML identical for every source shape | E9, INV-1, REQ-5 | innerHTML identical across no frontmatter, frontmatter table, raw fallback and a rendered diagram | collection-only |
| the open bar keeps its viewport position when the body scrolls, and each step scrolls the current match into the body's visible box | E10, INV-3, REQ-8 | Bar pinned while the body scrolls; stepping scrolls the match into the body's box | collection-only |
| Enter and Next match step forward, Shift+Enter and Previous match step back, both wrapping at the ends and keeping the current match in view | REQ-8 | Keys and buttons, forward and back, wrap both ways | collection-only |
| typing scrolls the first match into the body, counts update per key, an empty query clears the count and highlights, and a miss reads no matches | REQ-6, REQ-7 | Live update, scroll to first match, empty and `no matches` states | collection-only |
| each find control keeps keyboard focus on the same node across activation by a real key and a one-second tick | REQ-3, REQ-8, REQ-9, E13 | Icon, query box, next, previous and close each activated by Enter/Space; `document.activeElement` and node identity survive a tick | collection-only |
| Escape closes the bar, empties both highlights, shows the icon and leaves focus on the body | E13, REQ-9 | Escape closes, highlights gone (registry empty), icon back, body focused | collection-only |
| clicking Close search closes the bar, clears the highlights and returns the icon, and reopening starts from the last query's matches | REQ-9 | Close button path | collection-only |
| rewriting the open file with a Write hook re-runs the query, keeps the ordinal when it fits, clamps it when it does not, reads no matches at zero, and never scrolls the body | E11, REQ-11, edge cases 8-9 | `2 of 3` kept and `scrollTop` unchanged; clamps to `1 of 1`; `no matches` with the bar open | collection-only |
| opening another file with the bar open keeps the bar and query, re-runs them against the new file at 1 of n and scrolls to the first match | E12, REQ-12 | Query follows the file switch, `1 of 2`, scrolled to the first match | collection-only |
| the pop-out shows the icon, opens the bar on click and on Cmd+F, and highlights as in Focus | E14, REQ-1, REQ-3, REQ-10, INV-4 | Pop-out icon, bar, 3/1 highlights, Cmd+F prevented in the pop-out only | collection-only |
| in the pop-out the icon and the open bar hug the reading area's corner with the nav open and collapsed, and stay put while the body scrolls | INV-3 | Pop-out placement, both nav states | collection-only |
| in a 3×2 tile with the nav collapsed the icon and the open bar sit inside the tile's reading area with no horizontal overflow | E15, REQ-1, REQ-2, INV-3 | Tile icon and bar placement; bar `scrollWidth <= clientWidth`; every control inside the bar | collection-only |
| in a 2×2 tile with the nav open the icon and the open bar sit left of the nav's border inside the reading area | INV-3 | Tile placement with the nav open | collection-only |
| a tile's find bar carries the same controls as Focus's at a smaller type size | REQ-1 | Same five controls; the tile's query-box font size is smaller than Focus's | collection-only |
| with two tile readers, clicking in one body and pressing Cmd+F opens that tile's bar only, default-prevented | E16, REQ-10, INV-4 | Only the focused tile's bar opens | collection-only |
| with two tile readers searching different queries, stepping or closing one leaves the other's count and highlight ranges unchanged | E17, INV-5, REQ-5, REQ-9 | Both bars open on different queries; stepping, closing and reopening one leaves the other's count and ranges identical | collection-only |
| the open bar's ground, border and type follow the design tokens in the instrument, dark and light themes | REQ-13 | Bar `background` equals `--bg-raised`, border equals `--edge`, query box is mono xs or 2xs, per theme | collection-only |

## Deleted Tests

None. No existing spec was touched.

## Fixture Changes

New `web/e2e/helpers/reader-search.ts`, additive only:

- Locators: `searchIcon`, `searchBox`, `matchCount`, `previousMatch`, `nextMatch`, `closeSearch`. `matchCount` is `[role="status"]:not(.reader-notice)`, because the reader's own notice line is also a `role="status"` inside `.reader`.
- `readHighlights(region)` reads `CSS.highlights` and keeps only ranges inside that reader, so two readers on one page are read independently. Highlights are classified by structure (the larger set is "all", the other is "current"), not by name.
- `expectFindState`, `expectNoHighlights` and `expectCurrentMatchInView`.
- Geometry: `barMetrics` measures the lowest common ancestor of the query box and the close button, and `expectInCorner` checks the corner.
- `installFindKeyLog`, `readFindKeyLog` and `waitForFindKeys`: a capture-phase `keydown` log that reads `defaultPrevented` after dispatch finishes.
- `tagActiveElement` and `activeElementTag` for focus node identity.
- Fixture markdown: `FIND_FILES`, `writeFindFixtures` and `tallBody`. These are inputs to the real renderer and mermaid, not wire shapes.

Hook payloads reuse `envelopedSessionStart` and `rawPostToolUse` (Write, `file_path`) unchanged. No new wire shape was synthesized.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E2, no-document test, E14, pop-out placement, E15, 2×2 tile, compact test |
| REQ-2 | E2, E3, pop-out placement, E15, 2×2 tile |
| REQ-3 | E1, focus-identity test, E14 |
| REQ-4 | E4, E5, literal test, E6 |
| REQ-5 | E5, E6, E9, E17 |
| REQ-6 | E1, E5, live/no-matches test |
| REQ-7 | live/no-matches test |
| REQ-8 | E10, step/wrap test, focus-identity test |
| REQ-9 | E13, close-button test, E17 |
| REQ-10 | E7, E8, no-document test, E14, E16 |
| REQ-11 | E11 |
| REQ-12 | E12 |
| REQ-13 | token test |
| INV-1 | E9 |
| INV-2 | E4 |
| INV-3 | E2, E3, E10, E15, 2×2 tile, pop-out placement |
| INV-4 | E7, E8, E14, E16 (W2 is the Vitest side) |
| INV-5 | E17 |

Untested by plan decision: edge cases 10, 12, 15, 16 and 17 (the plan names them untested).

## Handoff

- **Highlight names.** I never read the two `CSS.highlights` names. If web-impl registers more than two sets inside one reader, `readHighlights` reads only the two largest, so tell me the names in the impl log.
- **Bar wrapper.** The placement tests and the REQ-13 token test assume the bar has one wrapper element containing the query box, count, buttons and close button. It carries the `--bg-raised` ground and the `--edge` border (the plan's REQ-13 wording). If the ground sits on the input instead, validate repairs the locator, since the plan does not pin which element.
- **Tab order.** I assume nothing about it. Controls are focused with `.focus()` and activated with Enter or Space.
- **Count element.** The count must be a `role="status"` that is not `.reader-notice`, in the same `.reader` as the box. The Testable UI Elements table pins it, so `getByRole("status")` alone would also match the notice.
- **Cmd+F in a real browser.** The suite proves only `defaultPrevented`. That Chrome lets a page prevent the chord is a reviewer / review-browser measurement, per the plan.
- **Terminal focus.** INV-4's "terminal surface" case is not asserted. xterm may prevent keys for its own reasons, which would not be this feature. The rail card and the page body stand in for "outside every reader".
- **Harness files.** No change is needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Test Run Output

Collection gate (from `web/`, `npx playwright test --list`):

```
Total: 935 tests in 59 files
Total: 27 tests in 1 file     (e2e/reader-search.spec.ts)
e2e-lint: clean
```

`npx tsc --noEmit -p web` and `npx biome check` are clean over the two new files.

## Notes

- After `make web-build build` I ran six tests live once, to check my setup and locators against the current tree: E1, the no-document test, E8, E15, the compact test and E16. Each failed only at its first new-behaviour assertion (`Search document` icon not found, or the searchbox absent after Cmd+F). The earlier setup steps all passed: launch, docs surface, opening a file, Tiles at 3×2 with the nav toggled, focusing the body, and pressing `Meta+KeyF`. These are not Tests-table `Live run` entries, because they are red as expected.
- The rest of the spec has not run. The riskiest unrun parts are the E9 shape loop, the pop-out tests, the theme-radio loop in the token test, and the mermaid label test.
- Highlight ranges are classified structurally. When there is exactly one match, both sets hold the same single range, so either assignment reads the same.
- Fixed holds: `settleFor` only, for stays-unchanged checks (E9 final, E11 scroll, focus-survives-a-tick).

## Validate Attempt 1

**Rebuild**: `make web-build build` (binary `v0.21.3-15-g231443bf-dirty`), then `npm run e2e -- e2e/reader-search.spec.ts` from `web/`.

**Own spec, first run**: `27 passed (19.0s)`. No locator needed repair; no spec file was edited this attempt. Tests-table `Live run` for all 27 rows: `ran-green-at-validate: 27 passed (19.0s)`.

**Soak**: `make e2e-soak SPEC=e2e/reader-search.spec.ts N=10` -> `270 passed (2.8m)`.

**Collection**: `npx playwright test --list` -> `Total: 935 tests in 59 files`.

**Full sweep** (`make e2e`): `3 failed`, `932 passed (8.8m)`.

| Failing test | Verdict |
|--------------|---------|
| `reader.spec.ts:1819` the reader has exactly one nav-toggle button ... (INV-ONE-ARROW) | implementation-bug, see below |
| `reader.spec.ts:1100` in Tiles at 3x2 the reader nav starts collapsed ... (INV-ONE-ARROW, edge case 8) | implementation-bug, same cause |
| `cache-warmth.spec.ts:675` a header's hover reads every warm ... (REQ-30) | not this plan: re-run alone with `--repeat-each=3` -> `3 passed (2.6m)`; load flake in an unrelated spec (the plan's diff touches nothing of cache-warmth) |

## Repairs

None. No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| The find controls reuse the class `arr` (`web/index.html:485,491-493`, and the same in `web/doc.html`), so a reader region now holds 5 `.arr` elements; the pre-existing nav-toggle invariant counts `.arr` in the region | `[web-impl]` | The plan's Protocol Contract / Doc Delta approve no change to the nav-toggle invariant (kb:adr/reader-nav-toggle-is-one-fixed-button, the plan's own reference at plan.md:64: the reader's own layout is not to change) | `region.locator(".arr")` has count 1 with the nav open and again collapsed (INV-ONE-ARROW) | `Expected: 1  Received: 5` (`reader.spec.ts:1833`, and the same count at `reader.spec.ts:1135` in the 3x2 tile) | `reader.spec.ts` "the reader has exactly one nav-toggle button ..." and "in Tiles at 3x2 the reader nav starts collapsed ..." |

Suggested fix for web-impl (not applied; the product is not mine): give the four find buttons a find-specific class that shares the `.arr` styling through the stylesheet (for example a grouped selector), so `.arr` stays the nav toggle's class alone. I did not rewrite the old specs' locator to `.docbar .arr`: the plan's delta does not sanction changing that old expectation, and the user-visible invariant (one toggle, fixed right edge) still holds, so the fix belongs in the markup.

## Handoff (validate)

- Highlight names confirmed as `find-match` / `find-current`; `readHighlights` structural classification worked unchanged.
- Bar wrapper `.find-bar` carries the ground and border as assumed; no locator repair needed.
- No harness-file change needed.
- The 3 sweep failures above are the only red; two share one cause.

## Validate Attempt 2

**Rebuild**: `make web-build build` (binary `v0.21.3-17-g7750f09c-dirty`, includes web-impl's `.fbtn` fix 7750f09c).

**Own spec**: `npm run e2e -- e2e/reader-search.spec.ts` -> `27 passed (19.7s)`. No spec file edited.
**Full sweep** (`make e2e`): `935 passed (8.7m)`. The two attempt-1 failures (`reader.spec.ts:1819` INV-ONE-ARROW, `reader.spec.ts:1100` 3x2 tile) are green; `cache-warmth.spec.ts:675` did not red this time.
**Soak**: `make e2e-soak SPEC=e2e/reader-search.spec.ts N=10` -> `270 passed (2.7m)`.
**Collection**: `npx playwright test --list` -> `Total: 935 tests in 59 files`.

The attempt-1 E2E Implementation Bugs row is resolved by the fix. Repairs: None. No assertion was deleted, skipped, or weakened.

## Fix Attempt 1 (review cycle 1)

Rebuilt first (`make web-build build`), then every run below served that build.

### Issue closed: Browser Minor 2 [e2e-specs]

`expectCurrentMatchInView` (`web/e2e/helpers/reader-search.ts`) now reads a `currentPlacement` verdict computed in the page from live boxes on every poll. It fails when the current match is above or below the body, left or right of the body's client box, left or right of the client box of any horizontally scrolling ancestor up to the body (`overflow-x` auto/scroll and `scrollWidth > clientWidth`: code block, table, diagram), intersecting the open `.find-bar`, or when `document.elementFromPoint` at its centre is not inside the body (the bar or anything else on top). A fixture for each case was added to `FIND_FILES`: `crowd` (40-word `heron` heading), `frontline` (frontmatter table first), `wide` (long code line ending `codefar`, 60-column table ending `tablefar`), `lateDiagram` (30 paragraphs, a mermaid fence, two later matches).

Proof the new oracle catches the two defects (throwaway spec, deleted; it ran against the fixed build with the fix undone from the page, since `web/src` is not mine to break):
- bar covering text: with `.md` padding-top forced to 0, stepping 14 matches of `crowd` in Focus read `["ok","ok","ok","ok","ok","ok","under the find bar (bar 757.4,133.4,1024,163.4)" x3,"under the find bar (bar 750.6,...)","ok","ok","ok","ok"]`.
- horizontal: after stepping to `codefar`, setting the code block's `scrollLeft = 0` read `right of 1044 (4359.625) in the body`.

### Fix-wave behaviour asserted (web-implementation.md Fix Attempt 2)

| Added behaviour | Test | Live run |
|---|---|---|
| Browser Major 1: first line clears the open bar, returns when it closes; every match of a wrapped heading clear of the bar in Focus | with the bar open the first line of the body sits below it, returns when the bar closes, and every match of a heading that wraps is readable in Focus | ran-green (36/36) |
| Browser Major 1: compact tiles | a heading of forty matches is readable at every step in a 3x2 tile ...; ... in a 2x2 tile | ran-green |
| Browser Major 1: frontmatter table at the very top | a match in the frontmatter table at the very top of the body is readable in Focus ...; ... of a 3x2 tile's body is readable | ran-green |
| Browser Major 2: horizontal scroll in code block and wide table, both directions | stepping scrolls sideways ... in Focus; ... in a 3x2 tile | ran-green |
| Correctness Minor 1: user-initiated switch into a diagram file reveals the diagram match | opening a file with a diagram under an open bar reveals the first match inside the diagram once it has rendered | ran-green |
| Browser Minor 3: no native clear button | the query box shows no native clear button, where a plain search input does | ran-green |

The clear-button test is a pixel oracle: the query box's right-edge strip with text and focus must equal the same strip empty, and a stock `input type=search` probe must differ between the two, proving the oracle sees the button. A `getComputedStyle(el, "::-webkit-search-cancel-button")` read was tried first and rejected: it returned `block` for both our box and a stock input, so it cannot tell them apart.

### Debounce: assertions that read stale state (Browser Minor 1 handoff)

Three places compared a count equal to the previous query's, which the 120 ms debounce can satisfy before the re-run lands. Each got an added oracle that changes with the query; no existing assertion was removed or weakened:
- regex-metacharacters test: `a*c` then `(x)` both read `1 of 1`; added `expectHighlightedText` (a helper that polls the all-matches ranges' text) after `a.c`, `a*c` and `(x)`.
- typing test: dropping the last letter reads `1 of 2` as before; added `x` (no matches) then Backspace, then `1 of 2` and the highlighted text `["Needl","Needl"]`.
- two-tile test: the reopened tile's `^1 of \d+$` was satisfied by the restored old query; added a poll that the all-matches set exceeds 3 ranges and contains `paragraph`.

## Repairs (fix attempt 1)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | every test using `expectCurrentMatchInView` | none red; the helper could not fail on x-axis or bar cover (Browser Minor 2) | helper compared top and bottom only | placement verdict on both axes, scroll containers, bar overlap, `elementFromPoint` | REQ-7/REQ-8: strengthened, not weakened; red-proven above |
| 2 | regex metacharacters; typing; two tile readers | count oracle reads stale across equal counts after the debounce | oracle not query-specific | added highlighted-text polls (above) | REQ-4, REQ-6, REQ-5/INV-5, every original assertion kept |

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs (fix attempt 1)

None. Every new assertion passed on first live run except the computed-style clear-button probe, which was my oracle, not the product.

## Handoff (fix attempt 1)

None. `docs/features/reader/spec.md` doc-delta items stay with web-impl's handoff.

## Test Run Output (fix attempt 1)

```
npm run e2e -- e2e/reader-search.spec.ts e2e/reader.spec.ts   -> 96 passed (46.9s)
make e2e-soak SPEC=e2e/reader-search.spec.ts N=10             -> 360 passed (3.4m)
npx playwright test --list                                    -> Total: 944 tests in 59 files
```

## Fix Attempt 2 (review cycle 2)

No `[e2e-specs]` issue this cycle. Coverage task: web-impl's Fix Attempt 3 added user-visible behaviour (opening or closing the find bar while the body is scrolled no longer moves the text; Browser Minor 1). Four tests added to `web/e2e/reader-search.spec.ts`, sharing one helper `expectScrolledTextStillAcrossBar(owner, region)`: scroll paragraph 15 of the tall fixture to mid-viewport (scrollTop asserted > 0), then open the bar, Escape, reopen, click Close search, asserting that paragraph's viewport y equals its resting y (to 0.5 px) after each flip and again after a 1.1 s tick.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/reader-search.spec.ts | opening and closing the bar with the body scrolled keeps a paragraph at the same viewport y in Focus | Browser Minor 1, INV-3 | y unchanged across open / Escape / reopen / close button | green, soak 400/400 |
| web/e2e/reader-search.spec.ts | ... in the pop-out | Browser Minor 1, INV-3 | same, in the second page | green |
| web/e2e/reader-search.spec.ts | ... in a 2×2 tile | Browser Minor 1, INV-3 | same, in a tile with the nav open | green |
| web/e2e/reader-search.spec.ts | ... in a 3×2 tile | Browser Minor 1, INV-3 | same, compact tile with the nav collapsed | green |

The scrollTop-0 half ("first line stays clear of the open bar") is already asserted for Focus by the existing test "with the bar open the first line of the body sits below it, returns when the bar closes ..." (E10, REQ-7); not duplicated. It still passes.

**Red without the fix (throwaway copy)**: copied `web/src` and configs to the scratchpad, deleted the one line `if (scrolled) body.scrollTop += topPadding(body) - before;` in the copy's `render/readerfind.ts`, built that bundle with vite into the copy's own outDir, swapped it into the worktree's gitignored `internal/webui/assets`, ran the four tests, then rebuilt from the real tree (`make web-build build`). `web/src` was never edited. All four went red on the first assertion: Focus `bar opened: the paragraph has not moved` Expected 400.25 Received 422.25 (22 px); pop-out Expected 350.875 Received 372.875 (22 px); 2×2 tile Expected 234.046875 Received 262.046875 (28 px); 3×2 tile red likewise. These match the reviewer's +22 / +28 px.

## Repairs (fix attempt 2)

None. No existing assertion was touched. No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs (fix attempt 2)

None.

## Handoff (fix attempt 2)

None.

## Test Run Output (fix attempt 2)

```
npm run e2e -- e2e/reader-search.spec.ts e2e/reader.spec.ts   -> 100 passed (55.3s)
make e2e-soak SPEC=e2e/reader-search.spec.ts N=10             -> 400 passed (4.4m)
npx playwright test --list                                    -> Total: 948 tests in 59 files
```

## Fix Attempt 3 (review cycle 3)

Issues addressed: Correctness Minor 2 `[e2e-specs]` and the `[e2e-specs]` half of Browser Minor 1: nothing scrolled the body to its end and closed the bar. Fix Attempt 4 in `web-implementation.md` (read-before-flip, absolute assignment in `renderFindBar`) added no new control; its observable behaviour is the end-of-body and near-end cases, asserted below.

`expectScrolledTextStillAcrossBar` gained an optional `where` argument (`"mid"` default, so the four cycle 2 tests are unchanged; `"end"`; `"near-end"`). For the last two it sets the body's `scrollTop` to `scrollHeight - clientHeight - gap` (gap 0 and 10 px) and takes paragraph 80's viewport y, then opens the bar and closes it by Escape, reopens and closes it by the close button, asserting the y is unchanged right after each flip and a render tick (1.1 s) later. For `end` it also asserts the body is still at its very end (`scrollHeight - clientHeight - scrollTop < 1`) at rest and after every flip: the other half of the reviewer's symptom ("the body is left 22 px short of its end").

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/reader-search.spec.ts | closing the bar with the body at the end of its body keeps the last paragraph at the same viewport y in Focus (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |
| web/e2e/reader-search.spec.ts | closing the bar with the body at the end of its body keeps the last paragraph at the same viewport y in the pop-out (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |
| web/e2e/reader-search.spec.ts | closing the bar with the body at the end of its body keeps the last paragraph at the same viewport y in a 2×2 tile (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |
| web/e2e/reader-search.spec.ts | closing the bar with the body at the end of its body keeps the last paragraph at the same viewport y in a 3×2 tile (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |
| web/e2e/reader-search.spec.ts | closing the bar with the body 10 px short of the end of its body keeps the last paragraph at the same viewport y in Focus (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |
| web/e2e/reader-search.spec.ts | closing the bar with the body 10 px short of the end of its body keeps the last paragraph at the same viewport y in the pop-out (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |
| web/e2e/reader-search.spec.ts | closing the bar with the body 10 px short of the end of its body keeps the last paragraph at the same viewport y in a 2×2 tile (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |
| web/e2e/reader-search.spec.ts | closing the bar with the body 10 px short of the end of its body keeps the last paragraph at the same viewport y in a 3×2 tile (Browser Minor 1, INV-3) | REQ-3/REQ-7, cycle 3 Minor 1/2 | paragraph 80's y (and, at the end, the end-of-body position) survive open, Escape, reopen, close button, each also a render tick later | ran-green; soak 10/10 |

### Red without the fix (proof)

The fix is on HEAD, so the proof ran in a throwaway copy of the tree under the scratchpad (`.../scratchpad/redcopy`; `web/src` of the worktree untouched) with `renderFindBar`'s old `const scrolled = body.scrollTop > 0; ... body.scrollTop += topPadding(body) - before;` restored, rebuilt there (`make web-build build`), and the new spec file copied in. `npm run e2e -- e2e/reader-search.spec.ts -g "same viewport y"` in the copy: `8 failed, 4 passed` — all 8 new tests red, the 4 cycle 2 mid-document tests green (so they could not see the defect). Focus at the end: `Error: bar closed by Escape: the paragraph has not moved  Expected: 641.75  Received: 663.75  (difference 22)`; tiles 10 px short of the end: `Expected: 313.53125  Received: 331.53125 (difference 18)`. The real build was then restored (`make web-build build` in the worktree) and the live run is green.

## Repairs (fix attempt 3)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| - | none | - | The four cycle 2 tests were not edited (default `where = "mid"`); the new cases are additions | - | - |

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs (fix attempt 3)

None.

## Handoff (fix attempt 3)

None.

## Test Run Output (fix attempt 3)

```
npm run e2e -- e2e/reader-search.spec.ts e2e/reader.spec.ts  ->  108 passed (1.1m)
make e2e-soak SPEC=e2e/reader-search.spec.ts N=10           ->  480 passed (6.4m)
```

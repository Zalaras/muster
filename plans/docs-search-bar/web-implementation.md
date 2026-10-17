# Web Implementation: Docs Search Bar

**Plan**: docs-search-bar
**Mode**: initial
**Pack**: kb: pack 17899 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/reader/find.ts` | created | Pure matcher: `findInTexts` (literal, case-insensitive, non-overlapping, per-string), `stepIndex` (wraps), `clampIndex`, `countText` (REQ-4, REQ-6, REQ-8; W1, W3) |
| `web/src/render/readerfind.ts` | created | DOM half: `buildFindRefs`, `renderFindBar` (per-tick `hidden` + count text only), `findRanges` (TreeWalker over the body's text nodes -> live `Range`s), `paintFind` (swaps this reader's ranges in the two global highlights), `scrollRangeIntoView` (REQ-4, REQ-5, REQ-7) |
| `web/src/features/readerfind.ts` | created | Per-reader find controller: open/query/ordinal state, Cmd+F claim, Enter/Shift+Enter/Escape in the bar, `refresh("first" \| "keep")` (REQ-3, REQ-7-REQ-12) |
| `web/src/features/reader.ts` | edited | Builds the controller per instance, feeds `find` view into the VM, `refresh("first")` after a user-initiated open and `"keep"` after a silent re-fetch, re-runs after every diagram pass (initial and theme), disposes paint |
| `web/src/render/reader.ts` | edited | `find` refs/VM/callbacks, `wireFind`, root `keydown`, `renderFindBar` in the tick |
| `web/src/shortcuts.ts` | edited | `{ type: "find" }` action, one binding row `KeyF` + Meta only (REQ-10, W9) |
| `web/index.html`, `web/doc.html` | edited | Icon and bar markup in both `#reader-template` copies, after `article.md` (REQ-1, REQ-3) |
| `web/src/style.css` | edited | `.find` overlay in `.md`'s grid cell, compact sizing, `::highlight(find-match)` / `::highlight(find-current)`, tokens `--find-match` / `--find-current` in all three theme blocks (REQ-1, REQ-2, REQ-5, REQ-13) |
| `web/scripts/contrast-pairs.json` | edited | `--fg` on both highlight tokens >= 4.5, and each highlight distinguishable from its ground (>= 1.3) |

## Decisions

- Highlight names (for the E2E agent): `find-match` (all matches, priority 0) and `find-current` (the current match, priority 1). Both are document-global registry entries; each reader adds and removes only its own `Range` objects, so two readers on one page never overwrite each other (INV-5). Nothing else is registered.
- Bar wrapper: `.find-bar` is the one element holding the query box, count, previous, next and close; it carries the `--bg-raised` ground and `--edge` border. The icon is `button.find-open` outside it. The count is `span.find-count[role=status]` inside `.reader`, not `.reader-notice`.
- Testable UI Elements table: all six rows implemented as written (names `Search document` x2 with roles `button` and `searchbox`, `Previous match`, `Next match`, `Close search`, count `role="status"`). The icon is `hidden` while no document is rendered and while the bar is open.
- Highlight colour: background only, never `color` (Chrome does not apply it to SVG `<text>`, per the plan's carried-over measurement); the current match also underlines so it is not carried by colour alone. Blue (hue about 210) sits outside every state-hue band and carries no state meaning.
- Contrast gate: `--fg` on `--find-match` and `--find-current` >= 4.5 in every theme (`make contrast`: 54 pairs, 0 failures x3). The 1.3 floor on highlight-vs-ground is my own choice (not WCAG's 3:1, which does not apply to a tint under text); it only guards against a theme block making the highlight invisible.
- The text walk skips text whose parent element is `style`, `script`, `title`, `desc` or `noscript`, because mermaid's SVG carries a `<style>` text node that is not rendered text. The diagram modal is a sibling of `article.md`, so it is outside the walk by construction. A `figure.diagram` enlarge button has no text of its own.
- Re-run triggers: user-initiated open -> `refresh("first")` (jump to first, scroll); silent re-fetch (`docChanged`, plan refocus, snapshot) -> `refresh("keep")` (ordinal clamped, no scroll); every diagram pass (open and theme change) -> `refresh("keep")` after it settles, guarded by the same `seq` as the pass, because a pass replaces the fence nodes the ranges pointed at. Closed bar: `refresh` returns at once.
- Closing keeps the query text and ordinal in the controller and the box; reopening re-runs it (`keep`, no scroll) and focuses and selects the box.
- Cmd+F is ignored while the reader's diagram `<dialog>` is open, and while no document is rendered (not default-prevented in either case).
- Per-tick reuse (kb:lesson/select-rebuilt-every-tick-passed-selectoption): the find nodes are built once from the template and never rebuilt. The tick writes only `hidden` on the icon and bar and the count's `textContent`, each only when it differs; the memo inputs are the three fields of `FindView` (`available`, `open`, `count`). The query box's value is never written by the tick.
- Layout: the `.find` wrapper is a grid item in `.md`'s own cell (column 1, row 3, `align-self: start`, `justify-self: end`), as the plan's hint described; it is a sibling of `.md`, so it never scrolls with it and follows the nav's collapse for free. Right margin 20px (18px compact) clears `.md`'s scrollbar and keeps the right edge inside the 24px corner bound. The bar's width yields (`min-width: 0` on the query box, `max-width` on the wrapper) so a 3x2 tile's bar does not overflow.
- Hint taken: the grid-cell overlay, `CSS.highlights`, plain-string matcher, dispatch from the reader with `matchShortcut` (the pop-out does not run `features/shortcuts.ts`). Hint dropped: none.
- REQ coverage: REQ-1..REQ-13 are all in Changes above; none deliberately skipped. Edge case 16 (collapsed `<details>`) is out of the first pass per plan.
- Placement, highlight ranges, tile fit and Cmd+F `defaultPrevented` are observed by the 27 passing specs in `reader-search.spec.ts` (see Handoff); that Chrome lets a page prevent the chord on a real keyboard stays for review-browser.

design: `reader/find.ts` — pure functions on strings and numbers, like `slug.ts`/`zoom.ts`; `rg -n "indexOf|toLowerCase" web/src/reader/*.ts` found only `tree.ts`'s `filterTree` (a path filter, not text matching), nothing to reuse.
design: `render/readerfind.ts` — the DOM half beside `render/reader.ts`, as `diagrams.ts` and `frontmatter.ts` are; it holds no state (`paintFind` takes the previous paint and returns the next, the caller owns it), per `render/CLAUDE.md`'s render-state rule. `FindRefs`/`buildFindRefs` mirror the reader's `requireElement` refs rather than adding 7 fields to `ReaderRefs`.
design: `features/readerfind.ts` — a reader sub-controller named `<owner><concern>.ts` (precedent `launchgroup.ts`, `launchresume.ts`); closure-over-state `create…` function, deps typed structurally (`hasDocument`, `requestRender`), the one owner of open/query/ordinal/ranges/paint. `rg -n "pendingTileFocus|reconcileCards"` precedents are for focus retention across reorder and do not apply: no find control is ever rebuilt, so nothing needs restoring. Escape/Enter use `event.key` as `render/rename.ts`/`railsections.ts` do; only the Cmd+F chord goes through `matchShortcut`.
design: the buttons reuse the docbar's `.arr` class (`rg -n "class=\"arr\"" web/index.html` -> the nav toggle) rather than a new button style.
design: size warnings kept: `web/src/features/reader.ts` 674 -> 697 and `web/src/render/reader.ts` 544 -> 568 lines, both already over 500 before this change; the find logic went into three new modules and what remains is wiring (callbacks, VM field, refresh calls).

doc-delta: `docs/design/design-system.md` § 1 token table lacks `--find-match` / `--find-current` (the find highlight grounds, text stays `--fg`); the plan's Doc Delta lists only reader and shortcuts.
doc-delta: `web/src/features/shortcuts.ts`'s header says it is the one window listener "for every bound chord"; ⌘F is bound in `shortcuts.ts` but dispatched from the reader's own root keydown, so the listener ignores it (the pop-out does not run that listener).

## Handoff

**Build status**: `npx tsc --noEmit`, `npm run build`, `npm run -s lint`, `npm test` (95 files, 2714 tests) and `make contrast` all exit 0.
**E2E smoke**: `make web-build build` then `npx playwright test reader-search.spec.ts` from `web/`: `27 passed (1.9m)` (run after the hold lifted, on commit 8dec7fd1 plus the log). No spec locator mismatch.
- web-tests to add: `web/src/reader/find.test.ts` (W1 `findInTexts` edge cases 1-4, W3 `stepIndex`/`clampIndex`/`countText`) and a `web/src/shortcuts.test.ts` row for `KeyF` + Meta only returning `{ type: "find" }` and null for any other modifier signature (W2). No existing test broke (`shortcuts.test.ts` has no exhaustive unbound-code table that touches `KeyF`).
- e2e-specs / validate: no mismatch found. Highlight names are `find-match` and `find-current` (see Decisions); `readHighlights` classifies structurally so no change is needed. The bar wrapper is `.find-bar`. No locator mismatch known, but none has been run.
- Not changed: `web/e2e/reader.spec.ts` layout assertions (the overlay is a sibling in `.md`'s grid cell, no new track); not re-run.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: gate `features-inventory`: `web/src/features/readerfind.ts` not named in `web/src/features/CLAUDE.md`.
**Changes made**: `web/src/features/CLAUDE.md` now lists `readerfind.ts` as `reader.ts`'s find-bar sub-controller beside `launchgroup.ts`/`launchresume.ts` (the sentence was merged to stay inside the file's 400-word budget; GENERATED trailer untouched). `make check-kb` passes (607 records, 0 problems).
**Decisions**: none new.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: E2E Implementation Bug: `region.locator(".arr")` counted 5 (nav toggle plus the four find buttons) in `reader.spec.ts:1135` and `:1833`/`:1840` (INV-ONE-ARROW).

**Changes made**: the find open/previous/next/close buttons take a new class `fbtn` instead of `arr`; `.arr` stays the nav toggle's alone.
- `web/index.html:485,491-493` and `web/doc.html:40,46-48` (both `#reader-template` copies): `class="arr ..."` to `class="fbtn ..."` on the four find buttons.
- `web/src/style.css`: the base `.arr` and `.arr:hover` rules became `.arr, .fbtn` and `.arr:hover, .fbtn:hover` (same declarations, so the find buttons keep their look); `.find-bar .arr` and `.reader.compact .find-bar .arr` became `.fbtn`. `.docbar .arr` (nav toggle margin) is untouched and never applied to find buttons (they sit in `.find`, not `.docbar`).

**Blast radius** (`rg '\.arr|"arr|class="arr'` over web/src, web/e2e, web/*.html): TS never queries `.arr` (the nav toggle is found by `[data-role="arr-nav"]`, find buttons by `[data-role="find-*"]`); the only `.arr` consumers are style.css rules above and the three `region.locator(".arr")` assertions in reader.spec.ts. No other surfaces use `fbtn`.

**Re-run of the repro**: `make web-build build`, then `npx playwright test reader.spec.ts reader-search.spec.ts` from web/: `87 passed (43.6s)`, including INV-ONE-ARROW (`reader.spec.ts:1819`) and the 3x2 tile count. `npx tsc --noEmit` and `npm run -s lint` exit 0.

**Decisions**: design: a distinct `fbtn` class sharing `.arr`'s base rules via a selector list, rather than overriding `.arr` per context; precedent grep above found no other find-button styling path. No deviation, no doc-delta.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: review.md cycle 1, every [web-impl] issue: Correctness Minor 1-2, Browser Major 1-2, Browser Minor 1 and 3, Maintainability Minor 1-5.

**Changes made**

| Issue | Where | Closed by |
|-------|-------|-----------|
| Correctness Minor 1 (diagram reveal) | `features/readerfind.ts`, `features/reader.ts` | `fileOpened(userInitiated)` replaces the open-time `refresh("first"\|"keep")` and arms `revealAfterDiagrams` for a user-initiated open; `diagramsSettled()` (the one caller `refindAfterDiagrams`, which serves both the open pass and the theme pass) re-runs as `"first"` (jump to ordinal 0, reveal) while armed, else `"keep"`. Typing, stepping and closing disarm it. A silent re-fetch never arms or disarms. |
| Correctness Minor 2 (Owns lists) | `reader/CLAUDE.md`, `render/CLAUDE.md` | `find.ts` named in the Owns list and joined to the pure-exemplar sentence; `readerfind.ts` named as the reader's find-bar DOM half. `go tool kb check` passes. |
| Browser Major 1 (bar covers text) | `style.css`, `render/readerfind.ts` | While `.find-bar` is not `[hidden]`, `.reader:has(...) .md` takes `padding-top` 44px (Focus, pop-out) / 38px (compact), reserving the bar's height (measured bar bottom minus body top: 36 and 30). `scrollRangeIntoView` now reveals against the bar's own bottom edge (`max(32, bar.bottom - body.top + 8)`), so a step or typed match never sits beneath it. No JS state; CSS-only toggle. |
| Browser Major 2 (horizontal) | `render/readerfind.ts` | `scrollRangeIntoView(body, range, bar)` walks every ancestor from the range's parent element up to and including the body and, for each that scrolls on x (`overflow-x` auto/scroll and `scrollWidth > clientWidth`), centres the range in its visible box when it is outside a 32px margin. Covers `pre`, `figure.diagram`, tables and the body itself. |
| Browser Minor 1 (typing) | `features/readerfind.ts` | `setQuery` only stores the query and (re)arms a trailing timer; the re-walk runs once per pause. Delay is 120ms, raised to twice the last run's measured cost (cap 800ms) so a huge document is not re-walked back to back. `step`, `close`, `dispose` flush or cancel it, so Enter right after typing still lands on ordinal 1. The count is derived from the query the ranges were built from (`searched`), so a pending key never shows a stale "no matches". |
| Browser Minor 3 (native x) | `style.css` | `.find-query::-webkit-search-cancel-button { display: none }`. Escape and Close search already clear. |
| Maintainability Minor 1 (shape) | `features/readerfind.ts`, `features/reader.ts` | Now `initReaderFind(elements: ReaderFindElements, deps: ReaderFindDeps): ReaderFindHandle` with `ReaderFindElements = { body, find: FindRefs }`; the dialog check is the structural dep `diagramOpen()`. No `ReaderRefs` import any more. |
| Maintainability Minor 2 (wiring) | `render/readerfind.ts`, `render/reader.ts` | `wireFind(find, callbacks)` and `FindCallbacks` moved beside the find refs and builder; `ReaderCallbacks extends FindCallbacks`; `buildReader` calls it in one line, as it does `wireDiagramDialog`. `render/reader.ts` 566 -> 559 lines. |
| Maintainability Minor 3 (shared registry) | `render/readerfind.ts` | A comment above `MATCH_HIGHLIGHT` says the registry is document-wide, written by every reader instance, and that `paintFind` deletes only the ranges its caller painted last. |
| Maintainability Minor 4 (comment split) | `render/reader.ts` | `renderFindBar(refs.find, vm.find)` is now the last call of `renderReader`, after the `aria-busy` lines its neighbour comment explains. |
| Maintainability Minor 5 (text box look) | `style.css` | One rule `.rnav .filter, .find-query` holds border, radius, padding, background, colour and font family; each keeps only its own size, flex and margin. Measured computed style of the two (border, radius, padding, background, colour, font family) is identical. |

**Blast radius** (`rg -n "find-query|\.rnav \.filter|\.md\b.*padding" web/src/style.css`, `rg -n "scrollRangeIntoView|createReaderFind|ReaderFind\b|wireFind" web/src web/e2e`): the shared text-box rule has two consumers, both measured (computed styles equal, above). `scrollRangeIntoView` has one caller (`features/readerfind.ts`). `createReaderFind`/`ReaderFind` had one consumer (`features/reader.ts`), repointed; no test imports them. The `.md` padding rule applies in Focus, pop-out, 2x2 and 3x2 tiles; measured in Focus, 3x2 and 2x2 (and the pop-out is the Focus rule).

**Re-run of the reviewers' repros** (scratch Playwright spec, removed after; fixtures: a 40-word `heron` h1, a 600-char code line ending `widgetfar`, a 60-column table ending `tablefar`, frontmatter plus h1, a mermaid fence after 30 paragraphs, 40000 paragraphs). Each current match is checked by `elementFromPoint` at its centre landing inside the match's own element:
- 3x2 tile, matches 1-14 of 40 (the reviewer's failing 6-9 included): every `hitOk` true, bar 153-179, text from y 189 (line 1) and 212 (line 2), scrollTop 0. 2x2 tile: same spec, density switched; `hitOk` true on every step.
- Focus, steps 1-12 of 40: bar 133-163, text at y 182, every `hitOk` true. Padding is 44px while open and 22px after Close search.
- `widgetfar` rect 930-999 inside body 300-1044, hit element `CODE` (was x 4958-5027); `tablefar` rect 957-1002, hit `TD` (was 3689-3734). Frontmatter match at y 213, hit `TH`.
- Diagram: opening `diag.md` with the bar open reads `1 of 3`, the current match is the SVG label at y 389-407 with body scrollTop 843, `elementFromPoint` inside it.
- Native clear: screenshot of the focused, non-empty bar shows no x inside the box beside Close search.
- Typing, 2.5 MB document with 80000 matches, five keys at 30ms: long tasks 698, 580, 579 ms (three debounced runs because the main thread was already blocked mid-typing), count `1 of 80000`; before the fix the reviewer measured 1721 ms for the first key and 12.2 s for nine more at that size. A 4000-paragraph document (8000 matches): one 63 ms long task, none per keystroke.
- `npx playwright test reader.spec.ts reader-search.spec.ts`: `87 passed (41.8s)`. `npx tsc --noEmit`, `npm run build`, `npm run -s lint`, `npm test` (96 files, 2761 tests), `make contrast` (54 pairs, 0 failures x3) and `go tool kb check` exit 0.

**Decisions**
- design: `initReaderFind` takes `{ body, find }` rather than the whole refs (`rg -n "ReaderRefs" web/src/features/launch*.ts web/src/features/groups*.ts` finds none; they take `<Name>Elements`); the dialog check is a named structural dep. The earlier design line's claim of `create…` precedent is withdrawn.
- design: the bar-clearance is two numbers in `style.css` (`:has(.find-bar:not([hidden]))` padding) plus one constant (`BAR_CLEARANCE_PX`) in `render/readerfind.ts`; the CSS reserve covers the first line at scrollTop 0, the constant covers a reveal scrolled mid-document. `rg -n ":has\(" web/src/style.css` shows `:has` is already used elsewhere in the sheet; no JS-set class was added because the bar's `hidden` attribute is already the single source of truth.
- design: debounce state (`typingTimer`, `lastSearchMs`, `revealAfterDiagrams`) lives in the controller closure beside `isOpen`/`query`/`ordinal`; `render/readerfind.ts` stays stateless. `rg -n "setTimeout|debounce" web/src/features` was run before choosing a bare `setTimeout`; no shared debounce helper exists to reuse.
- design: size warnings kept: `features/reader.ts` (698 lines) and `render/reader.ts` (559), both over 500 before this change; this wave net-removed 7 lines from the latter.
- user-visible additions: the bar's count updates after a short pause rather than on every key (120ms, up to 800ms in very large documents); the document's first line sits lower (44px / 38px top padding) while the bar is open.
- doc-delta: `docs/features/reader/spec.md` should say the find bar reserves the top of the reading area while open and reveals matches against the bar's bottom edge, and that stepping scrolls every horizontal scroll container (code block, table, diagram) as well as the body; the re-run after a diagram pass reveals the first match again for a user-initiated open unless the user typed or stepped since.

## Handoff (fix attempt 2)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
**E2E smoke**: `npx playwright test reader.spec.ts reader-search.spec.ts`: `87 passed (41.8s)`.
Test files broken by this change: none. Spec behaviour to be aware of: typing now updates the count after a debounce, so a `fill` to a new query whose count text equals the previous query's (for example `1 of 1` both times) is not a settled oracle; poll the current-match text instead. No existing spec in the two files does this.

## Fix Attempt 3 (review cycle 2)

**Failures addressed**: Browser Minor 1 (body text jumps on open/close while scrolled), Maintainability Minor 1 (`refresh`/`RefreshMode` public with no caller), Maintainability Minor 2 (find call between the comment and the diagram pass).

**Changes made**
- `web/src/render/readerfind.ts`: `renderFindBar(refs, view, body)` now, when the bar's `hidden` state flips while `body.scrollTop > 0`, reads the body's computed `padding-top` before and after the flip and adds the difference to `scrollTop` in the same render, so content stays at the same viewport position. At scrollTop 0 nothing is adjusted, so the first line is still pushed clear of the bar. `web/src/render/reader.ts` passes `refs.body`.
- `web/src/features/readerfind.ts`: `refresh` removed from `ReaderFindHandle` and its returned object; `RefreshMode` is no longer exported (it stays an inner type for the closure's `refresh`).
- `web/src/features/reader.ts`: `this.find.fileOpened(opts.showLoading)` moved below the `diagramPass.then(...)` line, so the four-line comment sits directly above `renderDiagrams(...)` again. Order is behaviour-neutral: `renderDiagrams` mutates the DOM only after its first `await`, so the find still reads the same body.

**Every path**: the padding rule `.reader:has(.find-bar:not([hidden])) .md` (22 to 44 px default, 10 to 38 px compact) is the only source of the shift; every open/close goes through `renderFindBar`, which serves Focus, pop-out, 2x2 and 3x2 tiles (one render function). A flip from `available` going false takes the same branch.

**Blast radius**: `rg -n "renderFindBar" web/src web/e2e` finds the definition and one caller (`render/reader.ts`); `rg -n "\.refresh\b|RefreshMode" web/src/features web/e2e` finds no caller of the find handle's `refresh` outside the module.

**Re-run of the reviewer's repro** (throwaway spec, deleted; tall fixture, body scrolled to 1500, tracked a paragraph's viewport top across open then Escape):
- Focus: 328.75 before, 328.75 open, 328.75 closed.
- Pop-out: 230.375 / 230.375 / 230.375.
- 2x2 tile: 353.828 / 353.828 / 353.828.
- 3x2 tile: 353.828 / 353.828 / 353.828.
- scrollTop 0, bar open in Focus: padding-top 44px, first element 44px below the body's top (still clear of the bar).
- Before the fix the reviewer measured +22 px (Focus, pop-out) and +28 px (tiles).

**Gates**: `npx tsc --noEmit` 0, `npm run build` 0, `npm run -s lint` clean, `npx vitest run` passes, `npx playwright test reader.spec.ts reader-search.spec.ts`: `96 passed (46.9s)`. `make size-warn`: only the existing `features/reader.ts` length warning (698 lines, unchanged reason).

**Decisions**
- design: the scroll compensation lives in `renderFindBar`, the one place that flips `bar.hidden`; a CSS-only fix cannot keep scrolled content still while still clearing the first line at scrollTop 0. Precedent: `scrollHeadingIntoView` in `render/reader.ts` also writes `container.scrollTop` from the render layer. The padding is read from computed style, so the default and compact values are not duplicated in TS.
- user-visible: none new; opening or closing the bar while scrolled no longer moves the text.

## Handoff (fix attempt 3)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
**E2E smoke**: `npx playwright test reader.spec.ts reader-search.spec.ts`: `96 passed (46.9s)`.
Test files broken: none.

## Fix Attempt 4 (review cycle 3)

**Failures addressed**: Correctness Minor 1 and Browser Minor 1 (one defect): closing the find bar with the body at, or within the padding change of, its end moved the text by the padding change and left the body short of its end.

**Changes made**
- `web/src/render/readerfind.ts` `renderFindBar`: `scrollTop` is captured before `refs.bar.hidden` flips and assigned absolutely afterwards (`body.scrollTop = top + topPadding(body) - before`), instead of `+=` after layout. Reading `scrollTop` after the flip returned a value Chrome had already clamped to the shrunken range, so the old `+=` subtracted the padding change a second time.

**Every path**: `renderFindBar` is the only code that flips `bar.hidden` (one caller, `render/reader.ts`); it serves Focus, pop-out, 2x2 and 3x2 tiles. Open and close, and a flip from `available` going false, share the one branch. Unavoidable and unchanged: with 0 < scrollTop < the padding change, closing moves the text by up to that change because `scrollTop` cannot go negative.

**Blast radius**: `rg -n renderFindBar web/src web/e2e` finds the definition and one caller; no other consumer.

**Re-run of the reviewer's repro** (throwaway spec in `web/e2e`, deleted afterwards; tall fixture; paragraph 15 viewport y before, with the bar open, and after Escape; scrollTop set to max, max-10, max-30, max/2). Closed equals rest in all 16 cases:
- Focus: end 4012/4012 `-3030.75 / -3030.75 / -3030.75`; end-10 `-3020.75` throughout; end-30 `-3000.75` throughout; mid `-1024.75` throughout.
- Pop-out: end 3914/3914 `-3031.125` throughout; end-10 `-3021.125`; end-30 `-3001.125`; mid `-1074.125`.
- 2x2 and 3x2 tiles: end 4584/4584 `-3562.953125` throughout; end-10 `-3552.953125`; end-30 `-3532.953125`; mid `-1270.953125`.
- Before the fix the reviewer measured the paragraph 22 px lower in Focus and pop-out, 28 px in tiles, at the end.

**Gates**: `npx tsc --noEmit` 0, `make web-build build` 0, `npm run -s lint` clean, `npx playwright test reader.spec.ts reader-search.spec.ts`: `100 passed (52.9s)`.

**Decisions**
- design: no new module or helper; the fix keeps the cycle 2 shape (compensation in the one function that flips the bar) and changes read-before-flip, assign-absolute.

## Handoff (fix attempt 4)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
**E2E smoke**: `npx playwright test reader.spec.ts reader-search.spec.ts`: `100 passed (52.9s)`.
Test files broken: none. The existing cycle 2 "scrolled text stays put" specs scroll to mid-document only; none covers the end of the body, so the end-of-body case has no regression spec until web-tests/e2e adds one.

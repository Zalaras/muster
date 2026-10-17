# Plan: Docs Search Bar

**Created**: 2026-10-16
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: reader-search.spec.ts daemon (each test seeds its own scratch directory and session; fresh daemon keeps the reader's auto-open on the sole session deterministic)
**Features**: reader, reader-find, shortcuts
**Touches**: connection, lifecycle
**Description**: An on-demand find bar in the docs reader that searches only the rendered markdown document, case-insensitively, opened by an icon in the body's top-right corner or by Cmd+F while focus is in the reader, in every reader host (Focus, tile, pop-out).

## Overview

Chrome's own find (Cmd+F) over the reader matches the docbar, the file nav, the outline and the
rest of the dashboard, so its results are cluttered (#94). This plan gives the reader its own
find bar that searches only the rendered document: the body including its frontmatter table, code
blocks and the text labels of rendered mermaid diagrams.

A small search icon sits in the top-right corner of the reading area, just below the docbar. It
is pinned to the reading area's own right edge, so it sits left of the file nav when the nav is
open and moves out to the reader's right edge when the nav is collapsed — the same corner of the
document either way. Clicking it, or pressing Cmd+F while keyboard focus is inside the reader,
opens the bar in that corner: a query box, an `N of M` count, previous/next arrows and a close
button. Matching is a plain case-insensitive substring match. Every match is highlighted, the
current one more strongly, and stepping scrolls the current match into view.

Web only, no daemon or protocol change. Highlights are drawn with the CSS Custom Highlight API so
the rendered body is never mutated — the sanitized fragment stays the only thing ever inserted
into it (`web/src/reader/CLAUDE.md` invariant). Closes #94.

## Requirements

### Must Have
- [ ] REQ-1: A search icon button sits at the top-right of the reading area, below the docbar, whenever a document is rendered, in every reader host — Focus, a tile (compact: smaller, same controls) and the pop-out. It stays pinned in that corner while the body scrolls.
- [ ] REQ-2: The icon and the open bar keep their right edge inside the reading area: left of the file nav's left border while the nav is open, and at the reader's right edge (same inset) while the nav is collapsed. Toggling the nav moves them with no reload and no change to the query.
- [ ] REQ-3: Clicking the icon opens the find bar in the icon's place and focuses its query box. The bar holds the query box, a count, a previous-match button, a next-match button and a close button.
- [ ] REQ-4: Matching is a case-insensitive substring match of the query against the rendered document's text — body, frontmatter table, code blocks and rendered diagram label text — and nothing outside the body (docbar, notice line, nav, outline, diagram modal). A match lies within one text node.
- [ ] REQ-5: Every match is highlighted; the current match carries a second, stronger highlight. Highlighting never adds, removes or changes a node in the rendered body.
- [ ] REQ-6: The count reads `<i> of <n>` (1-based current) when there are matches, `no matches` when the query is non-empty with none, and is empty when the query is empty.
- [ ] REQ-7: Typing updates matches, highlights and count live; the current match becomes the first match and is scrolled into view inside the body.
- [ ] REQ-8: Enter in the query box and the next button step to the next match; Shift+Enter and the previous button step to the previous one; both wrap around at the ends and scroll the new current match into view.
- [ ] REQ-9: Escape in the bar, or the close button, closes the bar, clears every highlight, shows the icon again and returns keyboard focus to the body.
- [ ] REQ-10: Cmd+F (⌘F, `KeyF` with Meta only) while keyboard focus is inside the reader opens the bar, or — when already open — focuses the query box and selects its text; the browser's own find does not open. Only the reader holding focus reacts. With focus anywhere else, Cmd+F is not intercepted.
- [ ] REQ-11: When the open document re-renders in place (a `docChanged` re-fetch, a plan refocus re-fetch, a theme change re-rendering diagrams), an open bar keeps its query and re-runs it; the current ordinal is kept, clamped to the new count, and the body does not scroll.
- [ ] REQ-12: Opening another file while the bar is open keeps the bar open with the same query and re-runs it against the new file; the current match is the first and is scrolled into view (the VS Code find-widget convention: one term follows you across files).

### Should Have
- [ ] REQ-13: The icon and bar follow the design system's tokens (mono xs/2xs text, `--edge` border, `--bg-raised` ground, like the nav's filter box) in every theme, and the highlight colours meet the `contrast` gate.

### Nice to Have
- (none)

## Protocol Contract

No protocol changes.

## Schema Changes

No schema changes required.

## UI Specifications

**Design system**: `docs/design/design-system.md` (tokens; the reader's docbar and nav filter box
are the nearest existing pattern — `web/src/style.css` `.rnav .filter`). No mockup; the reader's
own layout (`kb:spec/reader` § The reader, kb:adr/reader-nav-toggle-is-one-fixed-button) is the
host and is unchanged.

### Views
- Focus reader (`docs` surface in the Focus mainhead) — gains the icon/bar overlaid on the reading area's top-right corner.
- Pop-out (`/doc.html`) — same component, same behaviour.
- Tiles reader (compact) — the same icon and bar at compact size (smaller type and padding, same controls); the query box shrinks so the bar fits inside the tile's reading area, including at 3×2 with the nav collapsed.

### User Flows
1. Reader shows a document → icon visible top-right of the body → click → bar opens, query box focused.
2. Type `alpha` → every `alpha`/`Alpha`/`ALPHA` highlighted, count `1 of 3`, body scrolls to the first.
3. Enter / next arrow → `2 of 3`, scrolls; Shift+Enter / previous arrow → back; past the last wraps to `1 of 3`.
4. Collapse the file nav → bar slides to the reader's right edge, query and count unchanged.
5. Escape or close → highlights gone, icon back, focus on the body.
6. Click in the body, press Cmd+F → bar opens (or re-focuses with the query selected).

### States
- No data yet (no document rendered: the `loading…`/`no plan yet` placeholder, or a dead session's empty body): no icon; Cmd+F is not intercepted.
- Data: as above.
- Daemon down: search keeps working over the last rendered document; nothing in the bar depends on the socket.
- Failed open (kb:adr/reader-loading-cue-never-clears-a-rendered-body): the last render stays, and an open bar's matches stay as they were.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Search icon | `button` | `Search document` | `aria-label`; absent from the DOM or `hidden` while no document is rendered and while the bar is open; present in every host, tiles included |
| Query box | `searchbox` | `Search document` | native `<input type="search">` with that `aria-label`; the icon is hidden whenever the box is shown, so the two never resolve together |
| Match count | `status` | `^(\d+ of \d+\|no matches)?$` | `role="status"` mandated; empty text when the query is empty |
| Previous match | `button` | `Previous match` | `aria-label` |
| Next match | `button` | `Next match` | `aria-label` |
| Close search | `button` | `Close search` | `aria-label` |

Highlights have no DOM; tests read them through `CSS.highlights` in `page.evaluate` (two registered
highlight names, one for all matches and one for the current; the names are web-impl's, reported in
the impl log's Handoff).

### Invariants
- **INV-1 Body untouched**: opening, typing, stepping and closing the bar never change the rendered body's DOM — its `innerHTML` before and after is identical — from each source state: no frontmatter, frontmatter table, frontmatter raw fallback, document with a rendered diagram. → E9
- **INV-2 Body-only**: the match count equals the count of case-insensitive occurrences in the body's own text, never counting text in the docbar, notice line, nav (tree, outline, filter), or a diagram modal — asserted with the query equal to the open file's basename, which appears in the docbar and nav. → E4
- **INV-3 Corner placement**: in each host (Focus with nav open, Focus with nav collapsed, pop-out with nav open, pop-out collapsed, a tile at 2×2 with nav open, a tile at 3×2 with nav collapsed), the icon's and the open bar's box lie inside the reading area's box, below the docbar's bottom edge, right edge within 24 px of the reading area's right edge, and stay at the same viewport position after the body is scrolled to its end; in a tile the open bar's `scrollWidth` does not exceed its `clientWidth`. → E2, E3, E10, E15
- **INV-4 One find**: Cmd+F with focus inside any reader (Focus, tile, pop-out) always reaches that reader's bar (default prevented); with focus outside every reader (rail, terminal surface, page body) the event is not default-prevented. → E7, E8, E16, W2
- **INV-5 Bystanders**: with two tile readers showing documents, opening, typing, stepping or closing one reader's bar never changes the other reader's bar state, count or highlight ranges — asserted with both bars open on different queries. → E17

## Affected Files

### Web (web-impl)
- `web/index.html` — REQ-1, REQ-3: the reader template gains the icon and the find bar.
- `web/doc.html` — REQ-1: only if the pop-out carries its own copy of the reader template.
- `web/src/render/reader.ts` — REQ-1–REQ-3, REQ-5, REQ-9: draws icon/bar state and applies/clears the two highlights over the body.
- `web/src/features/reader.ts` — REQ-7–REQ-12: bar state per mounted reader, re-run on re-render and file switch, Cmd+F dispatch to the reader holding focus only (INV-4, INV-5).
- new under `web/src/reader/find*.ts` — REQ-4, REQ-6, REQ-8: pure matching over text-node strings, wrap-around stepping, count text.
- `web/src/shortcuts.ts` — REQ-10: the binding table gains ⌘F (`KeyF`, Meta only).
- `web/src/style.css` — REQ-1, REQ-2, REQ-13: icon/bar placement over the reading area, its `.reader.compact` size, and the `::highlight()` rules.

### Existing tests this breaks
- web-tests: `web/src/shortcuts.test.ts` — any exhaustive "every bound chord" / "unbound codes return null" table that treats `KeyF`+Meta as unbound.
- e2e-specs: none expected; `web/e2e/reader.spec.ts` layout assertions on `.md`'s box should be unaffected because the overlay sits over it, not in a new grid track — impl Handoff confirms.

## Edge Cases

1. Query is whitespace only — matched literally (a space is text); count reflects it. → W1
2. Query contains regex metacharacters (`.`, `*`, `(`) — matched literally, never as a pattern. → W1 (shared with edge case 1)
3. Query spans inline formatting (`foo **bar**` searched as `foo bar`) — no match in this first pass (match within one text node). → W1 (shared with edge case 1)
4. Overlapping occurrences (`aa` in `aaaa`) — non-overlapping, left to right: 2 matches. → W1 (shared with edge case 1)
5. Query matches the file name shown in the docbar and nav — counted only where it appears in the body. → E4
6. Match inside a frontmatter table cell and inside a code block — both counted and highlighted. → E5
7. Match inside a rendered mermaid diagram's label (Chrome 153 measured to paint `::highlight` background on SVG `<text>`, see Carried-over measurements) — counted and highlighted. → E6
8. Open file rewritten on disk + `docChanged` while the bar is open — query kept, re-run, ordinal clamped, no scroll. → E11
9. Rewrite reduces matches to zero — count `no matches`, bar stays open. → E11 (shared with edge case 8)
10. Theme change re-renders diagrams while the bar is open — highlights re-applied over the new SVG. → untested: covered by the same re-run path as E11; a theme flip test would duplicate it.
11. Opening another file with the bar open — same query re-run, `1 of n`, scrolled to first. → E12
12. A user-initiated open that fails — last render and its matches stay. → untested: the failure path keeps the body by an existing guarantee (E-tests of kb:adr/reader-loading-cue-never-clears-a-rendered-body) and search adds no code there.
13. Cmd+F with focus on the rail or a terminal surface — browser default not prevented. → E8
18. Cmd+F in one tile's reader while another tile shows a reader — only the focused tile's bar opens. → E16
19. Two tile readers searching at once — each keeps its own highlights (highlight registry names are document-global). → E17
14. Cmd+F with the bar already open and focus in the body — query box focused, text selected. → E7
15. Daemon dies while the bar is open — search keeps working over the rendered body. → untested: the bar has no socket dependency; asserting it needs a daemon kill for no new code path.
16. Collapsed `<details>` in the document — matches inside are counted; scrolling to one does not open it in this first pass. → untested: sanitizer-dependent, out of first-pass scope.
17. Very long document (10 MiB cap) — typing stays responsive. → untested: no perf budget set; reviewer reads the implementation.

## Acceptance Criteria

### Web
- **W1**: the pure matcher returns literal, case-insensitive, non-overlapping per-text-node match ranges for edge cases 1–4 (unit test).
- **W2**: `matchShortcut` returns the find action for `KeyF` with Meta only, and null for `KeyF` with any other modifier signature (unit test).
- **W3**: stepping wraps from last to first and first to last, and the count text is `<i> of <n>`, `no matches` or empty per REQ-6 (unit test).

### E2E
- **E1**: clicking `Search document` opens the bar with the searchbox focused and the icon hidden.
- **E2**: with the nav open, the icon's box lies inside the reading area, below the docbar, right edge within 24 px of the nav's left border (INV-3).
- **E3**: collapsing the nav moves the open bar so its right edge is within 24 px of the reader's right edge, query and count unchanged (INV-3, REQ-2).
- **E4**: searching the open file's basename counts only occurrences in the body (INV-2).
- **E5**: a query present in a frontmatter value, a paragraph (different case) and a code block yields `1 of 3`, and `CSS.highlights` holds 3 ranges in the all-matches highlight and 1 in the current.
- **E6**: a query present only in a mermaid node label yields `1 of 1`.
- **E7**: clicking in the body then pressing Cmd+F opens the bar; pressing it again with text typed re-focuses and selects the query; both keydowns are default-prevented.
- **E8**: Cmd+F with focus on a rail card is not default-prevented and opens no bar.
- **E9**: the body's `innerHTML` is identical before opening the bar and after typing, stepping and closing (INV-1).
- **E10**: in a document taller than the body, the open bar's viewport position is unchanged after scrolling the body to its end, and next steps scroll the current match into the body's visible box (INV-3, REQ-8).
- **E11**: rewriting the open file with a Write hook while `2 of 3` is shown re-runs the query, keeps or clamps the ordinal and does not change the body's `scrollTop`.
- **E12**: opening another file with the bar open shows the same query against the new file at `1 of n`.
- **E13**: Escape closes the bar, empties both highlights, shows the icon and leaves focus on the body.
- **E14**: the pop-out shows the icon and the bar behaves as in E1 and E5.
- **E15**: in a 3×2 Tiles grid with the nav collapsed, a tile reader's icon and open bar lie inside the tile's reading area with no horizontal overflow (INV-3).
- **E16**: with two tile readers, clicking in one body and pressing Cmd+F opens that tile's bar only, default-prevented.
- **E17**: with both tile readers' bars open on different queries, stepping and closing one leaves the other's count and highlight ranges unchanged (INV-5).

### Automated Checks

```checks
W1 make web-test
W4 make web-build
W5 make web-lint
E1 make e2e
C1 make check
```

### Reviewer-Verified

- **W6**: no `any` types in new web code.
- **W7**: the rendered body is never mutated by search — no `<mark>`, no `splitText`, no `innerHTML` in the find path.
- **W8**: highlight and bar colours read correctly in all three themes (instrument, dark, light).
- **W9**: Cmd+F is a row in the `web/src/shortcuts.ts` binding table, not a second key matcher.

## Doc Delta

**reader** — becomes true (`docs/features/reader/spec.md` § The reader, one sentence):
- A find bar — an icon at the body's top-right, or Command-F in the reader — highlights case-insensitive matches in the rendered document alone (kb:adr/reader-find-highlights-via-css-highlight-api).

**reader** — stops being true:
- nothing.

**shortcuts** — becomes true (`docs/features/shortcuts/spec.md` chord list):
- Command-F opens the find bar of the reader holding keyboard focus (Focus, tile or pop-out), and is otherwise left to the browser (kb:spec/reader).

**shortcuts** — stops being true:
- nothing.

## Out of scope

- Nothing.

(Not filed, noted for the developer: regex/whole-word/case-sensitive toggles, matching across inline formatting, ⌘G/⇧⌘G stepping, opening a collapsed `<details>` to reveal a match.)

## Implementation Notes

**Hints (non-binding):**
- `.reader` is a grid (`grid-template-columns: 1fr auto`, rows `auto auto 1fr`); `.md` is column 1 row 3 and is the scroll container, `.rnav` is column 2 and `hidden` when collapsed, so column 1 already widens to the reader's edge. An element placed in the same grid cell (column 1, row 3, `align-self/justify-self: start/end`) overlays `.md` without scrolling with it and follows the nav for free; putting it inside `.md` would make it scroll.
- CSS Custom Highlight API: `CSS.highlights.set(name, new Highlight(...ranges))`; highlight names are global to the document, and the pop-out and several Focus readers are separate instances — scope names per reader instance or clear on unmount so two readers never overwrite each other.
- The DOMPurify-dependent `markdown.ts` is not Vitest-importable; keep the matcher operating on plain strings (text-node contents) so `find*.ts` stays pure, like `slug.ts`.
- `features/shortcuts.ts` is the dashboard's one window keydown listener and the pop-out (`doc.ts`) does not run it; the pop-out still needs ⌘F, so dispatch from the reader with `matchShortcut` rather than only from `features/shortcuts.ts`.
- `matchShortcut`'s exact-modifier rule already gives "Meta only".

**Carried-over measurements:**
- Chrome paints a `::highlight()` background on SVG `<text>`: measured 2026-10-16 at planning on Playwright's Chromium 153.0.8010.12 (a highlight range over an SVG `<text>` node painted its background; `color` was not applied to SVG text). Applies unchanged: the dashboard targets Chrome only (Chrome-only target), and mermaid runs with HTML labels off (kb:adr/reader-diagram-svg-crosses-dompurify), so its labels are SVG `<text>`. Highlight colour therefore must not rely on `color` for diagram matches.
- Browser reservation: Chrome lets a page `preventDefault` ⌘F (it is not a browser-chrome-reserved chord like ⌘N/⌘T/⌘W). Not yet re-measured in this repo's probe (`spikes/S5-key-probe.md`); per kb:adr/shortcuts-option-command-family-off-reserved-chords the E2E suite cannot prove it — W9's reviewer and review-browser confirm on a real keyboard.

**Decisions (become proposed ADRs on approval):**
- `reader-find-highlights-via-css-highlight-api` — highlights use the CSS Custom Highlight API; `<mark>` wrapping rejected because it mutates the sanitized body.
- `reader-find-overrides-cmd-f-inside-reader` — ⌘F is intercepted only while focus is inside a reader (any host), reaching that reader alone; elsewhere the browser's find stays.
- `reader-find-query-follows-file-switch` — an open bar keeps its query across a re-render (no scroll) and a file switch (jump to first); per the VS Code find-widget convention, Chrome's close-on-navigate rejected because the reader switch is in-page.

**Doc upkeep (orchestrator):** move #94's `TODO.md` block to `docs/history/todo-done.md` at completion.

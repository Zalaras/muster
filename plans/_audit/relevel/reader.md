# Re-levelling batch: reader (reader.spec.ts, reader-mermaid.spec.ts)

Render spec `web/render/reader.spec.ts`, helper `web/render/helpers/reader.ts`; scenarios in
`internal/server/renderfix_scenarios_reader.go`. Every pure DOM locator and oracle of
`web/e2e/helpers/reader.ts` — the region, docbar, nav, tree, outline, frontmatter and diagram
locators, `navLabelLayout`, `canvasTransform`, `OriginRequestTracker` — and the documents the
E2E builders wrote (`MARKDOWN_TREE_DOCUMENTS`, `LARGE_TREE_DOCUMENTS`, `MERMAID_DOCUMENTS`, the
inline documents of the two specs as `READER_DOCUMENTS` and `INTERLEAVED_DOCUMENT`) moved into
the render helper; the E2E helper re-exports them and keeps what a render test never does:
`writeFakeTranscript`, the on-disk builders (now writing the shared bytes), the three held
responses, `getReaderListing`/`getReaderFile` and `ReaderRequestTracker`. The reader locators
`web/render/helpers/reader-find.ts` duplicated are now imported from `./reader` (its one edit).
Counts are Playwright `--list` counts.

## `reader.spec.ts` — 60 tests → 34 E2E, 26 render, 0 vitest

Every port keeps the original title, the same DOM and computed checks (`navLabelLayout`,
bounding boxes, `textContent` equality for the raw frontmatter, `firstElementChild`), the same
real key presses and element-handle identity checks, and the same host views (Focus, a 3×2
and a 2×2 tile). The view and the density are the fixture's prefs (`withPrefs`), never a
Cmd+\ or a density click: the dashboard adopts both only from the prefs broadcast, which the
harness never sends.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| Focus mainhead gains a docs segment; selecting it shows the reader and hides the Claude terminal, and selecting claude restores it | E1, REQ-1, REQ-2 | **property** | the surface switch is client state — `reader-docs` |
| in Tiles, selecting docs in one tile shows the reader there only and leaves the other tile's terminal socket and geometry untouched | E2, INV-6 | journey | a live terminal socket and tmux geometry |
| a session whose transcript names an existing plan file opens it automatically with the plan badge and full path | E3, REQ-7, REQ-9, REQ-4 | **property** | the listing's plan slot — `reader-docs-plan` |
| a session whose transcript names no plan shows no plan yet and lists the directory's files | E4, REQ-9 | **property** | nav for a plan-less listing |
| after a /clear pair naming a planless transcript, the plan slot still shows the pre-clear plan and its badge | frontmatter E1, REQ-8 | journey | a rebind's transcript scan |
| the tree lists exactly the fixture's markdown files, folders collapsed with counts, and expanding reveals children | E6, REQ-10 | **property** | the tree for a listing |
| typing in the filter narrows the tree to matching files with ancestors expanded, and clearing restores the collapsed tree | E7, REQ-11 | **property** | the filter box |
| the open file carries aria-current, moving to whichever file is opened | E8, REQ-12 | **property** | tree state across two opens |
| a routed Write hook for an unopened file lights its changed dot, cleared by opening it | E9, REQ-13 | journey | a hook POST |
| rewriting the open file on disk and posting a Write hook for it re-renders the new content with a changed cue | E10, REQ-18 | journey | a hook POST and a changed file |
| before any write hook for the open file, no freshness cue element exists | E11, REQ-24 | **property** | the docbar with no write recorded |
| rewriting the plan on disk and switching away and back to docs shows the new content | E12, REQ-19 | journey | a re-fetch of a changed file on disk |
| rewriting the plan on disk and dispatching a window focus event shows the new content | E13, REQ-19 | journey | as above |
| with a reader open and nothing happening, no further requests reach /reader or /reader/file | E14, INV-5 | journey | `ReaderRequestTracker` over the daemon's routes (borderline, see below) |
| a file with a GFM table, task list and fenced code renders a table, disabled checkboxes and a code block | E15, REQ-5 | **property** | the rendered body of a document |
| a file containing a script element, an onerror attribute and a javascript: link renders with none of them present | E16, REQ-22 | **property** | sanitization of a document |
| the outline lists the file's headings, clicking one scrolls the body, and scrolling moves aria-current | E17, REQ-14 | **property** | outline and scroll-spy |
| a long file or folder name truncates with an ellipsis and a long heading wraps, all inside the nav | #67 | **property** | nav label layout; the checkout's folder name is long so the Files header path wraps as the scratch path did |
| a repeated heading gets deduplicated ids so each outline entry scrolls to its own heading | edge case 26, REQ-14 | **property** | heading ids |
| the Files and Outline header toggles fold independently, and the nav toggle hides and restores the whole nav | E18, REQ-14, REQ-4 | **property** | nav folds |
| the last opened file is remembered across a reload | E19, REQ-7 | **property** | browser memory across `page.reload()`; the harness's routes survive the reload |
| reader/file returns 404 for .. traversal, an outside symlink and the plan's -agent- sibling | E20, REQ-20 | journey | the daemon's confinement |
| the pop out link opens a second page with the reader for the same file, and a docChanged re-renders it there too | E21, REQ-8, REQ-27 | journey | pop-out and a hook |
| on an ended session the plan block and the nav's plan header row are absent, opening a tree file still renders it, and the nav toggle still hides/restores the nav | E22, REQ-3; render-fixes E5, REQ-6 | **property** | the reader on a dead session — `reader-docs-ended` |
| on an ended session whose directory was removed, the status line shows the directory_missing message and the tree's loading row clears | E23, edge case 12 | journey | the daemon's 409 |
| stopping the daemon disables the docs segment and shows the unreachable status while keeping the render, and restarting restores it | E24, edge case 13 | journey | kill and restart |
| deleting the open file and posting a Write hook for it shows file no longer exists while keeping the last render | E25, REQ-28 | journey | a hook and a 404 |
| opening a file over 10 MiB clears the loading cue and the grey-out, shows the too_large message, and leaves the body unchanged | E26, REQ-6 | journey | the daemon's 413, a held response |
| the pop-out's own status line is hidden while healthy, shows file-gone on a routed delete, and then genuinely unreachable once the daemon dies | E30, REQ-8, REQ-27, REQ-28 | journey | pop-out, hook, kill |
| in Tiles at 3x2 the reader nav starts collapsed and the bar has no path, with the nav toggle still present and flush right; at 2x2 it starts open | E27, REQ-15; render-fixes E1 | **property** | `reader-docs-tiles-3x2` then `reader-docs-tiles-2x2` (deliberate difference 1) |
| the reader nav sits beside the body as a right-hand column bounded by its host, in Focus and in a tile | review cycle 1 Critical 1 | **property** | `reader-docs-large` then `reader-docs-large-tiles-2x2` (deliberate difference 1) |
| compact follows the current host across a Focus/Tiles switch, not the mount moment | review cycle 1 Major 1, REQ-15 | journey | one live instance across a view switch after a Write hook (borderline, see below) |
| after a daemon restart and reload, switching to docs shows the plan in the slot | E28, INV-3 | journey | restart |
| after a /clear pair naming a planless transcript, a straggler Write hook from the pre-clear id leaves the plan slot showing the retained plan | frontmatter E2, REQ-8, REQ-9 | journey | rebind and a straggler hook |
| leaving plan mode fires a scan that fills the plan slot | REQ-16, edge case 4 | journey | the ExitPlanMode hooks |
| no terminal exists for the docs surface from every switch direction, and ending a running shell while docs is selected keeps the docs selection | INV-1 | journey | a live shell pane killed in tmux |
| the pop-out reader bounds itself to the viewport so the body scrolls, the docbar stays fixed and scroll-spy tracks it | review cycle 3 Critical 1 | journey | pop-out through its link |
| keyboard-activating the plan slot, a tree file and an outline entry keeps focus on that exact node across a render tick, a routed docChanged write and an unrelated sessionUpsert | review cycle 3 Major 1/2 | journey | two hook POSTs drive the re-renders |
| expanding a tree folder rebuilds the section structurally and restores focus onto the new equivalent button, not the destroyed old node | review cycle 3 Major 1 sweep | **property** | a real key, element-handle identity |
| keyboard-activating the nav toggle leaves focus on it, in both directions, on the Focus host and on the pop-out | render-fixes E2, REQ-4 | journey | the pop-out half (borderline, see below) |
| the reader has exactly one nav-toggle button, never hidden, whose right edge is unchanged between the nav open and collapsed | render-fixes E1, INV-ONE-ARROW, INV-ARROW-FIXED | **property** | toggle geometry |
| the nav toggle's right edge is unchanged after the first routed write makes the freshness cue appear | render-fixes E4, REQ-5 | journey | a hook POST |
| with the file response held, selecting a tree file moves aria-current and the bar filename immediately, shows the loading status and greys the body… | render-fixes E6-E8, E16 | journey | a held response |
| with the listing response held, the body reads loading… and the tree shows one loading… row | render-fixes E9 | journey | a held response |
| a first open on a plan-less session, held, shows loading… in the body and never nothing open — pick a file | render-fixes REQ-9 | journey | a held response |
| a window focus event on an open plan and a routed write for an open tree file each re-render silently… | render-fixes E10, REQ-11 | journey | a held response and a hook |
| a pop-out opened with no path query settles its body on nothing open — pick a file | render-fixes E11, REQ-9 | **property** | the page itself navigates to `doc.html`, so the harness's routes answer (Notes) |
| a reader whose remembered open path was deleted before mount settles its body on nothing open — pick a file, never on loading… | render-fixes E14, edge case 3 | journey | a file deleted from a real directory |
| stopping the daemon mid-load shows the unreachable text and leaves no loading cue once it is restarted | render-fixes E13, REQ-15 | journey | kill mid-flight |
| with two tiles on docs, holding one tile's file response shows the loading cue in that tile only… | render-fixes E15, INV-CUES-PER-INSTANCE | journey | a held response |
| opening a file with flat frontmatter shows a Frontmatter table as the body's first element with one row per key… | frontmatter E3 | **property** | the rendered body of a document |
| a frontmatter value carrying <img onerror> and <script> shows as literal text and no img or script element exists in the body | frontmatter E4 | **property** | sanitization |
| opening a file with nested-YAML frontmatter shows the raw block verbatim in pre.frontmatter… | frontmatter E5 | **property** | the raw fallback, `textContent` equality kept |
| a long frontmatter key never forces article.md to scroll horizontally in a 3x2 tile with the file explorer open | review cycle 1, REQ-10, W16 | **property** | `reader-docs-tiles-3x2` |
| expanded folders and folds survive selecting Claude and then Docs again | reader-expanded-persists REQ-1, REQ-2 | **property** | browser memory across a surface switch |
| a pop-out's Outline fold leaves the dashboard's expanded folders intact on its next Claude to Docs switch | reader-expanded-persists, shared memory | journey | pop-out |
| a dashboard's collapse of docs/ survives the pop-out's later Outline toggle and the dashboard's next switch | reader-expanded-persists, shared memory reverse | journey | pop-out |
| a dashboard's collapse of adr/ shows in the pop-out with no click there and the pop-out's next adr/ click expands it in both | reader-expanded-persists, live adoption | journey | pop-out |
| a click on a pop-out's displayed-expanded adr/ collapses it and stores the collapse when its storage events never land | reader-expanded-persists, stale display | journey | pop-out |
| a folder click while a filter is typed saves nothing that shows after switching away with the filter still typed | reader-expanded-persists REQ-3 | **property** | browser memory across a surface switch |

## `reader-mermaid.spec.ts` — 16 tests → 4 E2E, 12 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a valid flowchart fence renders as an SVG diagram with styled nodes, and the source pre is gone | E2, REQ-1 | **property** | the rendered diagram — `reader-diagrams` |
| a malformed fence among valid ones keeps its source with a failure line while the others render | E3, REQ-6 | **property** | kept source and failure line |
| script, onerror and javascript: content in a diagram's labels and click directive never reach the DOM, even under a loose init directive | E4, REQ-5 | **property** | sanitization |
| mermaid's chunk loads lazily only for a document with a fence, and every request stays on the daemon's origin | E5, REQ-3, REQ-4 | **property** | `OriginRequestTracker` against the page's origin, from which the harness serves the bundle (deliberate difference 2) |
| changing the theme re-renders a diagram in the mapped mermaid theme without re-fetching the file, and the diagram survives having been enlarged | E6, REQ-7 | journey | a theme change is a pref round-trip whose broadcast re-renders (borderline, see below) |
| a routed Write hook for the open diagram file re-renders it with the changed node label | E7, REQ-1 | journey | a hook POST |
| Enlarge diagram opens a fitted, focused modal; Escape, the backdrop and Close each close it and restore focus to the button | E8, REQ-8 | **property** | the modal |
| with two tiles open on the same diagram file, enlarging one tile's diagram opens only that tile's dialog | E9, INV-3 | **property** | `reader-diagrams-pair-2x2` |
| on the pop-out, Enlarge diagram opens and closes the modal with focus restored, and every request stays on the daemon's origin | E10, REQ-8 | journey | pop-out through its link |
| a diagram wider than the body scrolls its own figure without giving article.md a horizontal scrollbar, in Focus and in a compact tile | E11, REQ-11 | **property** | `reader-diagrams` then `reader-diagrams-tiles-3x2` (deliberate difference 1) |
| a file with a fence of each of the kb's eight diagram kinds, plus case, attribute, blockquote and duplicate variants, renders every one | E12, REQ-1, REQ-2 | **property** | thirteen figures |
| heading ids and the outline are unchanged by a document that also carries mermaid fences, valid and malformed, between its headings | REQ-12 | **property** | ids and outline for a document |
| in the open modal, Zoom in/out, +/-/=/0 keys and Reset zoom move data-zoom through the documented sequence, clamped to [0.25, 8] | E13, REQ-9, INV-5 | **property** | real keys on the stage |
| in the open modal, wheel-up zooms in, a pointer drag pans the canvas by the drag delta, and Reset zoom restores fit with no pan | E14, REQ-9 | **property** | wheel and pointer on the stage |
| a flowchart naming layout: elk in frontmatter and one naming no layout both render | E15, REQ-2 | **property** | two figures |
| switching to a plain file while a diagram file's fetch is still held discards the late render | REQ-10, edge case 5 | journey | a held response |

**Deliberate differences**

1. Three tests measure Focus and then a tile of the same session: E27 (a 3×2 tile, then a
   2×2 one), review cycle 1 Critical 1 (the large tree in Focus, then its 2×2 tile) and
   mermaid E11 (`wide.md` in Focus, then its 3×2 tile). The E2E pressed Cmd+\ or clicked a
   density segment — a pref PUT whose broadcast the dashboard waits for — so each render test
   opens the Tiles fixture on the same page after the Focus one (the harness allows a second
   `open`, as reader-find's batch did). The session keeps its id across the two fixtures, so
   the tile's reader re-opens the remembered file from the browser memory exactly as the E2E's
   tile did; every measurement is still read from the live layout.
2. Mermaid E5's `OriginRequestTracker` is constructed with the render origin
   (`RENDER_ORIGIN`) in place of `daemon.baseURL`: the harness serves the bundle and its
   chunks from that origin exactly as the daemon serves them, so "every request stays on the
   daemon's origin" is the same check against the same requests.
3. E1 and the two reader-expanded-persists tests waited for `MUSTER-STUB-READY` in the
   terminal — a readiness gate on the stub Claude, not a claim of the test. The render tests
   wait for the terminal region to be visible instead; every assertion that follows is kept.
4. The E2E openers passed `{ timeout: 15_000 }` explicitly; the render config's expect timeout
   is the same 15 s, so the ports carry no explicit timeout.
5. E19 (the reload) clicks the `reader` rail card after `page.reload()` before switching to
   docs, as every render opener does; the E2E relied on the daemon's auto-focus of the only
   session. The remembered-file assertion is unchanged.
6. One test is new: "every reader fixture records each document the E2E helper writes with the
   same bytes, and only the markdown ones outside dot-directories (fixture identity)" proves,
   for all ten fixtures, that each session's listing names exactly the `.md` documents outside
   dot-directories, that every one is recorded, that each body equals the helper's constant
   (`READER_PLAN_BODY` for the plan fixture's plan), and that the Go transcription matches the
   TypeScript rather than being trusted.

## Scenarios added

| Scenario | Holds | Used by |
|---|---|---|
| `reader-docs` | one idle session `reader` on a plain (non-git, so the walk listing) directory holding `buildMarkdownFixtureTree`'s four files and every inline document of reader.spec.ts; the folder name is long enough that the Files header's path wraps | every Focus test |
| `reader-docs-tiles-2x2`, `reader-docs-tiles-3x2` | the same session under `view: tiles` at each density | E27, the wide-key test, and as the tile half of the Focus-then-tile tests |
| `reader-docs-plan` | the same checkout bound with a SessionStart whose transcript names an existing plan file under the rig root (`PlanAttachmentLine`), so the listing's plan slot is filled and the recording carries the plan | E3 |
| `reader-docs-ended` | the same session ended (`markDead`) | E22 |
| `reader-docs-large`, `reader-docs-large-tiles-2x2` | `buildLargeMarkdownFixtureTree`'s twenty files and thirty-heading document, in Focus and in Tiles 2×2 | review cycle 1 Critical 1 |
| `reader-diagrams`, `reader-diagrams-tiles-3x2` | `writeMermaidFixture`'s seven documents plus `interleaved.md`, on their own checkout (both trees have an `unsafe.md`), in Focus and in Tiles 3×2 | every mermaid test |
| `reader-diagrams-pair-2x2` | two such sessions, `reader-a` and `reader-b`, each on its own checkout, Tiles 2×2 | mermaid E9 |

All reader checkouts are plain directories because the E2E scratch directories were: the
listing is the dot-directory-skipping walk, which is what keeps `.hidden/secret.md` out of
the tree (E6). The scenario file transcribes every document into Go byte for byte; the
identity test above is what holds the two copies together.

## Deleted Tests

Every row moved to `web/render/reader.spec.ts` under the same title.

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `reader.spec.ts` | Focus mainhead gains a docs segment… (E1, REQ-1, REQ-2) | docs segment, reader replaces the terminal and back | `web/render/reader.spec.ts`, same title |
| `reader.spec.ts` | a session whose transcript names an existing plan file opens it automatically… (E3) | plan badge, filename, path, aria-current | same title |
| `reader.spec.ts` | a session whose transcript names no plan shows no plan yet… (E4) | no plan yet, files listed | same title |
| `reader.spec.ts` | the tree lists exactly the fixture's markdown files… (E6) | tree contents, exclusions, expanding | same title |
| `reader.spec.ts` | typing in the filter narrows the tree… (E7) | filter | same title |
| `reader.spec.ts` | the open file carries aria-current… (E8) | aria-current moves | same title |
| `reader.spec.ts` | before any write hook for the open file, no freshness cue element exists (E11) | cue absent | same title |
| `reader.spec.ts` | a file with a GFM table, task list and fenced code renders… (E15) | GFM rendering | same title |
| `reader.spec.ts` | a file containing a script element, an onerror attribute and a javascript: link renders with none of them present (E16) | sanitization | same title |
| `reader.spec.ts` | the outline lists the file's headings, clicking one scrolls the body, and scrolling moves aria-current (E17) | outline and scroll-spy | same title |
| `reader.spec.ts` | a long file or folder name truncates with an ellipsis and a long heading wraps, all inside the nav (#67) | nav label layout | same title |
| `reader.spec.ts` | a repeated heading gets deduplicated ids… (edge case 26) | deduplicated ids | same title |
| `reader.spec.ts` | the Files and Outline header toggles fold independently, and the nav toggle hides and restores the whole nav (E18) | folds and the toggle | same title |
| `reader.spec.ts` | the last opened file is remembered across a reload (E19) | browser memory | same title (deliberate difference 5) |
| `reader.spec.ts` | on an ended session the plan block and the nav's plan header row are absent… (E22) | dead-session reader | same title |
| `reader.spec.ts` | in Tiles at 3x2 the reader nav starts collapsed and the bar has no path… at 2x2 it starts open (E27) | compact at 3×2, open at 2×2, toggle flush right | same title (deliberate difference 1) |
| `reader.spec.ts` | the reader nav sits beside the body as a right-hand column bounded by its host, in Focus and in a tile (review cycle 1 Critical 1) | nav geometry, section scrolling | same title (deliberate difference 1) |
| `reader.spec.ts` | expanding a tree folder rebuilds the section structurally and restores focus… (review cycle 3 Major 1 sweep) | focus restore by key | same title |
| `reader.spec.ts` | the reader has exactly one nav-toggle button, never hidden, whose right edge is unchanged… (render-fixes E1) | one toggle, fixed edge | same title |
| `reader.spec.ts` | a pop-out opened with no path query settles its body on nothing open — pick a file (render-fixes E11) | placeholder on `doc.html` without a path | same title (Notes) |
| `reader.spec.ts` | opening a file with flat frontmatter shows a Frontmatter table… (frontmatter E3) | flat table, outline | same title |
| `reader.spec.ts` | a frontmatter value carrying <img onerror> and <script> shows as literal text… (frontmatter E4) | frontmatter sanitization | same title |
| `reader.spec.ts` | opening a file with nested-YAML frontmatter shows the raw block verbatim… (frontmatter E5) | raw fallback | same title |
| `reader.spec.ts` | a long frontmatter key never forces article.md to scroll horizontally in a 3x2 tile… (review cycle 1, W16) | no horizontal scroll | same title |
| `reader.spec.ts` | expanded folders and folds survive selecting Claude and then Docs again (reader-expanded-persists REQ-1, REQ-2) | memory across a surface switch | same title (deliberate difference 3) |
| `reader.spec.ts` | a folder click while a filter is typed saves nothing… (reader-expanded-persists REQ-3) | no save while filtering | same title (deliberate difference 3) |
| `reader-mermaid.spec.ts` | a valid flowchart fence renders as an SVG diagram with styled nodes… (E2) | SVG, styled node, source gone | same title |
| `reader-mermaid.spec.ts` | a malformed fence among valid ones keeps its source with a failure line… (E3) | kept source, failure line | same title |
| `reader-mermaid.spec.ts` | script, onerror and javascript: content in a diagram's labels and click directive never reach the DOM… (E4) | diagram sanitization | same title |
| `reader-mermaid.spec.ts` | mermaid's chunk loads lazily only for a document with a fence, and every request stays on the daemon's origin (E5) | lazy chunk, same origin | same title (deliberate difference 2) |
| `reader-mermaid.spec.ts` | Enlarge diagram opens a fitted, focused modal; Escape, the backdrop and Close each close it… (E8) | the modal | same title |
| `reader-mermaid.spec.ts` | with two tiles open on the same diagram file, enlarging one tile's diagram opens only that tile's dialog (E9) | one dialog per root | same title |
| `reader-mermaid.spec.ts` | a diagram wider than the body scrolls its own figure… in Focus and in a compact tile (E11) | figure scrolls, body does not | same title (deliberate difference 1) |
| `reader-mermaid.spec.ts` | a file with a fence of each of the kb's eight diagram kinds… renders every one (E12) | thirteen figures | same title |
| `reader-mermaid.spec.ts` | heading ids and the outline are unchanged by a document that also carries mermaid fences… (REQ-12) | ids and outline | same title |
| `reader-mermaid.spec.ts` | in the open modal, Zoom in/out, +/-/=/0 keys and Reset zoom move data-zoom… (E13) | zoom sequence and clamp | same title |
| `reader-mermaid.spec.ts` | in the open modal, wheel-up zooms in, a pointer drag pans the canvas… (E14) | wheel, pan, reset | same title |
| `reader-mermaid.spec.ts` | a flowchart naming layout: elk in frontmatter and one naming no layout both render (E15) | elk and default layouts | same title |

## Borderline, left in place

- **"with a reader open and nothing happening, no further requests reach /reader or
  /reader/file" (E14, INV-5)**: the claim is about the client never polling, which the
  harness's routes could observe, but its oracle is `ReaderRequestTracker`, which this audit
  keeps on the E2E side with the other daemon-answer oracles; the test stays with it.
- **"compact follows the current host across a Focus/Tiles switch, not the mount moment"
  (review cycle 1 Major 1, REQ-15)**: the claim is that one live instance re-reads its host
  every tick rather than at construction. Separate Focus and Tiles fixtures would mount a
  fresh instance in each host, which the pre-fix bug would also pass; the test needs the view
  switch (a pref round-trip) and a Write hook, so it stays E2E.
- **"keyboard-activating the nav toggle leaves focus on it, in both directions, on the Focus
  host and on the pop-out" (render-fixes E2, REQ-4)**: the Focus half is a property, but the
  test opens the pop-out through its link for the second half and a test is not split; it
  stays E2E whole.
- **"changing the theme re-renders a diagram in the mapped mermaid theme without re-fetching
  the file, and the diagram survives having been enlarged" (mermaid E6, REQ-7)**: the claim is
  a live re-render on a theme change, which only the prefs broadcast triggers; per-theme
  fixtures (reader-find's approach for tokens) would not exercise the re-render, so it stays
  E2E with its `ReaderRequestTracker`.

## Notes

- **The pop-out's direct-navigation shape is a property.** Render-fixes E11 navigates the
  page itself to `doc.html?session=<id>` rather than opening a popup, so the harness's routes
  (installed on that page) still answer, and `doc.ts` connects to `/ws` with no token the
  harness would lack. Measured: the placeholder renders and the loading placeholder is absent,
  as the E2E asserted. Every other pop-out test opens a second page through the `pop out ↗`
  link, which the harness cannot serve (reader-find's measurement), and stays E2E.
- `web/render/helpers/reader-find.ts` keeps its surface-button locators
  (`mainheadSurfaceButton`, `tileSurfaceButton`); the reader spec imports them from there
  rather than duplicating them, since that file's only edit in this batch was to import the
  reader locators from `./reader`.
- `ReaderRequestTracker` stays in `web/e2e/helpers/reader.ts` with `getReaderListing`,
  `getReaderFile`, the three held responses, `writeFakeTranscript` and the on-disk builders;
  `OriginRequestTracker` (a page-level request listener with no daemon knowledge) moved to
  the render helper, re-exported.
- `make gen-render-fixtures` wrote only the ten new fixtures; `make check-render-fixtures`
  reports every scenario up to date, so the generator's launch alignment has settled the two
  `effort-warned-*` fixtures reader-find's batch had to revert.

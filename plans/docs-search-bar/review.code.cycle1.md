# Correctness review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
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

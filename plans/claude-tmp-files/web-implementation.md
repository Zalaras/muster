# Web Implementation: claude-tmp-files

**Plan**: claude-tmp-files
**Mode**: initial
**Pack**: kb: pack 34171 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | modified | `scratchpadDir: string \| null`, required key (REQ-3) |
| `web/src/api/reader.ts` | modified | listing `scratch` block, `plan.modifiedAt` (REQ-4, REQ-13) |
| `web/src/reader/memory.ts` | modified | `claudeFolded` memory, default folded, `withClaudeFolded` (REQ-8) |
| `web/src/reader/claude.ts` | created | pure: chips, `latestIso`, `isScratchPath`, listing re-scan decisions (REQ-7, 9, 11) |
| `web/src/render/reader.ts` | modified | claude section: summary row + chips, plan row with age, keyed scratch rows, docbar `plan`/`tmp` badge (REQ-7, 9, 10, 12, 13) |
| `web/src/features/reader.ts` | modified | fold toggle, open scratch file, silent listing re-scan on new scratch path / moved folder, section on dead session (REQ-8, 10, 11, 12) |
| `web/index.html`, `web/doc.html` | modified | both reader templates: plan header and slot become the claude section |
| `web/src/style.css` | modified | summary row, chips, `.when`, `.badge.scratch` |

## Decisions

- deviation: `.badge.scratch` is not teal. design-system §1/§3 reserve `--teal` for Working and forbid borrowing it, so the `tmp` badge uses the neutral badge colours with a dashed border → kb:adr/reader-scratch-badge-neutral-not-teal
- deviation: the summary row keeps its chips while unfolded (mockup B drops them); the E2E specs assert the `<n> tmp` chip with the section open and INV-3 wants chips always agreeing with the rows → kb:adr/reader-claude-chips-stay-when-unfolded
- design: `reader/claude.ts` is a pure sibling of `notice.ts`/`freshness.ts`. Precedent grep: `rg "classifyDocChanged|changedText" web/src` found the shape to copy; nothing existed for chips or re-scan rules.
- design: scratch rows are keyed by absolute path and reused (`reconcileKeyedOrder` + `captureFocusedKey`/`restoreFocusedKey`, the rail/tiles reorder precedent), so a listing re-fetch inserting a row never replaces a focused node. Reuse key covers path (title/data-path); `current`, age text and dirty dot are applied in place. Plan row reuse key: fold + basename.
- design: a folded section holds no plan or scratch row in the DOM (sig `folded`); chips are static nodes updated in place; the tmp chip is removed, not hidden.
- design: listing re-fetch uses its own `listingSeq` (the shared `fetchSeq` would let a file open drop it). `coveredScratchDir` (owner: `ReaderInstance`) is the folder the latest request covers, set at issue and at landing, so the 1 s tick never re-issues. `scratchDirs` remembers every folder seen so an open file keeps its `tmp` badge after `/clear`.
- design: `PlanSlotVM` loses `absent`; `ReaderBarVM.badgeVisible` becomes `badge: "plan" | "tmp" | null`.
- Not done: `web/render/helpers/reader.ts`, `web/e2e/helpers/reader.ts`, `payloads.ts` locator/payload additions: e2e-specs' standalone `reader-scratch.ts` helper covers E2E, render helper goes to render-tests.
- Size warnings on `features/reader.ts` (824) and `render/reader.ts` (690) already existed and grew; kept, the section shares the render pass and signature memo with the rest of the nav.
- doc-delta: the claude section keeps its chips while unfolded; the `tmp` badge is neutral (dashed), not teal.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on sanctioned test files only: the new required `Session.scratchpadDir` and `ReaderMemory.claudeFolded` break typed literals in `src/api/launch.test.ts`, `src/api/sessions.test.ts`, `src/features/actionscopy.test.ts`, `src/reader/memory.test.ts`, `src/render/{dead,mainhead,sessions,tiles}.test.ts`, `src/sessions/{card,live,sort,store}.test.ts`, `src/ws.test.ts`; each needs `scratchpadDir: null` (memory test `claudeFolded: true`). No non-test errors. Smoke used `npx vite build` + `make build`. Existing unit tests asserting `planSlot`/`badgeVisible` need the new `claude`/`badge` shapes.
**E2E smoke**: `npx playwright test e2e/reader-scratch.spec.ts e2e/reader.spec.ts`: 50 passed, 1 failed.
Spec locator defect for validate mode: `reader-scratch.spec.ts:440` (daemon restart test) uses `page.getByRole("status")`, which matches both the connection status and the ended session's `<b role="status">session ended</b>`; use `#connection-status`.
Lint clean, `make contrast` 0 failures; `make check-kb` reports only the two e2e files owned by no feature (orchestrator/doc-reconcile).

## Fix Attempt 1

**Failures addressed**: `src/sessions/testfixtures.ts` (shared `makeSession`, not a test file, mine) lacked the required `scratchpadDir`; the earlier Handoff wrongly assigned it to web-tests.
**Changes made**: `web/src/sessions/testfixtures.ts` gains `scratchpadDir: null`. `npm run build` exits 0; `npx tsc --noEmit` still reports errors only in `*.test.ts` files that declare their own typed Session literals (actionscopy, render/{dead,mainhead,sessions,tiles}, sessions/{card,sort,store}), each needing `scratchpadDir: null` from web-tests. No non-test file errors.
**Decisions**: none new.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: browser Major 1; code Minor 3; maintainability Minor 1, 2, 6; decision row-age-text (bare `formatAge`).
**Changes made**:
- browser Major 1: `web/src/style.css` — `.rnav .plan-slot { flex: none }`, `.rnav .scratch-rows { flex: 0 1 auto; min-height: 0; max-height: 40%; overflow-y: auto }`. Consumers of the rules: `.plan-slot`/`.scratch-rows` exist only in `web/index.html` and `web/doc.html` (same nav markup, one CSS), so Focus, tiles and pop-out share it. Re-ran the repro (temporary render spec, deleted) with 30 extra rows injected into tree, outline and scratch rows, claude section unfolded. Before (30 scratch rows, default fixture tree/outline): `.tree 0/0, .outline 10/21, .scratch-rows 363/759`. After, Focus 1440x900: `.rnav 562/562 .plan-slot 23/23 .scratch-rows 143/759 .tree 107/570 .outline 111/591`; compact 3x2 tile: `.rnav 314/314 .plan-slot 21/21 .scratch-rows 41/513 .tree 36/450 .outline 38/471` (clientHeight/scrollHeight): every box non-zero and scrolls. 2x2 and pop-out use the same rule; not measured separately.
- Minor 1: `tmp-chip` span added to the claude-chips in `index.html`/`doc.html`; `refs.tmpChip` comes from the template; presence via `setPresence` (new `side` param, `"after"` the plan chip); `buildChip` and the unused `claudeChips` ref deleted.
- Minor 2: `buildTreeLoadingRow` became `buildLoadingRow(className)`, used by the tree and the scratch rows.
- Minor 6: re-scan policy moved to new `web/src/features/readerscratch.ts` (`createScratchTracker`: scratch dirs, covered dir, session dir, rescan decisions), the `readerfind`/`readerscroll` sub-controller shape; `features/reader.ts` 818 -> 799 lines; `listingSeq` stays (shared with `loadListing`).
- Minor 3: `web/src/reader/CLAUDE.md` Owns names `claude.ts`; `web/src/features/CLAUDE.md` names `readerscratch.ts`.
- row-age-text: scratch row age is `formatAge`; plan row and docbar stay `ageAgo`.
**Decisions**:
- design: `readerscratch.ts` is a closure-based tracker (precedent: `readerscroll.ts` `initReaderScroll`); state owner is the tracker, written from `render` (`observeSession`) and `applyListing`/`rescanListing`.
- doc-delta: `docs/features/reader/spec.md` web glob needs `web/src/features/readerscratch.ts` (check-kb: "owned by no feature"); the orchestrator owns docs. `docs/diagrams/web-components.md` may want the tracker.

**Handoff**: `npx tsc --noEmit` exits 0 and `npm run build` exits 0 (test files compile now). `npm run lint` reports formatter diffs only in test files (`src/api/reader.test.ts` and others, not mine). E2E smoke: `npx playwright test e2e/reader-scratch.spec.ts e2e/reader.spec.ts`: 51 passed. Render tests asserting `ageAgo` text on scratch rows (`web/render/reader-scratch.spec.ts`, via `rowAge` in `web/render/helpers/reader-scratch.ts`) need `formatAge` text (`now`, `2m`) — render-tests. Unit tests: none reference the moved symbols.

## Fix Attempt 3 (review cycle 1)

**Failures addressed**: render-tests implementation-bug: unfolded claude section in the compact 3x2 tile at 600px (and 450px, Focus 360px) left `.tree`/`.outline` at clientHeight 0.
**Changes made** (`web/src/style.css` only, no floor on `.tree`/`.outline`, no scrolling on `.rnav`, kb:adr/reader-nav-sections-shrink-without-floor held). Measured first: fixed rows in the 164px tile nav were summary 29 + plan 21 + Files header 69 (long folder path wrapped) + filter 17 + outline header 25 + two `.sep` (13 each), leaving nothing.
- `.rnav .hd .dir` still breaks anywhere but is clamped to one line (`-webkit-line-clamp: 1`; the #67 render test, which asserts the header wraps inside the nav, stays green): header 69 -> 25.
- `.rnav .scratch-rows`: `flex: 0 1000 auto; min-height: 22px` so the scratch list yields to the tree/outline first but always keeps one scrollable row (the scratch rows are not governed by the ADR).
- Compact only (`.reader.compact .rnav`): `.hd` padding 5/3, `.sep` margin 2px, `.claude-sum` block padding 4, `.filter` margin 2/3. Consumers: these selectors exist only inside `.reader.compact`, i.e. tile hosts; Focus and pop-out are not compact and unchanged.
- Repro numbers (clientHeight/scrollHeight, before -> after): tile 600: nav 164/199 -> 164/164, scratch 0/63 -> 27/63, tree 0/0 (fixture tree is empty), outline 0/21 -> 21/21. Focus 360: scratch 0/69 -> 24/69, outline 0/21 -> 21/21. Focus 450 unchanged (69/69, 21/21).
- **Not solved, developer's call: tile at 450px tall.** Nav is 89px; even compact, the fixed rows (summary 23 + plan 21 + headers 19+19 + filter 17 + seps 8 = 107) exceed it, so tree/outline/scratch stay 0 (`outline 0/21`, nav scrollHeight 138). No floor-free, nav-scroll-free layout holds there; it needs a floor, nav scrolling, or hiding the summary/plan rows.
**Decisions**:
- design: no new module; compact sizing extends the existing `.reader.compact .rnav` rules.
**Handoff**: tsc, build, lint exit 0. Full render suite: 485 passed. E2E smoke `e2e/reader-scratch.spec.ts e2e/reader.spec.ts`: see final message.

## Fix Attempt 4 (review cycle 2)

**Failures addressed**: browser Major 2 (decision: kb:adr/reader-nav-scrolls-as-one-column), browser Major 1 (empty `.scratch-rows` strip), browser Minor 1 (22px floor vs 23px row), code Minor 1 (`.dir` clamp).
**Changes made** (`web/src/style.css` only): `.tree`, `.outline`, `.plan-slot`, `.scratch-rows` are `flex: none` at natural height, with no per-section `overflow`, 40% cap or `min-height`; `.rnav` (`overflow: hidden auto`) is the single scroller. `.rnav .hd .dir` clamp removed (wraps again in every host, #67 behaviour restored, so no deviation). Compact-height comments and the per-section scrolling comments removed; compact padding rules kept. Scroll JS (`scrollHeadingIntoView`, scroll-spy) targets the document body, not `.tree`/`.outline`, so nothing there depended on them scrolling (`rg scrollIntoView|scrollTop` in web/src).
**Measured** (render harness, large fixture; `[clientHeight, scrollHeight]`, no section has overflow-y other than visible):
- Focus 900 folded: nav 742/742, tree 441/441, outline 21/21, scratch 0/0, plan 0/0. Unfolded: scratch 69/69, plan 23/23, nav 742/742.
- Focus 360 folded: nav 202/640, tree 441/441, outline 21/21, scratch 0/0. Unfolded: nav 202/732, scratch 69/69.
- Tile 3x2 600 folded: nav 164/475, tree 315/315, outline 21/21, scratch 0/0. Unfolded: nav 164/559, scratch 63/63, plan 21/21.
- Tile 450 folded: nav 89/475, same sections. Unfolded: nav 89/559.
- After scrolling `.rnav` to its end, last tree row and last outline row sit inside the nav bottom in every case above (true). Scratch rows are above the tree so are reached at scroll top (heights equal scrollHeight, nothing clipped). Header `.dir` height 55 = wrapped path in all hosts.
- Pop-out uses the same Focus rules (`.reader` non-compact); not measured separately.
**Decisions**: none new; no deviation.

**Render tests broken (render-tests repairs in wave 2)** in `web/render/reader-scratch.spec.ts`: `expectReachable`/`expectAllSectionsReachable` and the per-height "keep a scrollable row" tests (tree/outline/scratch scrollTop on their own box), the compact tile `sizes` annotation test, "in a compact tile the Files header's folder path stays on one line, ellipsized" (clamp gone), and "tight nav ... keeps at least one scratch row visible" (22px floor, `overflow-y: auto`); `expectSharedColumn` and any 40%-cap assertion likewise. Also check `web/render/reader.spec.ts` for #67/nav-height assertions.

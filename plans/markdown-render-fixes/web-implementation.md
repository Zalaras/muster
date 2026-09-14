# Web Implementation: Markdown Render Fixes

**Plan**: markdown-render-fixes
**Mode**: initial
**Pack**: kb: pack 5709 words (features: reader; decisions, lessons, conventions §TypeScript/web, §Composition roots)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/index.html` | edited | Reader template: deleted the `.rnav .hd` arrow button (`data-role="arr-open"`); retargeted the docbar's surviving button to `data-role="arr-nav"`, `aria-label="File explorer"`, `aria-expanded="true"` (REQ-1..REQ-3). |
| `web/doc.html` | edited | Identical edit — the two `#reader-template` blocks stay byte-identical (verified by diff, W10). |
| `web/src/style.css` | edited | `.docbar .chg` loses `margin-left: auto`; new `.docbar .arr { margin-left: auto; }` (REQ-2/REQ-5); `.arr[hidden]` removed (REQ-17); `.md` gains `transition: opacity 120ms ease` and a new `.md.loading { opacity: 0.4; }` (REQ-14); new `.rnav .hd[hidden] { display: none; }` companion for hiding the whole plan-header row (REQ-6, kb:lesson/display-rule-overrides-hidden-attribute); `.rnav .f.loading-row` added alongside `.rnav .f.none` for the tree's loading-row italic (see Decisions — not a literal `.f.none` reuse). |
| `web/src/render/reader.ts` | edited | `ReaderRefs`: `navToggle` replaces `collapsedArrow`/`openArrow`; `planLabel` dropped. `buildReader` wires one click listener. `renderPlanSlot` hides `planHeader` whole instead of just `planLabel` (REQ-6). `renderReader` sets the toggle's `aria-expanded`/glyph every pass and never hides it; applies `article.md`'s `loading` class and `aria-busy` (removed, not set false, when clear — REQ-14). `renderTree` takes a `loading` flag and renders a single `loading…` row via new `buildTreeLoadingRow` (REQ-10), text from `loadingText(null)`. `prepareNavArrowFocusRestore` and its whole comment block deleted (W6) — a never-hidden, never-rebuilt button needs no focus-restore dance. `ReaderVM` gained `treeLoading`/`bodyLoading`. |
| `web/src/features/reader.ts` | edited | Dropped the private `basename`, now imported from `../reader/paths`. Added `loadingPath`/`bodyRendered` instance fields and a module-level `deriveNotice` (the one place status-line precedence is decided, W9). `openFile(absPath, { showLoading })`: `showLoading` callers (`decideInitialOpen`, `maybeAutoOpenPlan`, `selectRelative`, `selectPlan`) set `loadingPath`/clear `noticeText`+`outline`+`currentHeadingId` and `requestRender()` before the await (REQ-7); silent callers (`handleDocChanged`, `refetchOpenFile`, `handleWindowFocus`) pass `false` (REQ-11). Every resolution clears `loadingPath` behind the existing `disposed`/`fetchSeq`/`openPath` guard (REQ-12). Constructor's placeholder changed from `PLACEHOLDER_TEXT` to `loadingText(null)` (REQ-9); `decideInitialOpen`'s and the listing-failure path's "nothing will open" branches now explicitly settle the body on `PLACEHOLDER_TEXT` instead of leaving it at `loading…`. `bodyRendered` set `true` once, never reset; a failed open only overwrites the body while it's still `false`. `render()` passes `treeLoading: this.listing === null` and `bodyLoading: this.loadingPath !== null`. |
| `web/src/reader/paths.ts` | created | `basename(path)` and `loadingText(path: string | null)` — pure, no DOM (REQ-13, W7). `loadingText(null)` returns the bare `loading…` (constructor placeholder, tree loading row); `loadingText(path)` returns `loading <basename>…` (status line, REQ-8) — one function backing all three call sites so they can't drift apart. |
| `web/src/reader/CLAUDE.md` | edited | **Owns** line now names `paths.ts` (W8). |

## Decisions

- **Tree loading row uses `.f.loading-row`, not a literal `.f.none`, despite the plan text "styled like `.f.none`".** Evidence: implementing it as `class="f none"` (an exact copy of `renderPlanSlot`'s "no plan yet" shape) broke three existing markdown-viewing tests live — `npx playwright test e2e/reader.spec.ts` failed E4, E29 and the REQ-16 test with `strict mode violation: locator(...).locator('.f.none') resolved to 2 elements` (the plan slot's own "no plan yet" `.f.none` and the tree's loading-row `.f.none` both present at once, because `buildPlanSlot` reads `session.plan` off the WebSocket stream — independent of `this.listing` — so it can resolve to `{kind:"none"}` before the reader's own `GET /reader` listing fetch, which drives `treeLoading`, has returned). `noPlanText` in `web/e2e/helpers/reader.ts` (a file I may not edit) locates by `.f.none` scoped to the whole nav, so it can't disambiguate. Fixed by giving the loading row its own class (`f loading-row`) and a matching CSS rule (`.rnav .f.none, .rnav .f.loading-row { font-style: italic; }`) — same visual shape (row layout from `.rnav .f`, italic from the new rule), no class collision. Re-ran the full suite after the fix: `48 passed (16.5s)`, including the three that had failed. This is a plan-text/test-suite conflict resolved in the test suite's favor per "never bend the output shape to keep a stale assertion green" — except here it's the reverse: the *plan's* prose ("styled like .f.none") was underspecified about literal class reuse, and the *tests* (pre-existing, out of my hands) are authoritative.
- Every REQ-1..REQ-17 is implemented (Changes table above); none deferred.
- `loadingText(path: string | null)` matches the plan's exact Affected Files signature. Using it for all three "loading…" occurrences (constructor placeholder, tree loading row, status line) rather than a separate `LOADING_TEXT` constant plus a `string`-only `loadingText` keeps REQ-13's "the loading-cue text" as one pure source of truth — an initial draft split it into a private `LOADING_TEXT` constant and a `loadingText(path: string)`, which compiled and passed the suite but didn't match the plan's stated signature; corrected before handoff.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0. `make check` (lint + unit + refs + check-kb) is clean. `make web-build build` then `npx playwright test e2e/reader.spec.ts` (the plan's own spec file, all 48 tests, including every markdown-render-fixes E1-E16 test and every updated markdown-viewing test) — `48 passed (16.5s)`. This is a smoke check, not the E2E gate verdict.

No test files needed changes — I hit one real defect against the authored suite (see Decisions) and fixed it in my own code (`render/reader.ts` + `style.css`), not in the tests.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md Major 1, Major 2, Minor 1 (all `[web-impl]`). Major 3
(`[e2e-specs]`) is not mine — quoted in the fix-wave prompt for context only.

**Changes made**:

- **Major 1** — `web/src/features/reader.ts`, `openFile`'s `showLoading` branch (~line 236-243).
  Added: when `opts.showLoading && !this.bodyRendered`, call
  `setReaderBody(this.refs, { kind: "placeholder", text: loadingText(null) })` before the
  await, alongside the existing `loadingPath`/`noticeText`/`outline` resets. This is the one
  site (`openFile`) every `showLoading: true` caller (`decideInitialOpen`, `maybeAutoOpenPlan`,
  `selectRelative`, `selectPlan`) funnels through, so the fix covers every user-initiated-open
  path in one place, not just the tree-click case the reviewer screenshotted.
  `deriveNotice`/the status-line suppression while `bodyRendered === false` is untouched — the
  plan's row scopes the cue to the body for this case, and the reviewer's diagnosis said so
  explicitly ("the parenthetical … only holds for the mount path").
- **Major 2** — `web/src/features/reader.ts`. Added a `listingLoading` field (default `true`,
  declared next to `listing`), cleared unconditionally right after the
  `disposed`/`fetchSeq` guard in `loadListing` — i.e. on *every* exit from that function past
  the guard, success or failure alike, not just the success path `listing = result.value`
  used to imply. `render()`'s `treeLoading` now reads `this.listingLoading` instead of
  `this.listing === null`. On a listing failure `this.listing` stays `null` forever (unchanged,
  intentionally — `buildTreeVM` already falls back to `[]` when `listing` is null, giving the
  plan's "replaced by an empty tree" edge-case-2 behaviour), but `treeLoading` now correctly
  flips to `false` once the failed request settles.
- **Minor 1** — `web/src/style.css:1051-1053`. Deleted the dead
  `.rnav .plan-label[hidden] { display: none; }` rule. Blast radius: `rg -n "plan-label"
  web/src/style.css web/src` (before the edit) returned only this one rule — no other CSS or
  TS reference to the class — confirming it was safe to remove outright rather than needing a
  replacement.

**Verification (reviewer's own repro, re-run after the fix)**: built `make web-build build`,
then drove a real scratch daemon in headless Chromium via a throwaway Playwright spec
(`web/e2e/_zz-throwaway-cycle1-repro.spec.ts`, deleted after the run — `git status --porcelain
web/e2e/` is empty), mirroring the reviewer's own two scenarios:

- Major 1: launched a plan-less session, confirmed the body settles on the "nothing open"
  placeholder (the bug's starting state), then held the file fetch and clicked a tree entry.
  Logged state immediately after the click: `MAJOR1 after click: placeholder=false
  loading=true` — the body now shows `loading…`, never the dimmed "nothing open" text; the
  assertion `bodyPlaceholder(region)` has count 0 while the fetch is held. Releasing clears the
  cue. Test passed.
- Major 2: launched a session, ended it, deleted its directory (same shape as the plan's own
  E23 test), opened docs, waited for the status line to settle on "no longer exists", then
  waited an extra 1.5s (matching the reviewer's "re-read 1.5s after settle") before reading the
  tree row. Logged: `MAJOR2 after settle: treeLoadingRowVisible=false` — the row is gone, not
  permanent. Test passed.

Also re-ran the plan's own smoke check: `npx playwright test e2e/reader.spec.ts` — `48 passed
(16.1s)`, no test file touched.

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0. `npx biome check
src/features/reader.ts src/style.css` clean. `python3
.claude/skills/orchestrate/scripts/dead-refs.py` — `523 references checked, 0 missing`.

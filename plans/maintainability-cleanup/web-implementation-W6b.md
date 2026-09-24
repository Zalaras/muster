# Web Implementation: Maintainability Cleanup — Unit W6b (render layer, internals half)

**Plan**: maintainability-cleanup
**Mode**: initial
**Unit**: W6 "Then" bullets — e-M5 (Major 5), e-M2 (Major 2), e-M4 (Major 4), e-m12 (Minor
12), e-m13 (Minor 13), e-m14 (Minor 14), e-m15 (Minor 15), e-m3 (Minor 3), e-m1 (Minor 1).
The "Placement" half (B7–B11, e-m17, d-m4) is W6a's, already landed.
**Pack**: not run via `go run ./tools/kb pack` this unit (network dropped mid-session,
worked offline from the pipeline's kb tooling) — read directly: plan.md's W6 "Then"
bullets, findings.md's cited seeds, `review.maintainability.e-webui.md` in full (Major
2/4/5, Minor 1/3/12/13/14/15, and the Seed check/Notes sections they reference), and every
file the findings name plus its siblings (render/sessions.ts, render/tiles.ts,
features/rail.ts, features/tiles.ts, render/masthead.ts, features/usage.ts,
render/focuskeep.ts, render/reader.ts, features/connection.ts, render/rename.ts,
features/rename.ts, render/mainhead.ts, features/focus.ts, render/diagrams.ts,
features/reader.ts, sessions/card.ts, sessions/context.ts, render/context.ts, dom.ts,
main.ts, render/CLAUDE.md). W6a's own log read first to avoid re-deriving its decisions.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/render/keyedreorder.ts` | created | Major 4: one `reconcileKeyedOrder(container, entries, focused)` — the `insertBefore`-if-not-in-slot loop plus `restoreFocusedControl` call that `render/sessions.ts`'s `reconcileCards` and `features/tiles.ts`'s `reconcileTilesGrid` each carried verbatim. Positioning only; capture and per-entry build/update stay the caller's job (capture has to happen before content updates too, not just before the reorder — a content update can blur focus on its own). |
| `web/src/render/sessions.ts` | rewritten | Major 5 + Major 4 + Minor 12. New `CardOptions`/`CardListOptions`(exported)/`CardRenderOptions`(internal) types replace the ten-slot positional tail through `updateSessionCardContent`, `buildSessionCardElement`, `reconcileCards`, `renderSessions`. `reconcileCards`'s own `insertBefore` loop + `restoreFocusedControl` call replaced by `reconcileKeyedOrder`. Stopped calling `requireTemplate` — `template` is now a required parameter throughout, looked up once by the caller. |
| `web/src/render/tiles.ts` | edited | Major 5 + Minor 12: `buildTile` takes `template` as a parameter instead of calling `requireTemplate("tile-template")` itself. New `StripOptions` type; `renderStrip` takes `template` + `StripOptions` and builds the full `CardListOptions` (draggable:false, currentId:null) internally before calling `reconcileCards`. Minor 3: `updateTileChrome` takes `isEditingName: boolean` instead of reading `nameEl.dataset["editing"]`; `buildTile`'s `attachRenameEditor` call supplies `onEditingChange` (toggles `.thead`'s `draggable` by querying down from `root`, replacing the editor's own `.closest(".thead")`); `updateTile` computes `isEditingName` from `refs.rename?.isEditing()`. |
| `web/src/features/rail.ts` | edited | Major 5 + Minor 12: looks up `#session-card-template` once at `initRail` startup; `renderSessions` call now passes `template` + one `CardListOptions` object. |
| `web/src/features/tiles.ts` | edited | Major 5 + Major 4 + Minor 12: looks up `#tile-template`/`#session-card-template` once; `reconcileTilesGrid`'s own `insertBefore` loop + `restoreFocusedControl` replaced by `render/keyedreorder.ts`'s `reconcileKeyedOrder` (this module now keeps only `tilesLive` membership, `tileElements`'s per-tile refs, and supplies `{id, root}` entries); both `renderStrip` call sites pass `template` + an options object. |
| `web/src/sessions/usage.ts` | created | Major 2: `UsageBucketViewModel`/`buildUsageBucketViewModel` — the pure "percent text, warn flag, fill percent, resets text" derivation shared by `#usage-5h`, `#usage-7d` and `#usage-model-week`'s own bucket slice. Matches `sessions/context.ts`'s "one derivation, `render/context.ts` renders it" shape (`rg -n "^export function build.*ViewModel" web/src/sessions` before this unit found exactly `card.ts`/`context.ts`, each its own file — followed that precedent rather than adding to the grab-bag `sessions/format.ts`). |
| `web/src/render/masthead.ts` | rewritten (usage section) | Major 2 + Minor 1: `renderBucket`+`renderUsageTrack` (rebuild-every-pass, order-dependent) and `applyModelTrack` (mutate-in-place) collapsed into one `buildUsageBucket`/`renderUsageBucket` pair, used directly by the two status-line buckets and internally by the model-week readout's own bucket slice. `ModelWeekState`/`modelWeekCache` (module-level `WeakMap<HTMLElement, …>`) replaced by `UsageModelWeekRefs`, built once via `buildUsageModelWeek` and mutated in place by `renderUsageModelWeek` — the caller (`features/usage.ts`) holds the refs, not this module. |
| `web/src/features/usage.ts` | edited | Major 2 + Minor 1: builds `fiveHourRefs`/`sevenDayRefs`/`modelWeekRefs` once at `initUsage` startup via the new `build*` functions; the render tick calls `renderUsageBucket`/`renderUsageModelWeek` on the held refs instead of `renderUsage`+`renderUsageTrack`+`renderModelWeek`. |
| `web/src/render/focuskeep.ts` | rewritten | Minor 13: extracted two generic primitives (`captureFocus`/`restoreFocusIfLost`) shared by three public pairs — `captureFocusedControl`/`restoreFocusedControl` (unchanged external contract, same `FocusedControl` shape) and the new `captureFocusedKey`/`restoreFocusedKey` (folded in from `render/reader.ts`'s `focusedKeyWithin`/`restoreFocusByKey`). `features/connection.ts`'s identity-keyed remember/restore is explicitly **not** folded in — see Decisions. |
| `web/src/render/reader.ts` | edited | Minor 13 + Minor 14: `focusedKeyWithin`/`restoreFocusByKey` removed, replaced by `render/focuskeep.ts`'s `captureFocusedKey`/`restoreFocusedKey` at both call sites (tree, outline). New `setAriaCurrent`/`setDirtyDot` helpers replace the three (four, counting `buildOutlineButton`'s bare toggle) independent `aria-current`/`.dot` read-modify blocks in `applyPlanAttrs`, `buildTreeButton`, `applyTreeAttrs`, `buildOutlineButton`, `applyOutlineAttrs`. |
| `web/src/render/diagrams.ts` | edited | Minor 15: `rerenderDiagrams(body, theme, instance, isCurrent)` → `rerenderDiagrams(body, opts: DiagramPassOptions)`, the same options type `renderDiagrams` already took. |
| `web/src/features/reader.ts` | edited | Minor 15: `rerenderDiagrams` call site updated to the new options-object signature. |
| `web/src/render/rename.ts` | edited | Minor 3: `RenameEditorHandlers` gains `onEditingChange?: (editing: boolean) => void`; `open()`/`closeEditor()` call it instead of computing `container.closest(".thead")` and setting `draggable` themselves. `thead()` helper removed. |
| `web/src/render/mainhead.ts` | edited | Minor 3: `renderMainhead` gains a defaulted `isEditingName = false` parameter, read instead of `elements.nameEl.dataset["editing"]`. |
| `web/src/features/rename.ts` | edited | Minor 3: `RenameHandle` gains `isEditing(): boolean`, returning the mainhead editor's own `isEditing`. |
| `web/src/features/focus.ts` | edited | Minor 3: `FocusDeps` gains a `getRename()` thunk (same shape as `getSurfaces`/`getReader` — `rename` is constructed after `focus`, main.ts's init order); `renderView` passes `deps.getRename().isEditing()` into `renderMainhead`. |
| `web/src/main.ts` | edited | Minor 3: wires `getRename: () => rename` into `initFocus`'s deps. |
| `web/src/dom.ts` | edited | Minor 12 cleanup: `requireTemplate` removed — after the above, it had zero callers anywhere in `web/src` (`rg -n "requireTemplate" $(find web/src -name '*.ts' -not -name '*.test.ts')` showed only its own definition and two comments referencing it in prose). No test covers it (`web/src/dom.test.ts` doesn't exist). |
| `web/src/render/CLAUDE.md` | edited | Minor 1: new **Render-state rule** paragraph (a builder holds only its own instance's state, never state keyed across calls by an external key) and a `keyedreorder.ts` mention in the `insertBefore` gotcha (Major 4). See Decisions for the word-budget trim this forced. |
| `docs/features/rail/spec.md` | edited | `web:` glob gains `web/src/render/keyedreorder*.ts` (shared by rail/strip/grid; rail already hosts `render/actionbutton*.ts` on the same "shared, filed under one of its consumers" precedent from W6a). |
| `docs/features/usage/spec.md` | edited | `web:` glob gains `web/src/sessions/usage*.ts`. |
| `.claude/rules/rail.md`, `.claude/rules/usage.md`, `docs/features/rail/INDEX.md`, `docs/features/usage/INDEX.md` | regenerated | `make gen-kb` after the two spec.md glob edits. |

## Decisions

- Every Major 5/2/4, Minor 12/13/14/15/3/1 item this unit was assigned is done above;
  nothing was deliberately skipped.
- design: `sessions/usage.ts` for the bucket view-model, not `sessions/format.ts` (which
  already holds `GAUGE_WARN_THRESHOLD`/`formatResets`, both of which `sessions/usage.ts`
  now imports) — `rg -n "^export function build.*ViewModel|^export interface.*ViewModel"
  web/src/sessions/*.ts` before this unit showed exactly two hits, `card.ts` and
  `context.ts`, each a dedicated one-concept file with its own `render/` consumer. Matched
  that shape rather than growing the grab-bag formatter file.
- design: `render/keyedreorder.ts` as its own module rather than folding into
  `render/focuskeep.ts` — it's a distinct concern (DOM positioning vs. focus capture/
  restore) that *uses* `focuskeep.ts`'s `restoreFocusedControl`, matching how
  `render/dragreorder.ts` already sits beside `focuskeep.ts` as a user of it rather than a
  part of it.
- design: `CardOptions`/`CardListOptions` (exported) vs. `CardRenderOptions` (module-
  private) in `render/sessions.ts` — `CardRenderOptions` adds only `pinnedLast`, a value
  `reconcileCards` computes itself from the whole ordered list per session; no caller
  outside this module ever needs to supply it, so it stays unexported, same visibility
  rule the module already applied to `updateSessionCardContent`.
- `CardOptions`'s two callback fields are typed `T | undefined` explicitly, not just `T?`
  — under this repo's `exactOptionalPropertyTypes: true`, assigning an already-optional
  value (e.g. `render/tiles.ts`'s `StripOptions.onAction`) straight into a `field?: T`
  property is a type error; spelling the union out fixes it without a caller-side cast.
  Confirmed necessary from the actual `tsc` output before the fix:
  `src/render/tiles.ts(236,9): error TS2375: Type '{ ... onAction: (...) => void | undefined ...}' is not assignable to type 'CardListOptions' with 'exactOptionalPropertyTypes: true'`.
- `features/connection.ts`'s disconnect/reconnect focus memory is **not** folded into
  `render/focuskeep.ts`'s capture/restore-by-key shape (Minor 13 asked to fold it in
  "where semantics allow, else state why"): it remembers one element by raw identity
  across a status transition (not a container rebuild/reorder), holds it across
  arbitrarily many renders rather than one before/after pair, and its restore condition
  (`connectionrestore.ts`'s `shouldRestoreFocus`) depends on daemon-connectivity state
  `render/` cannot see. There is no key and no rebuild to capture/restore around — folding
  it in would mean inventing a key where the mechanism doesn't have one. Documented
  directly in `render/focuskeep.ts`'s header comment so the next reader doesn't wonder why
  a third focus-memory mechanism still exists.
- Minor 3's "hosts ask the controller whether it is editing" required threading
  `isEditing()` from `features/rename.ts`'s mainhead `RenameEditorController` through to
  `features/focus.ts`'s `renderMainhead` call — `rename` is constructed after `focus`
  (main.ts's init order, same as `surfaces`/`reader`), so this is a `getRename()` thunk on
  `FocusDeps`, matching the existing `getSurfaces`/`getReader` shape exactly rather than
  inventing a new pattern for one more later-constructed dependency.
- `render/tiles.ts`'s `TileRefs.rename` already existed (built by W1-era work, unrelated
  to this unit), so Minor 3's tile half needed no new plumbing — `updateTile` reads
  `refs.rename?.isEditing()` directly. The mainhead half needed the thunk above because
  `MainheadElements` (unlike `TileRefs`) never carried a reference to its rename
  controller.
- `render/rename.ts`'s `data-editing` DOM attribute is left in place (still written by
  `open()`/`closeEditor()`) even though `render/mainhead.ts`/`render/tiles.ts` no longer
  read it for the title-write-skip decision — nothing in Minor 3's text asks for its
  removal, and it may still serve as a CSS/debug hook. Only the *readers* changed.
- word-budget: `web/src/render/CLAUDE.md`'s hand-written body was already at 396/400
  words before this unit (`git show HEAD:web/src/render/CLAUDE.md | wc -w`-equivalent via
  the same `stripFragments` logic `make check-kb` uses). The Minor 1 render-state rule and
  the Major 4 `keyedreorder.ts` gotcha mention could not be added at their first-draft
  length (measured 648 words total, `make check-kb` failing with "648 words outside kb
  fragments (budget 400)") — both were repeatedly condensed, and the existing Owns
  paragraph and two Gotchas bullets (diagramdialog backdrop-close, reader tree/outline)
  were trimmed for wording economy (meaning preserved) to land at 393 words total,
  verified via `make check-kb` passing clean for this file afterward.
- `web/src/dom.ts`'s `requireTemplate` removal is a direct consequence of Minor 12's "one
  rule" (every template lookup happens once, in `features/`, passed into `render/`) —
  removing it is basic hygiene for dead code this unit's own change created, not a
  separate cleanup item; evidence pasted above (Changes table row).
- doc-delta: none — this plan has no `## Doc Delta` section (a hand-run multi-agent
  cleanup, not a `/plan-work`-generated plan); the two `docs/features/*/spec.md` glob
  edits above are registry housekeeping for new files, not a behavior-description change.

## Handoff

**Build status**: `npx tsc --noEmit` — **0 errors outside test files**; 48 errors confined
to three test files (all sanctioned breakage from this unit's signature changes, listed
below). `make web-build` therefore also fails at its `tsc` step (it type-checks tests
too) — the one break this role cannot fix itself. `make web-lint` is clean (242 files).
`make web-test`: 66/69 files passing, 1794/1852 tests passing; the 58 failures are all in
the same three files. `make check-kb`: 0 problems from this unit (2 remaining problems,
`internal/boundedwait/boundedwait.go` and `internal/server/bgloop.go`, are the concurrent
daemon track's files, outside `web/` and not touched here).
`python3 .claude/skills/orchestrate/scripts/dead-refs.py`: 914 references checked, 0
missing. `make size-warn`: only `web/src/render/reader.ts` (527 lines, threshold 500)
inside this unit's files — already accepted in the review's Note 6, and now *smaller*
than before this unit (544 lines after W6a) because Minor 14's helper extraction shrank
it; not something newly tripped, no `design:` line needed.

**Sanctioned test breakage — 3 files, 48 `tsc` errors, 58 runtime failures**, all
mechanical consequences of the signature changes above:

- **`web/src/render/sessions.test.ts`** (43 `tsc` errors / 28 runtime failures): every
  `reconcileCards(...)`/`renderSessions(...)` call site passes the old positional tail
  (`onClick, onAction, connected, draggable, pendingFocus, currentId, railActivity`).
  Fix is mechanical: replace the trailing positional arguments with one
  `CardListOptions`/`CardOptions` object literal using the same field names now exported
  from `render/sessions.ts`; `template` (already a positional 4th arg in most calls) is
  unchanged.
- **`web/src/render/tiles.test.ts`** (1 `tsc` error / 2 runtime failures): the `tsc`
  error is `renderStrip(el, [], new Date(), () => {})` at line 325 — needs a `template`
  argument and a `StripOptions` object (`{connected: true, railActivity: ...}` or
  similar) added. The 2 runtime failures are the `updateTile` describe block asserting
  the title-write-skip via a hand-set `nameEl.dataset["editing"] = "true"` on a bare
  fixture with no real `rename` controller (Minor 3 moved this decision from the DOM
  attribute to `refs.rename?.isEditing()`) — the fixture needs a fake
  `rename: { isEditing: () => true/false, ... }` satisfying enough of
  `RenameEditorController` for the two affected tests.
- **`web/src/render/masthead.test.ts`** (4 `tsc` errors / 28 runtime failures): imports
  `renderModelWeek`/`renderUsage`/`renderUsageTrack`/`UsageElements`, none of which this
  module exports anymore (Major 2/Minor 1). This is the largest rewrite: the
  `renderUsage`/`renderUsage + renderUsageTrack`/`renderUsageTrack` describe blocks
  (~40 tests) need `buildUsageBucket`/`renderUsageBucket` in their place (build once per
  test, or per `describe`, then assert via the returned refs' `.num`/`.bar`/`.resets`
  nodes); the two `renderModelWeek` describe blocks (~20 tests, including the whole
  "node reuse across render passes" cycle-1 regression suite) need to hold a
  `UsageModelWeekRefs` object across calls (`buildUsageModelWeek` once, then
  `renderUsageModelWeek(refs, ...)` per tick) instead of relying on same-`el` identity
  through a bare `renderModelWeek(el, ...)` call — the underlying reuse/rebuild contract
  those tests pin (same `<select>` node across an unchanged option list, a fresh one
  when it changes) is unchanged, only the call shape moved from "pass `el`, get internal
  caching" to "hold the refs yourself, call the render function on them".

No test file's *content* was edited — only production signatures changed. No changes
outside `web/`, `web/src/*/CLAUDE.md` and the two `docs/features/*/spec.md` `web:` globs
(plus their `make gen-kb` regeneration).

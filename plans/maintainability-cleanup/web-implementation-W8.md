# Web Implementation: Maintainability Cleanup — Unit W8 (implementation half)

**Plan**: maintainability-cleanup
**Mode**: initial
**Unit**: W8 web-impl half — review.maintainability.e-webui.md Major 6 (production types
shaped around test fixtures).
**Pack**: not run via `go run ./tools/kb pack` this unit (offline from the pipeline's kb
tooling in this session) — read directly: plan.md's W8 bullets, review.maintainability.e-
webui.md Major 6 in full, and the current tree (each named item re-checked against
post-W6a/W6b/W7 code via `rg`, since several had already shifted line numbers or moved
files).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/render/tiles.ts` | edited | `TileRefs.actsEl`/`rename`/`surfaceSegment` made required (every real tile from `buildTile` supplies all three); doc comments no longer cite `tiles.test.ts`; `updateTile` drops `refs.rename?.isEditing() ?? false` → `refs.rename.isEditing()`; `renderTileFooterActions`'s stale comment citing "TileRefs's other optional fields" removed. |
| `web/src/features/tiles.ts` | edited | Drops all `refs.actsEl`/`refs.rename?.`/`refs.surfaceSegment` optional-guards now that `TileRefs` requires them; replaces the deleted `installTileDrag` wrapper with a direct `installDragReorder(tilesGridEl, { itemSelector: "article.tile", handleSelector: ".thead", onMove })` call (this is the only production caller of the old wrapper). |
| `web/src/render/tiledrag.ts` | deleted | Thin wrapper over `render/dragreorder.ts` that existed only "so `tiledrag.test.ts` … keeps compiling" (its own header comment) — `features/rail.ts` already calls `installDragReorder` directly, confirming the wrapper had no other reason to exist. |
| `web/src/render/dragreorder.ts` | edited | Header/doc comments that named the now-deleted `tiledrag.ts`/`installTileDrag` rewritten to describe the history without a dangling path reference; `installDragReorder`'s doc comment now names its two real callers. |
| `web/src/render/mainhead.ts` | edited | `MainheadElements.surfaceSegment` made required (real caller `features/focus.ts` always supplies it); `renderMainhead`'s `surfaceState`/`activity` parameters lose their defaults (real caller always passes both) — `isEditingName`'s own default is untouched (its own doc comment cites Review Minor 3, not a test file, so it's outside Major 6's scope); the two `if (elements.surfaceSegment)` guards become unconditional calls; unused `DEFAULT_SURFACE_STATE` import dropped. |
| `web/src/render/dead.ts` | edited | `DeadSurfaceRefs.noticeEl` made required (`collectDeadSurfaceRefs` already threw if it was missing — the optionality only ever gated `showDeadSurfaceNotice`'s test-only early return, which is now gone). Also fixed the interface doc comment's stale reference to a non-existent `refsFromRoot` (the real function is `collectDeadSurfaceRefs`) — a pre-existing error in the comment I was already touching. |
| `web/src/render/sessions.ts` | edited | `CardOptions.onClick` made required (every real caller — `features/rail.ts`, `render/tiles.ts`'s `renderStrip` — always supplies it, confirmed by `rg`); `applyCardText`'s six per-slot `querySelector` + `if` guards, plus `updateSessionCardContent`'s `.acts-row` and `.pin` guards, and `buildSessionCardElement`'s own `.pin` lookup, converted to `requireElement` (`../dom`, the same "throw if the real template's markup is missing a slot" idiom `render/reader.ts`/`render/settings.ts` already use in `render/`) — `session-card-template` (index.html) always carries every one of these slots for both the rail card and the strip card. Stale comments citing `sessions.test.ts`'s "honest-empty-state" fixtures removed (the current fixture, `buildCardTemplateFragment` in `sessions.test.ts`, already builds every slot — the optionality had no fixture left actually needing it). Also fixed a stale `installTileDrag` reference in `CardListOptions.pendingFocus`'s doc comment (now names `features/tiles.ts`'s own `pendingTileFocus`, matching the dragreorder.ts rewrite above). |
| `web/src/render/update.ts` | edited | `UpdateViewModel.toggleChecked` removed — its own doc comment said `renderUpdateSection` never reads it (verified: true), and the toggle's DOM `.checked` is written directly from the `prefs` broadcast in `features/update.ts`, never from this field. `checkEnabled`'s doc comment's stray reference to `toggleChecked` repointed to `prefs.updateCheck`. |
| `web/src/features/updateview.ts` | edited | `buildUpdateViewModel` no longer builds/returns `toggleChecked`; its `prefs` parameter (only ever used to derive `toggleChecked`) removed along with the now-dead `updateCheck` local and the unused `Prefs` type import. |
| `web/src/features/update.ts` | edited | Updated the one production call site: drops the `currentPrefs` argument (and the now-write-only `currentPrefs` variable/assignment/`Prefs` import) — `updateSectionElements.toggle.checked = prefs.updateCheck` already covers the toggle's actual DOM write, unchanged. |
| `docs/features/tiles/spec.md` | edited | `web:` glob drops `web/src/render/tiledrag*.ts` (file deleted); `web/src/render/dragreorder.ts` needs no new entry — it's already claimed by `docs/features/rail/spec.md`'s glob (rail was already its other caller). |
| `.claude/rules/tiles.md`, `docs/features/tiles/INDEX.md`, `web/src/render/CLAUDE.md` | regenerated | `make gen-kb` after the spec.md edit. |

## Decisions

- Every REQ Major 6 named is done: `TileRefs` (actsEl/rename/surfaceSegment), `MainheadElements.surfaceSegment` + the two parameter defaults, `DeadSurfaceRefs.noticeEl` + the early return, `CardOptions.onClick` + the `applyCardText`/`.acts-row`/`.pin` slot guards, `tiledrag.ts` (deleted), `toggleChecked` (removed). No item was already gone from W6a/W6b/W7 — all six were still present, confirmed by `rg` before touching each (pasted per-file above).
- design: swept `applyCardText`'s sibling guards in the same function (`updateSessionCardContent`'s `.acts-row`/`.pin`, `buildSessionCardElement`'s `.pin`) even though the review's line citations (106-108, 251-253) anchor only on `applyCardText` and the class doc comment — they're the exact same "querySelector + `if`, defended against a fixture that no longer needs it" pattern in the same file, on the same always-present template slots (`sessions.test.ts`'s `buildCardTemplateFragment` builds all of them). Leaving them half-fixed would read as an incomplete pass to the next reader.
- design: reused `requireElement` (`web/src/dom.ts`) for `sessions.ts`'s newly-required slots rather than hand-rolled `if (!x) throw` — `render/reader.ts:146-154` and `render/settings.ts` already use this exact helper for the same "assert a real template's markup is complete" job inside `render/`. `rg -n "requireElement" web/src/render/*.ts --include='*.ts' | grep -v test` → `reader.ts` (9 call sites), confirming the precedent.
- deviation: none — `onAction?` on `CardOptions`/`StripOptions` is left optional. Both real callers (`features/rail.ts:98`, `features/tiles.ts:307`) do always supply it, but the review's Major 6 citation and its "no production comment names a test file as the reason" rule name only `onClick`; `onAction`'s optionality carries no test-file-attributed comment (`rg -n "optional (so|for|because)|for the same reason|so.*fixture|test-fixture|pre-plan.fixture|before this plan" web/src --include='*.ts' | grep -v '\.test\.ts:'` — the full sweep result is pasted below, and `onAction` is not among the hits), so it's out of this Major's scope. → not a plan deviation, a scope boundary.
- Full comment-pattern sweep (the task's "also sweep web/src non-test for any other comment of the form …" instruction), tree-wide, before fixes:
  ```
  $ rg -rniE "optional (so|for|because)|for the same reason|so.*fixture|test-fixture|pre-plan.fixture|before this plan" web/src --include="*.ts" | grep -v "\.test\.ts:"
  src/render/dropguard.ts:3:// and `drop`; before this plan nothing in `web/src/` did so outside the tile/rail reorder
  src/render/tiles.ts:36-49: (fixed, see above)
  src/render/dead.ts:26: (fixed, see above)
  src/render/mainhead.ts:28,30,58,60: (fixed, see above)
  src/render/sessions.ts:104,247: (fixed, see above)
  src/terminal/shellactivity.ts:175: (checked, see below — not test-fixture-driven)
  src/protocol/messages.ts:113: (checked, see below — not test-fixture-driven)
  src/sessions/card.ts:199: (checked, see below — not test-fixture-driven)
  ```
  Three hits investigated and left alone, with evidence:
  - `src/sessions/card.ts:196-199`: `buildCardViewModel`'s `mode` parameter defaults to `PREF_DEFAULTS.railActivity` "so every existing call site (and Vitest fixture) … keeps compiling". `rg -n "buildCardViewModel\(" web/src --include='*.ts' | grep -v test` shows three **real, production** call sites (`features/actionscopy.ts:11`, `render/tiles.ts:73`, `render/mainhead.ts:39`) that omit the third argument on purpose (they only want `repoLine`, not the activity-mode-dependent fields) — the opposite of Major 6's pattern (real callers *relying on* the default, not only a test fixture needing it). Left as-is.
  - `src/terminal/shellactivity.ts:175`: "for the same reason (W8's shape)" refers to a `NONE_ENTRY`/onset guard shared with `observeIdle`, not to this cleanup's W8 unit (the coincidence is just the label) — no test file is named as the reason. Left as-is.
  - `src/protocol/messages.ts:112-114`: "so a pre-plan payload (and every existing snapshot fixture that predates this field) round-trips unchanged" — a wire-compatibility default for parsing old daemon payloads, not a type shaped for a test fixture; the parallel fixture reference is incidental, not the reason. Left as-is.
- `render/dropguard.test.ts:5` (a test file, so not mine to edit) still says "the same minimal-fake-listener technique render/tiledrag.test.ts already established" — now a dangling reference once `tiledrag.test.ts` is deleted per this plan's W8 test-side bullet ("Delete tests that pinned only removed dead exports"). Flagged for the web-tests agent, not fixed here (test file).
- doc-delta: none for the plan's own Doc Delta section — this Major 6 fix is a maintainability-only, behaviour-unchanged cleanup; no feature spec prose describes any of these types' optionality.

## Handoff

**Build status**: `npx tsc --noEmit` — **0 errors in non-test files** (verified: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v '\.test\.ts'` → empty). `npm run build` (`tsc --noEmit && vite build`) fails at the `tsc` step only because of the sanctioned test-file breakage below — `npx vite build` run standalone (bypassing the tsc gate) succeeds cleanly, confirming the shipped bundle itself is unaffected: `✓ built in 1.83s`.

**Test files broken by this unit (sanctioned — required fixtures listed for the web-tests agent):**

| File | What breaks | What the fixture must now supply |
|------|------|------|
| `web/src/render/tiledrag.test.ts` | `Cannot find module './tiledrag'` | The whole file pins the deleted `installTileDrag` wrapper — delete the file; `render/dragreorder.test.ts` (if it exists) or a new test on `installDragReorder` itself is the module's actual coverage now. |
| `web/src/render/tiles.test.ts` | 9 call sites (lines 47,170,188,207,232,249,269,291,310,330) build a `TileRefs`-shaped object missing `actsEl`/`rename`/`surfaceSegment` | Every hand-built `TileRefs` fixture needs all three fields — an `actsEl` element, a `rename: RenameEditorController` (fakeable — the module already has one at line 291/310), and a `surfaceSegment: SurfaceSegmentRefs`. |
| `web/src/render/mainhead.test.ts` | Line 84: fixture object missing `surfaceSegment`; lines 131,141-143,152-153,169,179: `renderMainhead` called with 4 args, now needs 6 (`surfaceState`, `activity` no longer default) | Every fixture needs a `surfaceSegment: SurfaceSegmentRefs`; every `renderMainhead` call needs explicit `surfaceState`/`activity` arguments (e.g. `DEFAULT_SURFACE_STATE`, `"none"` — those constants are still exported from `terminal/surfaceswitch.ts`/typed as `ShellActivityIndicator`). |
| `web/src/render/dead.test.ts` | Lines 24,236,259: fixture object missing `noticeEl` | Every hand-built `DeadSurfaceRefs`/`fakeRefs()` needs a `noticeEl: HTMLElement`. |
| `web/src/render/sessions.test.ts` | Line 367: an options object typed with `onClick?` passed where `CardListOptions` now requires `onClick` | That one call site needs an explicit `onClick` callback (even a no-op) instead of omitting it. |
| `web/src/features/updateview.test.ts` | Line 55: `buildUpdateViewModel` called with 4 args, now takes 3; lines 81,87,201,206,564: assert `vm.toggleChecked` | Drop the `prefs` argument from every call; delete or rewrite the 5 assertions on the now-removed `toggleChecked` field (the toggle's checked-state behaviour itself is unchanged — it's driven directly by the `prefs` broadcast in `features/update.ts`, which this view-model never owned). |
| `web/src/render/update.test.ts` | Line 58: `buildUpdateViewModel` called with 4 args, now takes 3 | Drop the `prefs` argument. |

**Doc-side follow-up outside this agent's permitted scope** (web-impl may only touch `docs/features/*/spec.md` globs, not ADRs): `make check-kb` reports two ADR `files:` lists still naming the deleted `web/src/render/tiledrag.ts`:
- `docs/adr/tiles-drag-reorder-header-handle-insert-shift.md:9` — `files: [web/src/render/tiledrag.ts, web/src/features/tiles.ts]`
- `docs/adr/drop-reorder-drag-mime-custom-type.md:9` — `files: [web/src/render/dragreorder.ts, web/src/render/tiledrag.ts, web/src/render/dropguard.ts]`

Both need `web/src/render/tiledrag.ts` dropped from their `files:` list. This is the orchestrator's/doc-reconcile's call, not mine to edit.

**`make check-kb`** (after my `docs/features/tiles/spec.md` edit + `make gen-kb`): 3 problems remain — the two ADR entries above, plus `web/src/render/tiledrag.test.ts: owned by no feature`, which self-resolves once the web-tests agent deletes that file per the plan's own W8 test-side bullet.

**`make web-lint`**: clean (`Checked 245 files in 191ms. No fixes applied.`).

**`make size-warn`**: no new warnings on any file this unit touched.

**E2E smoke check**: not run — `make web-build build` (the required first step) fails at `web-build`'s `tsc` gate due to the sanctioned test-file breakage above, so the plan's own E2E specs never got to `npx playwright test`. This is a real, reported blocker (not routed around): the tree's tests won't compile again until the web-tests agent updates the fixtures listed above. `npx vite build` alone (bypassing tsc) confirms the actual shipped code bundles correctly in the meantime.

### Tails

`npx tsc --noEmit` (33 lines total, all in the 7 test files listed above; full list already given in the Handoff table; last line):
```
src/render/update.test.ts(58,51): error TS2554: Expected 3 arguments, but got 4.
```

`make web-lint`:
```
cd web && npm run -s lint
Checked 245 files in 191ms. No fixes applied.
```

`make web-build`:
```
cd web && npm run build

> muster-web@0.0.0 build
> tsc --noEmit && vite build

[... 33 lines, identical to the tsc --noEmit output above, all in the 7 sanctioned test files ...]
make: *** [web-build] Error 1
```

`npx vite build` (standalone, confirming the shipped bundle itself is unaffected):
```
✓ built in 1.83s
```

`make check-kb`:
```
go run ./tools/kb check
docs/adr/drop-reorder-drag-mime-custom-type.md: files entry "web/src/render/tiledrag.ts" matches no file
docs/adr/tiles-drag-reorder-header-handle-insert-shift.md: files entry "web/src/render/tiledrag.ts" matches no file
web/src/render/tiledrag.test.ts: owned by no feature (add it to a docs/features/<name>/spec.md glob)
kb: 425 records, 23 features, 3 problem(s)
kb: kb check: 3 problem(s)
exit status 1
make: *** [check-kb] Error 1
```

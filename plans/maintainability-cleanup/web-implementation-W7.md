# Web Implementation: Maintainability Cleanup — Unit W7 (web controllers)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: not run via `go run ./tools/kb pack` this unit (spawned directly by the team lead
with the finding text inline, not through `/orchestrate`) — read directly: plan.md's Rules
and § Units → W7, `review.maintainability.e-webui.md` in full (Major 3/7/8/9, Minor
4/6/7/10/11/16, the Seed check and Notes sections they reference), W6a's and W6b's own logs
(to avoid re-deriving their decisions and to see what render/tiles.ts, render/mainhead.ts,
render/dead.ts, terminal/surfaceswitch.ts and render/CLAUDE.md/terminal/CLAUDE.md already
look like after those units), and every file the findings name plus its siblings
(features/{focus,tiles,actions,theme,reader,surfaces,settings,update,launch,issue,shortcuts,
rename}.ts, render/{dead,tiles,mainhead,settings,update,actionerror}.ts,
terminal/{pane,drop,dropguard→dragreorder,surfaceswitch}.ts, `../shortcuts.ts`, `app.ts`,
`main.ts`, `doc.ts`, `reader/memory.ts`, `dom.ts`, features/CLAUDE.md, terminal/CLAUDE.md).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/surfaceswitch.ts` | edited | Major 3: new `surfaceBodyKind(selected, alive): "dead" \| "docs" \| "surface"` — the one DOM-free decision `features/focus.ts` and `features/tiles.ts` each re-derived, in a different branch order with inverted conditions. Added beside the file's existing `isSurfaceAttachable`, which already crosses the same `alive` + `selected` boundary — no new module. |
| `web/src/render/slotmount.ts` | created | Major 3: `mountSlotRoot(slot, root)` — the "mount this root, or empty the slot" idiom repeated at all four `firstElementChild !== root` sites (`rg -n "firstElementChild" web/src --glob '!*.test.ts'` before this unit: exactly `features/focus.ts` ×2, `features/tiles.ts` ×2, plus `render/keyedreorder.ts`'s unrelated own use — no existing shared helper). |
| `web/src/features/focus.ts` | edited | Major 3: `mountReader`/`mountTerminalSurface` call `mountSlotRoot`; `renderView`'s dead/docs/terminal branch replaced by one `surfaceBodyKind(surfaceState.selected, session.alive)` switch, shared with tiles.ts. Major 9: `FocusHandle.deadSurfaceRefs` (a raw field) replaced by `deadSurfaceRefsFor(id)`, which does the `view === "focus" && focusedId === id` check itself instead of leaving it to `actions.ts`. |
| `web/src/features/tiles.ts` | edited | Major 3: `renderTileBody` split into `renderReaderTileBody`/`renderSurfaceTileBody`/`renderDeadTileBody`, dispatched by the same `surfaceBodyKind`; the `isNewTile` force-mount flag dropped (a freshly built tile's `bodySlot` starts empty per its template — `grep -n "tbody-slot" web/index.html` shows `<div class="tbody-slot"></div>` — so `mountSlotRoot`'s own diff already mounts on the first pass). Major 9: `TilesHandle.bodySlotFor` replaced by `deadSurfaceRefsFor(id)`, which does the `.dead-surface` query itself. Minor 11: new `teardownTile(id)` replaces the tile-teardown body that was written out at the `sessionRemoved` handler and again in `dropTilesNotIn`; `renderView`'s two `renderStrip` calls (empty-dashboard vs. normal) collapsed into one, fed by a `stripSessions` variable that stays `[]` in the empty case. |
| `web/src/features/actions.ts` | edited | Major 9: `ActionsDeps.focusDeadSurfaceRefs`/`tileBodySlot` (the latter queried a tile's `.dead-surface` directly) replaced by `getFocusDeadSurfaceRefs(id)`/`getTileDeadSurfaceRefs(id)`, both `DeadSurfaceRefs \| null`; `findDeadSurfaceRefs` is now `deps.getFocusDeadSurfaceRefs(id) ?? deps.getTileDeadSurfaceRefs(id)` — no DOM query, no `collectDeadSurfaceRefs` import left in this file. Minor 10: `handleRemoved` no longer calls `forget(window.localStorage, id)`. |
| `web/src/reader/memory.ts` | edited | Minor 10: `forget`'s doc comment updated — it's called from `features/reader.ts`'s own `sessionRemoved` subscriber now, not `features/actions.ts`'s `handleRemoved`. |
| `web/src/features/reader.ts` | edited | Minor 10: added `forget(window.localStorage, id)` to the existing `sessionRemoved` handler. Major 8: `ReaderInstance`'s per-instance `MutationObserver` on `<html data-theme>` removed (field + constructor wiring + `dispose()`'s `disconnect()`); `handleThemeChange` made public, called by a new manager-level `app.on("themeChanged", ...)` that loops every instance — same call, new trigger. Minor 4: `ReaderDeps.tilesLive` → `getTilesLive` (naming consistency; see Decisions on why this one isn't a genuine forward-reference thunk). |
| `web/src/app.ts` | edited | Major 8: new `AppEvents.themeChanged: () => void`. |
| `web/src/features/theme.ts` | edited | Major 8: `initTheme(app: App)` — no `deps` at all. `applyAttributes` no longer calls `deps.surfaces.applyTheme()`; it calls `app.emit("themeChanged")` after writing the DOM attributes and the hint. |
| `web/src/features/surfaces.ts` | edited | Major 8: `SurfacesHandle.applyTheme()` removed; a new `app.on("themeChanged", ...)` re-themes every live surface instead. Minor 4: `SurfacesDeps.tilesLive` → `getTilesLive`. |
| `web/src/doc.ts` | edited | Major 8: `initTheme(app, { surfaces: { applyTheme() {} } })` → `initTheme(app)` — the fake no-op is gone; the reader's own `getTilesLive: () => []` renamed to match. |
| `web/src/render/settings.ts` | edited | Major 7: `SettingsDialogElements` loses `updateToggle`/`applyBtn`/`restartBtn`/`checkBtn`; `SettingsDialogHandlers` loses `onToggleUpdateCheck`/`onUpdate`/`onUpdateAndRestart`/`onCheckNow`; `setChecked` drops the `updateCheck` parameter. Minor 6: `setChecked`'s two hand-rolled "check the matching radio" loops replaced by `checkRadioValue` from `dom.ts`. |
| `web/src/features/settings.ts` | edited | Major 7: `initSettings(app: App)` — no `deps` at all (was `{ update: {...} }`, used only to relay Updates-section clicks). |
| `web/src/features/update.ts` | edited | Major 7: `UpdateHandle` interface removed; `initUpdate(app: App): void`. This module now wires its own toggle `change` / apply·restart·check `click` listeners directly, and writes `toggle.checked` itself from its own `prefs` subscription (INV-7, same discipline `render/settings.ts`'s radios use). |
| `web/src/render/update.ts` | edited | Comment-only: `UpdateViewModel.toggleChecked`'s doc comment updated — the `.checked` write now happens in `features/update.ts`'s own `prefs` handler, not through `settings.ts`'s `setChecked` (which no longer exists for this field). |
| `web/src/features/launch.ts` | edited | Minor 4: local inline deps type → exported `LaunchDeps`; `initLaunch`/`initLaunchModal` now return a `LaunchHandle` (`open`/`isOpen`/`navigateToParentDir`). Minor 6: local `checkRadio` deleted, all three call sites use `checkRadioValue` from `dom.ts`; `showError`/`showReposError`/`clearError` reuse `render/actionerror.ts`'s `renderActionError` instead of hand-writing `textContent`/`hidden`. Minor 7: the module's own `window` `keydown` listener (⌥⌘N, ⌘↑) removed entirely — `features/shortcuts.ts` now dispatches both through the returned handle. |
| `web/src/features/issue.ts` | edited | Minor 6: `showError`/`clearError` reuse `renderActionError` for both `#issue-error` and `#issue-error-detail`. |
| `web/src/features/shortcuts.ts` | edited | Minor 7: the one `window` `keydown` listener now also handles `"new-session"` and `"launch-parent-dir"`, dispatching through a new `deps.launch: { open, isOpen, navigateToParentDir }` — the exact `preventDefault`/open-guard ordering each case had in `launch.ts` is preserved (unconditional for new-session, guarded-then-preventDefault for launch-parent-dir). |
| `web/src/features/rename.ts` | edited | Minor 4: local inline deps type → exported `RenameDeps`. |
| `web/src/dom.ts` | edited | Minor 6: new `checkRadioValue(radios, value)` — the "check exactly the matching radio" idiom `features/launch.ts` and `render/settings.ts` each hand-rolled. |
| `web/src/render/actionerror.ts` | unchanged (reused) | Minor 6: `renderActionError` is now called from `features/launch.ts` and `features/issue.ts` too, not just `features/actions.ts`. |
| `web/src/terminal/dropwire.ts` | created | Minor 16: `DropSurface` interface (`hasTerminal`/`canPasteNow`/`pasteText`/`showNotice`/`focus`) + `installTerminalDrop(root, sessionId, surface)` — the whole drop feature (`isInternalDrag`/`handleDrop`/`locateAndPasteOne` and the three listeners) pulled out of `terminal/pane.ts`'s `TerminalSurface` constructor, matching `render/dragreorder.ts`'s/`render/dropguard.ts`'s `install*(root, ...)` shape. |
| `web/src/terminal/pane.ts` | edited | Minor 16: drop-handling methods removed; `canPasteNow` made public (was `private`) and a new public `hasTerminal()` added, so `TerminalSurface` satisfies `DropSurface` structurally; constructor calls `installTerminalDrop(this.root, this.sessionId, this)` instead of `this.installDropHandlers()`. New `terminalThemeColors()` helper replaces the xterm theme object literal that was built twice (constructor + `applyTheme()`). |
| `web/src/main.ts` | edited | Wiring updates for all of the above: `getFocusDeadSurfaceRefs`/`getTileDeadSurfaceRefs` (Major 9), `getTilesLive` ×2 (Minor 4), `initTheme(app)` (Major 8), `initUpdate(app)` with no capture (Major 7), `const launch = initLaunch(...)` captured and passed into `initShortcuts` (Minor 7), `initSettings(app)` with no deps (Major 7). |
| `web/src/features/CLAUDE.md` | edited | Minor 4: new Gotchas bullet stating the one `init<Name>(app, deps)` shape (named `<Name>Deps` interface, `get<Noun>` thunk naming, handle returned only when used). |
| `web/src/terminal/CLAUDE.md` | edited | Minor 16: new Gotchas bullet naming `dropwire.ts` and its `install*`-from-outside shape. |
| `docs/features/focus/spec.md` | edited | `web:` glob gains `web/src/render/slotmount*.ts` (shared by focus's main slot and tiles' body slot — filed under focus, the same "shared, filed under one of its consumers" precedent W6a used for `render/keyedreorder.ts` under rail). |
| `.claude/rules/focus.md`, `docs/features/focus/INDEX.md` | regenerated | `make gen-kb` after the spec.md glob edit. |

## Decisions

- Every Major 3/7/8/9 and Minor 4/6/7/10/11/16 item this unit was assigned is done above; nothing was deliberately skipped.
- design: `surfaceBodyKind` lives in `terminal/surfaceswitch.ts`, not a new module — that file already crosses the `SessionSurfaceState` + `alive` boundary for `isSurfaceAttachable`, so this is the same kind of pure decision beside its sibling, not a fresh seam.
- design: `render/slotmount.ts` as its own tiny module rather than folding into `render/focuskeep.ts` or `render/keyedreorder.ts` — it's a distinct concern (mount-or-empty a single slot vs. focus capture/restore vs. keyed multi-item reorder) with no shared state or algorithm; `rg -n "firstElementChild" web/src --glob '!*.test.ts'` before this unit found no existing helper for this exact idiom.
- design: `terminal/dropwire.ts` as a new file rather than adding to `terminal/drop.ts` — `drop.ts`'s header comment and terminal/CLAUDE.md's invariant both say pure modules here take no `HTMLElement`; the DOM/fetch installer needed a home that isn't pure, matching the existing `render/dragreorder.ts`/`render/dropguard.ts` `install*(root, ...)` shape cited by the finding itself.
- `features/tiles.ts`'s `isNewTile` parameter was dropped, not threaded through the new `renderTileBody`/`renderReaderTileBody`/`renderSurfaceTileBody` split — evidence: `grep -n "tbody-slot" web/index.html` shows the template's slot starts with no children, so `mountSlotRoot`'s own `firstElementChild !== root` diff is already true on a tile's first render pass, making the separate force-mount flag redundant. This is a genuine simplification, not a behaviour change — verified by `make web-test`'s clean pass on every file that exercises tiles (no test asserted on `isNewTile` directly; it was a private parameter).
- Minor 4's naming-rule scope: `ActionsDeps.getFocusDeadSurfaceRefs`/`getTileDeadSurfaceRefs` and `SurfacesDeps`/`ReaderDeps.getTilesLive` were renamed to match `getSurfaces()`/`getReader()`/`getRenameHandlers()`'s `get<Noun>` shape, per the finding's own grouping. Correcting `features/surfaces.ts`'s header comment while touching it: it claimed "`tiles` is constructed after `surfaces`", which is backwards — `main.ts`'s actual order is `tiles` (line 46) then `surfaces` (line 59); `tiles` itself holds the real forward-reference thunk (`getSurfaces: () => surfaces`), not the other way around. `SurfacesDeps.getTilesLive`/`ReaderDeps.getTilesLive` are therefore not genuine forward-reference thunks — `tiles` already exists when both are constructed — but keep the `get<Noun>` shape anyway for the naming consistency the finding asked for; the comment now says so honestly instead of repeating the wrong construction-order claim. `FocusDeps.promoteTile`/`getRenameHandlers` and similar were left as-is: `promoteTile` performs an action rather than fetching another controller's state/handle, so it keeps its own verb name under the same rule.
- `features/shortcuts.ts`'s `initShortcuts(_app: App, ...)` keeps the `_`-prefixed unused `app` parameter — `tsconfig.json`'s `noUnusedParameters: true` requires the underscore for a genuinely-unused leading parameter (TS's own exemption rule), and every sibling controller's first parameter is `app`, so dropping it would trade one inconsistency (an unused param) for a worse one (a different `init` arity). Not a fixable item under Minor 4's own text.
- Major 8's `applyAttributes()` now runs `writeThemeHint(...)` before `app.emit("themeChanged")`, where the original order was `deps.surfaces.applyTheme()` then `writeThemeHint(...)`. The two are independent, non-interacting side effects (one writes a `localStorage` hint read only by the next page load's `<head>` script; the other repaints already-attached DOM) — reordering them has no observable effect. Similarly, reader diagram re-renders move from asynchronous (a `MutationObserver` microtask) to synchronous (inside the same `emit` call) — this is the direct, intended effect of Major 9/8's "no `MutationObserver`" instruction, not an incidental side effect; the final DOM state after a theme change is unchanged either way.
- Minor 6's `render/actionerror.ts` function keeps its name (`renderActionError`) and file — the unit brief says "reuse `render/actionerror.ts`'s `renderActionError`", not rename it; `render/actionerror.test.ts`'s existing assertions needed no changes since the function's contract didn't change, only its callers.
- doc-delta: none — this plan has no `## Doc Delta` section (a hand-run cleanup, not a `/plan-work`-generated plan). The `docs/features/focus/spec.md` glob edit is registry housekeeping for a new file, not a behaviour-description change; the `render/update.ts` comment edit and `reader/memory.ts` comment edit are comment-accuracy fixes forced by Major 7/Minor 10, not doc-delta material.

## Handoff

**Build status**: `npx tsc --noEmit` — **0 errors outside test files**; 10 errors confined to
two test files (sanctioned breakage, listed below). `make web-build` therefore also fails at
its `tsc` step (it type-checks tests too) — the one break this role cannot fix itself.
`make web-lint`: clean, 245 files. `make web-test`: 68/70 files passing, 1851/1856 tests
passing; the 5 failures are all in the same two sanctioned files. `make check-kb`: 0
problems (425 records, 23 features). `python3 .claude/skills/orchestrate/scripts/dead-refs.py`:
1123 references checked, 0 missing. `make size-warn`: `web/src/features/launch.ts` (508
lines, was ~516 per W6a's note — this unit's own Minor 7/6 removals shrank it further, not
newly tripped) and `web/src/features/reader.ts` (627 lines, was 609 — already accepted in
the review's Note 6 as one cohesive stateful class; this unit's Major 8/Minor 10 additions
grew it a little, still the same accepted file, no split requested); `web/src/render/reader.ts`
(527 lines) is untouched by this unit.

**Sanctioned test breakage — 2 files, 10 `tsc` errors, 5 runtime failures**, both mechanical
consequences of the signature/field-name changes above:

- **`web/src/features/surfaces.test.ts`** (2 `tsc` errors / 2 runtime failures, lines 51 and
  74): `initSurfaces(app, { tilesLive: () => [] })` needs `tilesLive` renamed to
  `getTilesLive` at both call sites (Minor 4's naming-rule rename to `SurfacesDeps`) — no
  other change needed, the test's own assertions are unaffected.
- **`web/src/render/settings.test.ts`** (8 `tsc` errors / 3 runtime failures): Major 7 moved
  the Updates-section wiring out of `render/settings.ts` entirely. `fakeElements()` needs
  `updateToggle`/`applyBtn`/`restartBtn`/`checkBtn` removed (lines ~53–56, 63–66);
  `fakeHandlers()` needs `onToggleUpdateCheck`/`onUpdate`/`onUpdateAndRestart`/`onCheckNow`
  removed (lines ~79–82); the whole `"initSettingsDialog — Updates section wiring (plan
  auto-update, rail-card-improvements-2)"` describe block (lines ~170–194) should be
  deleted — that wiring now lives in `features/update.ts`, which has no direct unit test
  (same as `features/usage.ts`/`features/actions.ts`'s own controller-level code, covered by
  E2E instead); the two `controller.setChecked("dark", true, "prompt")`-shaped calls (lines
  200, 210) need the middle `updateCheck` boolean argument dropped, and the
  `expect(els.updateToggle.checked).toBe(true)` assertion at line 202 removed.

No test file's *content* was edited — only production signatures/field names changed. No
changes outside `web/`, `web/src/*/CLAUDE.md`, and the one `docs/features/focus/spec.md`
`web:` glob edit (plus its `make gen-kb` regeneration). Did not run the plan's own E2E specs
before handoff — this plan has no `test-specs.md`/E2E scope (frontmatter: "E2E Scope: none
— the existing suite ... is the oracle"), and the team lead's spawn message named the gates
above explicitly with no Playwright run requested.

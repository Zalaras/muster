# Maintainability review: maintainability-cleanup, web features/render/terminal

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 2 (a re-read after the W6a/W6b/W7/W8 fix wave, plus 59cd108)
**Pack**: `kb: pack 18894 words (budget 8000)`, sections rules 1938 · features 3683 · diagrams 4290 · decisions 6530 · proposed 0 · facts 2091 · lessons 354 · runbooks 2 (`--features launch,surfaces`)
**Scope**: `web/src/features web/src/render web/src/terminal`, which is now 59 non-test files (up from 45). I read all of them, plus `main.ts`, `dom.ts`, `app.ts` (the events), `sessions/card.ts`, the three directory `CLAUDE.md`s, and the `## Decisions` sections of `web-implementation-{W6a,W6b,W7,W8}.md`.

Nothing is Critical or Major this cycle. Of the 26 cycle-1 findings, 19 are fixed and 7 are partly fixed; the partial residue is Minor 1 to 5 below. The fresh read found 6 more Minors. They are all small, but every one is agent-tagged, so the verdict is `needs-changes`.

## Cycle-1 findings: verdicts

| Cycle-1 finding | Verdict | Evidence |
|---|---|---|
| Major 1: the resumable rule is written 5 times | **fixed** | `sessions/card.ts:83` `canResume` is the one predicate. `render/sessions.ts:93,100`, `render/tiles.ts:295`, `render/mainhead.ts:100` and `render/dead.ts:107` each read it, combined with `connected`. `rg "claudeSessionId !== null"` finds no copy left in `render/`. What remains is cosmetic: `sessions.ts:93` and `:100` still spell the same `connected && (label !== "Resume" \|\| canResume(…))` twice inside one function. |
| Major 2: two usage-bucket renderers | **fixed** | `sessions/usage.ts` `buildUsageBucketViewModel` feeds the one `render/masthead.ts:64` `renderUsageBucket`, which serves all three buckets. Refs are built once in `features/usage.ts:41-50`. |
| Major 3: Focus and Tiles re-derive the slot body | **fixed** | `terminal/surfaceswitch.ts:118` `surfaceBodyKind` is called from `features/focus.ts:221` and `features/tiles.ts:224`. `render/slotmount.ts:12` `mountSlotRoot` is used at `focus.ts:162,172,177,225` and `tiles.ts:180,187`. What remains is cosmetic: `focus.ts:212` still calls `mainSlotEl.replaceChildren()` where `mountSlotRoot(mainSlotEl, null)` does the same job, and the no-op cast `surfaceState.selected as SurfaceKind` survives at `focus.ts:170`. |
| Major 4: the keyed reorder is implemented twice, once in a controller | **fixed** | `render/keyedreorder.ts:27` serves `render/sessions.ts:374` and `features/tiles.ts:285`. The only DOM write left in the controller is the one-line `tilesGridEl.append` at `:266`, the 59cd108 fix. See "Layout-before-attach check" below. |
| Major 5: a ten-slot positional card parameter list | **fixed** for cards | `CardOptions`/`CardListOptions` (`render/sessions.ts:25-55`). The rail call at `features/rail.ts:85-105` and the strip call at `render/tiles.ts:236-250` pass named fields. One side effect: the `CardOptions` doc comment (`:19-24`) cites `renderMainhead(elements, …)` as an options-object sibling, but that function grew a seventh positional parameter in this wave (Minor 1). |
| Major 6: production types shaped around test fixtures | **partially** | The six cited sites are fixed: `TileRefs` fields are required, `DeadSurfaceRefs.noticeEl` is required, `tiledrag.ts` and `toggleChecked` are gone, and `applyCardText` uses `requireElement`. The same shape remains in three places. See Minor 1. |
| Major 7: the Updates buttons are split across two controllers | **fixed** | `features/update.ts:91-96` wires its own buttons. `initSettings(app)` takes no deps (`features/settings.ts:15`). `UpdateHandle` is gone. |
| Major 8: two mechanisms carry a theme change | **fixed** | `features/theme.ts:34` `app.emit("themeChanged")` reaches `features/surfaces.ts:229` and `features/reader.ts:599`. No `MutationObserver` remains. The payload still travels through the DOM (Note 3). |
| Major 9: actions reads other views' dead-surface markup | **partially** | `actions` no longer queries markup, and each view answers `deadSurfaceRefsFor`. It is still the router, though, so a Focus click goes focus → actions → focus and back. See Minor 2. |
| Minor 1: render-state rule and `modelWeekCache` | **fixed** | The render-state rule is stated in `render/CLAUDE.md`. `UsageModelWeekRefs` is caller-held (`features/usage.ts:43`). |
| Minor 2: pass-through wrappers and dead exports | **partially** | `updateSessionCardElement`, `refsFromRoot`, `renderEndDialogBody`/`renderRemoveDialogBody` and the settings return value are gone, and `updateTile` now adds `isEditing`. New in this wave: `buildSessionCardElement` is exported with no caller outside its file. See Minor 3. |
| Minor 3: rename state exposed through `data-editing`, and `.thead` reached from inside the editor | **partially** | Hosts now ask `isEditing()` (`render/tiles.ts:186`, `features/focus.ts:207`), and `.thead` comes in through `onEditingChange` (`render/tiles.ts:169`). But `data-editing` is still written (`render/rename.ts:69,116`) with no reader, and the mainhead half added a new `getRename` edge. See Minor 3 and Minor 7. |
| Minor 4: the 16 controllers' `init` shapes diverge | **partially** | 10 named `*Deps` interfaces, and the rule is written in `features/CLAUDE.md`. Still divergent: `initViews` types its deps inline, and `get<Noun>` thunks point at earlier controllers. See Minor 4. `_app` is kept with a sound reason (W7 Decisions: `noUnusedParameters`). |
| Minor 5: hand-formatted `console.error` sites | **fixed** | `rg -n console.error features render terminal` returns nothing. `http.ts` `logApiFailure` owns the logging. |
| Minor 6: hand-rolled DOM idioms | **fixed** | `renderActionError` is used by `features/launch.ts:144-160` and `features/issue.ts:98-106`. `dom.ts:31` `checkRadioValue` is used by `features/launch.ts:114,128` and `render/settings.ts:71-72`. |
| Minor 7: two keydown listeners | **fixed** | The one listener is at `features/shortcuts.ts:21`, and it reaches `deps.launch` for both chords. |
| Minor 8: no stale-response guard on surface select | **fixed** | The per-id `selectRequestId` is at `features/surfaces.ts:77,134-146`. |
| Minor 9: the visible-ids rule is duplicated | **fixed** | `sessions/live.ts` `visibleIds` is called from `features/surfaces.ts:161` and `features/reader.ts:517`. |
| Minor 10: actions forgets reader memory | **fixed** | Only `features/reader.ts:613` calls `forget`. `rg localStorage` shows reader.ts only. |
| Minor 11: tiles teardown and strip call repeated | **fixed** | `teardownTile` at `features/tiles.ts:116`, and one `renderStrip` at `:313`. |
| Minor 12: three template-lookup styles | **fixed** | `rg "getElementById\|requireTemplate" render terminal` finds comments only. Every template comes from a controller. |
| Minor 13: three focus-preservation implementations, and a name collision | **fixed** | `render/focuskeep.ts` holds one capture/restore primitive pair with two flavours. The reason connection's memory stays separate is stated in its header (`:27-33`) and holds. |
| Minor 14: aria-current and dirty-dot toggles written out repeatedly | **fixed** | `setAriaCurrent`/`setDirtyDot` at `render/reader.ts:222,232`. |
| Minor 15: two option shapes in `diagrams.ts` | **fixed** | Both functions take `DiagramPassOptions` (`render/diagrams.ts:66,111`). |
| Minor 16: drop code in `pane.ts`, xterm theme built twice | **partially** | `terminal/dropwire.ts` with `DropSurface` was added, and the theme is built once by `terminal/pane.ts:37` `terminalThemeColors`. But the install still runs inside `TerminalSurface`'s constructor (`pane.ts:122`), which is the thing the new `terminal/CLAUDE.md` gotcha forbids. See Minor 5. |
| Minor 17: segment DOM builder lives in `terminal/` | **fixed** | The builder is `render/surfaceseg.ts`. `terminal/surfaceswitch.ts` keeps the reducer. |
| Note 1: plan and requirement IDs in comments | **mostly fixed** | 10 run-specific IDs and 53 plan-section citations remain. See Minor 11. |
| Note 2: render-phase numbers and stacked doc comments | **not fixed** | `features/rail.ts:83` says "Render phase 8", but `main.ts` numbers rail 9. The stacked doc comments at `features/actions.ts:84-87` are still there. See Minor 11. |
| Note 4: `check()` does not render | **fixed** | `features/update.ts:64,71`. |
| Note 7: `notice.ts` called pure | **not changed** | It still owns a module-level `WeakMap` of timers (`terminal/notice.ts:31`), while `terminal/CLAUDE.md:11` lists it among the pure modules. No change is requested. |
| Notes 3, 5, 6, 8 | no change requested | Note 6: the size reasons still hold (see the Files table). |
| Seeds B4–B11 | **fixed** | B4: `isRailDensity`/`isRailActivity` are imported from `protocol/prefs`, `pad2` from `sessions/format`, and `render/reader.ts:147-171` uses `requireElement(sel, root)`. B5: `ConnectionStatus` is in `app.ts`, `DRAG_MIME` in `dragmime.ts`, and `SessionAction` in `sessions/card.ts`. B6: `pane.ts` imports `wsUrl` from `../ws`. B7: six `features/*` decision files. B8: `loadPane` is in `features/actions.ts:30`. B9: `render/launch.ts`, `render/settings.ts` and `render/issue.ts`, with the reason for keeping `initIssueDialog` and `initLaunchModal` in `features/` (they own network calls and state), which holds. B10: `render/focusview.ts`. B11: `render/actionbutton.ts`. |

## Layout-before-attach check (the 59cd108 class)

```
$ rg -n "getBoundingClientRect|offset(Top|Height|Width|Left)|scroll(Top|Left|Height|Width|IntoView|To)\b|clientHeight|clientWidth|\.fit\(\)|refit\(" features render terminal --glob '!*.test.ts'
render/diagramdialog.ts:56,57,66,141   (open dialog only)
render/reader.ts:508,511,530,531       (scroll spy / outline click — mounted reader only)
render/crumbs.ts:55                    (launch dialog nav, static markup)
terminal/pane.ts:228,309,312           (refit on socket open / on call)
features/tiles.ts:188                  surface.refit()
features/focus.ts:187                  surface.refit()
```

Only the two `refit()` calls were reordered by this wave:

- **`focus.ts:187`.** Its sequence (mount, then NBSP reserve, then refit) is unchanged from `main`, and `#main-terminal-slot` is static markup that is always attached.
- **`tiles.ts:188` on an existing tile.** The tile is already in the grid when the call runs.
- **`tiles.ts:188` on a new tile.** 59cd108 appends the tile before the call.

On `main`, the tile moved into position before `renderTileBody`. Now it refits at its old or appended slot, and `reconcileKeyedOrder` positions it afterwards. That makes no difference, because the grid is uniform: `style.css:1688-1694` is `1fr` columns and rows, with no position-dependent spans. `reconcileCards` builds new cards detached, as it did on `main`, and nothing in a card measures layout. No other layout-dependent call now runs before attachment.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| features/actions.ts | focus.ts, tiles.ts, main.ts | n/a (edited) | — | Minor 2, 11 |
| features/actionscopy.ts | connectionrestore.ts, updateview.ts, render/confirm.ts | yes (W6a) | — | pass |
| features/connection.ts | connectionrestore.ts, render/focuskeep.ts | — | — | Minor 11 |
| features/connectionrestore.ts | features/* decision files | yes (W6a) | — | pass |
| features/connectionversion.ts | render/masthead.ts | yes (W6a) | — | pass |
| features/focus.ts | tiles.ts, rename.ts, render/focusview.ts, render/mainhead.ts | n/a | — | Minor 2, 7, 8 |
| features/issue.ts | launch.ts, render/issue.ts | n/a | — | Minor 10, 11 |
| features/launch.ts | render/launch.ts, render/crumbs.ts, launchrestore.ts | n/a | filelen 504: the reason holds (W6a; one dialog's state machine) | Minor 11 |
| features/launchcrumbs.ts | render/crumbs.ts | yes (W6a) | — | pass |
| features/launchrestore.ts | launch.ts | yes (W6a) | — | pass |
| features/rail.ts | tiles.ts, views.ts, render/masthead.ts | n/a | — | Minor 8, 11 |
| features/reader.ts | surfaces.ts, theme.ts, render/reader.ts | n/a | filelen 620: the reason holds (cycle-1 Note 6; still one instance class plus manager) | Minor 4 |
| features/rename.ts | tiles.ts, focus.ts, render/rename.ts | n/a | — | Minor 7 |
| features/settings.ts | render/settings.ts, update.ts | n/a | — | pass |
| features/shortcuts.ts | launch.ts, views.ts | n/a | — | pass |
| features/surfaces.ts | tiles.ts, reader.ts, terminal/pane.ts | n/a | — | Minor 4, 11 |
| features/theme.ts | surfaces.ts, reader.ts | n/a | — | Minor 11, Note 3 |
| features/tiles.ts | focus.ts, render/tiles.ts, render/keyedreorder.ts | n/a | — | Minor 2 |
| features/update.ts | updateview.ts, render/update.ts | n/a | — | Minor 11 |
| features/updateview.ts | render/update.ts | yes (W6a) | — | pass |
| features/usage.ts | render/masthead.ts | n/a | — | pass |
| features/views.ts | every features/*.ts init | n/a | — | Minor 4 |
| render/actionbutton.ts | sessions.ts, tiles.ts | yes (W6a) | — | Minor 1 |
| render/actionerror.ts, banner.ts, context.ts | each other | n/a | — | pass |
| render/confirm.ts | update.ts, settings.ts | n/a | — | pass |
| render/crumbs.ts | render/launch.ts | n/a | — | Note 5 |
| render/dead.ts | tiles.ts, mainhead.ts, terminal/notice.ts | n/a | — | Minor 9, Note 4 |
| render/diagramdialog.ts, diagrams.ts, mermaid.ts | render/reader.ts | n/a | — | pass |
| render/dragreorder.ts, dropguard.ts | terminal/dropwire.ts | n/a | — | pass |
| render/focuskeep.ts | keyedreorder.ts, reader.ts, features/connection.ts | yes (W6b) | — | pass |
| render/focusview.ts | features/focus.ts | yes (W6a) | — | Minor 8 |
| render/frontmatter.ts | render/reader.ts, render/mermaid.ts | yes (W6a) | — | pass |
| render/issue.ts | render/settings.ts, render/launch.ts | Changes table (W6a) | — | Note 4 |
| render/keyedreorder.ts | sessions.ts, features/tiles.ts | yes (W6b) | — | pass |
| render/launch.ts | render/crumbs.ts, features/launch.ts | yes (W6a) | — | Minor 1, Note 5 |
| render/mainhead.ts | tiles.ts, dead.ts, focusview.ts | n/a | — | Minor 1, 9 |
| render/masthead.ts | features/usage.ts, render/context.ts | n/a | — | pass |
| render/reader.ts | focuskeep.ts, frontmatter.ts | n/a | filelen 532: the reason holds (cycle-1 Note 6) | pass |
| render/rename.ts | tiles.ts, mainhead.ts | n/a | — | Minor 3, 11 |
| render/sessions.ts | tiles.ts, keyedreorder.ts, actionbutton.ts | yes (W6b CardOptions) | — | Minor 1, 3 |
| render/settings.ts | confirm.ts, update.ts | Changes table (W6a) | — | pass |
| render/slotmount.ts | keyedreorder.ts, focuskeep.ts | yes (W7) | — | Minor 11 |
| render/surfaceseg.ts | terminal/surfaceswitch.ts | yes (W6a) | — | pass |
| render/tiles.ts | sessions.ts, dead.ts, mainhead.ts | n/a | — | Minor 1, 9 |
| render/update.ts | confirm.ts, features/updateview.ts | n/a | — | Minor 11 |
| terminal/drop.ts, dropwire.ts | render/dragreorder.ts, render/dropguard.ts | yes (W7) | — | Minor 5, 11 |
| terminal/notice.ts | render/dead.ts, pane.ts | n/a | — | Minor 11 |
| terminal/overlay.ts, shellactivity.ts, shellkeys.ts | pane.ts | n/a | — | pass |
| terminal/pane.ts | dropwire.ts, notice.ts | n/a | — | Minor 5, 11 |
| terminal/surfaceswitch.ts | render/surfaceseg.ts | yes (W7, surfaceBodyKind) | — | Minor 11 |

## Issues

### Critical
None.

### Major
None.

### Minor

1. **[web-impl][web-tests]** Major 6's fixture-shaped optionality survives in three places. Each one lets a newcomer conclude that a real caller can omit the value, which is exactly what Major 6 asked to end ("every field every real caller supplies is required"; § Design "One owner per concept").
   - **`onAction` is optional on six signatures**, but every real caller supplies it. The signatures are `CardOptions.onAction` (`render/sessions.ts:31`), `reconcileActsRow` (`:80`), `StripOptions.onAction` (`render/tiles.ts:209`), `renderTileFooterActions` (`:272`), `mountTileDeadSurface` (`:345`) and `buildActionButton` (`render/actionbutton.ts:23`). `rg -n onAction features` shows the only callers, `features/rail.ts:98`, `features/tiles.ts:314` and the dispatch passed at `features/tiles.ts:207,275`, always pass `deps.actions.dispatch`. The `exactOptionalPropertyTypes` comment at `render/sessions.ts:27-30` exists only to forward that optionality. W8 Decisions scoped `onAction` out because no comment named a test file. That is not the test Major 6 set.
   - **`renderMainhead`'s `isEditingName = false` default** (`render/mainhead.ts:67`) was added in W6b. The only production caller, `features/focus.ts:207`, always passes it. The default exists because `render/mainhead.test.ts:156-178` calls with six arguments. It is also a seventh positional parameter on a builder whose siblings take objects, as the `CardOptions` doc comment at `render/sessions.ts:19-24` claims `renderMainhead` does.
   - **Optional slot guards on templates that always carry the slots.** `render/tiles.ts:74-111` `updateTileChrome` has `if (dot)`, `if (nameEl …)`, `if (where)`, `if (ctx)` and `if (timer)`, while `buildTile` in the same file throws on a missing slot (`:139`). `render/launch.ts:21-26,74-75` does the same with `if (name)`/`if (branch)`/`if (age)`/`if (nm)`. W8 swept exactly this pattern out of `render/sessions.ts` using `requireElement(sel, root)`.

   **A fix must make true:** every callback and flag every production caller passes is required, the fixtures supply it, and template slots that `buildTile` or the templates guarantee are read with `requireElement`, as `applyCardText` does.

2. **[web-impl]** The Major 9 residue: `actions` is still the router for dead-surface refs, although it now has nothing to route. There are three hops for each view:
   - The Focus mainhead segment calls `deps.actions.findDeadSurfaceRefs(id)` (`features/focus.ts:85`).
   - That calls `deps.getFocusDeadSurfaceRefs`, which is `main.ts:41`'s thunk to `focus.deadSurfaceRefsFor`. So it is back in focus, which already holds `deadSurfaceRefs` (`:101`).
   - Tiles does the same round trip through `main.ts:42` (`features/tiles.ts:261` → `actions.ts:202-204` → `tiles.deadSurfaceRefsFor`).

   The chain is equivalent to each view passing its own lookup to `select`. In Focus view, `focus.deadSurfaceRefsFor` answers and the tile lookup is never consulted. In Tiles view, `focus` answers `null` (`focus.ts:251`). The seam costs `ActionsDeps` (`actions.ts:37-42`), `ActionsHandle.findDeadSurfaceRefs`, the `findDeadSurfaceRefs` member of both `FocusDeps.actions` and `TilesDeps.actions`, and two `main.ts` thunks. This breaks § Design "One owner per concept" (focus asks actions for focus's own refs). **A fix must make true:** each view hands `surfaces.select` its own dead-refs lookup, and `actions` carries no dead-surface API or deps.

3. **[web-impl]** Minor 2 and Minor 3 left dead state and dead exports behind:
   - `render/sessions.ts:241` exports `buildSessionCardElement`, but its only caller is `:361` in the same file. Its parameter type `CardRenderOptions` (`:59`) is module-private, so no outside caller could build its argument. The export sweep (`rg -l -w buildSessionCardElement src e2e --glob '!*.test.ts'`) returns only `render/sessions.ts`.
   - `render/rename.ts:69,116` still writes `container.dataset["editing"]`. `rg -n 'data-editing|dataset\["editing"\]' src e2e index.html` shows no reader outside the writer: no CSS, no e2e, no source. What it does return is five comments explaining that nothing reads it any more (`features/rename.ts:18`, `features/focus.ts:57`, `render/mainhead.ts:66`, `render/tiles.ts:87,183`). W6b kept it because it "may still serve as a CSS/debug hook", but the grep shows no such hook.

   **A fix must make true:** every export in `render/` has a caller outside its file (or a test that needs it), and a DOM attribute is written only if something reads it.

4. **[web-impl]** The Minor 4 residue: the `init` rule that `features/CLAUDE.md` now states ("`deps` is always a named exported `<Name>Deps` interface … a thunk reaching a controller constructed later is named `get<Noun>`") is broken in four places:
   - `features/views.ts:30-33` `initViews(app, deps: { focus: ViewRenderer; tiles: ViewRenderer })` types its deps inline. It is the only one of the eleven controllers with deps that does.
   - `SurfacesDeps.getTilesLive` (`features/surfaces.ts:48`), `ReaderDeps.getTilesLive` and `ReaderDeps.getSurfaces` (`features/reader.ts:45-46`) are thunks with `get` names that point at controllers constructed **before** them. `main.ts:46` builds `tiles` and `:59` builds `surfaces`, both ahead of `reader` at `:60`. The header at `features/surfaces.ts:7-10` concedes this. The sibling for an earlier controller is a real value: `RailDeps.surfaces` (`features/rail.ts:20`) and `FocusDeps.promoteTile: tiles.promote` (`main.ts:53`).

   A newcomer who reads `get<Noun>` as the rule defines it will look for a construction cycle that does not exist. **A fix must make true:** every controller declares a named `<Name>Deps`, and a `get<Noun>` thunk exists only for a later-constructed controller.

5. **[web-impl]** The Minor 16 residue: `terminal/dropwire.ts` is installed from **inside** `TerminalSurface`'s constructor (`terminal/pane.ts:119-122`, `installTerminalDrop(this.root, this.sessionId, this)`). Meanwhile the `terminal/CLAUDE.md:20` gotcha this wave added says drop wiring "attaches to a surface from outside … never built into `TerminalSurface`'s own constructor", and the comment at `pane.ts:119` reads "Installed from outside". The precedents W7 cites are installed by their owners: `render/dragreorder.ts` by `features/rail.ts:73` and `features/tiles.ts:157`, and `render/dropguard.ts` by `main.ts`. So `pane.ts` still imports the drop feature (`:12`), and through it `api/terminal`. A newcomer who follows the directory rule reads the code as violating it. **A fix must make true:** the drop wiring is installed by the one owner that constructs surfaces (`features/surfaces.ts:212`), and `pane.ts` does not import `dropwire.ts`. If that is not done, the gotcha and the comment must say where the wiring really sits.

6. **[web-impl]** Render text composition diverges from the rule `render/CLAUDE.md` restated in this wave ("a builder here takes the computed value, never the raw data"; conventions § Composition roots bullet 4). W6a moved the B7 list, but it left text derivations of the same shape in `render/`, each taking a raw `Session`:
   - `render/mainhead.ts:36-41` `mainheadMeta`: one controller caller, `features/focus.ts`
   - `render/tiles.ts:106-111`: the dead-tile timer wording choice
   - `render/tiles.ts:294`: `✕ ended …`
   - `render/dead.ts:80-103`: the endbar and cap copy (two hosts, so under the rule it belongs in `sessions/`)

   **A fix must make true:** these strings come from a `sessions/` view-model, or from a `features/` decision for a single caller, like `features/actionscopy.ts`. The alternative is for the rule to name the exception.

7. **[web-impl]** The mainhead's rename editor is owned by a different controller from the heading it edits, and the Minor 3 fix deepened that loop:
   - `features/rename.ts:39` attaches the editor to `deps.focus.nameEl`. That is the only DOM node handed from one controller to another (`FocusHandle.nameEl`, `features/focus.ts:67`).
   - `rename.ts:53-56` subscribes the editor's cancels.
   - Focus then asks back through the new `FocusDeps.getRename` thunk (`focus.ts:58,207`) whether its own heading is being edited.

   The sibling host does all of this itself. `render/tiles.ts:166` attaches each tile's editor in `buildTile`, using only the handlers `rename` supplies (`getRenameHandlers`), and `features/tiles.ts:124-125` subscribes those editors' cancels. Mainhead and tiles are two hosts of one editor (kb:adr/rename-muster-owned-title-override-wins, "one shared editor module serves both"), wired in two different shapes. This breaks § Design "Match the siblings" and features/CLAUDE.md "Owns" ("looks up its elements, attaches listeners"). **A fix must make true:** the mainhead's host attaches and cancels its own editor with `rename`'s shared handlers, like a tile does. Then no DOM node crosses controllers and `rename` exposes no `isEditing`.

8. **[web-impl]** Controllers write DOM that a sibling `render/` builder already owns:
   - **Sizenote.** It is written by `render/focusview.ts:21` `renderSizenote` and also directly at `features/focus.ts:183-186` (the NBSP reserve).
   - **Focus main slot's `hidden`.** It is written in five places across two modules: `render/focusview.ts:15` and `features/focus.ts:161,176,211,224`. `renderFocusMain`'s write only survives the no-surface branch.
   - **Rail density segmented control.** Its `aria-pressed` loop is hand-rolled in `features/rail.ts:111-116`, while the identical Focus/Tiles and 2×2/3×2 controls render through `render/masthead.ts:109,122` (`renderViewSwitcher`/`renderDensityControl`) from `features/views.ts`.

   This breaks conventions § Composition roots bullet 3 and § Design "One owner per concept". **A fix must make true:** each of these elements has one writer, and it is in `render/`.

9. **[web-impl]** `render/dead.ts:121` `showDeadSurfaceNotice(refs, text)` is now exactly `showNotice(refs.noticeEl, text)`. Its early return, the only behaviour it added, was removed in W8. `render/tiles.ts:338` `mountTileDeadSurface` also has a seven-slot positional list with an optional trailing callback, the shape Major 5 retired for cards. This breaks Minor 2's cycle-1 rule, "a wrapper exists only when it adds behaviour", and § Design "Match the siblings". **A fix must make true:** the notice is shown through `terminal/notice.ts` directly, or the wrapper does something, and the dead-tile mount takes named options like `renderStrip` does.

10. **[web-impl]** The shape of `features/` is now undocumented and split two ways:
    - W6a created six `<owner><concern>.ts` decision files: `actionscopy`, `connectionrestore`, `connectionversion`, `launchcrumbs`, `launchrestore` and `updateview`.
    - Same-kind DOM-free decisions stay inline in their controllers: `features/issue.ts:58-84` (`composeNoteSection`, `composePreview`, `formatCaptureTime`, `formatErrorDetail`), `features/reader.ts:60` `parseStandaloneQuery` and `:515` `visibleDocsIds`, and `features/launch.ts:75` `checkedValue`.
    - `features/CLAUDE.md:3` "Owns" still says "one controller per feature … Pure logic lives in `sessions/` or `terminal/`". That contradicts both the directory's contents and the conventions sentence the wave added.
    - W6a's `design:` line explains the names, but not when a decision gets its own file.

    This breaks § Design "Match the siblings". **A fix must make true:** one rule says when a single-caller decision becomes its own file, the code follows it, and the "Owns" line describes what the directory holds.

11. **[web-impl]** Comments added or left by this wave narrate history or cite this run. This breaks conventions § Comments ("don't narrate history"; cite `kb:` records). Some are now false, which is `review-work`'s class, flagged here at the lead's request.
    - **This run's IDs and finding tags:**
      - `render/slotmount.ts:4` "before this unit"
      - `render/rename.ts:28` "the finding objects to"
      - `features/connection.ts:72` "(R1)"
      - `terminal/pane.ts:112` "Plan file-drop-fix", and `:262` "── file-drop-fix:"
      - `terminal/drop.ts:100` "(web-tests fix attempt 1)", and `:64` "per the plan's Testable UI Elements table"
      - `terminal/surfaceswitch.ts:36` "User flow 2/3"
      - plus 53 plan-section citations ("UI Specifications", "Testable UI Elements", `States: "…"`) across 31 files. The count is from `rg -c` over the scope.
    - **History narration.** `rg -i "used to|no longer|moved (out|to|from|here)|split out of|replacing the|before this unit|this unit"` over the scope counts 57 matches in 35 files. The wave's own include:
      - `render/keyedreorder.ts:3-6`, `render/sessions.ts:69-70,370-373`, `render/tiles.ts:119-122`
      - `render/masthead.ts:55-57,158-160`, `render/mainhead.ts:71-81`, `render/rename.ts:26-29`, `render/dead.ts:6-10`
      - `features/theme.ts:1-8`, `features/update.ts:1-6`, `features/shortcuts.ts:4-6`, `features/surfaces.ts:226-228`
      - `features/reader.ts:386-389,611-612`, `features/tiles.ts:88-89,112-115,294-295`, `features/rail.ts:28-29`, `features/usage.ts:38-40`
      - `terminal/dropwire.ts:1-3`, `terminal/pane.ts:36,119-122,262-265`
    - **Now false:**
      - `features/update.ts:36`: "render/update.ts's `CheckState` doc comment". It lives in `features/updateview.ts:24`.
      - `render/update.ts:51`: "see the field's own doc comment". `toggle` has none since `toggleChecked` went.
      - `terminal/pane.ts:340-342`: "Called … by `features/surfaces.ts`'s `applyTheme()`, itself invoked by `features/theme.ts`". It is now the `themeChanged` subscriber at `surfaces.ts:229`.
      - `features/theme.ts:21-22`: "re-themes every live terminal surface in place". It only emits.
      - `terminal/notice.ts:17-22`: "Only `terminal/pane.ts` ever passes `"inflight"`". It is `dropwire.ts:58`.
      - `render/rename.ts:3`: "modelled on features/settings.ts's controller shape". That shape is `render/settings.ts`.
      - `features/issue.ts:81-82`: "render/confirm.ts's session label". It is `features/actionscopy.ts:9`.
      - `features/surfaces.ts:59-61`: "`render/mainhead.ts` … reads this". It is `features/focus.ts:199`.
      - `features/focus.ts:77`: "main.ts dispatches focus vs. tiles". It is `features/views.ts`.
      - `features/launch.ts:448`: "its two open buttons". There is one.
      - `features/rail.ts:83`: "Render phase 8". `main.ts` numbers it 9.
    - **Orphaned stacked doc comments:** `features/actions.ts:84-87` (cycle-1 Note 2) and `features/launch.ts:447-459` (the `initLaunch` doc sits above `LaunchDeps`).

    **A fix must make true:** no comment in scope cites a plan, unit, finding or attempt, narrates a move, or names a symbol or location that no longer holds. Each doc comment sits on the declaration it describes.

### Notes

1. **[note]** For `review-work`'s registry and DIAG row: `kb for web/src/render/slotmount.ts` names only `focus`, but `features/tiles.ts` uses the module too. `kb for web/src/render/keyedreorder.ts` names only `rail`, but it also serves the strip and the Tiles grid. W6a's decisions line lists `drop` under "Features" in `render/CLAUDE.md`, but that line lacks `settings`, `issue` and `surfaces`, which now have files in `render/` (`settings.ts`, `issue.ts`, `surfaceseg.ts`). The `main.ts` header (out of scope) still says only "`actions` and `tiles` … take a small thunk", but `focus`, `surfaces` and `reader` do too.
2. **[note]** `render/keyedreorder.ts` restores focus but leaves capture to the caller. So `pending ?? captureFocusedControl(container)` is written at both `render/sessions.ts:339` and `features/tiles.ts:245`. The asymmetry is documented (`keyedreorder.ts:21-25`) and has a reason, so no change is requested.
3. **[note]** `themeChanged` carries no payload. `features/reader.ts:89-91` reads the resolved theme back off `<html data-theme>`, which `features/theme.ts:28` wrote. Terminals legitimately read CSS tokens. The reader could take the theme as an event argument, which would complete Major 8's "no controller observes another controller's DOM side effect". No change is requested.
4. **[note]** `render/issue.ts:15` `renderIssueButton(el, connected)` is `el.disabled = !connected` and adds nothing over the direct write its sibling controllers use. `render/issue.ts:12` exports `DASHBOARD_SCOPE_TEXT`, which has no caller outside the file; the e2e helper keeps its own copy.
5. **[note]** The launch dialog's DOM is split across `render/crumbs.ts` and `render/launch.ts`. Every other dialog has one render module (`confirm.ts`, `settings.ts`, `issue.ts`, `update.ts`). W6a's `design:` line for `render/launch.ts` says it "matches render/crumbs.ts's shape" but not why the two stay separate.
6. **[note]** `render/diagrams.ts:14` `sourceByFigure` is a module-level `WeakMap`, but it is keyed by the figure the module itself built. It stays within the letter of the new render-state rule, so no change is requested.

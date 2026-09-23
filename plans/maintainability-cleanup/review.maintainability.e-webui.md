# Maintainability review: maintainability-cleanup, web features/render/terminal

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 1 (a standalone cleanup read with no diff)
**Pack**: `kb: pack 18444 words (budget 8000)`, sections rules 1874 · features 3683 · diagrams 3904 · decisions 6530 · proposed 0 · facts 2091 · lessons 354 · runbooks 2 (`--features launch,surfaces`)
**Scope**: `web/src/features web/src/render web/src/terminal`, which is 45 non-test files. Siblings opened: all 45, plus `app.ts`, `dom.ts`, `main.ts`, `doc.ts`, `protocol.ts` (grep), `sessions/card.ts`, `sessions/store.ts` and `sessions/format.ts`.

The run's adjustments apply: there are no Decisions sections, so the table has no `design:` column and nothing is filed for a missing `design:` line. Size warnings are judged on their merits.

## Files

| File | Siblings opened | Size warnings | Result |
|------|-----------------|---------------|--------|
| features/actions.ts | all 16 features, render/dead.ts, render/confirm.ts | — | Major 9, Minor 4/5/10 |
| features/connection.ts | features/*, render/focusrestore.ts, render/masthead.ts | — | pass (seed B5, B7) |
| features/focus.ts | features/tiles.ts, render/mainhead.ts, render/sessions.ts | — | Major 3 |
| features/issue.ts | features/launch.ts, features/settings.ts, render/confirm.ts, render/actionerror.ts | — | Minor 6 (seed B4, B9) |
| features/launch.ts | features/issue.ts, features/shortcuts.ts, render/crumbs.ts, render/launchrestore.ts | filelen 578: this is a symptom of B9 (about 120 lines of DOM building) | Minor 6/7 (seed B7, B9) |
| features/rail.ts | features/tiles.ts, render/sessions.ts, render/dragreorder.ts | — | Major 5 (seed B4) |
| features/reader.ts | features/surfaces.ts, features/theme.ts, render/reader.ts, render/diagrams.ts | filelen 609: holds, see Note 6 | Major 8, Minor 9 |
| features/rename.ts | render/rename.ts, render/tiles.ts, render/mainhead.ts | — | Minor 3 |
| features/settings.ts | features/update.ts, render/update.ts, render/confirm.ts | — | Major 7, Minor 4/6 (seed B4, B9) |
| features/shortcuts.ts | features/launch.ts, `../shortcuts.ts` | — | Minor 4/7 |
| features/surfaces.ts | features/tiles.ts, features/reader.ts, terminal/* | — | Minor 8/9 |
| features/theme.ts | features/reader.ts, terminal/pane.ts, doc.ts | — | Major 8 |
| features/tiles.ts | features/focus.ts, render/tiles.ts, render/sessions.ts | — | Major 3/4, Minor 11 |
| features/update.ts | features/settings.ts, render/update.ts | — | Major 7 |
| features/usage.ts | render/masthead.ts | — | pass (exemplar) |
| features/views.ts | features/tiles.ts, render/masthead.ts | — | pass |
| render/actionerror.ts | render/banner.ts | — | pass (Minor 6 reuses it) |
| render/banner.ts | render/actionerror.ts | — | pass |
| render/confirm.ts | render/update.ts, render/rename.ts | — | Minor 2 (seed B7) |
| render/context.ts | render/masthead.ts, sessions/context.ts | — | pass |
| render/crumbs.ts | features/launch.ts | — | seed B7 (missed) |
| render/dead.ts | render/tiles.ts, render/mainhead.ts, terminal/notice.ts | — | Major 1/6, Minor 2 (seed B8) |
| render/diagramdialog.ts | render/reader.ts, render/mermaid.ts | — | pass |
| render/diagrams.ts | render/mermaid.ts, features/reader.ts | — | Minor 1/15 |
| render/dragreorder.ts | render/tiledrag.ts, render/dropguard.ts, terminal/pane.ts | — | seed B5 |
| render/dropguard.ts | render/dragreorder.ts | — | pass |
| render/focus.ts | render/focusrestore.ts, render/reader.ts | — | Minor 13 |
| render/focusrestore.ts | features/connection.ts | — | seed B7 |
| render/launchrestore.ts | features/launch.ts | — | seed B7 |
| render/mainhead.ts | render/tiles.ts, render/dead.ts | — | Major 1/6, Minor 3 |
| render/masthead.ts | render/context.ts, features/usage.ts | — | Major 2, Minor 1 (seed B5, B7) |
| render/mermaid.ts | render/diagrams.ts | — | Minor 1 |
| render/reader.ts | render/diagramdialog.ts, features/reader.ts | filelen 531: holds, one component's DOM half | Minor 13/14 (seed B4) |
| render/rename.ts | render/mainhead.ts, render/tiles.ts, features/rename.ts | — | Minor 2/3 |
| render/sessions.ts | render/tiles.ts, render/mainhead.ts, render/reader.ts | filelen 564: no stated reason; it is a symptom of Major 5 plus B10/B11 | Major 1/4/5/6 (seed B4, B10, B11) |
| render/tiledrag.ts | render/dragreorder.ts, features/rail.ts | — | Major 6 |
| render/tiles.ts | render/sessions.ts, render/dead.ts | — | Major 1/6, Minor 2/12 (seed B4) |
| render/update.ts | render/confirm.ts, features/update.ts | — | Minor 2 (seed B7) |
| terminal/drop.ts | terminal/pane.ts, terminal/overlay.ts | — | pass |
| terminal/notice.ts | render/dead.ts, terminal/pane.ts | — | Note 7 |
| terminal/overlay.ts | terminal/pane.ts | — | pass (exemplar) |
| terminal/pane.ts | terminal/*, render/dragreorder.ts | — | Minor 16 (seed B5, B6) |
| terminal/shellactivity.ts | features/surfaces.ts | — | pass |
| terminal/shellkeys.ts | terminal/pane.ts | — | pass |
| terminal/surfaceswitch.ts | render/mainhead.ts, render/tiles.ts, features/surfaces.ts | — | Minor 17 |

## Seed check

- **B4 confirmed, and it missed one helper.** These pairs exist: `isRailDensity` (`features/rail.ts:15` and `protocol.ts:498`), `isRailActivity` (`features/settings.ts:11` and `protocol.ts:502`), `requireTemplate` (`render/sessions.ts:27` and `render/tiles.ts:24`), and `pad` (`features/issue.ts:76` and `sessions/format.ts:6` `pad2`). It missed `render/reader.ts:121` `requireEl(root, selector)`. That is a root-scoped version of `dom.ts:3` `requireElement`, and a fifth lookup helper. See Minor 12 for the three ways templates are looked up.
- **B5 confirmed, and it missed a type of the same kind.** `ConnectionStatus` is defined at `render/masthead.ts:17` and imported by `app.ts:5`, `features/connection.ts:12` and `features/reader.ts:23`. `DRAG_MIME` is defined at `render/dragreorder.ts:51` and used by `terminal/pane.ts:12`. It missed `SessionAction` (`render/sessions.ts:19`), a domain vocabulary type that `features/actions.ts`, `features/focus.ts`, `features/rail.ts` and `features/tiles.ts` import from a render module.
- **B6 confirmed, with a third copy in scope.** It names `main.ts:98` and `doc.ts:69`. The third copy of the `location.protocol === "https:" ? "wss:" : "ws:"` URL build is at `terminal/pane.ts:218`.
- **B7 confirmed, and it missed four modules.** `render/focusrestore.ts` and `render/launchrestore.ts` touch no DOM. B7 missed these DOM-free derivations, which also live in `render/`:
  - `render/crumbs.ts:18` `splitCrumbs`
  - `render/masthead.ts:376` `describeClaudeVersion`
  - `render/update.ts:59-172`: `buildUpdateViewModel`, `availableText` and `statusText`
  - `render/confirm.ts:32-52`: the dialog copy composition

  Under the settled rule, the ones with a single controller caller go beside that controller.
- **B8 confirmed.** `render/dead.ts:9,125` has `loadPane`, which calls `fetchPane`. It is called only from `features/actions.ts:61`.
- **B9 confirmed, and it missed more of the same shape.** `features/launch.ts:158-278` and `features/issue.ts:86,163` build DOM. The same pattern also appears here:
  - The whole dialog builders `features/settings.ts:67-111` `initSettingsDialog` and `features/issue.ts:90-270` `initIssueDialog`, plus `features/launch.ts:74` `initLaunchModal`. Each is the "elements in, handlers in, controller out" shape. Its siblings `render/confirm.ts:54` and `render/update.ts:260` live in `render/`. So three dialogs sit in `features/` and two in `render/`.
  - `features/tiles.ts:216-263`, the grid reorder (Major 4).
- **B10 confirmed.** `renderFocusMain` and `renderSizenote` at `render/sessions.ts:537-564` are called only by `features/focus.ts`.
- **B11 confirmed.** `buildActionButton` (`render/sessions.ts:41`) is imported by `render/tiles.ts:15`. Move it with `SessionAction` (see B5).

## Issues

### Critical
None.

### Major

1. **[web-impl]** The "can this session be resumed" rule is written five times in `render/`:
   - `render/sessions.ts:93` and `render/sessions.ts:100`, twice inside one function
   - `render/tiles.ts:275`
   - `render/mainhead.ts:107`
   - `render/dead.ts:116`

   Each writes `claudeSessionId !== null` (or `=== null`) combined with `connected`/`alive`. Meanwhile `sessions/card.ts:74` `resumeDisabledReason` already owns the *why* of the same rule. This breaks § Design "One owner per concept" and render/CLAUDE.md invariant 1 (the builder should not compose what the view-model owns). `rg -n "claudeSessionId !== null|claudeSessionId === null" web/src --glob '!*.test.ts'` returns those five render sites plus `sessions/card.ts:75,122`. **A fix must make true:** `sessions/` owns one "resumable" predicate, and every Resume button reads it (combined with `connected` where needed).

2. **[web-impl]** The masthead renders a usage bucket (percent text, warn-class bar, fill width, resets text) with two separate implementations in one file:
   - `renderBucket` + `renderUsageTrack` at `render/masthead.ts:40-119` rebuild the nodes every pass. Their correctness depends on the caller invoking `renderUsageTrack` right after `renderUsage` (see the doc comment at `:90`).
   - `applyModelTrack` at `render/masthead.ts:240-277` updates the nodes in place.

   Both compute `Math.round(bucket.usedPct)` (`:47,109,246,269`) and the `GAUGE_WARN_THRESHOLD` class (`:107,261`) inline. The context gauge next to it takes a view-model instead (`sessions/context.ts` `buildContextRowViewModel` feeds `render/context.ts:21`). This breaks § Design "Reuse before add". **A fix must make true:** one bucket view-model and one renderer serve `#usage-5h`, `#usage-7d` and `#usage-model-week`, and no exported render function depends on being called after another.

3. **[web-impl]** Focus and Tiles each re-derive "what does this session's slot show?" (reader, dead surface, or terminal) and repeat the mount logic:
   - The decision: `features/focus.ts:199-235` and `features/tiles.ts:186-213`. The branches are the same, written in a different order and with inverted conditions: focus uses `!session.alive && selected === "claude"`, tiles uses `session.alive || selected !== "claude"`.
   - Reader mount: `features/focus.ts:150-159` and `features/tiles.ts:165-173` repeat the `readerRoot && slot.firstElementChild !== readerRoot → replaceChildren` block.
   - Surface mount: `features/focus.ts:172-174` and `features/tiles.ts:194-196` repeat it too.

   This breaks § Design "One owner per concept". A newcomer adding a fourth surface kind has to change both, in two different branch orders. **A fix must make true:** one DOM-free function decides the body kind for `(session, surfaceState)`, and one slot-mount routine places a root into a slot. Both views call them.

4. **[web-impl]** The keyed reorder with focus capture and restore is implemented twice, and one copy does DOM work inside a controller:
   - `features/tiles.ts:223-262` (`captureFocusedControl`, the `desiredNext`/`insertBefore` loop, `restoreFocusedControl`)
   - `render/sessions.ts:425-491` `reconcileCards`, the same algorithm for cards

   This breaks § Design "Reuse before add". It also breaks conventions § Composition roots bullet 3 ("`web/src/render/` holds pure DOM builders; `web/src/features/` holds controllers"). The render/CLAUDE.md gotcha on `insertBefore` blurs is addressed to `render/`. **A fix must make true:** the grid's reorder lives in `render/` and shares one keyed-reorder routine with the rail and strip. `features/tiles.ts` keeps only membership (`tilesLive`) and supplies element roots.

5. **[web-impl]** `render/sessions.ts` passes one ten-slot positional parameter list down through four functions: `renderSessions:499`, `reconcileCards:392`, `buildSessionCardElement:261` and `updateSessionCardContent:191`, with `updateSessionCardElement:329` repeating it again. The list is made of adjacent booleans and nullables, each with its own default.
   - Callers read as `features/rail.ts:96-113` (ten arguments) and `render/tiles.ts:216-228` (`…, connected, false, undefined, null, railActivity`).
   - Every sibling builder takes an object instead: `renderReader(refs, vm)` at `render/reader.ts:430`, `renderUpdateSection(elements, vm)` at `render/update.ts:190`, and `renderMainhead(elements, …)` at `render/mainhead.ts:66`.

   This breaks § Design "Match the siblings". **A fix must make true:** the card and rail options travel as one named object (or view-model), and no call site passes a positional `false`/`undefined`/`null`.

6. **[web-impl][web-tests]** Production types are shaped around pre-existing test fixtures, so they claim optionality that no real caller has:
   - `render/tiles.ts:38-51`: `TileRefs.actsEl`, `rename` and `surfaceSegment` are optional "so tiles.test.ts's existing hand-built TileRefs fixtures … keep typechecking". So `features/tiles.ts:250-259` guards `if (refs.actsEl)` / `refs.rename?.` on every tile.
   - `render/mainhead.ts:30-36,63`: `surfaceSegment?` and the parameter defaults exist for `mainhead.test.ts`'s fixtures.
   - `render/dead.ts:21-31,145`: `noticeEl?`, and `showDeadSurfaceNotice` returns early "only unset for dead.test.ts's … fixture".
   - `render/sessions.ts:106-108,251-253,498`: optional card slots and `onClick?` exist "so the … Vitest coverage … keeps working unchanged".
   - `render/tiledrag.ts:1-5`: a whole wrapper module exists "so tiledrag.test.ts … keeps compiling". Meanwhile `features/rail.ts:79` calls `installDragReorder` directly.
   - `render/update.ts:26-32`: `toggleChecked` is "kept here for W5's full table-test contract". `renderUpdateSection … never reads this field`.

   The pipeline rule "impl agents never edit tests" is the stated reason. In this cleanup, tests may move with the code. A newcomer reading `actsEl?` concludes that tiles can lack a footer. **A fix must make true:** every field every real caller supplies is required, the fixtures supply it, `tiledrag.ts` and `toggleChecked` are gone, and no production comment names a test file as the reason for a shape.

7. **[web-impl]** The Updates section's buttons are split across two controllers:
   - `features/update.ts:40-49` looks the buttons up and renders them.
   - It hands the same nodes out through `UpdateHandle` (`:22-27`).
   - `features/settings.ts:80-85` attaches their listeners, and those listeners call back into `deps.update.apply/applyAndRestart/check` (`:157-159`).

   Every other controller wires listeners on the elements it looked up itself (features/CLAUDE.md "Owns": "Each `init<Name>(app, deps)` looks up its elements, attaches listeners"). This is the only controller-to-controller edge that passes DOM nodes. This breaks § Design "One owner per concept": to find the Apply button's click handler you have to go through two files and three hops. **A fix must make true:** `features/update.ts` wires its own buttons, `settings` no longer takes an `update` dep, and `UpdateHandle` exposes no elements.

8. **[web-impl]** A theme change reaches live terminals and reader diagrams by two different mechanisms:
   - `features/theme.ts:26` pushes it through `deps.surfaces.applyTheme()`.
   - Each `ReaderInstance` installs its own `MutationObserver` on `<html data-theme>` (`features/reader.ts:174-178`) and reads the theme back off the DOM (`:71-73`).

   Because of this split, `doc.ts:64` has to fake `surfaces: { applyTheme() {} }`. This breaks § Design "One owner per concept" (theme application is `features/theme.ts`'s): someone changing how themes apply will miss one of the two paths. **A fix must make true:** one theme-change signal from the theme owner reaches both terminal surfaces and reader instances, and no controller observes another controller's DOM side effect.

9. **[web-impl]** To route one shell-spawn failure notice, `features/actions.ts` (End/Resume/Remove) reads other controllers' DOM:
   - `ActionsHandle.findDeadSurfaceRefs` (`features/actions.ts:201-206`) reads Focus's dead-surface refs through a thunk.
   - It queries a tile's body slot for `.dead-surface` (`:204`), which is markup owned by `render/tiles.ts`/`features/tiles.ts`.
   - Its only consumers are `surfaces.select`'s failure path (`features/surfaces.ts:125`), reached from focus (`features/focus.ts:76`) and tiles (`features/tiles.ts:232`), which pass `() => deps.actions.findDeadSurfaceRefs(id)`.
   - The two `main.ts` thunks `focusDeadSurfaceRefs` and `tileBodySlot` exist for this path alone.

   This breaks features/CLAUDE.md (each controller owns its own elements) and § Design "One owner per concept". **A fix must make true:** the view that renders a dead surface (focus or tiles) is the one asked to show a notice on it, and `actions` knows nothing about tile or Focus markup.

### Minor

1. **[web-impl]** render/CLAUDE.md says "No state, fetch or socket here". The directory contradicts this:
   - Module-level state: `render/masthead.ts:185` `modelWeekCache`, `render/diagrams.ts:13` `sourceByFigure`, and `render/mermaid.ts:15-17` (engine and last theme).
   - Per-instance closure state: `render/confirm.ts:58-59`, `render/rename.ts:51-54`, `render/dragreorder.ts:93-99` and `render/diagramdialog.ts:32-41`.

   `modelWeekCache` in particular hides a module-level `WeakMap` keyed by host element. That diverges from the build-once-and-return-refs shape its siblings use (`terminal/surfaceswitch.ts:165` `buildSurfaceSegment`, `render/tiles.ts:116` `buildTile`, whose refs the caller holds). The loose rule is also why three dialogs landed in `features/` (B9). **A fix must make true:** the render rule states which state a builder may hold (per-widget DOM state), and the model-week select's persistent nodes are refs its caller holds, like the siblings' refs.

2. **[web-impl]** Pass-through wrappers and dead exports:
   - `render/tiles.ts:167` `updateTile` just calls `updateTileChrome`.
   - `render/sessions.ts:329` `updateSessionCardElement` repeats `updateSessionCardContent`'s nine parameters, and nothing outside the file calls it.
   - `render/dead.ts:56` `collectDeadSurfaceRefs` just calls `refsFromRoot`.
   - `render/confirm.ts:39,47` exports `renderEndDialogBody` and `renderRemoveDialogBody`, which have no external or test caller.
   - `features/settings.ts:67`, `features/issue.ts:90` and `features/launch.ts:74` export dialog initializers that have no external caller.
   - `features/settings.ts:130` returns a controller that `main.ts` discards.

   The grep evidence is an export sweep: each symbol has zero references outside its own file, across both `web/src` and `web/e2e`. **A fix must make true:** each exported render function has a caller outside its file, and a wrapper exists only when it adds behaviour.

3. **[web-impl]** The rename editor exposes its state through a DOM attribute and knows about its tile host:
   - `render/rename.ts:113` sets `data-editing`. `render/mainhead.ts:97` and `render/tiles.ts:89` read that attribute directly, while `RenameEditorController.isEditing` (`render/rename.ts:30,131`) has no caller (`rg -n isEditing web/src web/e2e` finds only its definition).
   - The shared editor reaches up to `.thead` (`render/rename.ts:56-58,67,115`) to toggle the tile's draggable state. That is markup only one of its two hosts has.

   **A fix must make true:** hosts ask the editor controller whether it is editing, and host-specific effects come in through the host's handlers, not through selectors inside the editor.

4. **[web-impl]** The 16 controllers do not share one `init` shape:
   - Seven name an exported `*Deps` interface (actions, focus, rail, reader, shortcuts, surfaces, tiles). Four type their deps inline (`theme.ts:9`, `rename.ts:20`, `launch.ts:535`, `settings.ts:119`).
   - `initShortcuts(_app, …)` (`features/shortcuts.ts:17`) takes an `app` it never uses.
   - Thunks are named `getSurfaces()`/`getReader()`/`getRenameHandlers()` in some places and `tilesLive()`/`focusDeadSurfaceRefs()`/`tileBodySlot()` in others.
   - Return values are a handle, `void`, or an internal dialog controller (`settings`).

   This breaks § Design "Match the siblings", and features/CLAUDE.md names `usage.ts` as the exemplar. **A fix must make true:** one deps-declaration style, one thunk naming rule, and `init` returns a handle only when a caller uses it.

5. **[web-impl]** There are 11 hand-formatted `console.error("<METHOD> /api/... failed: ${code} ${message}")` sites beyond the 8 `putPrefs` sites B1 covers:
   - `features/actions.ts:112,121,136,150`
   - `features/rename.ts:29`
   - `features/rail.ts:88`
   - `features/surfaces.ts:119`
   - `features/usage.ts:70`
   - `features/update.ts:61,70,99`

   `rg -c console.error` across the three directories counts 19. Each site re-states a route that `api.ts` already owns. **A fix must make true:** a failed `ApiResult` is logged through one helper that knows its own route, and no controller spells out an API path.

6. **[web-impl]** Small DOM idioms are hand-rolled even though a twin already exists:
   - The message region (write the text and toggle `hidden`) is done at `features/launch.ts:137-156` and `features/issue.ts:99-111`. `render/actionerror.ts:6` `renderActionError(el, message)` already does exactly this.
   - The "check the radio whose value matches" loop appears at `features/launch.ts:61-68` and `features/settings.ts:101-108`.

   This breaks § Design "Reuse before add". **A fix must make true:** each idiom has one implementation, used by every dialog.

7. **[web-impl]** Keyboard shortcut dispatch has two `window` `keydown` listeners, each calling `matchShortcut`: `features/shortcuts.ts:18` and `features/launch.ts:437`. The header of `features/shortcuts.ts:3-5` acknowledges the split but gives no reason. **A fix must make true:** one listener dispatches every chord and reaches launch's open and parent-directory actions through deps.

8. **[web-impl]** `features/surfaces.ts:104-135` `select` has no stale-response guard. Its siblings do: `features/launch.ts:297,300` `browseRequestId`, `features/issue.ts:141,151` `captureRequestId`, and `features/reader.ts:254,271` `fetchSeq`. The interleaving that breaks it:
   1. The user clicks `shell` on session 1, and the POST is in flight.
   2. The user clicks `docs`. `selectSurface(docs)` runs and a render follows.
   3. The POST resolves, and lines 130-131 run `setShellRunning` and `selectSurface(shell)`.
   4. The user's later `docs` choice is overwritten.

   **A fix must make true:** a spawn response selects `shell` only if no newer selection happened for that id since the click.

9. **[web-impl]** `features/reader.ts:510-518` `visibleDocsIds` repeats `features/surfaces.ts:140-143` `visibleSessionIds` (the tiles-live-or-focused id rule). Its comment gives the reason as "no controller imports a sibling". That reason does not hold: a DOM-free helper in `sessions/` is not a sibling import. **A fix must make true:** "ids visible in the current view" has one definition that both controllers call.

10. **[web-impl]** `features/actions.ts:97` calls `forget(window.localStorage, id)`, which is the reader's per-session memory. The reader already has its own `sessionRemoved` subscriber (`features/reader.ts:600-603`). No reason is recorded (it arrived in `acc541e`). This breaks § Design "One owner per concept". **A fix must make true:** reader memory is created, saved and forgotten only by the reader feature.

11. **[web-impl]** `features/tiles.ts` repeats itself in two places:
   - The tile teardown body (cancel rename, dispose it, remove the root, delete the ref) appears at `:119-127` and again at `:147-155`.
   - `renderStrip` is called twice with the same seven arguments (`:273-281`, `:298-306`).

   **A fix must make true:** one teardown routine, and one strip call per pass.

12. **[web-impl]** Templates are looked up three ways:
   - `render/sessions.ts:521` and `render/tiles.ts:122,211` call `document.getElementById` from inside render functions on every call.
   - `features/reader.ts:525`, `features/launch.ts:544,547` and `features/tiles.ts:82` look them up once and pass them in.
   - `render/tiles.ts` does both: `buildTile` looks up its own template, while `mountTileDeadSurface:324` takes one as a parameter.

   This breaks § Design "Match the siblings". **A fix must make true:** one rule for who looks up a template, applied across `render/`.

13. **[web-impl]** Focus preservation around a rebuild is implemented three ways:
   - `render/focus.ts:28-62`, keyed on `data-action`/`data-id`/`data-session-id`
   - `render/reader.ts:321-335` `focusedKeyWithin`/`restoreFocusByKey`, keyed on a data key
   - `features/connection.ts:92-111`, keyed on element identity

   Also, `render/focus.ts`'s name collides with `features/focus.ts` (the Focus view), while every other `render/<x>` is the renderer for `features/<x>`. **A fix must make true:** the capture-and-restore-by-key idea has one implementation, and the helper's filename says what it does.

14. **[web-impl]** In `render/reader.ts`, the `aria-current` toggle and the dirty-dot add/remove are each written out three times: `applyPlanAttrs:208-220`, `buildTreeButton:289-296` and `applyTreeAttrs:345-355`, with a fourth `aria-current` at `:409-410`. **A fix must make true:** one helper per attribute.

15. **[web-impl]** Two functions in one module take the same inputs in different shapes: `render/diagrams.ts:65` `renderDiagrams(body, opts: DiagramPassOptions)` and `render/diagrams.ts:109` `rerenderDiagrams(body, theme, instance, isCurrent)`. **A fix must make true:** both take the same options type.

16. **[web-impl]** On the cohesion of `terminal/pane.ts`: the socket, xterm lifecycle, overlay and shell input handling belong together, and the shell input already delegates to pure `shellkeys.ts`. The file-drop block does not fit:
   - The drop code (`:261-375`) is a separate feature (`drop`, with its own `api` call `locateDroppedFile`) built into the class. The other drag/drop wiring in the codebase is installed from outside by an `install*` function (`render/dragreorder.ts:91`, `render/dropguard.ts:16`). The drop code needs only `canPasteNow`/`pasteText`/`showNotice`/`focus`.
   - The xterm theme object is built twice (`:134-143` and `:434-437`).

   **A fix must make true:** drop wiring attaches to a surface through a small surface-facing interface, and one function builds the terminal theme.

17. **[web-impl]** `terminal/surfaceswitch.ts` holds both a pure state reducer (`:28-140`) and a DOM control (`:142-229`, `buildSurfaceSegment`/`updateSurfaceSegment`). The DOM control is imported by `render/mainhead.ts:12` and `render/tiles.ts:18`, which is the diagram's render→terminal "segment" edge. Conventions § Composition roots bullet 3 says `web/src/terminal/` holds pure logic, but the segment builder is a render builder. **A fix must make true:** the segment's DOM builder lives with the other builders, and `terminal/` keeps the reducer. Alternatively, the conventions line states what `terminal/` actually owns: the xterm component and the pure halves of the terminal bridge.

### Notes

1. **[note]** Plan and requirement IDs in comments: about 700 tokens (`REQ-n`, `INV-…`, `Wn`, "edge case n", "plan <name>", "review … cycle n") across 42 of 45 files.
2. **[note]** Comment truth, which belongs to `review-work`:
   - Render-phase numbers disagree with `main.ts`'s numbered list. `features/rail.ts:94` says 8 but is 9. `features/views.ts:81` says 9 but is 10. `features/focus.ts:68` and `features/tiles.ts:74` say 10 but are 11.
   - Two orphaned stacked doc comments sit on a single function: `features/actions.ts:71-74` and `features/tiles.ts:158-164`.
3. **[note]** Diagram (`review-work`'s DIAG row): the B5, B11 and Minor 17 moves change the render↔terminal edges of `kb:diagram/web-components`. Its render→reader edge is labelled "tree types" but carries values: `loadingText` from `reader/paths` (in `render/reader.ts`), `reader/mermaid` (in `render/diagrams.ts`) and `reader/zoom` (in `render/diagramdialog.ts`).
4. **[note]** For `review-browser`: `features/update.ts:89-92` `check()` settles `checkState` without calling `app.render()`. A failed check's reason, and the re-enabled button, appear only on the next 1 s tick.
5. **[note]** `FocusDeps.actions`/`getSurfaces` (`features/focus.ts:33-44`) and `TilesDeps.actions`/`getSurfaces` (`features/tiles.ts:48-59`) are identical structural types. This is a cost of the "deps typed structurally" invariant, so no change is requested.
6. **[note]** On size: `features/reader.ts` (609 lines) is one stateful per-session `ReaderInstance` class plus its manager. That is cohesive, so the warning holds. The precedent for a per-instance class is `TerminalSurface` in its own module (`terminal/pane.ts`), managed by `features/surfaces.ts`. `render/reader.ts` (531 lines) holds. `render/sessions.ts` (564 lines) and `features/launch.ts` (578 lines) would shrink through Major 5, B9, B10 and B11. No split is requested.
7. **[note]** terminal/CLAUDE.md calls `terminal/notice.ts` pure, but it owns module-level timers (`:31`) and calls `setTimeout`. `features/reader.ts:66` holds a module-level counter. Both are fine, but neither is what "pure" says.
8. **[note]** A keyed mount/dispose diff appears in three managers: `features/surfaces.ts:171-194`, `features/tiles.ts:147-156` and `features/reader.ts:550-572`. Each is small and specific to its own case, so no shared helper is requested beyond Minor 11.

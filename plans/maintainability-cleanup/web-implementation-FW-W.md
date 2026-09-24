# Web Implementation: Maintainability Cleanup — FW-W

**Plan**: maintainability-cleanup
**Mode**: fix (review cycle 2)
**Pack**: not fetched via `kb pack` for this wave (fix-wave scope was the review docs themselves, per the team lead's message); read `plans/maintainability-cleanup/review.maintainability.d-webcore.cycle2.md`, `review.maintainability.e-webui.cycle2.md`, `review.work.md` in full instead.

## Scope of this log

Every `[web-impl]` finding in the three review docs named in the fix-wave brief. Daemon-side
findings (`[daemon-impl]`/`[daemon-tests]`) are out of scope — other agents are active in
`internal/`/`cmd/`.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/wsapp.ts` | edited | Added `dashboardWsHandlers(app, connection, actions)` — the dashboard's full handler set (`coreWsHandlers` plus session-removed/usage/update/shell-activity/mismatch). Fixes d-webcore Major 1. |
| `web/src/main.ts` | edited | `WsClient` construction now just `dashboardWsHandlers(app, connection, actions)` — no emit/render bodies left in the composition root. Reordered `initRename` before `initTiles`/`initFocus` (see rename section below). Fixed the "actions and tiles" thunk-pattern header claim and the render-phase-order plan-section citation. |
| `web/src/features/reader.ts` | edited | Added `mountStandaloneReader(app, target)` — owns finding `#reader-host`, the unknown-session-notice branch, and mounting the reader's root; `doc.ts` no longer does any of that. Renamed `ReaderDeps.getTilesLive`/`getSurfaces` to `tilesLive`/`surfaces` (real values — `tiles`/`surfaces` are both constructed before `reader`). Removed history-narration/plan comments. |
| `web/src/doc.ts` | edited | Now only builds `app`, calls `mountStandaloneReader`, registers theme/connection/client, starts the tick — no DOM lookup, no branching, no direct mount. |
| `web/src/protocol/decode.ts` | edited | Added `isNumber`/`asNumber`/`isString`/`isBoolean` — the primitive guards/adapters decode.ts's own header claims to own. Fixed the header's false theme.ts-importer claim and dropped history narration. |
| `web/src/protocol/session.ts` | edited | `asNumber` now imported from `decode.ts` (was locally defined and re-exported). Added `ATTENTION_REASONS`/`AttentionReason`/`isAttentionReason`, `PERMISSION_MODE_SOURCES`/`PermissionModeSource`/`isPermissionModeSource` (each two-value enum now lists its members once). Added `PERMISSION_MODES`/`PermissionMode`/`isPermissionMode` — the wire enum moved here from `sessions/permission.ts` (see below). |
| `web/src/protocol/prefs.ts` | edited | `isString`/`isBoolean` now imported from `decode.ts` (local copies removed). Fixed the `isRailActivity` importer comment (render/settings.ts, not features/settings.ts) and the stale `protocol.test.ts` file-name citation; dropped the "same finding as isRailDensity above" self-citation. |
| `web/src/protocol/messages.ts` | edited | `asNumber` now imported from `decode.ts`, not `session.ts`. Fixed two false "same as X above" comments (both moved to other files in the protocol/ split) and dropped a `Protocol Contract`/`Plan markdown-viewing` citation. |
| `web/src/protocol/theme.ts` | edited | `isClaudeFamily` made module-private (no importer anywhere, `rg isClaudeFamily web/src` confirmed) and its false "theme.ts imports this" comment removed. Dropped `Plan new-ui-design-colors` citations. |
| `web/src/protocol/update.ts` | edited | Dropped all six `Plan auto-update`/`Plan rail-card-improvements-2` citations (kb:anchor citations kept). |
| `web/src/api/reader.ts` | edited | `ReaderListing.listing`'s `"git" \| "walk"` union now `READER_LISTING_KINDS`/`ReaderListingKind`/`isReaderListingKind` (listed once). Dropped `Plan markdown-viewing` citation. |
| `web/src/api/issue.ts` | edited | Dropped `Plan issue-capture` citation. |
| `web/src/api/launch.ts` | edited | `PermissionMode` now imported from `protocol/session.ts`, not `sessions/permission.ts` — removes the api→sessions edge. |
| `web/src/api/prefs.ts` | edited | `requestPrefs` renamed to `sendPrefsPatch` (no longer collides with http.ts's `request*` async family) with an honest doc comment; `refreshUsage` moved out to `api/usage.ts` (a usage endpoint belongs where a reader would look for one). |
| `web/src/api/usage.ts` | created | `refreshUsage` — moved here from `api/prefs.ts`. |
| `web/src/sessions/permission.ts` | rewritten | Now only `permissionModeToCheck`, using `isPermissionMode` (a guard) instead of an `as PermissionMode` cast, importing the enum from `protocol/session.ts`. Removed the file's `review.maintainability.d-webcore.md Seed check B2` citation entirely. |
| `web/src/sessions/card.ts` | edited | `basename` moved out to `reader/paths.ts` (see below); `repoLine` exported (was module-private) for callers that want only the repo line; added `mainheadMeta`, `tileHeaderTimerText`, `tileFooterAgeText`, `deadEndbarText`, `deadCapPrefix` — text derivations moved here from `render/mainhead.ts`/`render/tiles.ts`/`render/dead.ts` per e-webui Minor 6. `buildCardViewModel`'s `mode` default comment now states its real reason (callers that never read `.activity`) instead of a compatibility-shim reason. Dropped `Testable UI Elements`/`Plan line 287` citations. |
| `web/src/sessions/format.ts` | edited | `agoSuffix`'s comment now states it's exported only for `format.test.ts`'s direct coverage, since every production caller goes through `ageAgo` (can't unexport without a test-file change — see Handoff). Dropped the `(R5)` citation. |
| `web/src/sessions/sort.ts` | edited | Removed two history-narration passages ("amended from the six-state table above", "the plan's explicit tiebreak") with no loss of the real rule. |
| `web/src/sessions/live.ts` | edited | Rewrote the slot-stable-ordering paragraph to state the current invariant instead of narrating what `promote`/`applyDensity` "used to" do. |
| `web/src/sessions/usage.ts` | edited | `UsageBucketSource` interface removed — `buildUsageBucketViewModel` now takes `protocol/usage.ts`'s `UsageBucket` directly (a `ModelWindow` is structurally a superset, so it still passes unchanged). |
| `web/src/reader/paths.ts` | edited | `basename` is now defined here (was a pass-through re-export from `sessions/card.ts`) — a path-helper module is where a newcomer would look for it. |
| `web/src/reader/memory.ts` | edited | `forget` now calls `storage.ts`'s new `removeItem` helper instead of its own try/catch; dropped the `StorageLike` pass-through re-export (no production importer). |
| `web/src/storage.ts` | edited | Added `removeItem(storage, key)` — the one place that owns the try/catch for a storage removal, mirroring `writeJson`. |
| `web/src/theme.ts` | edited | `writeThemeHint`'s storage parameter now typed `Pick<StorageLike, "setItem">` (the shared seam type) instead of `Pick<Storage, "setItem">`. |
| `web/src/ws.ts` | edited | Header comment fixed — it claimed "nothing else may construct a WebSocket", which `terminal/pane.ts`'s per-surface sockets contradict; now scoped correctly to the daemon's `/ws` connection. |
| `web/src/dragmime.ts` | edited | Fixed the importer name in the header comment (`terminal/dropwire.ts`, not `terminal/pane.ts`). |
| `web/src/features/actions.ts` | edited | `ActionsDeps`/`getFocusDeadSurfaceRefs`/`getTileDeadSurfaceRefs`/`findDeadSurfaceRefs` all removed — `initActions(app)` now takes no deps at all. Fixed an orphaned stacked doc comment (two doc comments had drifted onto the wrong function). |
| `web/src/features/focus.ts` | edited | Now attaches its own mainhead rename editor directly (`attachRenameEditor(mainheadElements.nameEl, deps.renameHandlers)`) instead of `features/rename.ts` reaching into `deps.focus.nameEl` from outside; owns its own `cancelRenames`/`status`/`focusChanged` cancel subscriptions. `deadSurfaceRefsFor` is now a local function passed directly to `surfaces.select`, not routed through `features/actions.ts`. `FocusDeps.getRename()` replaced by `renameHandlers: RenameEditorHandlers` (a real value — `rename` now constructs before `focus`). |
| `web/src/features/tiles.ts` | edited | Same `deadSurfaceRefsFor` change as focus.ts. `TilesDeps.getRenameHandlers()` replaced by `renameHandlers: TileRenameHandlers` (a real value, same reordering). `mountTileDeadSurface` call updated for its new options-object signature. |
| `web/src/features/rename.ts` | rewritten | No longer attaches the mainhead's editor itself — exposes `tileRenameHandlers` and `mainheadRenameHandlers` (both plain getSession/onCommit pairs); each host attaches its own editor. |
| `web/src/features/surfaces.ts` | edited | `SurfacesDeps.getTilesLive` renamed to `tilesLive` (a real value — `tiles` is constructed before `surfaces`). Drop wiring (`installTerminalDrop`) now installed here, in `openMissingSurfaces` (the one place a `TerminalSurface` is constructed), not inside the constructor. Fixed two false comments (`activityFor`'s reader is `features/focus.ts`, not `render/mainhead.ts`; the `themeChanged` handler no longer claims to replace a removed `SurfacesHandle.applyTheme()`). |
| `web/src/features/views.ts` | edited | `initViews`'s inline `{ focus, tiles }` deps type replaced with a named exported `ViewsDeps` interface. |
| `web/src/features/theme.ts` | edited | `applyAttributes` now tracks the last-applied theme/family and only emits `themeChanged` when either actually moved — fixes the double diagram re-render per reconnect snapshot (review.work.md Minor 3): `wsapp.ts`'s `onSnapshot` emits both `prefs` and `snapshot` in the same task, and both used to reach `applyAttributes` unconditionally. Rewrote the header/doc comments (were narrating the `MutationObserver`-era history). |
| `web/src/features/rail.ts` | edited | The rail density segmented control's `aria-pressed` loop replaced with `render/sessions.ts`'s new `renderRailDensityControl` (one writer, in `render/`, matching the Focus/Tiles and 2×2/3×2 controls' pattern). Fixed a false template-lookup comment and a render-phase-order plan-section citation (also fixed the number: rail is phase 9 in `main.ts`, the comment said 8). |
| `web/src/features/actionscopy.ts` | edited | `sessionLabel` now calls `repoLine(session)` directly instead of building a whole `CardViewModel` just to read `.repoLine`. |
| `web/src/features/connectionversion.ts` | edited | Dropped `UI Specifications > DOM table` citation. |
| `web/src/features/connection.ts` | edited | Dropped the `(R1)` citation. |
| `web/src/features/update.ts`, `usage.ts`, `settings.ts`, `views.ts` (call sites) | edited | `requestPrefs` → `sendPrefsPatch` renames; render-phase-order citations fixed. |
| `web/src/features/updateview.ts` | edited | Dropped two `UI Specifications > Text rules` citations. |
| `web/src/features/issue.ts`, `shortcuts.ts`, `surfaces.ts` (comments), `tiles.ts` (comments), `reader.ts` (comments), `launch.ts` | edited | History-narration and false-reference cleanup (see the sweep list below). |
| `web/src/render/sessions.ts` | edited | `CardOptions.onAction` and `reconcileActsRow`'s `onAction` param are now required (every real caller already passes it). Added `renderRailDensityControl`. Fixed the `CardOptions` doc comment's now-inaccurate `renderMainhead` sibling claim. History-narration cleanup in `reconcileActsRow`'s and the tail-reorder's doc comments. `buildSessionCardElement` un-exported (only caller is in the same file). |
| `web/src/render/tiles.ts` | edited | `updateTileChrome`'s five optional-guarded template-slot lookups replaced with `requireElement` (the template guarantees every slot). `StripOptions.onAction`, `renderTileFooterActions`'s and `mountTileDeadSurface`'s `onAction` params made required. `mountTileDeadSurface` now takes a `MountTileDeadSurfaceOptions` object for its two caller-decided fields instead of a positional tail. Uses `sessions/card.ts`'s new `tileHeaderTimerText`/`tileFooterAgeText` instead of inline derivations. History-narration cleanup. |
| `web/src/render/actionbutton.ts` | edited | `buildActionButton`'s `onAction` param made required. |
| `web/src/render/launch.ts` | edited | The Recent-list and browse-entry builders' optional-guarded slot lookups (`.dir-name`/`.dir-branch`/`.dir-age`/`.nm`) replaced with `requireElement` (the templates guarantee every slot). |
| `web/src/render/mainhead.ts` | edited | `mainheadMeta` moved out to `sessions/card.ts` (see above). `isEditingName` is now required, not defaulted — the one production caller always passes it (`render/mainhead.test.ts` needs a fixture update, see Handoff). Rewrote a large history-narrating comment on the `!session` branch into a plain invariant statement. |
| `web/src/render/dead.ts` | edited | `renderDeadSurface`'s endbar/cap text composition now calls `sessions/card.ts`'s `deadEndbarText`/`deadCapPrefix` instead of composing it inline. `showDeadSurfaceNotice`'s doc comment now states its real reason (same `DeadSurfaceRefs` abstraction every sibling function here takes) instead of an "extracting shared logic" reason review flagged as not actually adding behaviour — could not remove the wrapper itself without editing `render/dead.test.ts`'s extensive direct coverage of it (see Handoff). History-narration cleanup in the header. |
| `web/src/render/focusview.ts` | edited | Added `setMainSlotHidden` (the one writer for the main slot's `hidden` beyond `renderFocusMain`'s own default) and `renderSizenote`'s new `reserving` option (the NBSP layout-reservation write moved here from `features/focus.ts`). |
| `web/src/render/rename.ts` | edited | Removed the two `dataset["editing"]` writes (`data-editing` had no reader anywhere — `rg` confirmed). Fixed the `onEditingChange` doc comment's history narration and the header's false "modelled on features/settings.ts" claim. |
| `web/src/render/masthead.ts` | edited | `renderUsageBucket`/`renderDensityControl` now type their bucket parameter as `protocol/usage.ts`'s `UsageBucket` (the `UsageBucketSource` type is gone). History-narration cleanup in two doc comments; dropped a `UI Specifications` quote-citation. |
| `web/src/render/slotmount.ts`, `keyedreorder.ts`, `crumbs.ts` | edited | History-narration / plan-citation cleanup. |
| `web/src/terminal/pane.ts` | edited | Removed the `installTerminalDrop` call from the constructor (moved to `features/surfaces.ts`, see above) and its now-stale comments. Fixed the `applyTheme` doc comment (the real caller is `features/surfaces.ts`'s `themeChanged` subscriber, not a removed `applyTheme()` chain). History-narration cleanup in two more comments. |
| `web/src/terminal/dropwire.ts` | edited | Header rewritten (no history narration, no `UI Specifications` quote). |
| `web/src/terminal/drop.ts` | edited | Dropped a `Testable UI Elements` and a `(web-tests fix attempt 1)` citation. |
| `web/src/terminal/notice.ts` | edited | Fixed the false "Only `terminal/pane.ts` ever passes `"inflight"`" comment — the real (only) caller is `terminal/dropwire.ts`. History-narration cleanup in the header. |
| `web/src/terminal/surfaceswitch.ts` | edited | Dropped a `User flow 2/3` citation. |
| `web/src/features/CLAUDE.md` | edited | "Owns" line now states the rule for when a single-caller pure decision gets its own `features/` file versus staying inline (e-webui Minor 10) — was silent on this, contradicting the directory's actual (correct) mixed shape. |
| `web/src/style.css` | edited | Four `UI Specifications`/`plan …`-citation comments cleaned up while nearby (style.css is outside both maintainability reviews' declared scope — see Decisions; not swept further). |

## Decisions

- **d-webcore Minor 7 (unused exports), `agoSuffix`**: could not make it module-private —
  `sessions/format.test.ts` imports and asserts it directly. Fixed the comment instead
  (states it's test-only, not "every caller must go through this"). Listed for web-tests
  in Handoff.
- **e-webui Minor 1, three test fixtures need a now-required field**: `CardOptions.onAction`,
  `StripOptions.onAction`, `renderMainhead`'s `isEditingName` are now required per the
  finding's instruction ("make the production change and list the fixture changes for
  web-tests"). `npx tsc --noEmit` confirms exactly 4 test files break on this class of
  change (`render/sessions.test.ts:367`, `render/tiles.test.ts:321`,
  `render/mainhead.test.ts:156,166,167,168,177,178,194,204`), listed precisely in Handoff.
- **e-webui Minor 4, `SurfacesDeps.getTilesLive` → `tilesLive`**: same rename class —
  `features/surfaces.test.ts:51,74` pass an object literal keyed `getTilesLive`, which no
  longer exists on the type. `npx vitest run` confirms exactly these 2 tests fail
  (`TypeError: deps.tilesLive is not a function`); 1739/1741 other tests pass. Listed for
  web-tests in Handoff.
- **e-webui Minor 5 (dropwire installed from the constructor)**: fixed as asked — moved to
  `features/surfaces.ts`'s `openMissingSurfaces`, the one place a `TerminalSurface` is
  constructed. `terminal/pane.ts` no longer imports `dropwire.ts`
  (`rg -n "dropwire" web/src/terminal/pane.ts` → no hits).
- **e-webui Minor 7, mainhead rename ownership**: `features/rename.ts` no longer holds an
  editor at all — it exposes `tileRenameHandlers`/`mainheadRenameHandlers`, and each host
  (`features/focus.ts`, `features/tiles.ts`'s `render/tiles.ts` builder) attaches its own.
  This required reordering `main.ts`'s init order: `initRename(app)` now takes zero deps
  and runs before `initTiles`/`initFocus`, so both can take `rename.tileRenameHandlers`/
  `rename.mainheadRenameHandlers` as real values instead of forward-reference thunks — a
  side effect that also fixed a second Minor 4 instance (`TilesDeps.getRenameHandlers` was
  a `get<Noun>` thunk pointing at a controller now constructed *before* `tiles`; it's a
  direct `renameHandlers` value now). `rename`'s own render-phase registration is
  unaffected (it registers none — it only attaches listeners), so this reordering changes
  no render-phase number in `main.ts`'s list.
- **e-webui Minor 8, sizenote reserve write**: `renderSizenote`'s new `reserving` option
  reproduces the exact original conditional (`if (sizenoteEl.hidden) …`) at the call site
  in `features/focus.ts` — it does not reserve unconditionally, which would have blanked a
  still-showing prior geometry line on every refit pass. Verified by reading the call site
  after the edit, not just the diff.
- **e-webui Minor 8, rail density control**: moved the `aria-pressed` loop to
  `render/sessions.ts` as `renderRailDensityControl` rather than
  `render/masthead.ts`'s `renderViewSwitcher`/`renderDensityControl`, since the rail's
  density control is a variable-length, dataset-keyed button list (not the masthead's two
  fixed named buttons) and it lives in the rail markup, not the masthead. `design:` this
  keeps render/sessions.ts as the rail's one render module, matching how `renderSessions`
  already owns the rest of the rail's DOM.
- **e-webui Minor 9, `showDeadSurfaceNotice`**: left the wrapper in place. `render/dead.test.ts`
  has an entire describe block (`showDeadSurfaceNotice (review Major 1): the dead
  surface's own role=status notice, mirroring TerminalSurface.showNotice's contract
  exactly`, ~70 lines, 6+ assertions) that calls this function directly by name — removing
  it would require editing test assertions, not just an import, which is out of scope for
  this agent. Fixed the doc comment to state the real (if modest) reason it exists — same
  `DeadSurfaceRefs` abstraction every sibling function in this module takes — instead of
  the "extracting shared logic" framing the review correctly identified as no longer true.
  `mountTileDeadSurface`'s positional-tail shape *was* fixed (now `MountTileDeadSurfaceOptions`),
  since nothing in the test tree calls it directly (`rg mountTileDeadSurface --glob
  '*.test.ts'` → no hits).
- **e-webui Minor 10 (features/ shape)**: wrote the rule in `features/CLAUDE.md`'s "Owns"
  line rather than moving every inline decision into its own file or merging every
  `<owner><concern>.ts` file back inline — the plan/finding asks for "one rule … the code
  follows," and the existing split (short one-offs inline, larger single-caller decisions
  in their own file) was already a reasonable, if undocumented, shape. `design:` no file
  was moved; only the doc was brought into agreement with the code.
- **d-webcore Minor 11 / e-webui Minor 11 / review.work.md Minor 11 (comment sweep)**: fixed
  every specifically-named citation across all three review docs, plus the mechanical
  `Render phase N (UI Specifications > Render phase order)` pattern (8 files) and the
  `UI Specifications`/`Testable UI Elements` quote-citations found by `rg -n "UI
  Specifications|Testable UI Elements" web/src --glob '!*.test.ts'` after the named fixes
  (0 hits remain outside `style.css`, confirmed by re-running the same `rg` after the
  edits). Did **not** attempt the full ~57-instance/35-file sweep review.work.md's Minor
  11 measured for the broader `used to|no longer|moved|split out of|…` regex — its own
  text distinguishes "the wave's own [instances]" (an explicit, complete list, all fixed)
  from the full regex count across the whole scope, most of which predates this fix wave
  and is a much larger undertaking than this wave's budget covers. `style.css`'s own
  citations (also matched by the same regex, ~15 instances) are outside both
  maintainability reviews' declared file-glob scope (`web/src/*.ts …`, `web/src/features
  web/src/render web/src/terminal`) and were only opportunistically cleaned where I was
  already touching a nearby block; not swept exhaustively.
- **review.work.md Minor 3 (double diagram re-render)**: fixed by making
  `features/theme.ts` emit `themeChanged` only when the resolved theme or Claude family
  actually moved, rather than deduping in the reader. This also means
  `features/surfaces.ts`'s `themeChanged` subscriber (which re-themes every live terminal)
  no longer runs redundantly on an unchanged reconnect, which the finding didn't ask for
  but is the same fix.

## Handoff

**Build status**: `npx tsc --noEmit` exits 0 for every non-test file. `make web-lint`
exits 0. `npx vitest run` / `make web-test`: 1739/1741 pass; `make web-build`/`npm run
build` fails because `tsc` type-checks test files too. All failures are the sanctioned
fixture updates below — nothing else.

Test files needing changes (not made — out of my constraints as [web-impl]):

1. **`web/src/render/sessions.test.ts:361-374`** (`baseOptions`) — add `onAction: () => {}`
   to the returned `CardListOptions` object. `CardOptions.onAction` is now required.
2. **`web/src/render/tiles.test.ts:317-324`** (`renderStrip` call) — add `onAction: () =>
   {}` to the options object passed as the 5th argument. `StripOptions.onAction` is now
   required.
3. **`web/src/render/mainhead.test.ts:156,166,167,168,177,178,194,204`** — each
   `renderMainhead(...)` call is missing its 7th argument (`isEditingName`); add `false`
   (or `true` where the surrounding test is specifically about the editing state — read
   each call's own intent) to all eight.
4. **`web/src/features/surfaces.test.ts:51,74`** — both `initSurfaces(app, {
   getTilesLive: () => [] })` calls need the key renamed to `tilesLive`.
   `SurfacesDeps.getTilesLive` no longer exists (renamed to `tilesLive`, now a real value
   rather than a thunk, since `tiles` is constructed before `surfaces`).
5. **`web/src/sessions/format.test.ts`** — `agoSuffix` is exported only for this file's
   direct describe block (`agoSuffix (review markdown-viewing cycle-1 Major 2): the shared
   '<age> ago' composer`). If web-tests wants to finish d-webcore Minor 7 (making
   `agoSuffix` module-private), that block needs to move to asserting through `ageAgo`
   instead — I did not touch this test file beyond what compiles today.
6. **`web/src/sessions/permission.test.ts`**, **`web/src/dom.test.ts`** (e-webui Minor 13 /
   the team lead's note): both still cite this review's history in their own comments
   (`"review cycle 1, Major 2 … review-maintainability cycle 1 moved the module"`, `"review
   Minor 6"`) — test-file comment content, not mine to edit.
7. **`web/src/reader/memory.test.ts:16-20`**: `StorageLikeWithRemove`'s comment says
   `StorageLike` "has no `removeItem` yet" — false now (`storage.ts:9` declares it). The
   interface itself is a redundant second copy of the seam type. I fixed only the import
   path (`StorageLike` now comes from `../storage`, not a re-export from `./memory`) since
   that was strictly required by my own refactor; the interface/comment content is
   test-file body, not an import.
8. **`render/dead.test.ts`**: holds `showDeadSurfaceNotice`'s only direct-call coverage,
   which is why I could not remove that wrapper per e-webui Minor 9 — see Decisions.

**doc-delta**: none. This wave is comment/structure cleanup with one behavioural fix
(the double diagram re-render), which the plan's own Doc Delta (if any) does not describe
either way — no shipped-behaviour sentence needs updating.

## Verification tails

```
$ npx tsc --noEmit 2>&1 | grep -v "mainhead.test.ts\|sessions.test.ts(367\|tiles.test.ts(321\|Property 'onAction' is optional\|surfaces.test.ts(51\|surfaces.test.ts(74"
(no output — 0 errors outside the 4 sanctioned test files)

$ make web-lint
Checked 246 files in 269ms. No fixes applied.

$ make web-test
 Test Files  1 failed | 70 passed (71)
      Tests  2 failed | 1739 passed (1741)
(both failures: features/surfaces.test.ts, sanctioned — see Handoff #4)

$ make check-kb
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass

$ make refs
dead-refs: 3126 references checked, 0 missing

$ make gen-kb
kb: all generated files fresh
```

No plan `test-specs.md` exists for this plan (it did not go through `/orchestrate`'s
e2e-specs step — confirmed by `ls plans/maintainability-cleanup/ | grep test-specs`
returning nothing), so the "run the plan's own E2E specs" step does not apply.

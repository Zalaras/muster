# Web Implementation: Rail groups

**Plan**: groups
**Mode**: initial
**Pack**: kb: pack 48603 words (budget 20000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/groups.ts` | created | `Group`, `UngroupedLayout`, `GroupsMessage`, parsers; a snapshot with neither key (older daemon) parses as no groups, one key without the other is rejected |
| `web/src/protocol/batch.ts` | created | `BatchResult` (`done`/`skipped`/`failed`) and its parser, shared by the batch endpoints and delete-group |
| `web/src/protocol/messages.ts`, `session.ts` | edited | snapshot carries `groups`/`ungrouped`; `groups` joins the `Message` union; `Session.groupId` required (`null` or integer) |
| `web/src/ws.ts`, `wsapp.ts`, `app.ts` | edited | `onGroups`; `groups` event on the bus (snapshot emits it too); `AppState.groups`/`ungrouped`, written only by `features/groups.ts` |
| `web/src/api/groups.ts` | created | `createGroup`, `updateGroup`, `putGroupsOrder`, `putAllCollapsed`, `deleteGroup` |
| `web/src/api/sessions.ts`, `launch.ts` | edited | `putSessionsGroup`, `endSessions`, `removeSessions`; `putSessionOrder(ids, pinnedCount, groupId?)`; `LaunchGroup` (`groupId`/`newGroup`) on both launch requests |
| `web/src/sessions/sections.ts` | created | pure: `buildSections`, `visibleCards`, `shownCards`/`shownCount`/`filterHides`, `filterForFocus`, `defaultFocusId`, `moveSection`, `sectionOrder`, `groupOf`/`groupLabel`/`commonGroupId`, `summarize`/`summaryRows`/`popoverModel`, `selectionState`, header strings |
| `web/src/sessions/railorder.ts` | edited | `moveCard` computes a drop against the target card's own section and returns that section's ids, `pinnedCount` and `groupId` |
| `web/src/sessions/card.ts` | edited | `displayTitle()` — the one `untitled` fallback, used by the card, mainhead, popover and checkbox label |
| `web/src/render/menu.ts` | created | the one menu builder (`createMenu`) |
| `web/src/render/railsections.ts` | created | section reconcile by key: header (caret, checkbox, name/field, summary, ⋯), body via `reconcileCards`, pending new-group section, empty-rail line |
| `web/src/render/grouppopover.ts`, `selectbar.ts`, `groupdialogs.ts` | created | hover popover; select-bar text/enablement; delete-group and new-group-from-selection dialog controllers |
| `web/src/render/sessions.ts` | edited | `CardOptions.selection` (select-mode checkbox, `.selected`), `CardListOptions.adopt`; `renderSessions` removed (the rail now draws through `railsections.ts`) |
| `web/src/render/confirm.ts` | edited | one dialog serves one session or a batch: `ConfirmRequest { ids, title, body, confirmLabel }` |
| `web/src/render/dragreorder.ts`, `keyedreorder.ts` | edited | `idAttribute`, `dropZoneSelector`/`onDropZone`; keyed entries take `number \| string` |
| `web/src/render/mainhead.ts`, `launch.ts` | edited | group control label/enablement; `renderGroupOptions` |
| `web/src/features/groups.ts` | created | per-window rail state (filter, select mode, selection, name editor), every menu, the two dialogs, section-header drag, `reveal`, `renderChrome` |
| `web/src/features/groupscopy.ts` | created | DOM-free text: menu labels, bulk Stop/Remove and delete-group titles/bodies, count, batch report |
| `web/src/features/launchgroup.ts`, `launchgroupchoice.ts` | created | the launch dialog's Group row: controller and pure choice logic |
| `web/src/features/rail.ts` | edited | renders through `railsections`; card drag onto cards and onto header/body zones; count `n of m`; select-mode click |
| `web/src/features/actions.ts`, `actionscopy.ts` | edited | `dispatchMany` (batch Stop/Remove with count dialogs, partial-result line), `showError`, single-dialog title/label constants |
| `web/src/features/focus.ts` | edited | group control click, `nth` over displayed cards, default focus over the first displayed card, `⌥⌘0` unfolds, `bringForward` un-filters |
| `web/src/features/launch.ts`, `launchresume.ts` | edited | Group row wiring on both tabs; both submit forms carry `groupId`/`newGroup` |
| `web/src/features/shortcuts.ts`, `web/src/shortcuts.ts` | edited | `new-group` on ⌥⌘G, inert in Tiles and while a dialog is open |
| `web/src/main.ts` | edited | registration lines only: `initGroups`, and `groups` into `focus`, `rail`, `shortcuts` deps |
| `web/index.html`, `web/src/style.css` | edited | rail head row 2, `#select-bar`, delete-group and new-group dialogs, launch Group row and Resume slot, mainhead `.ingroup`; tokens only |
| `web/src/{features,render,sessions}/CLAUDE.md` | edited | hand-written parts, trimmed to the 400-word budget |

## Decisions

REQs: every REQ the plan lists for the web side is in Changes. REQ-21, REQ-22 and REQ-26 are the client halves (adopt only from the wire, batch endpoints, orphan `groupId` renders in Ungrouped). REQ-23 is the daemon's; the client only sends one section's ids. REQ-27 is the fixed phrase in `batchReport`.

Testable UI Elements: every row is implemented as written. No row is unimplementable.

- deviation: a single click on the name text of a renameable group does not fold its section; the rest of the header, the caret, the summary and ⋯ do. The daemon round trip is async, so the two clicks of a double-click both read the same state and would fold the group being renamed; the rename spec (E3) then reads `Expand` on the caret. This is reasoned from the code path, not measured: I made the exclusion before running that spec. The Ungrouped name, which cannot be renamed, still folds. → kb:adr/rail-group-name-click-does-not-fold
- deviation: bar actions (Move to, Ungroup, Stop…, Remove…) leave select mode and the selection on, unlike the mockup, which cleared both. The authored specs continue to use the checkboxes after Ungroup and after a partial Remove. The mode ends on Done, Escape, Tiles, or when no session is left (specs E15). → kb:adr/rail-select-mode-persists-across-bar-actions
- deviation: the launch dialog's Group row is one set of nodes that moves between two homes: under Title in `.fields` on New, into `#group-resume-slot` on Resume. The first attempt kept the row in `.fields` and hid its siblings on Resume; `past-sessions.spec.ts` asserts `#launch-form .fields` is hidden on Resume, which failed. → kb:adr/launch-group-row-moves-between-tabs
- deviation: `BatchResult` lives in `protocol/batch.ts`, not `api/groups.ts` as the plan's hint says: `api/` modules import only `decode`/`http`, and both `api/sessions.ts` and `api/groups.ts` need it. → kb:adr/web-batch-result-type-lives-in-protocol
- Stop, from the bar or a header's Stop all…, counts and sends only live ids; Remove counts every selected id and says how many are live. The daemon would skip a stopped one either way.
- the plan's Hints: taken — `railsections.ts`, `menu.ts`, `grouppopover.ts`, `selectbar.ts`, `groupdialogs.ts`, `groupscopy.ts`, `groups.ts`, the second `installDragReorder`, `adopt`-style reuse. Dropped — "`renderSessions` keeps the flat path for the strip": the strip calls `reconcileCards` directly (`render/tiles.ts:246`), so `renderSessions` had one caller, the rail, and went with it.
- Existing-spec fallout I found by running the suites (no spec edited): `e2e/shell.spec.ts:47` asserts the exact `GET /api/state` object and now lacks `groups`/`ungrouped`; see Handoff.
- Measured, the group control's cost in the Focus header: first draft padded 2px 7px with letter spacing, and `card-location.spec.ts` E11 (1280x800, 60-char folder, 80-char branch) failed with the branch line 13.125px under its 44ch cap. After 2px 5px, no letter spacing, no leading space before the caret and a 24ch ellipsis cap on the name, the spec passes (`153 passed` across groups-launch, past-sessions, card-location, launch).

design: `sessions/sections.ts` — pure derivation next to `sort.ts`/`railorder.ts`. `rg 'orderRail\('` (HEAD) found six users (focus, issue, rail, tiles, railorder, sort); it is reused per section and still flat in the strip and issue dialog. `moveSection` reuses `insertAtDragTarget`, boxed because that helper tests the dragged item for truthiness and Ungrouped's id is `0` (observed: the second drag in `E10` did nothing before the fix).
design: `render/menu.ts` — `git grep 'role="menu"\|aria-haspopup' HEAD -- web/src web/index.html` found nothing: no menu existed. One `createMenu()` per controller (render-state rule: the open panel is the instance's own state). Built on open, discarded on close, so the tick never touches it; Escape and a choice return focus to the opener, then the choice runs, so Rename's field keeps focus.
design: `render/railsections.ts` — copies `reconcileCards`' shape: reconcile by key, update in place, build only what is new. Positioning reuses `reconcileKeyedOrder`, whose entry id I widened to `number | string`. State owner: the instance holds the DOM it built; the controller (`features/groups.ts`) owns `editing`, `filter`, `selecting`. The name field is created once per edit and focused after the pass mounts it (a pending section is not in the document until the pass positions it; observed: `toBeFocused` read `inactive` while the field was focused during creation, and passed once focus moved after positioning). Every focusable control keeps its node: caret, ⋯, header checkbox, name field (`e2e` tick specs in groups.spec, groups-select, groups-launch pass).
design: `render/grouppopover.ts` — `git grep tooltip HEAD` found only title-attribute comments; nothing to reuse. One controller per rail holds the timer and the open panel; `attach` takes a getter for the header's current model because headers are updated in place.
design: `render/selectbar.ts` — static markup, written only in text/`hidden`/`disabled`, like `renderMainhead`. `render/groupdialogs.ts` — `confirm.ts`'s shape (elements and handlers in, controller out); `features/groupscopy.ts` supplies the text.
design: `features/groups.ts` — owns the per-window state the plan assigns it; imports no controller (`rg "from \"\./" web/src/features/groups.ts` → `./groupscopy` only, a pure module). It registers no render phase: `rail.ts` calls `groups.renderChrome(frame)` first in phase 9, because a phase registered at construction would run before focus's phase 6, which can change the filter in the same pass. `groups` is constructed before `focus` and `rail`, which read it through `deps`.
design: `features/launchgroup.ts` + `launchgroupchoice.ts` — the Group row as a sub-controller beside `launchresume.ts`, with its pure half beside it as `launchpastlist.ts` is to `launchresume.ts`. `launch.ts` only resets it, syncs it on the `groups` event and merges its fields; the select is rebuilt only when its option key (value + label of every option) changes, so a user mid-typeahead keeps node, focus and choice.
design: `actions.dispatchMany` + `confirm.ts` `ConfirmRequest` — one dialog pair serves single and batch; the controller keeps one flag, `confirmingBatch`, set by whichever opened the dialog. `showError` is exposed so `#action-error` keeps one writer.
design: `render/dragreorder.ts` — installed twice on `#sessions` (cards in `rail.ts`, headers in `groups.ts`); each install claims only a drag it started. Header ids come from `data-section-id` (`0` is Ungrouped, as on the wire), separate from `data-group-id` the table pins.
design: `protocol/groups.ts` is the `prefs.ts` pattern: whole-list broadcast, absent keys tolerated only on the snapshot.
size: `features/launch.ts` was 731 lines before this change and now reads 770 (`make size-warn`); the Group row's own logic is in `launchgroup.ts`, what remains is its reset, sync, `place()` and the two-line body merge. Kept.

doc-delta: focus — the group control hides when the header's content box (the header minus its 14px side padding) is under 640px, so at a header width under 668px; the e2e sweep notes the same band.
doc-delta: focus — the title does not shorten before repo / branch at every width. The existing layout gives the title the free space ahead of `.meta`, so a folder name longer than the 8-character floor ends in an ellipsis whenever the title is shortened; measured below. The plan's "repo / branch never truncate" overstates it ("the repo block never hides" is what holds).
doc-delta: rail — select mode stays on after a bar action; it ends on Done, Escape, switching to Tiles, or when no session remains.
doc-delta: rail — a click on a renameable group's name does not fold it; double-click renames.
doc-delta: rail — Select all (n) in a header menu turns select mode on with that group's members selected.
doc-delta: launch / past-sessions — the Group row sits under Title on New and under the past-sessions list on Resume; one select, one choice across both tabs.
doc-delta: focus — default focus falls back to the first card of the whole rail when every kept section is empty or collapsed, un-filtering if that card's section is filtered out.
doc-delta: `docs/features/rail/spec.md` `web` globs must also cover `web/src/features/groups*.ts`, `web/src/features/launchgroup*.ts`, `web/src/features/groupscopy.ts` and `web/src/protocol/batch.ts`; `make check-kb` lists the new files as owned by no feature.

Measured, Focus header at four widths, long title (66 chars), folder `muster-app /` (12 chars, floor is 8ch), `.rf` truncated where `scrollWidth > clientWidth`:

```
control hidden (baseline)  1140: whole    900: truncated  724: truncated  600: truncated  500: truncated
control present            1140: truncated 900: truncated  724: truncated  600: hidden/truncated  500: hidden/truncated
```

Only the 1140 baseline row is whole. Every other width truncates the folder before and without my control, so `groups-focus.spec.ts` E27's "repo and branch read whole" cannot hold for this folder name under the existing layout (kb:adr/focus-mainhead-title-keeps-a-floor; #73 stays filed).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on sanctioned test files only. `Session.groupId` is required by the plan, so every test fixture that builds a `Session` or a `Snapshot` literal no longer type-checks; `vite build` and Biome (`npm run -s lint`, 284 files) are clean, `make contrast` is 43 pairs and 0 failures per theme, and `tsc` shows no error in a non-test file.

```
   1 src/api/launch.test.ts          1 src/api/sessions.test.ts       1 src/features/actionscopy.test.ts
   1 src/features/updaterestart.test.ts                               2 src/render/dead.test.ts
  17 src/render/mainhead.test.ts     2 src/render/sessions.test.ts    1 src/render/tiles.test.ts
   1 src/sessions/card.test.ts       1 src/sessions/live.test.ts      1 src/sessions/railorder.test.ts
   1 src/sessions/sort.test.ts       1 src/sessions/store.test.ts     2 src/ws.test.ts
```

`npm run build` runs `tsc` first, so `make web-build` exits non-zero; for the smoke I ran `npx vite build` then `make build`. `npx vitest run`: 90 failed, 1903 passed, in `src/protocol/{session,messages,prefs,theme,update}.test.ts`, `src/api/{launch,sessions}.test.ts`, `src/render/{mainhead,sessions}.test.ts` and `src/ws.test.ts`.

**E2E smoke** (plan spec files, daemon implementation present in the tree):

```
npx playwright test e2e/groups.spec.ts e2e/groups-select.spec.ts e2e/groups-launch.spec.ts e2e/groups-focus.spec.ts
  6 failed
  93 passed (1.2m)
```

Existing suites I ran as a regression read (no spec edited): rail, actions, shortcuts, rename, launch, past-sessions, tiles, views, card-location, terminal/shell, reader, update and the rest. Everything passes except `shell.spec.ts:47`.

Test files needing changes, with the reason:

- Fixtures need `groupId: null` on every `Session` literal: `src/api/launch.test.ts`, `src/api/sessions.test.ts`, `src/features/actionscopy.test.ts`, `src/render/dead.test.ts`, `src/render/mainhead.test.ts`, `src/render/sessions.test.ts`, `src/render/tiles.test.ts`, `src/sessions/card.test.ts`, `src/sessions/live.test.ts`, `src/sessions/sort.test.ts`, `src/sessions/store.test.ts`, `src/ws.test.ts`, and the protocol tests that parse them (`src/protocol/session.test.ts`, `messages.test.ts`, `prefs.test.ts`, `theme.test.ts`, `update.test.ts`).
- Snapshot literals and `toEqual` expectations need `groups: []` and `ungrouped: { pos: 0, collapsed: false }`: `src/ws.test.ts`, `src/features/updaterestart.test.ts`, `src/protocol/messages.test.ts`.
- `src/render/mainhead.test.ts`: `MainheadElements` gains `groupBtn` (with an `.ig-name` child) and `renderMainhead` takes a trailing `groupText`; its fake elements have no `querySelector`. The mandated markup is a button holding a name span, so the fixture upgrades, not the markup.
- `src/render/sessions.test.ts`: `renderSessions` is removed; its one test ("honest empty state") belongs on `railsections.ts`' empty-rail line.
- `src/sessions/railorder.test.ts`: `RailOrderItem` gains `groupId`, `MoveCardResult` gains `groupId`; a cross-section drop inserts before the target.
- `src/shortcuts.test.ts`: new ⌥⌘G binding (W11); existing cases still hold.
- New unit tests the plan names: `sections.test.ts`, `groupscopy.test.ts`, `protocol/groups.test.ts`; `protocol/batch.ts` and `features/launchgroupchoice.ts` are also pure and untested.
- `web/e2e/shell.spec.ts:47`: asserts the exact empty `GET /api/state` object; the contract adds `groups` and `ungrouped` to it.

Spec findings for validate mode (nothing edited):

- `groups-select.spec.ts:696-697`: `page.getByRole("button", { name: "Tiles" })` is not exact and the spec names its groups `Tiles A` and `Tiles B`; four buttons match (the view switch, two carets `Collapse Tiles A/B`, the Focus header's `Tiles A`). Needs `exact: true` or other group names.
- `groups-focus.spec.ts` E27, five tests (1140, 724, 600, 500 and the sweep): the folder `muster-app /` has 12 characters, the layout's floor is 8, and the table above shows it truncated at every width but the baseline 1140. Use a folder of 8 characters or fewer, or fix #73 first. The control-present 1140 case is also worse than baseline there because the control takes room the title would otherwise keep.
- `groups.spec.ts:1230` ("dropping a header onto a card…") is flaky, 3 of 16 repeats: it compares the ordered `sessions` array of `GET /api/state` before and after, and the daemon builds that array from a Go map (`internal/session/manager.go:601`, `Manager.List`). Sort by id in the spec, or in the daemon.
- `web/e2e/helpers/groups.ts:500` cites `kb:lesson/select-rebuilt-` (truncated slug), which `make check-kb` reports as resolving to no record.

`make check-kb` also lists every new file as owned by no feature; that is the Doc Delta's `rail` glob work (see doc-delta).

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: the wave-1 `comments` gate flagged `web/src/features/groupscopy.ts:104`, a plan ID (`REQ-27`) in a doc comment on `batchReport`.

**Changes made**: that one comment now states the why and cites `kb:adr/actions-bulk-stop-remove-are-daemon-batches`. No code changed. The comment sits on one exported function, so there is no CSS or shared-consumer surface to re-measure.

**Paths enumerated**: the category is "a plan ID in a production web comment". The tree-wide grep below returns no match, so `groupscopy.ts:104` was the only instance.

Re-run of the gate:

```
$ python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates
comment-checks: clean
```

```
$ grep -rn "REQ-[0-9]" web/src --include='*.ts' --exclude='*.test.ts'
(no output, exit 1)
```

**Decisions**: none new.

## Fix Attempt 2 (pre-review fix)

**Failures addressed**: web-tests' one implementation bug: the rule for which ids a batch Stop or Remove confirms, counts and sends sat in `dispatchMany` (a closure over the store and DOM) and was repeated by the header menu's `live`, so no unit test could pin it.

**Changes made**:

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/features/batchplan.ts` | created | pure `batchPlan(action, ids, sessions): BatchPlan \| null`, `BatchPlan { ids, live }`. Stop keeps live known ids; Remove keeps every known id and counts the live; ids not in `sessions` are dropped; order follows `sessions`; `null` with nothing to confirm |
| `web/src/features/actions.ts` | edited | `dispatchMany` calls `batchPlan(action, ids, app.store.values())` and builds the dialog from the plan |
| `web/src/features/groups.ts` | edited | `headerMenuEntries` enables Stop all… on `batchPlan("end", ids, section.cards) !== null` and sends that plan's ids |

**Paths enumerated** (category: a batch's id selection decided outside the pure function): `rg "dispatchMany" web/src` shows the callers `groups.ts` lines 63 (bar Stop/Remove), 253 and 260 (bar actions) and the header's Stop all…. All reach `dispatchMany`, which now plans; the header's own enablement was the only other copy and now calls `batchPlan` too. No other `.alive` filter picks batch ids.

**Decisions**:
- design: `features/batchplan.ts` takes a structural `PlannedSession { id, alive }`, not `Session`, so the tester's `Session[]` calls type-check and the module imports no protocol type. `rg "alive" web/src/features/groupscopy.ts` found nothing: `groupscopy.ts` is text only, so the decision sits beside it as its own module rather than inside it. It matches `launchgroupchoice.ts` (pure half, own file, imported by its controller).
- `dispatchMany` now sets `confirmingBatch` only after the plan is non-null. Before, it was set and then the call returned with no dialog; `dispatch` resets the flag at its start, so nothing observable changes.
- Taken or left, the two non-blocking items: left. `rail.ts` `onDropZone`'s same-section guard and `groups.ts` `commitRename`'s unchanged-name guard are one comparison each, next to the event and editor state they read; an extracted function would hold one `===`. The tester can cover them by e2e.
- `groups.ts` went from 609 to 610 lines (measured with `wc -l`); the size warning stays and is kept for the reason in the initial log.

**Behaviour check**: the same four spec files after `make web-build build`.

```
npx playwright test e2e/groups.spec.ts e2e/groups-select.spec.ts e2e/groups-launch.spec.ts e2e/groups-focus.spec.ts
  7 failed
  92 passed (1.2m)
```

The seven are the ones in this log's Handoff and not caused by this change: five E27 width tests (folder name over the 8-character floor), the `Tiles` locator at `groups-select.spec.ts:675` (not exact; four buttons match) and the flaky `groups.spec.ts:1230` (daemon `Manager.List` map order). Initial run was 6 failed and 93 passed, the flake being the 7th this time. No test that exercises Stop or Remove failed.

**Gates**: `npx tsc --noEmit` 0, `npm run build` 0, `npm run -s lint` clean, `vitest` 2344 passed in 85 files, `comment-checks.py --gates` clean.

**Test files**: none break; the signature is new. web-tests can add `batchplan.test.ts` for the required behaviour.

## Fix Attempt 3 (review cycle 1)

**Failures addressed**: correctness Major 1 and Minor 2; browser Minor 1; maintainability Critical 1, Major 1 and Minors 1 to 7 (every issue tagged web-impl).

**Changes made**:

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/style.css` | edited | the Focus-header group-control comment states the amended rule (hides below 640px; title shortens above it, never below 6rem; repo block keeps its 8-character floor); the query is `@container (width < 640px)` |
| `web/src/features/groups.ts` | edited | `commitRename` and `commitNew` close the field only through `closeEditingIf(committed)`, which acts only while `editing` is still that object; the rest of select mode and the two dialogs moved out (610 → 435 lines) |
| `web/src/features/groupsselect.ts` | created | select mode: Select toggle, selected ids, bar listeners, Escape, Tiles reset, bar and toggle rendering. `selectMany` is a no-op while disconnected |
| `web/src/features/groupsdialogs.ts` | created | the delete-group and new-group dialogs wired: element lookups, copy, what a confirm sends, close on status change |
| `web/src/render/selectbar.ts` | edited | All and Done are disabled while disconnected, like the other bar buttons |
| `web/src/render/sessions.ts` | edited | the card's select checkbox is disabled while disconnected (`reconcileSelectCheckbox` takes `connected`) |
| `web/src/render/anchored.ts` | created | the one anchored-panel placement routine, `placeAnchored(panel, anchor, { alignRight })` |
| `web/src/render/menu.ts`, `web/src/render/grouppopover.ts` | edited | both call `placeAnchored`; the menu passes `alignRight: true`, the popover does not; their own `position`/`place` and gap constants are gone |
| `web/src/render/options.ts` | created | the one `<option>` list builder, `fillOptions(select, rows)` |
| `web/src/render/launch.ts`, `web/src/render/groupdialogs.ts` | edited | `renderGroupOptions` and `fillTargets` call `fillOptions` |
| `web/src/render/dragreorder.ts`, `web/src/features/rail.ts` | edited | new option `zoneKeyAttribute` names the zone key's `data-` attribute; the rail passes `"groupId"` |
| `web/src/protocol/decode.ts`, `batch.ts`, `groups.ts`, `session.ts` | edited | one exported `asInteger` in `decode.ts`, used by the three sites (`session.ts` through `parseNullable`) |
| `web/src/sessions/sections.ts` | edited | `groupsInRailOrder(groups)` and the shared labels `NO_GROUP_CHOICE` and `NEW_GROUP_CHOICE` |
| `web/src/features/groupscopy.ts`, `launchgroupchoice.ts` | edited | read `groupsInRailOrder` and the label constants; `NO_GROUP_OPTION` and `NEW_GROUP_OPTION` are removed (no importer outside this file) |
| `web/src/features/actionscopy.ts` | edited | `sessionLabel` uses `displayTitle` |

**Paths enumerated** (the categories the findings name):
- *A daemon answer closing a different editor*: every async continuation that writes `editing` is `commitRename`'s `.then`, `commitNew`'s success path and the `groups` handler. The first two now go through `closeEditingIf`. The handler already compares the object it holds. `commitNew`'s failure path mutates only `pending`. No new edit is blocked, so a second field opens during a request, as before.
- *Selection controls live while down*: card checkbox (`reconcileSelectCheckbox`), header checkbox (`railsections.ts:209`, already disabled), Select toggle, All, Done, the four action buttons, and the selection edits that bypass a disabled control (card click in select mode, header menu Select all, header checkbox change) all reach `selectMany`, which now returns while disconnected.
- *Second implementation of a shared idea*: `rg "getBoundingClientRect" web/src/render/menu.ts web/src/render/grouppopover.ts` now finds none; `rg "createElement\(\"option\"\)" web/src/render web/src/features` leaves only `masthead.ts:209` and `issue.ts:32` (pre-branch, optional). `rg "\.pos - " web/src` leaves `sections.ts` only. `rg "Number.isInteger" web/src/protocol` leaves `decode.ts` and the pre-branch `backgroundTasks` range check. `rg '\?\? "untitled"' web/src` leaves only files this branch does not touch.

**Blast radius** (shared things changed):
- `placeAnchored`: consumers are the menu (rail ⋯, header ⋯, Move to, Focus-header control) and the popover. The groups, select and focus specs open every one of them and pass (below).
- `renderSelectBar`: one caller, `groupsselect.ts`; the card checkbox: `reconcileCards`, one caller path (`railsections.ts`), and the Tiles strip passes no selection.
- `installDragReorder`'s new option: three callers; only the rail passes a drop zone.
- `groupscopy.ts` constants: `MENU_LABELS` keeps its keys and values.

**Repros re-run** (throwaway specs, deleted after):
- Rename A, Enter, then double-click B's name and type before A's PUT answers (the PUT held 1.5 s in the browser). With the guard removed: `B field count after A answered: 0`, the value read `gone`. With the fix: `B field count after A answered: 1`, `B value: typing-in-b`.
- Select mode on, daemon killed, banner shown: `{"cardChkDisabled":true,"headChkDisabled":true,"all":true,"done":true,"move":true}` (every value is `disabled`); Escape then leaves the mode (`aria-pressed` false). The review's numbers were `cardChk:false`, `All disabled false`, `Done disabled false`.
- The container-query boundary, `#mainhead` forced to a content box of each width: `641: display=flex`, `640: display=flex`, `639: display=none`.

**Decisions**:
- design: `render/anchored.ts` and `render/options.ts` are one-function modules beside their callers in `render/`. `rg "getBoundingClientRect|replaceChildren" web/src/render` found only the two placements and the two option builders (plus the older `masthead`/`issue` ones), so there was nothing else to extend. Neither holds state. The menu's right-align is the caller's choice (`alignRight`).
- design: `features/groupsselect.ts` and `features/groupsdialogs.ts` take `launchgroup.ts`'s shape: `init<Name>(app, elements/deps)` returning a small handle, a structural deps type, no sibling controller imported. Owner of `selecting` and the selected ids is `groupsselect.ts` (written by its handlers, `render` and the `prefs` listener); owner of `deleting` is `groupsdialogs.ts`; `editing` and `filter` stay in `groups.ts`.
- design: `closeEditingIf(committed)` rather than blocking a second edit during a request. The guard matches the one the `groups` handler already uses (compare the object held) and loses no keystroke; blocking would turn a double-click on B into a silent no-op for one round trip.
- design: `selectMany` returns while disconnected so the selection cannot change by a path that has no disabled control; leaving select mode is Escape, which this fix keeps working. The card click in select mode still focuses nothing and toggles nothing while down.
- design: shared labels sit in `sessions/sections.ts` beside `UNGROUPED_NAME` and `NO_GROUP_LABEL` because both feature modules already import it; the lowercase `no group` (the control's own text) stays a separate constant on purpose.
- design: `zoneKeyAttribute` has no default, unlike `idAttribute`: a default would be the rail's own name again. Without it a drop in a zone is ignored.
- size: `features/groups.ts` is now 435 lines, under the threshold, so the earlier warning is gone by extraction, not a reason. `make size-warn` shows no new web warning on files this wave touched. `features/launch.ts` keeps its earlier reason.
- doc-delta: select mode's bar buttons All and Done, and the card checkboxes, are now disabled while the daemon is down (the plan's Daemon down list already says "bar buttons"); the Doc Delta's select-mode sentence does not mention the daemon-down state and needs no change, but any feature-spec sentence saying "Done and All still work while down" is now wrong (none found in `docs/`).
- doc-delta: `render/CLAUDE.md` and `features/CLAUDE.md` name the rail's modules by hand; the registry globs and those lists need `features/groupsselect.ts`, `features/groupsdialogs.ts`, `render/anchored.ts` and `render/options.ts`.

## Handoff (fix attempt 3)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` and `comment-checks.py --gates` clean.
**Vitest**: 2362 passed, 1 failed, the sanctioned one below.
**E2E smoke**: `npx playwright test e2e/groups.spec.ts e2e/groups-select.spec.ts e2e/groups-launch.spec.ts e2e/groups-focus.spec.ts e2e/card-location.spec.ts e2e/rail-layout.spec.ts` after `make web-build build`: `204 passed (1.9m)`.

**Sanctioned breakage for web-tests (wave 2)**:
- `web/src/render/selectbar.test.ts:93-103` ("with the daemon down disables every action, but never All or Done") asserts `all: true, done: true` while disconnected. The plan says every bar button is disabled while down; the expected values become `false` and the title changes.
- New unit coverage the fixes allow: `groupsInRailOrder`, `asInteger` in `decode.ts`, `placeAnchored` (menu right-align versus popover left), `fillOptions`, `installDragReorder` with `zoneKeyAttribute`, and the disabled card checkbox from `reconcileSelectCheckbox`.
- For e2e-specs (wave 3): daemon down in select mode now disables the card checkbox, All and Done (the existing E24 test does not cover the bar or checkboxes), and a held rename answer does not close a second open name field.

**New files for the registry globs**: `web/src/features/groupsselect.ts`, `web/src/features/groupsdialogs.ts`, `web/src/render/anchored.ts`, `web/src/render/options.ts`.

## Fix Attempt 4 (review cycle 2)

**Failures addressed**: correctness Minor 1 (stale hand-written parts of two package guides) and maintainability Minor 1 (the two sub-controllers of `groups.ts` got their markup differently).

**Changes made**:
- `web/src/features/groups.ts`: looks up the new-group and delete-group dialog elements itself and passes them as `initGroupsDialogs(app, dialogElements, deps)`, as it already did for `initGroupsSelect`. Behaviour is unchanged; the lookups moved, byte for byte.
- `web/src/features/groupsdialogs.ts`: takes a `GroupsDialogsElements` argument (`newGroup`, `deleteGroup`, the render module's own element types) and no longer imports `requireElement`. Header comment now says the caller looks the markup up.
- `web/src/features/CLAUDE.md`: `batchplan.ts` joins the pure helpers; `groups.ts` no longer claims select mode and the dialogs, which are named as `groupsselect.ts` and `groupsdialogs.ts` beside `launchgroup.ts`.
- `web/src/render/CLAUDE.md`: the rail group module list adds `anchored.ts` and `options.ts`. The GENERATED trailers were not touched.

**Sweep** (every sub-controller `groups.ts` hands elements to): `groupsselect.ts` already took them; `groupsdialogs.ts` now does. `groups.ts` has no other sub-controller. Both now match `launchgroup.ts` and `launchresume.ts`: the caller looks up, the sub-controller is handed.

**Decisions**:
- design: one shape for both `groups.ts` sub-controllers, `init<Name>(app, elements, deps)`, rather than a `design:` line justifying the divergence. A third piece added to `groups.ts` copies either. The line in Fix Attempt 3 saying both "take `launchgroup.ts`'s shape" is now true. `groups.ts` grows by the lookups and stays under the size threshold: `make size-warn` shows no web warning (only Go test warnings, not mine).
- doc-delta: none; the registry globs are unchanged.

## Handoff (fix attempt 4)

**Build status**: `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm run -s lint`: `Checked 302 files in 296ms. No fixes applied.`; `comment-checks.py --gates`: `comment-checks: clean`.
**E2E smoke** (after `make web-build build`): `68 passed (36.0s)` for `web/e2e/groups.spec.ts` and `web/e2e/groups-select.spec.ts`.
No test file needs changes; no unit test imports `initGroupsDialogs`.

## Fix Attempt 5 (review cycle 2)

**Failures addressed**: `make check-kb` word budget on two nested guides (hand-written part, outside the GENERATED trailer).

**Changes made**: tightened existing prose only; every module name and rule kept, trailers untouched.

| File | Words before | Words after |
|------|--------------|-------------|
| `web/src/features/CLAUDE.md` | 425 | 397 |
| `web/src/render/CLAUDE.md` | 406 | 397 |

`go run ./tools/kb check` ends `kb: 522 records, 25 features, 0 problem(s)` / `kb: all checks pass`. `comment-checks.py --gates` prints `comment-checks: clean`.

**Decisions**: none new.

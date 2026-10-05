# Maintainability review: Rail groups

**Plan**: groups
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 44284 words (budget 20000)
**Scope**: 77 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (a full review: cycle 1 had a Critical and a Major open, so no delta). The 33 files `git diff 2687fb6c..HEAD` touches were read line by line with their siblings open; the rest carry cycle 1's reading forward, re-checked where a fix's search reached them.

## Delta

Every cycle 1 issue, checked against `git diff 2687fb6c..HEAD` with the sibling modules open.

| Cycle 1 issue | Fix commit | Verified how |
|---|---|---|
| Critical 1 (async answer closes another field) | 5b83df5c | `features/groups.ts:176-179` `closeEditingIf(committed)` closes only while `editing` is still the object the request was for. `commitRename` (`:207-221`) and `commitNew`'s success path (`:233-236`) both call it. The failure path mutates only the orphaned `pending` object. The `groups` handler (`:135-138`) keeps its identity check. The interleaving from cycle 1 (rename A in flight, open B, A answers) now re-renders and leaves B open. |
| Major 1 (two placement routines) | 5b83df5c | `render/anchored.ts` `placeAnchored` is the only one. `rg "EDGE_GAP\|getBoundingClientRect" web/src/render` finds `EDGE_GAP` only in `anchored.ts`. `menu.ts:146` passes `{ alignRight: true }` and `grouppopover.ts:85` passes nothing. |
| Minor 1 (groups.ts 610 lines, no reason) | 5b83df5c | Select mode moved to `features/groupsselect.ts` and the two dialogs to `features/groupsdialogs.ts`. `groups.ts` is 435 lines and off the size log. The split is by concern (select-mode state and bar, and dialog state), not by line count. See Minor 1 below for the one way the two new modules diverge. |
| Minor 2 (integer adapter ×3) | 5b83df5c | `protocol/decode.ts:21-25` exports `asInteger`. `batch.ts`, `groups.ts:40` and `session.ts:346` import it. `rg "Number.isInteger" web/src` leaves `session.ts:329`, which predates the branch, and `launchgroupchoice.ts:63`, which parses a select value, not the wire. |
| Minor 3 (rail order ×3) | 5b83df5c | `sessions/sections.ts:60-62` `groupsInRailOrder` is read by the Move to menu (`groups.ts:349`), the delete targets (`groupsdialogs.ts:111`) and the launch row (`launchgroupchoice.ts:28`). `rg "\.pos - " web/src` finds only it and `byPlace`, which orders `Section`s with Ungrouped in them. |
| Minor 4 (labels twice) | 5b83df5c | `NO_GROUP_CHOICE` and `NEW_GROUP_CHOICE` sit beside `UNGROUPED_NAME` in `sessions/sections.ts`. `groupscopy.ts` and `launchgroupchoice.ts` import them. `rg '"No group"\|"New group…"\|"Ungrouped"'` finds each literal once. |
| Minor 5 (option builder ×2) | 5b83df5c | `render/options.ts` `fillOptions` is called by `render/launch.ts:302` and `render/groupdialogs.ts:59`. The older `masthead.ts:209` and `issue.ts:32` remain, as cycle 1 allowed. |
| Minor 6 (hard-coded zone attribute) | 5b83df5c | `dragreorder.ts:69` takes `zoneKeyAttribute`, and `features/rail.ts:123` passes `"groupId"`. `rg 'dataset\["groupId"\]'` finds only the writers in `railsections.ts`. |
| Minor 7 (title fallback) | 5b83df5c | `features/actionscopy.ts:17` uses `displayTitle`. The other `"untitled"` sites predate the branch. |
| Minor 8 (duplicate rule in handler) | 5e777784 | `runBatch` (`internal/session/actions.go:128-131`) refuses a repeated id with `ErrInvalidOrder` before running anything. `handleEndSessions` and `handleRemoveSessions` map it through `writeBatchError` (`sessions.go:176-183`), as `handleSetOrder` (`:357`) and `handleSetSessionsGroup` (`:248`) do. `hasDuplicateIDs` is gone. `hasDuplicateRailPos` now uses the shared `hasRepeat`. The two loops left in `applyOrder` and `validateSessionIDs` interleave the unknown-id check, and the design line explains why they stay. |
| Minor 9 (batch wire placement) | 5e777784 | `batchWire`, `toWireBatch` and `nonNil` moved verbatim to `sessionwire.go:194-212`. `groups.go:267,337` uses them by package name. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/server/groups.go | prefs.go, usage.go, sessions.go, sessionwire.go, respond.go | yes (groupsFeature, writeBodyError) | — | pass (Minor 9 fixed) |
| internal/server/launcher.go | launcherpast.go, launcherrors.go | yes (size line) | file 606 (559 on main), reason holds | pass |
| internal/server/launchergroup.go | launcher.go, launcherpast.go | yes (size line names it) | — | pass |
| internal/server/launcherpast.go | launcher.go | yes (size line) | funlen `launchResume` 62 (61 on main), reason holds | pass |
| internal/server/launcherrors.go | launcher.go | n/a (one constructor beside its siblings) | — | pass |
| internal/server/respond.go | groups.go, sessions.go | yes (writeInvalidRequest) | — | pass |
| internal/server/server.go | usage.go, prefs.go | yes (groupsFeature registration) | funlen `New` 45 (44 on main), documented reason holds | pass |
| internal/server/sessions.go | groups.go, sessionwire.go, respond.go | yes (fix 1: duplicate rule in runBatch) | — | pass (Minor 8 fixed) |
| internal/server/sessionwire.go | groups.go, sessions.go | yes (fix 1: batch wire placement) | — | pass |
| internal/server/state.go | groups.go, prefs.go | n/a (two fields) | — | pass |
| internal/session/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/session/actions.go | manager.go, railorder.go | yes (runBatch, fix 1) | — | pass |
| internal/session/grouplaunch.go | groups.go, groupops.go, manager.go | yes (launchGroups) | — | pass |
| internal/session/grouplayout.go | railorder.go, groupops.go | yes (fix 1: withHeldAboveUngrouped) | — | pass |
| internal/session/groupops.go | groups.go, grouplaunch.go, manager_rail.go | yes (groupsMu writers, fix 1) | — | pass |
| internal/session/groups.go | manager.go, grouplaunch.go, railorder.go | yes (fix 1: heldGroupIDsLocked) | — | pass |
| internal/session/manager.go | manager_rail.go, writeorder.go | yes (groupsMu, launchGroups) | file 623 (580 on main), reason holds | pass |
| internal/session/manager_rail.go | railorder.go, groups.go | n/a (extends SetOrder) | — | pass |
| internal/session/railorder.go | grouplayout.go, manager_rail.go, actions.go | yes (fix 1: hasRepeat) | — | pass (Notes 4, 5) |
| internal/session/row.go | session.go | n/a (one field) | — | pass |
| internal/session/session.go | row.go, writeorder.go | n/a (one field) | — | pass |
| internal/session/writeorder.go | session.go | n/a (one field) | — | pass |
| internal/store/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/store/group.go | usage.go, session.go, store.go | yes (GroupLayout) | — | pass |
| internal/store/migrations/0013_groups.sql | 0012 and earlier | n/a | — | pass |
| internal/store/session.go | group.go | n/a (one column) | — | pass |
| web/src/api/groups.ts | api/sessions.ts, api/prefs.ts, api/http.ts | yes (deviation line on BatchResult) | — | pass |
| web/src/api/launch.ts | api/sessions.ts | n/a (one interface) | — | pass |
| web/src/api/sessions.ts | api/groups.ts | n/a (three calls beside their siblings) | — | pass |
| web/src/app.ts | wsapp.ts, features/rail.ts | yes (protocol/groups.ts prefs pattern) | — | pass |
| web/src/features/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/features/actions.ts | groups.ts, render/confirm.ts | yes (dispatchMany) | — | pass |
| web/src/features/actionscopy.ts | groupscopy.ts, sessions/card.ts | n/a | — | pass (Minor 7 fixed) |
| web/src/features/batchplan.ts | launchgroupchoice.ts, groupscopy.ts | yes (fix 2 log) | — | pass |
| web/src/features/focus.ts | rail.ts, groups.ts | yes (groups deps) | — | pass |
| web/src/features/groups.ts | groupsselect.ts, groupsdialogs.ts, launch.ts, launchgroup.ts, rail.ts, render/rename.ts | yes (fix 3) | none (435 lines, was 610) | pass (Critical 1, Minor 1 fixed; Minor 1 below names lines 99-108) |
| web/src/features/groupscopy.ts | actionscopy.ts, launchgroupchoice.ts, sessions/sections.ts | yes | — | pass (Note 6) |
| web/src/features/groupsdialogs.ts | groupsselect.ts, launchgroup.ts, launchresume.ts, launch.ts | yes (fix 3) | — | Minor 1 |
| web/src/features/groupsselect.ts | groupsdialogs.ts, launchgroup.ts, launchresume.ts, shortcuts.ts | yes (fix 3) | — | pass (Notes 2, 3) |
| web/src/features/launch.ts | launchresume.ts, launchgroup.ts | yes | file 770 (731 on main), reason holds | pass |
| web/src/features/launchgroup.ts | launchresume.ts, launch.ts | yes | — | pass |
| web/src/features/launchgroupchoice.ts | launchpastlist.ts, groupscopy.ts | yes | — | pass (Minors 3, 4 fixed) |
| web/src/features/launchresume.ts | launch.ts | n/a (one parameter) | — | pass |
| web/src/features/rail.ts | groups.ts, tiles.ts | yes | — | pass |
| web/src/features/shortcuts.ts | shortcuts.ts | n/a (one binding) | — | pass |
| web/src/main.ts | features/*.ts registration | n/a (registration only) | — | pass |
| web/src/protocol/batch.ts | decode.ts, prefs.ts | yes (deviation line) | — | pass (Minor 2 fixed) |
| web/src/protocol/decode.ts | batch.ts, groups.ts, session.ts | yes (fix 3: asInteger) | — | pass |
| web/src/protocol/groups.ts | prefs.ts, decode.ts | yes (prefs pattern) | — | pass |
| web/src/protocol/messages.ts | prefs.ts | n/a | — | pass |
| web/src/protocol/session.ts | decode.ts | n/a (one field) | — | pass |
| web/src/render/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/render/anchored.ts | menu.ts, grouppopover.ts | yes (fix 3) | — | pass |
| web/src/render/confirm.ts | groupdialogs.ts | yes (ConfirmRequest) | — | pass |
| web/src/render/dragreorder.ts | keyedreorder.ts, railsections.ts | yes (fix 3: zoneKeyAttribute) | — | pass (Minor 6 fixed; Note 7) |
| web/src/render/groupdialogs.ts | confirm.ts, options.ts, launch.ts | yes (confirm.ts shape) | — | pass |
| web/src/render/grouppopover.ts | menu.ts, anchored.ts | yes | — | pass (Major 1 fixed) |
| web/src/render/keyedreorder.ts | railsections.ts, sessions.ts | yes (widened id) | — | pass |
| web/src/render/launch.ts | groupdialogs.ts, options.ts, masthead.ts, issue.ts | yes | — | pass (Minor 5 fixed) |
| web/src/render/mainhead.ts | tiles.ts | n/a (one control) | — | pass |
| web/src/render/menu.ts | grouppopover.ts, anchored.ts | yes | — | pass (Major 1 fixed) |
| web/src/render/options.ts | launch.ts, groupdialogs.ts, masthead.ts, issue.ts | yes (fix 3) | — | pass |
| web/src/render/railsections.ts | sessions.ts, keyedreorder.ts, rename.ts | yes (reconcileCards shape) | — | pass |
| web/src/render/selectbar.ts | mainhead.ts | yes (renderMainhead shape) | — | pass |
| web/src/render/sessions.ts | railsections.ts, tiles.ts | yes | — | pass |
| web/src/render/tiles.ts | sessions.ts | n/a (comment) | — | pass |
| web/src/sessions/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/sessions/card.ts | actionscopy.ts, issue.ts, pane.ts | n/a (one helper) | — | pass |
| web/src/sessions/railorder.ts | reorder.ts, sort.ts | n/a (extends moveCard) | — | pass |
| web/src/sessions/sections.ts | sort.ts, railorder.ts, reorder.ts | yes (fix 3: labels, groupsInRailOrder) | — | pass (Note 4) |
| web/src/sessions/sort.ts | sections.ts | n/a (comment) | — | pass |
| web/src/sessions/testfixtures.ts | api/testfakes.ts | stated in the file header | — | pass |
| web/src/shortcuts.ts | features/shortcuts.ts | n/a (one table row) | — | pass |
| web/src/style.css | existing state-dot and dialog rules | n/a (contrast gate owns it) | — | pass |
| web/src/ws.ts | wsapp.ts | n/a (one handler) | — | pass |
| web/src/wsapp.ts | ws.ts, app.ts | n/a (prefs pattern) | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The two sub-controllers split out of `features/groups.ts` in the same commit get their markup in two different ways, and nothing says why. `features/groupsselect.ts` is handed its elements: `groups.ts:99-108` looks up the eight `#select-bar` nodes only to pass them to `initGroupsSelect(app, { toggle: selectBtn, bar }, deps)` at `groups.ts:147-156`. `features/groupsdialogs.ts:59-95` looks up its own twenty-odd nodes inside `initGroupsDialogs(app, deps)`. The sibling both header comments name as their model, `features/launchgroup.ts:45`, is `initLaunchGroup(elements: LaunchGroupElements)`, and `launch.ts:739-744` looks those elements up and hands them in. `launchresume.ts` gets its elements the same way. The `design:` line (`web-implementation.md:226`) says both modules "take `launchgroup.ts`'s shape", which is true of `groupsselect.ts` and not of `groupsdialogs.ts`. A newcomer adding a third piece to `groups.ts` cannot tell which shape to copy. This cites conventions § Design "Match the siblings" ("or says in Decisions why it diverges"). A fix must make the two sub-controllers of `groups.ts` get their elements the same way, or make the `design:` line state why the dialogs differ.

### Notes

1. **[note]** These size warnings have reasons that hold, unchanged from cycle 1:
   - `launcher.go` is 606 lines, up from 559. The group pieces went to `launchergroup.go`.
   - `manager.go` is 623 lines, up from 580. Fix wave 1 changed only its `groupsMu` comment.
   - `launchResume` is 62 lines, up from 61, with its prefix moved to `checkResumeRequest`.
   - `New` has 45 statements, up from 44. That is one registration line under its documented reason.
   - `features/launch.ts` is 770 lines, up from 731. The Group row lives in `launchgroup.ts`.

   `features/groups.ts` left the log by a split along real seams, not a cut to silence it. No `dupl` warning names any file. The funlen hits on the new test files (`groupSources`, `TestSetSessionsGroup`, `TestRebuild_PerSection`, `TestApplyGroupMove`, `TestSetGroupsOrder_WithLaunchHeldGroups`, `assertConsistent`) now carry a reason in `daemon-tests.md:114,166`. The other 16 hits are on test files that already exist on `main`.
2. **[note]** `features/groupsselect.ts:106-110` still adds a second `window` keydown listener for Escape. `features/shortcuts.ts:32` is the bound-chord listener, and Escape is not a bound chord, so this is not a divergence. Cycle 1's Note 7 asked for a `design:` line saying so, and none was added. Adding one would still save the next reader the search.
3. **[note]** The batch `origin` union is spelled out in `groups.ts:54` and again in `groupsselect.ts:28`, beside `BatchOrigin` in `features/actions.ts:58`. The design rule that a controller imports no sibling explains why the type is not imported. The compiler checks the hand-off at `groups.ts:151`, so the copies cannot drift without a type error.
4. **[note]** There are two "rail order" comparators with different tie-breaks. `groupsInRailOrder` (`sessions/sections.ts:61`) sorts by `pos` alone. `byPlace` (`:49-56`) and the daemon's `visibleGroupsLocked` (`internal/session/groups.go:140-145`) break a tie by id. `byPlace`'s comment says a tie cannot come from a current daemon, so the menus and the rail cannot disagree today.
5. **[note]** This is for review-work, as comment truth. The `ErrInvalidOrder` comment (`internal/session/railorder.go:9-13`) names `applyOrder` and `validateSessionIDs` as its sources, but `runBatch` now returns it too. The unwrapped line in that comment from cycle 1's Note 5 is still there.
6. **[note]** Three header comments were edited without being re-wrapped. They are `features/groups.ts:4-8`, `features/groupscopy.ts:3-5` and `render/selectbar.ts:2`, which runs past the wrap. This is cosmetic only.
7. **[note]** `dragreorder.ts`'s "all three are given or none" (`:63-67`) is a comment, not a type. `dropZoneSelector`, `zoneKeyAttribute` and `onDropZone` are three independent optionals. Without `zoneKeyAttribute`, a drop in a zone is ignored, as the `design:` line intends. One optional `dropZone` object would let the compiler enforce the rule. This is a suggestion, not a request.
8. **[note]** This is for review-work, as a diagram row. `kb:diagram/web-components` says `features/` has 31 modules and `render/` 35. The tree has 33 and 37 now that `groupsselect.ts`, `groupsdialogs.ts`, `anchored.ts` and `options.ts` exist. The features node also still says "groups owns the rail sections, select mode and the filter". No new dependency edge appeared.
9. **[note]** Shared state on the daemon side is guarded. The new reader `heldGroupIDsLocked` takes `mu` inside `groupsMu`, which is the declared lock order (`manager.go:140-145`). Every writer of `launchGroups` holds both locks, so the set cannot change between `SetGroupsOrder`'s `visibleGroupsLocked` and `heldGroupIDsLocked` calls. The gates' `go test -race -count=1 ./...` passed `internal/session`.

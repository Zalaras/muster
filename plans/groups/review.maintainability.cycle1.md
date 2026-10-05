# Maintainability review: Rail groups

**Plan**: groups
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 44195 words (budget 20000)
**Scope**: 72 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/server/groups.go | prefs.go, usage.go, sessions.go, sessionwire.go, respond.go | yes (groupsFeature, writeBodyError) | — | Minor 9 |
| internal/server/launcher.go | launcherpast.go, launcherrors.go | yes (size line) | file 606 (559 on main), reason holds | pass |
| internal/server/launchergroup.go | launcher.go, launcherpast.go | yes (size line names it) | — | pass |
| internal/server/launcherpast.go | launcher.go | yes (size line) | funlen `launchResume` 62 (61 on main), reason holds | pass |
| internal/server/launcherrors.go | launcher.go | n/a (one constructor beside its siblings) | — | pass |
| internal/server/respond.go | groups.go, sessions.go | yes (writeInvalidRequest) | — | pass |
| internal/server/server.go | usage.go, prefs.go | yes (groupsFeature registration) | funlen `New` 45 (44 on main), documented reason holds | pass |
| internal/server/sessions.go | groups.go, sessionwire.go | yes (teardownRemoved) | — | Minor 8 |
| internal/server/sessionwire.go | groups.go | n/a (one field) | — | pass |
| internal/server/state.go | groups.go, prefs.go | n/a (two fields) | — | pass |
| internal/session/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/session/actions.go | manager.go, manager_rail.go | yes (runBatch) | — | pass |
| internal/session/grouplaunch.go | groups.go, groupops.go, manager.go | yes (launchGroups) | — | pass |
| internal/session/grouplayout.go | railorder.go | yes | — | pass |
| internal/session/groupops.go | groups.go, manager_rail.go | yes (groupsMu writers) | — | pass |
| internal/session/groups.go | manager.go, manager_rail.go, railorder.go | yes | — | pass |
| internal/session/manager.go | manager_rail.go, writeorder.go | yes (groupsMu, launchGroups) | file 623 (580 on main), reason holds | pass |
| internal/session/manager_rail.go | railorder.go, groups.go | n/a (extends SetOrder) | — | pass |
| internal/session/railorder.go | grouplayout.go, manager_rail.go | yes (deviation line on rebuild) | — | pass (see Minor 8, Notes) |
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
| web/src/features/actions.ts | features/groups.ts, render/confirm.ts | yes (dispatchMany) | — | pass |
| web/src/features/actionscopy.ts | groupscopy.ts, sessions/card.ts | n/a | — | Minor 7 |
| web/src/features/batchplan.ts | launchgroupchoice.ts, groupscopy.ts | yes (fix 2 log) | — | pass |
| web/src/features/focus.ts | features/rail.ts, features/groups.ts | yes (groups deps) | — | pass |
| web/src/features/groups.ts | features/rail.ts, features/launch.ts, features/launchgroup.ts, features/shortcuts.ts, render/rename.ts | yes | file 610, **no reason** | Critical 1, Minor 1, Minor 3 |
| web/src/features/groupscopy.ts | actionscopy.ts, launchgroupchoice.ts | yes | — | Minor 4 |
| web/src/features/launch.ts | launchresume.ts, launchgroup.ts | yes | file 770 (731 on main), reason holds | pass |
| web/src/features/launchgroup.ts | launchresume.ts, launch.ts | yes | — | pass |
| web/src/features/launchgroupchoice.ts | launchpastlist.ts, groupscopy.ts | yes | — | Minor 3, Minor 4 |
| web/src/features/launchresume.ts | launch.ts | n/a (one parameter) | — | pass |
| web/src/features/rail.ts | features/groups.ts, features/tiles.ts | yes | — | pass |
| web/src/features/shortcuts.ts | shortcuts.ts | n/a (one binding) | — | pass |
| web/src/main.ts | features/*.ts registration | n/a (registration only) | — | pass |
| web/src/protocol/batch.ts | protocol/decode.ts, protocol/prefs.ts | yes (deviation line) | — | Minor 2 |
| web/src/protocol/groups.ts | protocol/prefs.ts, protocol/decode.ts | yes (prefs pattern) | — | Minor 2 |
| web/src/protocol/messages.ts | protocol/prefs.ts | n/a | — | pass |
| web/src/protocol/session.ts | protocol/decode.ts | n/a (one field) | — | Minor 2 |
| web/src/render/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/render/confirm.ts | groupdialogs.ts | yes (ConfirmRequest) | — | pass |
| web/src/render/dragreorder.ts | keyedreorder.ts, railsections.ts | yes | — | Minor 6 |
| web/src/render/groupdialogs.ts | confirm.ts, render/launch.ts, masthead.ts, issue.ts | yes (confirm.ts shape) | — | Minor 5 |
| web/src/render/grouppopover.ts | menu.ts | yes | — | Major 1 |
| web/src/render/keyedreorder.ts | railsections.ts, sessions.ts | yes (widened id) | — | pass |
| web/src/render/launch.ts | groupdialogs.ts, masthead.ts, issue.ts | yes (launchgroup.ts line) | — | Minor 5 |
| web/src/render/mainhead.ts | render/tiles.ts | n/a (one control) | — | pass |
| web/src/render/menu.ts | grouppopover.ts | yes | — | Major 1 |
| web/src/render/railsections.ts | render/sessions.ts, keyedreorder.ts, rename.ts | yes (reconcileCards shape) | — | pass |
| web/src/render/selectbar.ts | render/mainhead.ts | yes (renderMainhead shape) | — | pass |
| web/src/render/sessions.ts | railsections.ts, tiles.ts | yes (adopt, renderSessions dropped) | — | pass |
| web/src/render/tiles.ts | render/sessions.ts | n/a (comment) | — | pass |
| web/src/sessions/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/sessions/card.ts | actionscopy.ts, issue.ts, pane.ts | n/a (one helper) | — | see Minor 7 |
| web/src/sessions/railorder.ts | sessions/reorder.ts, sessions/sort.ts | n/a (extends moveCard) | — | pass |
| web/src/sessions/sections.ts | sessions/sort.ts, sessions/railorder.ts, sessions/reorder.ts | yes | — | Minor 3 |
| web/src/sessions/sort.ts | sections.ts | n/a (comment) | — | pass |
| web/src/sessions/testfixtures.ts | api/testfakes.ts, nine private `makeSession` copies | stated in the file header | — | note |
| web/src/shortcuts.ts | features/shortcuts.ts | n/a (one table row) | — | pass |
| web/src/style.css | existing state-dot and dialog rules | n/a (contrast gate owns it) | — | pass |
| web/src/ws.ts | wsapp.ts | n/a (one handler) | — | pass |
| web/src/wsapp.ts | ws.ts, app.ts | n/a (prefs pattern) | — | pass |

## Issues

### Critical

1. **[web-impl]** A daemon answer closes whatever name field is open, not the one it committed — `web/src/features/groups.ts:333-336` (`commitRename`) and `web/src/features/groups.ts:350-352` (`commitNew`'s success path) — the per-window `editing` state is written from an async continuation with no identity check. The interleaving, in order:
   1. The developer renames group A and presses Enter. `commitRename` sets `editing.readOnly = true` and sends `updateGroup`.
   2. Before the daemon answers, the developer double-clicks group B's name. `startRename` (`groups.ts:298-309`) has no in-flight check, so it replaces `editing` with B's editor. A's field blurs, and `onNameBlur` returns on `readOnly` (`groups.ts:546`).
   3. A's response arrives. `closeEditing()` (`groups.ts:335`) sets `editing = null`, and the next pass closes B's field mid-typing, which loses what was typed.

   The same happens when ⌥⌘G (`newGroup`, `groups.ts:311-322`) or a rename starts while a new group's create is in flight. The window is one daemon round trip, which includes the SQLite write the daemon makes under `groupsMu`. The module already guards this correctly in two places: the `groups` handler compares the object it holds (`groups.ts:157-160`), and `commitNew`'s failure path mutates only `pending`. The sibling editor, `web/src/render/rename.ts:71-82`, never closes from an async continuation. A fix must make this true: a daemon answer closes the editor only while `editing` is still the object that answer was for, or no new edit can start while one is in flight.

### Major

1. **[web-impl]** The branch adds two implementations of anchored-panel placement — `web/src/render/menu.ts:96-108` (`position`) and `web/src/render/grouppopover.ts:72-81` (`place`) — cites § Design "Reuse before add" ("A second implementation of an existing idea is a defect even when both work"). Both place the panel below the anchor, flip it above when it would overflow, and clamp it inside the viewport, and each declares its own `EDGE_GAP = 8` and a 4px gap (`menu.ts:35-36`, `grouppopover.ts:15-16`). The only difference is the menu's right-align when it would overflow. The two `design:` lines for these files do not mention each other. Search output:
   ```
   web/src/render/grouppopover.ts:15:const EDGE_GAP = 8;
   web/src/render/grouppopover.ts:78:    below + height > window.innerHeight - EDGE_GAP ? box.top - ANCHOR_GAP - height : below;
   web/src/render/grouppopover.ts:79:  panel.style.left = `${Math.max(EDGE_GAP, Math.min(box.left, window.innerWidth - width - EDGE_GAP))}px`;
   web/src/render/menu.ts:35:const EDGE_GAP = 8;
   web/src/render/menu.ts:105:    below + height > window.innerHeight - EDGE_GAP ? anchor.top - OPENER_GAP - height : below;
   web/src/render/menu.ts:106:  panel.style.left = `${Math.max(EDGE_GAP, Math.min(left, window.innerWidth - width - EDGE_GAP))}px`;
   ```
   A fix must leave one placement routine in `render/` that both modules call, with the right-align behaviour as the caller's choice.

### Minor

1. **[web-impl]** `web/src/features/groups.ts` is 610 lines and trips the file-length warning with no reason given. Fix attempt 2 says the file is "kept for the reason in the initial log", but the initial log's only `size:` line is about `features/launch.ts` (`web-implementation.md:64`). The file is one roughly 500-line `initGroups` closure. It holds select mode and its bar, the filter, the name editor, three menus, two dialogs and the header drag. Its sibling `features/launch.ts` moves this kind of growth into sub-controllers (`launchresume.ts`, `launchgroup.ts`). This cites kb:adr/process-size-linters-warn-never-fail. A fix must either give a reason that holds or extract a cohesive sub-controller the `launchgroup.ts` way, such as select mode and its bar. A split that only silences the warning is not a fix.
2. **[web-impl]** The integer adapter for wire values is spelled three times, and none of the copies is in `decode.ts`. They are `web/src/protocol/batch.ts:14-16` (a private `asInteger`), `web/src/protocol/groups.ts:44` and `web/src/protocol/session.ts:346`, all three new on this branch. The header of `web/src/protocol/decode.ts:1-5` says that module "owns how a JSON primitive … [is] recognised", and its existing `asNumber` (`decode.ts:17-19`) is the sibling adapter. This cites § Design "One owner per concept". A fix must leave one exported integer adapter in `decode.ts` that all three sites use.
3. **[web-impl]** "Groups in rail order" is computed in three places: `web/src/sessions/sections.ts:42-49` (`byPlace`), `web/src/features/groups.ts:106-108` (`byPos`, used at 389 and 510) and `web/src/features/launchgroupchoice.ts:27`, which sorts inline. This cites § Design "One owner per concept". A fix must leave one derivation in `sessions/sections.ts` that the menu, the delete dialog's targets and the launch Group row all read.
4. **[web-impl]** The same user-facing labels are defined in more than one module. "No group" appears in `features/groupscopy.ts:21` and `features/launchgroupchoice.ts:14`. "New group…" appears in `groupscopy.ts:10` and `launchgroupchoice.ts:15`. "Ungrouped" appears in `sessions/sections.ts:21` and `groupscopy.ts:20`. This cites § Design "One owner per concept". A fix must give each label one constant that every surface imports.
5. **[web-impl]** The branch builds `<option>` lists twice, in the same shape. One is `web/src/render/launch.ts:296-310` (`renderGroupOptions`), the other `web/src/render/groupdialogs.ts:57-66` (`fillTargets`). Each does `select.replaceChildren(...items.map(createElement("option")))`. This cites § Design "Reuse before add". A fix must leave one option-list builder in `render/` that both call. The older copies at `render/masthead.ts:209` and `render/issue.ts:32` predate the branch, so moving them is optional.
6. **[web-impl]** The generic drag module hard-codes the rail's attribute name: `web/src/render/dragreorder.ts:192` reads `zoneOf(event.target)?.dataset["groupId"]`. The same install already takes the item id's attribute as an option (`idAttribute`, `dragreorder.ts:58-60` and `105`), and its header says it has "no Session or store knowledge at all". This cites the sibling option in the same file. A fix must make the zone key's attribute the caller's, as `idAttribute` is for items.
7. **[web-impl]** The new `displayTitle` (`web/src/sessions/card.ts:96-101`) is the shared title fallback, but `web/src/features/actionscopy.ts:17`, which this branch edits, still spells `session.title ?? "untitled"` itself. This cites § Design "One owner per concept". A fix must make the files this branch touches use `displayTitle`. `render/issue.ts:34` and `terminal/pane.ts:96` predate the branch, so changing them is optional.
8. **[daemon-impl]** The rule that a batch id list has no duplicates lives in the HTTP handler for the batch endpoints, `internal/server/sessions.go:165-185` (`decodeBatchRequest`, `hasDuplicateIDs`). The sibling handlers do it differently: `handleSetOrder` and `handleSetSessionsGroup` let the manager refuse a repeated id (`internal/session/railorder.go:98-101` in `applyOrder`, `railorder.go:129-145` in `validateSessionIDs`, both returning `ErrInvalidOrder`) and only map the error. The same seen-map loop appears a third time as `hasDuplicateRailPos` (`railorder.go:244-254`). This cites conventions § Go "Business logic never lives in HTTP handlers; handlers decode, delegate, encode" and the sibling handlers. A fix must make the session package own the duplicate rule for `EndMany` and `RemoveMany`, with the handler mapping its error as its siblings do.
9. **[daemon-impl]** The batch report's wire shape lives in the group endpoints' file but serves the session endpoints too. `batchWire`, `toWireBatch` and `nonNil` (`internal/server/groups.go:103-121`) are used by `sessions.go:198` and `sessions.go:214` as well as by delete-group. Session wire shapes live in `internal/server/sessionwire.go`. This cites sibling placement. A fix must put the batch wire beside the endpoints that own it, with `groups.go` importing it from there.

### Notes

1. **[note]** These size warnings have reasons that hold:
   - `launcher.go` is 606 lines, up from 559. The group pieces went to `launchergroup.go`.
   - `manager.go` is 623 lines, up from 580. The group pieces went to `grouplaunch.go`, `groups.go` and `groupops.go`.
   - `launchResume` is 62 lines, up from 61, with its prefix moved to `checkResumeRequest`.
   - `New` has 45 statements, up from 44. That is one registration line under its documented reason.
   - `features/launch.ts` is 770 lines, up from 731. The Group row lives in `launchgroup.ts`.
   - No `dupl` warning names a touched file.
2. **[note]** These funlen warnings are on new test files, which are outside this diff and are not `dupl` hits. `daemon-tests.md` gives no reason for them:
   - `groupSources` (73 lines) in `groups_invariants_test.go`.
   - `TestSetSessionsGroup` (66 lines) in `groups_test.go`.
   - `TestRebuild_PerSection` (85 lines) and `TestApplyGroupMove` (70 lines) in `railorder_group_test.go`.
3. **[note]** This is for review-work, as comment truth. The `groupsMu` comment at `internal/session/manager.go` says its writers are "the group methods in groups.go and LoadAll", but most of them live in `groupops.go` and `grouplaunch.go`. The `displayTitle` comment says "none composes its own fallback", which Minor 7 shows is not yet true.
4. **[note]** This is for review-work, as a diagram row. The module counts on `kb:diagram/web-components` are now stale: `features/` 24, `render/` 30 and `protocol/` 8. No new dependency edge appeared on either component diagram.
5. **[note]** Two comments in `internal/session/railorder.go` were edited without being re-wrapped. One is the `ErrInvalidOrder` comment, whose line 11 now runs past the paragraph's wrap. The other is in the `applyPin` comment. This is cosmetic only.
6. **[note]** `internal/server/groups.go:178` builds a `groupWire` inline beside `toWireGroups`, which does the same conversion.
7. **[note]** `features/groups.ts:273` adds a second `window` keydown listener, for Escape leaving select mode. `features/shortcuts.ts`'s header calls that listener "the one … for every bound chord". Escape is not a bound chord, so this is not a divergence. A `design:` line saying so would spare the next reader the search.
8. **[note]** `internal/session/groups.go`'s `GroupRef` has no `design:` line. Its doc comment explains why it is a pointer to a nullable id, and the `json.RawMessage` deviation line covers the decode side.
9. **[note]** These choices diverge from a sibling, and each has its reason stated in the code or the logs:
   - `web/src/sessions/testfixtures.ts` adds a shared `makeSession` while nine private copies remain, and its header says so.
   - The section header carries two ids, `data-group-id` (pinned by the Testable UI table) and `data-section-id` (the wire id). The design line covers this.
   - `writeInvalidRequest` is used only by the new handlers, and its design line says the 26 older literal sites were left alone.
   - The name field's `maxLength = 40` literal matches `render/rename.ts:108`'s `100`.

# Completion notes — plan `groups`

Every `[note]` from the four review cycles, verbatim, grouped by cycle and part. Listed per `.claude/skills/orchestrate/SKILL.md` § Completion step 3; none is routed. The ones worth keeping are proposed in `proposed-backlog.md`.

## Cycle 1 (`plans/groups/review.cycle1.md`)

**Reviewer-Verified Criteria** — 1. **[note]** The first `make test-race` run was red on `TestHandleTerminal_SecondSocketSupersedesTheFirst` (`internal/server/terminal_test.go:408`, "An error is expected but got nil"); the re-run in `$GATES_LOG_DIR` is green. Neither that test nor any terminal code is touched by the branch. daemon-tests saw a second unrelated flake, `TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal` (`shellscroll_test.go:195`). Both are candidates for `proposed-backlog.md`.

**Reviewer-Verified Criteria** — 2. **[note]** On `PUT /api/sessions/group`, a missing or mistyped `groupId` gets `groupId is required and must be an integer or null` (`internal/server/sessions.go`). `docs/protocol.md` prints one message, "ids must be known session ids without duplicates", after a list of causes that includes the missing key. The contract text is ambiguous and the code is the same. `doc-reconcile` should record the shipped message.

**Reviewer-Verified Criteria** — 3. **[note]** The plan contradicts itself in two places, and the tests honestly pin the contract both times:
   - I3 and D6 say non-requested sessions never change, but the contract re-enforces the per-section invariant, which moves a target section's unpinned members when a pinned session joins.
   - Edge case 22 says ungrouped pinned members land "at the end of" Ungrouped's pinned block, but `ungroup` keeps railPos, so they land by railPos (`TestApplyGroupMove`).
   No code change is requested.

**Reviewer-Verified Criteria** — 4. **[note]** In `deleteGroupRemoving` (`internal/session/groupops.go:223`), a session moved into the group by another window during a `remove` batch makes the response `deleted:false` with no `failed` member. The contract says `false` "only when a remove left a failed member behind". The race is narrow and the group correctly stays.

**Reviewer-Verified Criteria** — 5. **[note]** `parseSession` requires `groupId`, as W2 mandates. The plan's "an older daemon's snapshot … renders flat" therefore holds only for a snapshot with no sessions; one with sessions is rejected whole.

**Reviewer-Verified Criteria** — 6. **[note]** The rail spec's `go` frontmatter did not gain `internal/session/groups*.go` and `grouplayout*.go` as the plan's doc upkeep listed. The new session files are owned by lifecycle's glob, and `check-kb` is clean.

**Reviewer-Verified Criteria** — 7. **[note]** For review-maintainability: the stylesheet adds px glyph sizes for the caret, kebab and tick (`font-size: 10px`, `14px`, `11px`), following the existing `.arr` precedent rather than an `--fs-*` token.

**Browser review** — 1. **[note]** In the gates directory, `02-test.log` (19:36) records `make test-race` failing at `TestHandleTerminal_SecondSocketSupersedesTheFirst`. `01-test.log` (19:51) is green, and the orchestrator reports one red line (`dead-refs`). This belongs to review-work.

**Browser review** — 2. **[note]** A drag onto a header scrolled out of view was not measured. Playwright scrolls the target into view mid-drag, and the drop then never lands (b1 kept its group). With both ends on screen in the same overflowing 720 px rail, the drags apply. A native drag would rely on Chromium's edge autoscroll, which this instrument cannot reproduce. Card drag in an overflowing rail predates this plan.

**Browser review** — 3. **[note]** Removing every session while groups exist leaves each group's empty line and `no ungrouped sessions`. A separate `No sessions yet` sits below the last section (header bottom 370, line at 410–457). E15 asks for that line and it is present. The rail reads two "empty" statements, one under the other. No change requested.

**Browser review** — 4. **[note]** In edge case 28 with real frames, the select drops the deleted group and shows `No group` within a render tick, so a launch then goes ungrouped without an error. The `unknown group` refusal appears only inside that sub-second window, which `groups-launch.spec.ts` holds open by withholding frames. This matches the plan's "re-populates from the next render".

**Browser review** — 5. **[note]** `n of m` counts members of collapsed sections that the filter keeps. With A collapsed and filter Groups the count read `3 of 5` while one card was laid out. This matches the spec's "while the filter hides cards". The plan's Web notes say the count comes from `visibleCards`, which skips collapsed sections. That is a statement for review-work.

**Browser review** — 6. **[note]** A filter the developer picks can hide the focused session (filter Ungrouped while a grouped session is focused). Focus keeps showing it, with one live client and no visible current card in the rail. I4 lists only launch, ⌥⌘0 and default focus as sources, so this is not a violation.

**Browser review** — 7. **[note]** The selection bar's `Done` is the plan's mode-exit label, not a session state, so design-system §6.5 is not engaged. The planning-state summary dot was not driven, because it needs a plan-mode hook sequence. The other six states were measured against their tokens. xterm `scrollback` is not observable without a page hook. The plan touches no terminal code, and one live client held across collapse and filter.

**Browser review** — 8. **[note]** Pre-existing, not this plan: with zero sessions `#rail-count` reads `""`, not `0`. Double-clicking the Ungrouped name collapses it, because both clicks read the same state, which follows the recorded single-click-folds deviation.

**Maintainability review** — 1. **[note]** These size warnings have reasons that hold:
   - `launcher.go` is 606 lines, up from 559. The group pieces went to `launchergroup.go`.
   - `manager.go` is 623 lines, up from 580. The group pieces went to `grouplaunch.go`, `groups.go` and `groupops.go`.
   - `launchResume` is 62 lines, up from 61, with its prefix moved to `checkResumeRequest`.
   - `New` has 45 statements, up from 44. That is one registration line under its documented reason.
   - `features/launch.ts` is 770 lines, up from 731. The Group row lives in `launchgroup.ts`.
   - No `dupl` warning names a touched file.

**Maintainability review** — 2. **[note]** These funlen warnings are on new test files, which are outside this diff and are not `dupl` hits. `daemon-tests.md` gives no reason for them:
   - `groupSources` (73 lines) in `groups_invariants_test.go`.
   - `TestSetSessionsGroup` (66 lines) in `groups_test.go`.
   - `TestRebuild_PerSection` (85 lines) and `TestApplyGroupMove` (70 lines) in `railorder_group_test.go`.

**Maintainability review** — 3. **[note]** This is for review-work, as comment truth. The `groupsMu` comment at `internal/session/manager.go` says its writers are "the group methods in groups.go and LoadAll", but most of them live in `groupops.go` and `grouplaunch.go`. The `displayTitle` comment says "none composes its own fallback", which Minor 7 shows is not yet true.

**Maintainability review** — 4. **[note]** This is for review-work, as a diagram row. The module counts on `kb:diagram/web-components` are now stale: `features/` 24, `render/` 30 and `protocol/` 8. No new dependency edge appeared on either component diagram.

**Maintainability review** — 5. **[note]** Two comments in `internal/session/railorder.go` were edited without being re-wrapped. One is the `ErrInvalidOrder` comment, whose line 11 now runs past the paragraph's wrap. The other is in the `applyPin` comment. This is cosmetic only.

**Maintainability review** — 6. **[note]** `internal/server/groups.go:178` builds a `groupWire` inline beside `toWireGroups`, which does the same conversion.

**Maintainability review** — 7. **[note]** `features/groups.ts:273` adds a second `window` keydown listener, for Escape leaving select mode. `features/shortcuts.ts`'s header calls that listener "the one … for every bound chord". Escape is not a bound chord, so this is not a divergence. A `design:` line saying so would spare the next reader the search.

**Maintainability review** — 8. **[note]** `internal/session/groups.go`'s `GroupRef` has no `design:` line. Its doc comment explains why it is a pointer to a nullable id, and the `json.RawMessage` deviation line covers the decode side.

**Maintainability review** — 9. **[note]** These choices diverge from a sibling, and each has its reason stated in the code or the logs:
   - `web/src/sessions/testfixtures.ts` adds a shared `makeSession` while nine private copies remain, and its header says so.
   - The section header carries two ids, `data-group-id` (pinned by the Testable UI table) and `data-section-id` (the wire id). The design line covers this.
   - `writeInvalidRequest` is used only by the new handlers, and its design line says the 26 older literal sites were left alone.
   - The name field's `maxLength = 40` literal matches `render/rename.ts:108`'s `100`.

## Cycle 2 (`plans/groups/review.cycle2.md`)

**Reviewer-Verified Criteria** — 1. **[note]** The W13 globs do not reach `render/anchored.ts`, `render/options.ts` or `features/batchplan.ts`. A grep of every non-test web file this branch touches finds no `any` and no `innerHTML`, only three comments using the word "any".

**Reviewer-Verified Criteria** — 2. **[note]** The 500 branch of `writeBatchError` (`internal/server/sessions.go`) is untested. `runBatch` returns an error only for a repeated id, so no fake can reach it. daemon-tests says so in its log.

**Reviewer-Verified Criteria** — 3. **[note]** These are for doc-reconcile, and no change is requested. The `sessions.order` stop-being-true line says listed ids take "the railPos values the section already holds". With `groupId`, a joining card brings its own railPos into the target's set. Also, `PUT /api/groups/order` lists only the groups a client has been told of: a launch-held group is left out and keeps its slot above Ungrouped.

**Reviewer-Verified Criteria** — 4. **[note]** This is for review-maintainability. `render/options.ts` calls itself "the one `<option>` list builder", but `render/masthead.ts:209` and `render/issue.ts:32` still build their own. Both predate the branch, and the cycle-1 finding left moving them optional.

**Reviewer-Verified Criteria** — 5. **[note]** Cycle-1 correctness Notes 4, 5 and 6 still stand unchanged. They are the `deleteGroupRemoving` race that yields `deleted:false` with no failed member, `parseSession` rejecting an older daemon's sessions, and the rail spec's `go` globs leaving the new session files to lifecycle.

**Browser review** — 1. **[note]** While a rename's `PUT` response is held, the name field stays open on the old header after the daemon's `groups` frame has arrived. It closes when the response lands. In real use this lasts one round trip, and the identity guard keeps a second field safe through it.

**Browser review** — 2. **[note]** A drag whose source starts below the fold was not measured. When Playwright scrolls the rail between `mouse.down` and the first move, Chromium picks the card now under the original point. In a 720 px viewport this moved `d-b1` instead of `d-u1`, and a header drag moved the wrong section. With both ends on screen in a 1400 px viewport, every drag landed as intended and DOM matched the daemon. A real pointer cannot scroll between press and drag start, so I read this as the instrument. Cycle 1's Note 2 hit the same limit.

**Browser review** — 3. **[note]** Removing every session while groups exist leaves each group's empty line and `no ungrouped sessions`, with a separate `No sessions yet` below the last section. E15 asks for that line and it is present. No change requested.

**Browser review** — 4. **[note]** In select mode the card title moves right by 21 px at every density (compact x 14 → 35), and its line and the card's height do not change. This matches the mockup's `.card .chk.left` (static, 8 px right margin). The plan's Web note says the checkbox sits "in the stripe column's gutter". That statement is review-work's to weigh.

**Browser review** — 5. **[note]** In edge case 28 with real frames, the launch select drops the deleted group and shows `No group` within 15 ms. A launch then goes ungrouped without an error. The `unknown group` refusal shows only inside that window, which `groups-launch.spec.ts` holds open by withholding frames. This matches the plan's "re-populates from the next render".

**Browser review** — 6. **[note]** `n of m` counts members of collapsed sections that the filter keeps (`3 of 5` with one card laid out). This is unchanged from cycle 1 and matches the spec's wording.

**Browser review** — 7. **[note]** The rail never scrolls a newly focused card into view. After the I4 filter flip, the launched card sat at 736–875, below the list's 720 bottom, with `scrollTop` 0. The same happens with no groups (card 666–805) and for ⌥⌘5 onto an off-screen card. No `scrollIntoView` exists in `web/src`, so this predates the plan. E22's "visible" holds in the sense the plan means: the card is in a shown section and is current. A backlog entry may be worth it.

**Browser review** — 8. **[note]** The daemon fix "a held launch group no longer blocks reorder" has no browser instrument. The group is held only while a `newGroup` launch is inside the daemon, which the stub `claude` and tmux finish in milliseconds. A response hold delays only the answer, after the hold has ended. The unit test the fix names is review-work's to read.

**Browser review** — 9. **[note]** Pre-existing, not this plan: with zero sessions `#rail-count` reads `""`, not `0`. A single click on a renameable group's name does not fold it; this is the recorded deviation kb:adr/rail-group-name-click-does-not-fold. The Ungrouped name still folds.

**Maintainability review** — 1. **[note]** These size warnings have reasons that hold, unchanged from cycle 1:
   - `launcher.go` is 606 lines, up from 559. The group pieces went to `launchergroup.go`.
   - `manager.go` is 623 lines, up from 580. Fix wave 1 changed only its `groupsMu` comment.
   - `launchResume` is 62 lines, up from 61, with its prefix moved to `checkResumeRequest`.
   - `New` has 45 statements, up from 44. That is one registration line under its documented reason.
   - `features/launch.ts` is 770 lines, up from 731. The Group row lives in `launchgroup.ts`.

**Maintainability review** — 2. **[note]** `features/groupsselect.ts:106-110` still adds a second `window` keydown listener for Escape. `features/shortcuts.ts:32` is the bound-chord listener, and Escape is not a bound chord, so this is not a divergence. Cycle 1's Note 7 asked for a `design:` line saying so, and none was added. Adding one would still save the next reader the search.

**Maintainability review** — 3. **[note]** The batch `origin` union is spelled out in `groups.ts:54` and again in `groupsselect.ts:28`, beside `BatchOrigin` in `features/actions.ts:58`. The design rule that a controller imports no sibling explains why the type is not imported. The compiler checks the hand-off at `groups.ts:151`, so the copies cannot drift without a type error.

**Maintainability review** — 4. **[note]** There are two "rail order" comparators with different tie-breaks. `groupsInRailOrder` (`sessions/sections.ts:61`) sorts by `pos` alone. `byPlace` (`:49-56`) and the daemon's `visibleGroupsLocked` (`internal/session/groups.go:140-145`) break a tie by id. `byPlace`'s comment says a tie cannot come from a current daemon, so the menus and the rail cannot disagree today.

**Maintainability review** — 5. **[note]** This is for review-work, as comment truth. The `ErrInvalidOrder` comment (`internal/session/railorder.go:9-13`) names `applyOrder` and `validateSessionIDs` as its sources, but `runBatch` now returns it too. The unwrapped line in that comment from cycle 1's Note 5 is still there.

**Maintainability review** — 6. **[note]** Three header comments were edited without being re-wrapped. They are `features/groups.ts:4-8`, `features/groupscopy.ts:3-5` and `render/selectbar.ts:2`, which runs past the wrap. This is cosmetic only.

**Maintainability review** — 7. **[note]** `dragreorder.ts`'s "all three are given or none" (`:63-67`) is a comment, not a type. `dropZoneSelector`, `zoneKeyAttribute` and `onDropZone` are three independent optionals. Without `zoneKeyAttribute`, a drop in a zone is ignored, as the `design:` line intends. One optional `dropZone` object would let the compiler enforce the rule. This is a suggestion, not a request.

**Maintainability review** — 8. **[note]** This is for review-work, as a diagram row. `kb:diagram/web-components` says `features/` has 31 modules and `render/` 35. The tree has 33 and 37 now that `groupsselect.ts`, `groupsdialogs.ts`, `anchored.ts` and `options.ts` exist. The features node also still says "groups owns the rail sections, select mode and the filter". No new dependency edge appeared.

**Maintainability review** — 9. **[note]** Shared state on the daemon side is guarded. The new reader `heldGroupIDsLocked` takes `mu` inside `groupsMu`, which is the declared lock order (`manager.go:140-145`). Every writer of `launchGroups` holds both locks, so the set cannot change between `SetGroupsOrder`'s `visibleGroupsLocked` and `heldGroupIDsLocked` calls. The gates' `go test -race -count=1 ./...` passed `internal/session`.

## Cycle 3 (`plans/groups/review.cycle3.md`)

**Reviewer-Verified Criteria** — 1. **[note]** The W13 globs still do not reach `render/anchored.ts`, `render/options.ts`, `features/batchplan.ts`, `features/launchgroup.ts` or `features/launchgroupchoice.ts`. The same grep over those five files finds nothing.

**Reviewer-Verified Criteria** — 2. **[note]** This is for daemon-impl, and no change is requested. The edge in Major 1 is also a latent behaviour. A corrupt duplicate-railPos rail that is reordered after `LoadAll` can renumber a session onto or past `nextRailPos`, so the next new session can share a railPos. The following rebuild repairs it. Main's whole-list renumber had the same edge, and the daemon never writes duplicates itself.

**Reviewer-Verified Criteria** — 3. **[note]** The features guide's list of pure helpers omits `launchpastlist.ts`, which calls itself "Pure decisions". The omission predates this branch and is on `main` too.

**Reviewer-Verified Criteria** — 4. **[note]** Cycle-2 correctness Notes 2–5 still stand unchanged. They cover the untested 500 branch of `writeBatchError`, two `sessions.order` points for doc-reconcile, `render/options.ts` calling itself the one option builder, and cycle-1 Notes 4–6.

**Browser review** — 1. **[note]** The cycle-2 matrix was not re-driven outside the two dialogs. fdb5aed3 changes only where their elements are looked up, and the gates' `e2e` line is green on this tree. Cycle 2's notes still hold.

**Browser review** — 2. **[note]** After Create from a selection, select mode stays on with the same two sessions selected (`2 selected`). This matches cycle 2's Move to behaviour. No change requested.

**Browser review** — 3. **[note]** The new-group refusal shows the daemon's raw message `unknown session` when a selected session is removed behind the open modal. It sits inside the dialog and clears on the next keystroke. Whether that wording is enough is review-work's to weigh against the plan's copy.

**Maintainability review** — 1. **[note]** The fix wave changed no shared state. The daemon change in `railorder.go` touches only comments. The `ErrInvalidOrder` comment (`:9-15`) now names `runBatch` as a source, and `rg ErrInvalidOrder internal/session` confirms the three sources it lists (`railorder.go:85,100,105,136`, `actions.go:131`). Whether the reworded `applyPin` comment (`:42-45`) is true belongs to review-work.

**Maintainability review** — 2. **[note]** The size log is unchanged from cycle 2. The cycle 2 reasons still hold for `launcher.go`, `manager.go`, `launch.ts`, `launchResume` and `New`. No delta file appears in it.

**Maintainability review** — 3. **[note]** This is for review-work, as plan-doc truth. The file table row for `groupsdialogs.ts` (`web-implementation.md:195`) still lists "element lookups" among the module's jobs. The fix log at `:254` records the change. The `design:` line, the header comment and the package guide agree with the code.

**Maintainability review** — 4. **[note]** `kb:diagram/web-components` now says 33 `features/` modules and 37 `render/` modules. It describes groups' select mode and dialogs as sub-controllers. Both counts match the tree, which closes cycle 2's Note 8.

**Maintainability review** — 5. **[note]** Cycle 2's Note 2 is still open. No `design:` line says why `groupsselect.ts` adds its own `window` keydown listener for Escape. It is not a divergence, so no change is requested.

## Cycle 4 (approved) (`plans/groups/review.md`)

**Reviewer-Verified Criteria** — 1. **[note]** `plan.md` is stamped `**Status**: blocked` from the exhausted budget (`200960ac`). The orchestrator should flip it when this cycle completes.

**Reviewer-Verified Criteria** — 2. **[note]** Cycle-3 correctness Notes 1–4 still stand unchanged. They cover the W13 glob reach, the latent duplicate-railPos edge that main's renumber shared, `launchpastlist.ts` missing from the features guide's helper list, and the carried cycle-2 Notes.


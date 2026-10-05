# Review: groups

**Plan**: groups
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Rail groups

**Plan**: groups
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 65982 words (budget 20000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — rail ⋯, ⌥⌘G, Move to → New group…, launch `newGroup`, Focus control; pending section; trimmed 1–40 | Yes — E1, E2; D11; new: a create's answer closes only its own field (groups.spec.ts) | pass |
| REQ-2 | Yes — dblclick / ⋯ Rename; `closeEditingIf` guards the async close (cycle-1 maintainability Critical 1) | Yes — E3; D11, D14; new: a rename's answer closes only its own field | pass |
| REQ-3 | Yes — caret/header/⋯ toggle, persisted `collapsed` | Yes — E6, E8; D8 | pass |
| REQ-4 | Yes — empty body line, menu keeps Rename/Delete | Yes — E4 | pass |
| REQ-5 | Yes — delete dialog (now `features/groupsdialogs.ts`), three dispositions, count | Yes — E7; D9, D13 | pass |
| REQ-6 | Yes — `ungroup` keeps railPos | Yes — E7; D4 | pass |
| REQ-7 | Yes — Stop all… → `POST /api/sessions/end`, live ids only | Yes — E14; batchplan.test.ts | pass |
| REQ-8 | Yes — header drag → `PUT /api/groups/order`; a launch-held group no longer fails it (cycle-1 correctness Minor 1) | Yes — E10; D12; `TestSetGroupsOrder_WithLaunchHeldGroups` and three siblings | pass |
| REQ-9 | Yes — drop on header/body → `sessions/group` (zone key now the caller's `zoneKeyAttribute`); among cards → `sessions/order` + `groupId` | Yes — E5; W7; D4; dragreorder.test.ts | pass |
| REQ-10 (amended twice) | Yes — `.ingroup` between name and meta, `@container (width < 640px)`, 6rem title floor, repo block floor | Yes — E27 (amended); new 640 px present / 639 px absent pair | pass |
| REQ-11 | Yes — Group row, default from focused session, both-or-neither launch | Yes — E17, E18, E19; D10, D16 | pass |
| REQ-12 | Yes — select mode now `features/groupsselect.ts`; every bar button and both checkbox kinds disabled while down (cycle-1 browser Minor 1) | Yes — E12, E13, E16; new daemon-down select tests | pass |
| REQ-13 | Yes — Move to menu; bulk Stop/Remove dialogs with counts | Yes — E14; W12 | pass |
| REQ-14 | Yes — All → Remove… → `POST /api/sessions/remove` | Yes — E15 | pass |
| REQ-15 | Yes — Ungrouped header and filter iff a group exists | Yes — E1, E7; W6 | pass |
| REQ-16 | Yes — `.gsum` count and per-state dots; popover | Yes — E8, E9; W6 | pass |
| REQ-17 | Yes — All · Groups · Ungrouped, `n of m`, window state | Yes — E20, E22; W8 | pass |
| REQ-18 | Yes — sections fixed, cards sorted per section | Yes — E8; sections.test.ts | pass |
| REQ-19 | Yes — `nth` over visible cards; ⌥⌘0 `reveal(id, true)` | Yes — E20, E21; W8 | pass |
| REQ-20 | Yes — `LoadAll` loads groups and layout | Yes — E6; D8 | pass |
| REQ-21 | Yes — rows, whole-list `groups`, `groupId` on upsert, client adopts from the wire only | Yes — E25; D15 | pass |
| REQ-22 | Yes — `dispatchMany` calls the batch endpoints once; the duplicate-id rule now in `runBatch` | Yes — D9; `TestBatch_ARepeatedIDIsRefusedBeforeAnythingRuns`; `TestBatchEndpoints_RefuseABadIDsList` | pass |
| REQ-23 | Yes — per-section `rebuild` (option C′), unique railPos | Yes — D4 | pass |
| REQ-24 | Yes — `draggable="false"` in select mode | Yes — E12 | pass |
| REQ-25 | Yes — header drag in both modes | Yes — E10, E11 | pass |
| REQ-26 | Yes — unknown `groupId` renders in Ungrouped | Yes — W5 | pass |
| REQ-27 | Yes — `batchReport` into `#action-error` | Yes — groupscopy.test.ts; E14 | pass |
| DIAG | store-schema, domain-model, daemon-components, containers true; web-components and one-launch-end-to-end false | — | fail — Major 2 |

## Build & Tests

E2E tests: pass (713) · Daemon tests (race): pass (every package ok, `02-test.log`) · Web tests: pass (2404) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; Biome clean) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass (`01-build.log` empty) |
| test | `make test-race` | pass (`02-test.log`, no FAIL) |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2404) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| kb-check | `make check-kb` | pass (522 records, 0 problems) |
| dead-refs | `dead-refs.py --all` | pass (0 missing; `.claude/worktrees` now "ignored by design") |
| e2e-lint | `make e2e-lint` | pass |
| features | features-scope | pass |
| comments | comment-checks | pass |
| size | `make size-warn` | WARN (27 hits) — review-maintainability's |
| e2e | `make e2e` | pass (713 passed) |
| D1 | `make test` | pass (deduped to test-race) |
| D2 | `go build ./...` | pass (deduped to build) |
| D3 | `make lint` | pass (deduped to lint) |
| D17 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`17-D17.log` empty) |
| D18 | `make test-race` | pass (deduped to test) |
| W1 | `make web-build` | pass (deduped) |
| W2 | `make web-test` | pass (deduped) |
| W3 | `make web-lint` | pass (deduped) |
| W4 | `make contrast` | pass (deduped) |
| W13 | `! rg -n ": any\b\|as any\b\|\.innerHTML = " web/src …` | pass (`18-W13.log` empty; Note 1) |
| E28 | `make e2e` | pass (deduped to e2e, 713 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — two diagram records false (Major 2); design-system bar-button size (Minor 2). Every cycle-1 doc item is fixed: dead-refs, both protocol stop-being-true lines, design-system tokens, the 640 px ADR, the features-header ADR. Every `deviation:` line carries `→ kb:adr/…` or a stated no-ADR reason, and each record is `proposed` with `plan:groups`. TODO ticks are correctly deferred until `approved`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4 | I1 from every source incl. reload | pass | `groups_invariants_test.go` 38 sources; `assertConsistent` now also checks launch-held groups' pos |
| D5 | no dangling `GroupID` | pass | same rig, I2 after each delete disposition and restart |
| D6 | bystanders untouched | pass | `TestBystanders_AreNeverChangedOrBroadcast`; batch repeat refusal asserts no listed id ran |
| D7 | `/clear`, straggler, late `SessionEnd(clear)`, resume keep `GroupID` | pass | `TestGroupID_SurvivesClearRebindStragglerLateSessionEndAndResume` |
| D8 | `LoadAll` restores everything | pass | `TestLoadAll_RestoresGroupsLayoutAndMembership` |
| D9 | done/skipped/failed | pass | `actions_batch_test.go`; repeated id now `ErrInvalidOrder` before anything runs |
| D10 | failed `newGroup` launch leaves no row | pass | `TestLaunchGroup_ASpawnFailureLeavesNoGroupAndAnnouncesNone`; `TestLaunchGroup_ARetriedCollisionStillCreatesExactlyOneGroup` |
| D11 | name bounds 400 | pass | `TestCreateGroup_RefusesAndCreatesNothing`, `TestUpdateGroup_Refuses` |
| D12 | order refusals change nothing | pass | `TestSetGroupsOrder_RefusesAnInvalidOrderAndChangesNothing`; `…HeldGroupIsNotPartOfTheClientsOrder` |
| D13 | move to unknown `to` → 404 | pass | `TestDeleteGroup_Refuses` |
| D14 | one `groups` on change, none on no-op | pass | `TestUpdateGroup_AlreadyInTheRequestedStateBroadcastsNothing`, `TestSetAllCollapsed`, `…UnchangedOrderWithAHeldGroupBroadcastsNothing` |
| D15 | `groups` before joins, after leaves | pass | `TestCreateGroup_WithSessionsBroadcastsGroupsBeforeEveryUpsert`, `TestDeleteGroup_BroadcastsMemberChangesBeforeGroups` |
| D16 | launch group refusals and placement | pass | `TestLaunchGroup_RefusesBeforeAnySideEffect`, `TestLaunchGroup_IntoAnExistingGroup` |
| W5–W12 | Vitest coverage | pass | as cycle 1; plus `decode.test.ts` (`asInteger`), `anchored.test.ts`, `options.test.ts`, `dragreorder.test.ts` (`zoneKeyAttribute`), `selectbar.test.ts` (All and Done disabled while down), `groupsInRailOrder` |
| W14 | main.ts registration only; no sibling controller imported | pass | `main.ts` unchanged since cycle 1; `groups.ts` imports its own sub-controllers `groupsselect.ts` and `groupsdialogs.ts`, the `launch.ts` → `launchgroup.ts` precedent |
| E1–E27 | driven live by review-browser | present | every one named by a test in the four `groups*.spec.ts` files; the six new tests were read and assert positive outcomes on both sides of each fix |
| copy | labels match the table verbatim | pass | `NO_GROUP_CHOICE` / `NEW_GROUP_CHOICE` / `UNGROUPED_NAME` keep the table's strings |
| colour | no literal, state tokens only for their state | pass | stylesheet diff since cycle 1 is a comment and the query only |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D17 green; no Claude-Code field in new or changed Go outside `internal/claudecode/` |
| 2 | Terminal-output state parsing | pass — none added |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux | pass — no tmux invocation added |
| 5 | Payload logging | pass — new log lines carry ids and errors only |
| 6 | Empty-gauge dishonesty | pass — an empty group shows its true `0` and no dots |
| 7 | Identity on `session_id` | pass — `groupId` keys on the Muster id |
| 8 | Settings trespass | pass — the one `settings.local.json` write is a test's scratch dir |
| 9 | Real `claude` | pass — none launched |

## Cycle 1 fixes

| Cycle-1 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| correctness Critical 1 `[orchestrator]` dead-refs red on `.claude/worktrees` | `b0e0913` | `.gitignore` entry; `11-dead-refs.log` 0 missing |
| correctness Major 1 `[web-impl]` false style.css comment "repo / branch never truncate" | `5b83df5c` | comment now states the 640 px rule, title floor and repo floor, citing both ADRs |
| correctness Major 2 `[orchestrator]` protocol sentences on `sessions.group` / `sessions.order` | `b0e0913` | both, plus the `groupId` message, are stop-being-true lines in `doc-delta.md` |
| correctness Major 3 `[orchestrator]` design-system tokens | `b0e0913` | header name `--fg-muted` / Ungrouped `--fg-dim`, popover `--edge`, titles `--fg-muted`; each matches the CSS |
| correctness Major 4 `[orchestrator]` 640 px ADR false | `b0e0913` | Decision names the content box; Consequences cite the floor ADR |
| correctness Major 5 `[orchestrator]` no features-header ADR | `b0e0913` | `process-features-header-widens-for-forced-fixture-repairs`, proposed, refs the decision file |
| correctness Major 6 `[orchestrator]` stale diagrams | `b0e0913` | updated, then made stale again by the web fix wave and one wrong retry line (Major 2) |
| correctness Minor 1 `[daemon-impl]` held launch group fails reorder | `5e777784` | validates against visible groups, slots held ones above Ungrouped; four new tests |
| correctness Minor 2 `[web-impl]` `max-width: 640px` | `5b83df5c` | `@container (width < 640px)`; 640/639 E2E pair |
| browser Major 1 `[orchestrator:decision]` control hide rule | `0a2d0dad` | Option A by consensus; REQ-10 amended; new ADR; CSS and design-system agree |
| browser Minor 1 `[web-impl]` selection live while down | `5b83df5c` | All, Done and card checkbox disabled; `selectMany` no-op while down; E2E pins it |
| maintainability Critical 1 `[web-impl]` editor identity | `5b83df5c` | `closeEditingIf(committed)` on both async paths; two E2E tests hold the answer and assert the second field survives |
| maintainability Major 1 `[web-impl]` two placement routines | `5b83df5c` | one `placeAnchored`; menu passes `alignRight` |
| maintainability Minors 1–7 `[web-impl]` | `5b83df5c` | `groups.ts` 435 lines by extraction; `asInteger` in `decode.ts`; `groupsInRailOrder`; shared labels; `fillOptions`; `zoneKeyAttribute`; `displayTitle` in actionscopy |
| maintainability Minors 8–9 `[daemon-impl]` | `5e777784` | `runBatch` owns the duplicate rule, handler maps `ErrInvalidOrder`; `batchWire` moved to `sessionwire.go` |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** A comment states a rebuild behaviour this plan removed — `internal/session/railorder.go:38-44` (`applyPin`). It says that without the same-flag short circuit, the rebuild "renumbers every entry as a contiguous 0..n-1 index", which "closes the gap" a Remove left and broadcasts an untouched bystander. Under option C′ (kb:adr/rail-pin-invariant-scoped-per-section) `rebuild` reuses each section's own railPos values, and its own comment at `railorder.go:194-199` says a section that already satisfies the invariant keeps every value. Only a corrupt duplicate-railPos row is still renumbered 0..n-1. Restate why the short circuit exists in terms of what `rebuild` now does, or drop the false rationale.
2. **[orchestrator]** Two diagram records are false about what shipped (DIAG):
   - `kb:diagram/web-components` says `features/` has 31 modules and `render/` 35. The web fix wave added `features/groupsselect.ts`, `features/groupsdialogs.ts`, `render/anchored.ts` and `render/options.ts`, so the counts are 33 and 37. The features box's "18 controllers plus 13 DOM-free helpers" split needs the two new sub-controllers too.
   - `kb:diagram/one-launch-end-to-end` says that on an `ErrSessionExists` collision the launcher will "roll the row back (DiscardLaunchGroup too), raise the floor, retry". The code keeps the held group across retries and discards it only when the whole launch fails (`internal/server/launcher.go:389-394`). `TestLaunchGroup_ARetriedCollisionStillCreatesExactlyOneGroup` pins "the retry reuses the launch's group". Move `DiscardLaunchGroup` out of the retry branch to a final-failure step.

### Minor

1. **[web-impl]** The hand-written parts of two package guides are out of date after the split. `web/src/features/CLAUDE.md` says `groups.ts` owns select mode and the group dialogs. Those now live in `groupsselect.ts` and `groupsdialogs.ts`, which the guide does not name, though it names `launchgroup.ts` as `launch.ts`'s sub-controller. The guide's list of pure helpers also omits the branch's `batchplan.ts`. `web/src/render/CLAUDE.md`'s list of rail group modules omits `anchored.ts` and `options.ts`. The web-impl log flagged these lists and left them, but both files are web-impl's under the plan's Affected Files.
2. **[orchestrator]** `docs/design/design-system.md` §5 Selection bar says the bar's buttons are "ordinary **Buttons**". The Buttons entry gives those as `--fs-xs`, but `.selbar .btn` sets `--fs-2xs` (`web/src/style.css:3997-4000`). Name the smaller size.

### Notes

1. **[note]** The W13 globs do not reach `render/anchored.ts`, `render/options.ts` or `features/batchplan.ts`. A grep of every non-test web file this branch touches finds no `any` and no `innerHTML`, only three comments using the word "any".
2. **[note]** The 500 branch of `writeBatchError` (`internal/server/sessions.go`) is untested. `runBatch` returns an error only for a repeated id, so no fake can reach it. daemon-tests says so in its log.
3. **[note]** These are for doc-reconcile, and no change is requested. The `sessions.order` stop-being-true line says listed ids take "the railPos values the section already holds". With `groupId`, a joining card brings its own railPos into the target's set. Also, `PUT /api/groups/order` lists only the groups a client has been told of: a launch-held group is left out and keeps its slot above Ungrouped.
4. **[note]** This is for review-maintainability. `render/options.ts` calls itself "the one `<option>` list builder", but `render/masthead.ts:209` and `render/issue.ts:32` still build their own. Both predate the branch, and the cycle-1 finding left moving them optional.
5. **[note]** Cycle-1 correctness Notes 4, 5 and 6 still stand unchanged. They are the `deleteGroupRemoving` race that yields `deleted:false` with no failed member, `parseSession` rejecting an older daemon's sessions, and the rail spec's `go` globs leaving the new session files to lifecycle.

## Browser review

# Browser review: Rail groups

**Plan**: groups
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 39368 words (budget 20000)
**Rig**: `bin/musterd` built fresh by `make web-build build` at c9902fc4 (clean tree). Each test ran its own `ScratchDaemon` from `web/e2e/helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-XXXX`, a private socket `<data dir>/tmux.sock` removed with it, and the shared E2E stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven by headless Chromium through throwaway `web/e2e/zz-rb2-*.spec.ts` specs in the foreground, now deleted with their `test-results` folders. Afterwards no `musterd` or tmux process was left, and `git status --porcelain` showed nothing of mine.

Gates log read, not re-run (`gates-groups-c2`). Every line is green: `web-build` built, `e2e` reads `713 passed (5.0m)`, `dead-refs` reads `0 missing`. The app I drove is the one that ships.

This cycle re-drove the whole matrix, because the fix wave touched almost every surface: the menu and popover placement (`placeAnchored`), the option builder behind the launch and delete selects, select mode (moved to its own module), both group dialogs, the card drop zones, the session decoder and the daemon's batch and reorder paths. REQ-10 is measured against its amended text: the control hides below a 640 px content box, and above that the title may shorten beside it, never below its 6rem floor.

## Matrix

Hosts are `focus` (rail, mainhead, launch dialog), `tiles` (grid, strip, launch dialog opened from Tiles) and `pop-out` (`/doc.html`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| all rows | pop-out | all | — | N/A — `/doc.html` hosts only the reader | `grep -c 'rail\|sessions\|mainhead' web/doc.html` → 0 |
| States | focus | no data yet (WS routed silent) | no header, no filter, no select bar before the first snapshot | pass | heads 0; `#rail-filter` display none; `#select-bar` display none |
| REQ-15 | focus | no data | Select and ⋯ sit inside the rail head | pass | Select 202,83–257,102 and ⋯ 263,83–287,102 inside railhead 0,46–299,112 |
| REQ-15 | focus | data, no groups | flat rail: no header, no filter, count as today | pass | heads 0; filter display none; count `3` |
| Views: rail ⋯ | focus | data, no groups | opened by Enter: New group… enabled, both collapse items disabled, hint `aria-hidden`, menu below its opener and inside the viewport | pass | menu 263,106–453,206 under opener 263,83–287,102; `aria-expanded=true` |
| Views: menu | focus | data | ArrowDown moves focus; Escape closes and returns focus to the opener | pass | focus on `New group…`; menus 0; active `rail-actions-button` |
| REQ-1 | focus | data, no groups | New group…: pending section above the first card, `Group name` focused, same node after a tick | pass | pending 0,112–299,146 above card 0,146–299,285; same node after 1300 ms |
| REQ-1/E2 | focus | data, no groups | Escape, empty Enter and blur each discard with no request | pass | fields 0 each time; heads 0; requests `[]` |
| REQ-1 | focus | data | ⌥⌘G opens the field focused; 45 typed characters keep 40 | pass | length 40 |
| REQ-1/E1/I6 | focus | data | Enter keeps the trimmed name; Ungrouped header and filter appear; count unchanged | pass | `   Review queue   ` → DOM and daemon `Review queue`; one `POST /api/groups`; filter display flex; count `3` |
| REQ-15 | focus | data | row 2 (filter, Select, ⋯) fits the 300 px rail head | pass | filter 12–178, Select 202–257, ⋯ 263–287 in head 0–299; row 2 scroll 275/275 |
| Views: sections | focus | data | a 40-character name ellipsizes; summary and ⋯ stay inside the header | pass | name 28–227 clipped; sum 233–263 and ⋯ 269–291 inside head 0–299 |
| Views: header ⋯ | focus | data | ⋯ opacity 0 at rest, 1 on hover and on keyboard focus | pass | `0`, `1`, `1` |
| REQ-2 | focus | data | double-click opens a prefilled, fully selected, focused field inside the header; same node after a tick | pass | `{"v":"Alpha","s":0,"e":5}`; field 28,123–168,138 in head 0,114–299,148 |
| E3/edge 12 | focus | data | Escape and a whitespace-only Enter restore the name with no request | pass | `Alpha` both; requests `[]` |
| REQ-2/E3 | focus | data | new name shows at once in header, daemon, Focus control, popover and launch Group options | pass | `Alpha two▾`; popover `Alpha two 2 sessions…`; options `No group, Alpha two, Beta, New group…` |
| REQ-2 (fix wave) | focus | data, rename `PUT` answered but its response held | a second name field opened meanwhile survives the answer, keeps focus and its typing | pass | after release: B fields 1, value `typing-in-b`, focused |
| REQ-1 (fix wave) | focus | data, create `POST` answered but its response held | a rename field opened meanwhile survives the answer, keeps focus and its typing | pass | after release: B fields 1, value `still-typing`, focused; Enter then committed it |
| Views: header ⋯ | focus | data | items and order; menu right-aligned under its ⋯, inside the viewport | pass | `Rename, Collapse, Select all (6), New group…, Stop all…, Ungroup, Delete group…`; menu 269,142–459,359 under ⋯ 269,124–291,138 |
| Views: header ⋯ | focus | data | Ungrouped menu omits Rename, Ungroup and Delete group… | pass | `Collapse, Select all (1), New group…, Stop all…` |
| Views: header ⋯ | focus | data | Rename chosen by keyboard leaves its field focused across a tick | pass | same node after 1300 ms |
| REQ-3 | focus | data | a click on the header's blank part collapses: body none, caret `Expand Alpha`, `aria-expanded=false`, `.collapsed`, daemon collapsed | pass | collapsed 12 ms after the click |
| REQ-3 | focus | data | the caret by keyboard toggles and keeps its node focused across a tick; ⋯ → Collapse collapses | pass | body none; same node |
| REQ-3 | focus | data | a single click on a renameable group's name does not fold | N/A — recorded deviation, kb:adr/rail-group-name-click-does-not-fold | not collapsed after 2 s |
| Views: rail ⋯ | focus | data | collapse items enabled; Collapse all flips every section, Ungrouped included | pass | daemon `[true,true,true]`; laid-out cards 0 |
| REQ-3/REQ-17/REQ-20 | focus | data, reload | section order and collapsed state survive; filter resets to All | pass | `["1","2","ungrouped"]` before and after; B body none; filter `All` |
| REQ-20/E6 | focus | data, daemon restarted | order, membership and collapsed state survive | pass | sections = oracle; A `[1,2]` = oracle; B body none |
| REQ-4/E4 | focus | data, empty group | count 0, no dots, drop line shown; Select all (0) and Stop all… disabled; Rename and Delete group… offered; popover `empty` | pass | line `empty — drop sessions here` display block 0,493–299,533 |
| REQ-16 | focus | data | count, then one item per state in attention order, each title `1 <word>`, matching the daemon | pass | `needs_input, failed, started, working, idle, ended`; daemon states agree |
| REQ-16 / §3 | focus | data | each dot is its state's token; ended is `--line-control` | pass | backgrounds equal `--amber`, `--rose`, `--fg-muted`, `--teal`, `--idle`, `--line-control` |
| REQ-16 | focus | data | six items fit the 300 px header | pass | sum 118–263, ⋯ 269–291, head 0–299 |
| REQ-16 | focus | data | popover absent at 150 ms, then below the header, inside the viewport, pointer-events none | pass | count 0 at 150 ms; tip 8,152–228,376 under head 114–148 |
| REQ-16/E9 | focus | data | popover names the group, `6 sessions`, each state word and each member | pass | `Six 6 sessions needs input 1 p-need … ended 1 p-end` |
| Views: popover | focus | data | removed on leave; caret focus shows it; Tab removes it | pass | 0 after leave; 0 after Tab |
| Views: popover, menu | focus | data, header near the viewport bottom (330 px tall) | popover and ⋯ menu stay inside the viewport | pass | head 158–192; tip 8,196–228,265; menu 269,186–459,322 |
| REQ-9/E5 | focus | data, manual, both ends on screen | card dropped on a header joins the end of that section (DOM = daemon) | pass | `[1,2,5]` both; invariant problems `[]` |
| REQ-9/E5 | focus | data, manual | card dropped on a pinned card of another section joins it there and takes its pin | pass | `[2,3,4]` both; a2 pinned |
| REQ-9 | focus | data, manual | card dropped on the Ungrouped header leaves its group | pass | Ungrouped `[6,1]` both |
| REQ-4/REQ-9 | focus | data, manual | card dropped on an empty group's drop line joins it | pass | `[6]` both |
| REQ-8/E10 | focus | data, manual | header dragged above another reorders the sections | pass | `["2","1","3","ungrouped"]` both |
| REQ-25/E10 | focus | data, attention | Ungrouped header drags; cards `draggable=false`, headers `true` | pass | `["ungrouped","2","1","3"]` both |
| REQ-8 | focus | data, reload | section order survives | pass | `["ungrouped","2","1","3"]` both |
| edge 16/E11 | focus | data, manual | header onto a card, card onto the rail head and onto the filter: nothing sent or changed | pass | requests `[]`; order unchanged; no drop class left |
| REQ-8/REQ-9 | focus | data, ends off screen | drag with the source below the fold | not measured — Note 2 | |
| REQ-7 | focus | data | Stop all… dialog copy, inside the viewport | pass | `Stop 2 sessions?`; body ends ` The group stays.`; `Cancel, Stop 2`; 420,282–860,438 |
| REQ-7/E14 | focus | data | members end and stay in the group; ended dot reads 2 | pass | `1:false, 2:false` in A; ended `2` |
| REQ-5 | focus | data | delete dialog: title, count body, three radios with Ungrouped checked, Target group, footer, no overflow | pass | `Delete group “Bb”?` / `…its 1 session.`; target `Aa, Cc, Dd`; 438/438 × 388/388 |
| REQ-5 | focus | data | a radio and Target group keep focus across a tick | pass | both true |
| REQ-5/E7 | focus | data | Move to another group (end of Aa), Move to Ungrouped, Stop and remove, each against the daemon | pass | A `[1,2,3]` = oracle; c1 groupId null; d1 row and tmux pane gone |
| Views: delete dialog | focus | data | an empty group shows the one line and hides the radios | pass | `The group is empty; nothing else changes.`; choices display none |
| Views: delete dialog | focus | data, one group | the other-group radio and Target group are not laid out | pass | target no box under a `[hidden]` ancestor; radios `Move them to Ungrouped`, `Stop and remove them` |
| REQ-6 | focus | data | Ungroup: no dialog; members keep relative order in Ungrouped | pass | `[1,2,3]` → Ungrouped `[6,1,2,4,3]`; dialogs 0 |
| REQ-15/I6 | focus | data | deleting the last group removes the Ungrouped header and the filter | pass | heads 0; filter display none |
| REQ-12 | focus | data (12 cards) | Select: a checkbox per card (12) and header (3), cards `draggable=false`, pin display none, `aria-pressed=true` | pass | as stated |
| REQ-12 | focus | data, overflow (640 px tall) | bar at the rail's foot inside rail and viewport; list scrolls above it; buttons inside the bar | pass | rail 0,46–300,640; bar 0,579–299,640; list 114–579, scroll 1764/465 auto |
| REQ-12 | focus | data, overflow | scrolled to the end, the last card sits above the bar | pass | last card bottom 579 = bar top 579 |
| Views: sections | focus | data, overflow | a section header sticks to the list top | pass | head y 114 = list y 114 at scrollTop 120 |
| REQ-12 | focus | data | at 0 selected: `Select sessions`; Move to, Ungroup, Stop…, Remove… disabled | pass | All and Done enabled |
| REQ-12/E13 | focus | data | card clicks toggle; `2 selected`; mainhead and current marker unchanged | pass | mainhead `s10-card`; current `[10]` |
| Views / §3 | focus | data | a selected card is a neutral `--fg` stripe on `--bg-hover` | pass | stripe and inset shadow rgb(232,230,225) = `--fg`; ground rgb(28,32,41) = `--bg-hover` |
| REQ-12 | focus | data | Space on a card checkbox toggles it and keeps its node across a tick | pass | `3 selected`; same node |
| REQ-12/E13 | focus | data | a header checkbox selects its members | pass | 3 → 5 selected |
| REQ-12 | focus | data, compact / comfortable / expanded | checkbox inside the card, clear of the title; compact height and title line unchanged | pass | compact 102.5 → 102.5; title y unchanged (Note 4) |
| REQ-12 | focus | data, select off | header checkboxes left in the DOM are not laid out | pass | `hidden`, display none, 0 rects |
| REQ-13 | focus | data | Move to opens above its button, inside the viewport, clear of the bar's buttons; items as planned | pass | menu 88,438–278,584; opener 88,588; `Move to` header, `Grp A, Grp B, New group…, Ungrouped` |
| REQ-13/E14 | focus | data | Move to Grp A puts the selection at its end; selection kept; tick then on Grp A | pass | `[1,2,3,6,7]` both; `✓Grp A` |
| REQ-13 | focus | data | New group… modal titled from the count, field focused across a tick; Create makes the group with the selection | pass | `New group from 2 sessions`; members `[6,7]` = DOM |
| REQ-13 | focus | data | Stop… and Remove… copy with one ended session selected | pass | `Stop 2 sessions?` / `Remove 3 sessions?`, `2 of them are alive…`, `Remove 3` |
| REQ-12 | focus | data | Escape with the Move to menu or a bulk dialog open closes only that, keeping the selection | pass | bar flex; `2 selected` / `3 selected` |
| REQ-27/edge 8 | focus | data, a selected session removed behind the open dialog | the daemon skips it and the fixed phrase shows; a later complete batch clears it | pass | one `POST /api/sessions/remove`; `Not every session was handled — some were skipped or failed.` display block; then display none |
| REQ-14/E15 | focus | data → no data | Select → All → Remove 4 with a group present: `No sessions yet`, mainhead hidden, mode off | pass | daemon sessions 0 (layout: Note 3) |
| REQ-12/E12 | focus | data, attention, no groups | select mode works; Move to offers `New group…, ✓Ungrouped`; Ungroup disabled; New group… makes the group | pass | group `[1]` |
| REQ-12/E16 | focus | data | Escape, Done and switching to Tiles each leave the mode; re-entry starts at 0; cards draggable again | pass | `Select sessions`; Tiles group chrome 0 |
| REQ-11 | focus | data | Group row under Title inside the dialog, defaulting to the focused session's group; name field hidden | pass | select 381,478–561,508 under Title 439–467; field display none |
| REQ-11 | focus | data | keyboard typeahead picks New group…; the field appears beside it; select and field keep node and focus across a tick | pass | field 569,479–983,507; both same node |
| REQ-11 | focus | data, Resume tab | the same row shows inside the dialog, keeping the choice | pass | select 381,496–561,526 |
| REQ-11/E18 | focus | data | a refused launch with New group… creates neither; the name is kept | pass | groups `Alpha, Bravo`; sessions 3; field `Hotfix` |
| REQ-11/E18 | focus | data | the retry creates group and session; the card is its only member, focused | pass | Hotfix `[4]`; control `Hotfix▾`; `aria-current=true` |
| REQ-11 | focus | data | a launch into an existing group lands at its end | pass | `[1,2,5]` both |
| edge 28/E19 | focus | data, real frames | the chosen group deleted while the dialog is open | observed — Note 5 | select falls to `No group` 15 ms after the delete |
| REQ-26/edge 21 | focus | data, `groups` frame withheld | a card naming an unknown group renders in Ungrouped with no error; the next frame corrects it | pass | Ungrouped `[3,2]`, errors `[]`; then Bravo `[2]` |
| REQ-11/edge 27 | tiles | data | a dialog opened from Tiles defaults to the focused session's group, inside the dialog | pass | `Bravo` |
| REQ-19/E20 | focus | data, A collapsed | ⌥⌘1 focuses the first displayed card | pass | `c-b1`; displayed `[3,4,5]` |
| REQ-17 | focus | data, filter Groups | count `n of m`; the filter button keeps focus across a tick when pressed by Enter | pass | `3 of 5` (Note 6) |
| REQ-19/E20 | focus | data, filter Groups | ⌥⌘1 focuses the first grouped displayed card | pass | `c-b1` |
| REQ-19/I4/E21/E22 | focus | data, filter Ungrouped, A collapsed | ⌥⌘0 onto a2: section expands, filter flips to All, card current | pass | card 287–430 inside list 114–720 |
| I4/E22 | focus | data, filter Groups | an ungrouped launch flips the filter to All, shows the plain total and focuses the new card | pass | filter `All`; count `4` = daemon 4; mainhead `q-new` (scroll: Note 7) |
| REQ-10 | focus | data | control between the name and the repo readout, with its title and `aria-hidden` caret | pass | name 314–404, control 416–469, meta 481–682 |
| REQ-10 | focus | data | click opens Move to below the control, inside the viewport: header, groups with tick, New group…, No group | pass | menu 416,83–606,229 |
| REQ-10 | focus | data | Escape returns focus to the control | pass | active `ingroup` |
| REQ-10 | focus | data | arrows move focus; Enter on Bravo moves the session to Bravo's end; focus returns and holds across a tick | pass | B DOM `[2,1]` = oracle; label `Bravo▾` |
| REQ-10 | focus | data | ungrouped reads `no group`; New group… opens the naming modal and the session joins the new group | pass | `New group from 1 session`; Charlie `[3]`; `Charlie▾` |
| REQ-10/E27 (amended) | focus | data, 29-char title, 6-char folder | 8 px sweep 1240→480: control shown iff content box ≥ 640; title ≥ 6rem; folder at its 8ch floor; no overlap; fit clean | pass | fails `[]`; last shown at content 644, first hidden at 636; title shortened beside the control at 800 (163 px), which the amendment allows |
| REQ-10/E27 (amended) | focus | data, 66-char title, 6-char folder | same sweep | pass | fails `[]`; title 163–510 px while shown, floor 90 px |
| REQ-10/E27 (amended) | focus | data, 29-char title, 10-char folder | same sweep; folder at or above its floor, never hidden | pass | fails `[]`; folder 54–81 px against a 54 px floor |
| REQ-10 (fix wave) | focus | data | the boundary is strict: content box 641 and 640 shown, 639 hidden | pass | `641:flex, 640:flex, 639:none` in all three setups |
| REQ-10 | tiles | data | — | N/A — the plan gives Tiles no group control | |
| I7/E23 | tiles | data, A collapsed, filter set, select mode on | grid and strip carry no header, section, checkbox or group control | pass | group chrome 0 |
| I7/E23 | tiles | data | the strip follows the flat order | pass | strip `[5]`, the flat order `[4,5,1,2,3]` minus the four grid tiles |
| REQ-12/E16 | tiles | data | switching to Tiles left select mode | pass | back in Focus `aria-pressed=false` |
| REQ-1/W11 | tiles | data | ⌥⌘G is inert; no pending section back in Focus | pass | pending 0; groups 2 |
| rail rows (REQ-1–9, 12–19) | tiles | all | — | N/A — the rail is hidden in Tiles; the I7 rows cover what Tiles shows | |
| States | focus | daemon-down | banner shown, inside the viewport | pass | 1280×32 at 0,46 |
| States/E24 | focus | daemon-down, select mode on | the open header menu closes; every card and header checkbox, every bar button (All and Done included), Select, rail ⋯, carets, header ⋯ and the Focus control disabled; headers not draggable | pass | menus 0; all `disabled`; draggable `false`×2 (cycle 1 Minor 1 fixed) |
| States (fix wave) | focus | daemon-down | forced clicks on a card, a card checkbox and a header ⋯ change nothing | pass | still `1 selected`; menus 0; focused session unchanged |
| States (fix wave) | focus | daemon-down | Escape still leaves select mode | pass | `aria-pressed=false`; bar display none |
| States | focus | daemon-down | header click and name double-click do nothing; ⌥⌘G opens nothing; the Focus control opens nothing | pass | body block; fields 0; menus 0 |
| States/E24 | focus | reconnect | sections render once each; controls enabled again | pass | `["1","ungrouped"]`; cards 3 |
| States/E24 | focus | daemon down, then back, select mode on | select mode and its selection survive; controls enabled | pass | `1 selected`; bar enabled per selection; checkboxes enabled |
| REQ-5/E24 | focus | daemon-down | the delete-group dialog closes on the status change; on reconnect the sections render once | pass | `open:false`, display none; `["1","ungrouped"]` |
| States | tiles | daemon-down | — | N/A — Tiles has no group control | |
| edge 7/E25 | focus (second window) | data | create, rename, collapse and delete reach the other window without reload | pass | p2 heads follow; filter display none after the delete |
| window state | focus (second window) | data | a filter in one window leaves the other on All | pass | p2 `All` |
| E26/edge 17 | focus | data, delete dialog open | ⌥⌘1, ⌥⌘0 and ⌥⌘G change nothing | pass | focused unchanged; pending 0; dialog open |
| §7.1 | focus | data, focused section collapsed | one live client and the pane are kept | pass | attached clients 1 → 1; xterm display block |
| §6 | focus | all | no gauge, Done state, cost or unlabelled stale display among the plan's surfaces | pass | summaries count known states; ended is neutral; the bar's `Done` is a mode exit |
| daemon fix wave | focus | data, a `newGroup` launch in flight | a section reorder succeeds while a launch holds its group | not measured — Note 8 | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** While a rename's `PUT` response is held, the name field stays open on the old header after the daemon's `groups` frame has arrived. It closes when the response lands. In real use this lasts one round trip, and the identity guard keeps a second field safe through it.
2. **[note]** A drag whose source starts below the fold was not measured. When Playwright scrolls the rail between `mouse.down` and the first move, Chromium picks the card now under the original point. In a 720 px viewport this moved `d-b1` instead of `d-u1`, and a header drag moved the wrong section. With both ends on screen in a 1400 px viewport, every drag landed as intended and DOM matched the daemon. A real pointer cannot scroll between press and drag start, so I read this as the instrument. Cycle 1's Note 2 hit the same limit.
3. **[note]** Removing every session while groups exist leaves each group's empty line and `no ungrouped sessions`, with a separate `No sessions yet` below the last section. E15 asks for that line and it is present. No change requested.
4. **[note]** In select mode the card title moves right by 21 px at every density (compact x 14 → 35), and its line and the card's height do not change. This matches the mockup's `.card .chk.left` (static, 8 px right margin). The plan's Web note says the checkbox sits "in the stripe column's gutter". That statement is review-work's to weigh.
5. **[note]** In edge case 28 with real frames, the launch select drops the deleted group and shows `No group` within 15 ms. A launch then goes ungrouped without an error. The `unknown group` refusal shows only inside that window, which `groups-launch.spec.ts` holds open by withholding frames. This matches the plan's "re-populates from the next render".
6. **[note]** `n of m` counts members of collapsed sections that the filter keeps (`3 of 5` with one card laid out). This is unchanged from cycle 1 and matches the spec's wording.
7. **[note]** The rail never scrolls a newly focused card into view. After the I4 filter flip, the launched card sat at 736–875, below the list's 720 bottom, with `scrollTop` 0. The same happens with no groups (card 666–805) and for ⌥⌘5 onto an off-screen card. No `scrollIntoView` exists in `web/src`, so this predates the plan. E22's "visible" holds in the sense the plan means: the card is in a shown section and is current. A backlog entry may be worth it.
8. **[note]** The daemon fix "a held launch group no longer blocks reorder" has no browser instrument. The group is held only while a `newGroup` launch is inside the daemon, which the stub `claude` and tmux finish in milliseconds. A response hold delays only the answer, after the hold has ended. The unit test the fix names is review-work's to read.
9. **[note]** Pre-existing, not this plan: with zero sessions `#rail-count` reads `""`, not `0`. A single click on a renameable group's name does not fold it; this is the recorded deviation kb:adr/rail-group-name-click-does-not-fold. The Ungrouped name still folds.

## Maintainability review

# Maintainability review: Rail groups

**Plan**: groups
**Part verdict**: needs-changes
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

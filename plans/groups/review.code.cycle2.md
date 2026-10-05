# Correctness review: Rail groups

**Plan**: groups
**Verdict**: needs-changes
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

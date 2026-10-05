# Daemon Tests: Rail groups

**Plan**: groups
**Verdict**: pass
**Pack**: kb: pack 46683 words (budget 20000) — WARN: pack exceeds budget of 20000 words (rules 953 · features 17333 · decisions 15909 · facts 10268 · lessons 2212)

## Summary

Tests created: 136 test functions in 10 new files (552 counting subtests) | Passing: 552 | Failing: 0

Gates, last run on the final tree, all in the foreground:

| Gate | Result |
|------|--------|
| `go build ./...` | exit 0 |
| `make test` | every package `ok` (second run; see Notes for one unrelated flake on the first) |
| `make test-race` | every package `ok` (run before the last test was added; the added test is read-only and ran under `go test` only) |
| `make lint` | `0 issues.` |
| D17 `rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | no match, exit 1 |

Fails-on-old-code was proved in a throwaway copy of the tree (never in this worktree): 14 mutations of the production code, each caught by the tests named below. Output is under Notes.

## Tests

Table-driven tests list their subtests as rows of the table; counts are test functions.

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/store/group_test.go` | `TestReadUngroupedLayout`, `TestListGroups_Empty…` | Absent, written, corrupt and empty-object `rail_ungrouped` blobs (corrupt reads as absent, never an error) | pass |
| `internal/store/group_test.go` | `TestInsertGroup_*` (3) | The row and the displaced layout commit together; a failing layout write (kv dropped) rolls the inserted row back | pass |
| `internal/store/group_test.go` | `TestSaveGroups_*`, `TestDeleteGroup_*` | Whole-layout rewrite in one transaction; groups not named keep every column; delete rewrites what remains | pass |
| `internal/store/group_test.go` | `TestSessionGroupID_RoundTrips…` | `group_id` through Insert, Update, Get and List, nil and set | pass |
| `internal/session/grouplayout_test.go` | `TestSectionOrder`, `TestInsertBeforeUngrouped`, `TestRemoveSection`, `TestValidateSectionOrder`, `TestPositionsOf`, `TestWithPositions`, `TestSectionAlgebra_…` | The pure section algebra: sort with deterministic ties, insert above Ungrouped wherever it sits, validate `order` (D12 pure half), renumber, copy semantics | pass |
| `internal/session/railorder_group_test.go` | `TestRebuild_PerSection` | Per-section rebuild: valid candidate keeps every value, pinned moves forward only inside its own section, gaps survive, duplicate railPos falls back to 0..n-1 | pass |
| `internal/session/railorder_group_test.go` | `TestApplyPin_*`, `TestApplyOrder_Join*` | Pin and order with a join section leave other sections byte-identical | pass |
| `internal/session/railorder_group_test.go` | `TestApplyGroupMove*` (5) | Fresh move lands at the section end, pin kept, listed order; dissolve keeps railPos then re-enforces the invariant; no-op returns nil and never closes a bystander's gap; bad ids refused before computing | pass |
| `internal/session/railorder_group_test.go` | `TestI1_HoldsFromEveryMutationSource` | I1 from 3 starts (fixture, two gaps) × every pin toggle, order with and without join at every pinned prefix, group moves into every section including a new one in both modes | pass |
| `internal/session/groups_test.go` | `TestCreateGroup_*` (5) | Lands above Ungrouped and renumbers, also when Ungrouped was dragged to the top; name bounds; groups broadcast before the member upserts (D15); refusals create nothing | pass |
| `internal/session/groups_test.go` | `TestUpdateGroup*`, `TestSetGroupsOrder_*`, `TestSetAllCollapsed*` | Rename, collapse, order, collapse-all; one broadcast on change and none when unchanged (D14); invalid order refused with nothing changed (D12) | pass |
| `internal/session/groups_test.go` | `TestSetSessionsGroup*`, `TestSetOrder_*` | Move to end of section, pin kept, only changed sessions broadcast; null names Ungrouped; unknown group, unknown or repeated session refused | pass |
| `internal/session/groups_test.go` | `TestDeleteGroup_*` (8) | Ungroup, move, remove; sections renumbered; refusals (D13); remove with a failed kill keeps group and member and reports `Deleted` false (D9); two groups coexisting, the other group's sessions are not killed | pass |
| `internal/session/grouplaunch_test.go` | `TestCreateLaunchGroup_*`, `TestRecordLaunch_Announces…`, `TestDiscardLaunchGroup_*`, `TestLaunchGroup_AnotherGroupChange…` | A launch-held group is invisible to snapshots and broadcasts until `RecordLaunch` announces it; discard before announce is silent (D10), after announce announces the removal, never touches a group that gained a member | pass |
| `internal/session/grouplaunch_test.go` | `TestCreateSession_*` | New session lands at the highest railPos (D16); unknown group refused with no row | pass |
| `internal/session/actions_batch_test.go` | `TestEndMany`, `TestRemoveMany`, `…BeforeItsTurnIsSkipped` (2) | done / skipped / failed per id; a session gone before its turn (made to vanish from inside the first kill) is skipped; failed kill keeps the row (D9) | pass |
| `internal/session/groups_invariants_test.go` | `TestRailInvariants_HoldAfterEverySourceAndAReload` | D4 and D5 at manager level: 38 sources (pin, order, move, create, delete in each disposition, launch into a group and a new group, remove leaving a gap, reload alone) then I1, I2 and memory equals database, then restart and again | pass |
| `internal/session/groups_invariants_test.go` | `TestBystanders_AreNeverChangedOrBroadcast` | D6 for 15 group, batch and delete-group operations | pass |
| `internal/session/groups_invariants_test.go` | `TestGroupID_SurvivesClearRebindStragglerLateSessionEndAndResume` | D7: bind, activity, clear rebind, reordered straggler, late `SessionEnd(clear)`, death hint, End, resume | pass |
| `internal/session/groups_invariants_test.go` | `TestLoadAll_*` (3) | D8: name, pos, collapsed, Ungrouped layout and membership restored; corrupt layout reads as last place, expanded | pass |
| `internal/session/groups_invariants_test.go` | `TestGroups_ConcurrentMixedOperations…` | 8 workers × 30 mixed group, order, pin, move operations; no deadlock, invariants hold, last `groups` broadcast and last upsert per session equal the final state (D18 under `-race`) | pass |
| `internal/server/groups_test.go` | `TestGroupsWire_MessageShape`, `TestToWireSession_GroupIDIsARequiredKey`, `TestGroupsContribute_…` | `groups` envelope and `groupId` key shapes; snapshot keys after a restart reload | pass |
| `internal/server/groups_test.go` | `TestCreateGroup_*` (6), `TestUpdateGroup_*` (4) | POST and PUT group endpoints: success shapes, D11 bounds with the contract's messages, D14 no-op, id 0, 404s | pass |
| `internal/server/groups_test.go` | `TestSetGroupsOrder_*` (3), `TestSetAllCollapsed*` (3) | Order and collapsed endpoints; literal routes win over `{id}`; D12 refusals with the documented message | pass |
| `internal/server/groups_test.go` | `TestDeleteGroup_*` (7) | Dispositions over the wire; arrays never null; D15 ordering; teardown for each removed member and no other; failed member keeps the group; D13 and all 400s | pass |
| `internal/server/sessions_batch_test.go` | `TestEndSessions_*`, `TestBatchEndpoints_RefuseABadIDsList`, `TestRemoveSessions_*` | Batch End and Remove: 200 whatever the mix, bystanders untouched, per-id teardown, 400 for each bad ids shape, Remove all (#27) | pass |
| `internal/server/sessions_batch_test.go` | `TestSetSessionsGroup_*` (4), `TestSetOrder_*` (4) | `PUT /api/sessions/group`; `groupId` absent versus null versus integer on `PUT /api/sessions/order` | pass |
| `internal/server/sessions_batch_test.go` | `TestGroupEndpoints_RequireTheCookie`, `TestGroups_RealServerSnapshotAndBroadcast` | All 8 new routes 401 without the cookie; `New` wires the feature: snapshot keys, a POST reaches a socket as `groups`, `/api/state` reports it | pass |
| `internal/server/launcher_group_test.go` | `TestLaunchGroup_*` (12), `TestSpawnWithRetries_…` | Both forms: refusals before any side effect and in the contract's order; success with `groupId` and `newGroup` (groups before the upsert); D10 for spawn failure, exhausted collisions and a refused model; retry makes one group; group checked before the transcript lookup | pass |
| `internal/server/state_test.go` | `TestBuildSnapshot_M0Shape` | Pinned snapshot gains `groups: []` and `ungrouped: {pos 0, collapsed false}` | pass |

## Handoff Received

From `plans/groups/daemon-implementation.md` `## Handoff`:

- `internal/session/railorder_test.go`: the 13 `applyOrder` calls gained the fourth argument `nil`. The per-section rebuild table and the I1 table are new work, in `railorder_group_test.go`.
- `internal/session/manager_test.go` (2 calls), `manager_writeorder_test.go` (2), `manager_writeturnstile_interleave_test.go` (1): `SetOrder` gained the fourth argument `nil`.
- `internal/server/state_test.go` `TestBuildSnapshot_M0Shape`: the pinned JSON gained `groups` and `ungrouped`.
- `internal/store/migrate_test.go` and `internal/store/store_test.go`: migration count 12 to 13, including the version and the comments naming `0013_groups`.
- D7, which the impl log said it did not test: `TestGroupID_SurvivesClearRebindStragglerLateSessionEndAndResume`.

Also in this step, the lead's bounded extra item: `internal/session/machine_turnstate_test.go` built a raw `hook_event_name` payload literal. It now uses `claudecodetest.RawPostToolBatch("c1", ToolFileOpts{PromptID: "p1", PermissionMode: tt.mode})`, which is the same payload, so no non-test file changed and the gap named in the brief does not exist. D17 is green:

```
$ rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
$ echo $?
1
```

## Notes

**Fails-on-old-code.** Each row mutated production code in a copy at `scratchpad/mut` and ran the named tests there. All 14 were caught; the worktree was never edited.

| Mutation | Caught by |
|----------|-----------|
| `rebuild` ignores sections (the old flat rebuild) | `TestApplyGroupMove`, `TestApplyOrder_JoinSection`, `TestApplyPin_ScopedToItsOwnSection`, `TestBystanders_…` and more |
| delete-group announces `groups` before moving members | `TestDeleteGroup_Ungroup`, `TestDeleteGroup_Move` |
| a launch-held group is visible in broadcasts | `TestCreateLaunchGroup_IsInvisible…`, `TestLaunchGroup_AnotherGroupChange…` |
| `UpdateGroup` broadcasts when nothing changed | `TestUpdateGroup`, `TestUpdateGroup_UngroupedCollapsedFlag` |
| a batch counts a not-alive End as failed | `TestEndMany`, `TestEndMany_ASessionEndedBeforeItsTurnIsSkipped` |
| delete-group remove deletes the row despite a failed member | `TestDeleteGroup_RemoveWithAFailedKillKeepsTheGroupAndTheMember` |
| `LoadAll` ignores the stored Ungrouped layout | `TestLoadAll_RestoresGroupsLayoutAndMembership` |
| a group move keeps railPos instead of landing at the end | `TestSetSessionsGroup` |
| a failed launch leaves its new group behind | `TestLaunchGroup_ASpawnFailureLeavesNoGroupAndAnnouncesNone`, `…ResumeFormFailuresCreateNoGroup` |
| `PUT /api/sessions/order` treats `groupId: null` as absent | `TestSetOrder_GroupIDDistinguishesAbsentNullAndAnInteger` |
| batch endpoints accept a repeated id | `TestBatchEndpoints_RefuseABadIDsList` |
| batch remove skips the server teardown | `TestRemoveSessions_RemovesAndTearsDownEachDoneSessionAndNoOther` |
| delete-group remove skips the server teardown | `TestDeleteGroup_RemoveTearsDownEachRemovedSessionAndNoOther` |
| the snapshot omits `groups` | `TestBuildSnapshot_M0Shape` |

**Where the plan's own statements disagree with each other or the contract.** None is an implementation bug; each is pinned by a test so a change shows.

- **D6 and I3 versus the contract on a pinned mover.** D6 says sessions outside the request keep `RailPos` and are not broadcast. The contract for `PUT /api/sessions/group` says the per-section invariant is re-enforced and every session whose `railPos` changed is broadcast. A pinned mover joining a section must take a pinned slot, which moves that section's first unpinned member. `TestSetSessionsGroup` ("a pinned mover keeps its pin and ends the pinned run") expects upserts for the mover and that member. `TestBystanders_AreNeverChangedOrBroadcast` treats sessions in other sections as the strict bystanders and names the target section's shifted member as touched. An unpinned mover changes nobody else, asserted in the same tests.
- **Edge case 22 versus the dissolve contract.** Edge case 22 says ungrouped pinned members land at the end of Ungrouped's pinned block. The contract says `ungroup` leaves `railPos` untouched, then re-enforces the invariant. Measured: a pinned member at railPos 0 dissolved into an Ungrouped section whose pinned card sits at 3 lands before it (`TestApplyGroupMove`, "dissolving a group in place keeps every railPos…"). The contract and REQ-6 ("relative order") hold; the "end of it" wording is true only when the member's railPos is already above Ungrouped's pinned cards.
- **`PUT /api/sessions/group` error message.** The contract gives one message, "ids must be known session ids without duplicates", for every 400 including a missing `groupId`. The handler answers a missing or wrongly typed `groupId` with "groupId is required and must be an integer or null". The code is the same `invalid_request`. The tests assert the contract's message for the `ids` cases and only the code for the `groupId` cases (`TestSetSessionsGroup_Refuses`). If the contract wins, that is a one-string change for daemon-impl.
- **`rebuild` reuses railPos values** instead of the Implementation Notes' contiguous renumber, as the impl log recorded; `TestRebuild_PerSection` pins it, including the gap and duplicate cases.

**Coverage not provable at unit level.**

- A launch whose record step fails after the group was announced: the server calls `DiscardLaunchGroup` on any launch error (mutation 9 proves it) and the manager half is `TestDiscardLaunchGroup_AfterTheAnnouncementDeletesAndAnnouncesWhileEmpty`. A store write failure cannot be provoked through the fake spawner, as the impl log says.
- Hook loss, duplication and ordering: the plan states groups derive from no hook, so the only hook-related claim is D7, covered above with a reordered straggler and a late `SessionEnd(clear)`.
- No migration round-trip test, per `docs/conventions.md` §Testing.

**Flake outside this change.** The first of three `make test` runs on the final tree failed `TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal` (`shellscroll_test.go:195`, the log line not yet written when the assertion read it). It passed 30 of 30 alone and in the other two full runs, touches nothing from this plan, and was not edited.

**Size warnings naming my files** (warn-only, `make size-warn`): `funlen` on `groupSources` (73), `TestSetSessionsGroup` (66), `TestRebuild_PerSection` (85) and `TestApplyGroupMove` (70). All are tables whose rows are the point. No `dupl` line names any of my files.

## Test Run Output

```
$ go build ./...                       exit 0
$ make lint
golangci-lint run
0 issues.
$ make test                            (final run; excerpt)
ok  	github.com/Zalaras/muster/internal/server	117.118s
ok  	github.com/Zalaras/muster/internal/session	20.675s
ok  	github.com/Zalaras/muster/internal/store	9.504s
... every other package ok, none FAIL
$ make test-race                       (excerpt)
ok  	github.com/Zalaras/muster/internal/server	272.146s
ok  	github.com/Zalaras/muster/internal/session	140.243s
ok  	github.com/Zalaras/muster/internal/store	28.319s
```

## Fix Attempt 1 (review cycle 1)

**Verdict**: pass

**Handoff received**: `internal/session/actions_batch_test.go` no longer compiled because `EndMany` and `RemoveMany` return `(BatchResult, error)`. Every call now takes the second value and requires no error. The stale subtest "a repeated id is removed once and skipped the second time" is deleted and replaced by `TestBatch_ARepeatedIDIsRefusedBeforeAnythingRuns`: both methods crossed with five repeat shapes (adjacent, separated, after valid ids that would run, an unknown id repeated, first and last). Each asserts `ErrInvalidOrder`, an empty `BatchResult`, no kill, no broadcast and every session untouched (valid listed ids included, so "nothing ran" is an assertion).

**Tests added**

| File | Test | What it pins |
|------|------|--------------|
| `groups_test.go` | `TestSetGroupsOrder_WithLaunchHeldGroups` | one and two launch-held groups: the order lists visible sections only, the held group lands just above Ungrouped (also when Ungrouped is dragged first), two held in ascending id order, `Groups()` and the broadcast omit them, the store carries the full layout |
| `groups_test.go` | `TestSetGroupsOrder_HeldGroupIsNotPartOfTheClientsOrder` | naming the held id, a missing visible group, a missing Ungrouped and a duplicate are all `ErrInvalidGroupOrder` with a held group present, nothing changes or broadcasts |
| `groups_test.go` | `TestSetGroupsOrder_UnchangedOrderWithAHeldGroupBroadcastsNothing` | the held group's slot is not a change |
| `groups_test.go` | `TestSetGroupsOrder_TheHeldGroupIsAnnouncedWhereTheReorderLeftIt` | after `RecordLaunch` the group shows in the slot the reorder kept |
| `grouplayout_test.go` | `TestWithHeldAboveUngrouped` | the pure layout helper, input never mutated |
| `railorder_test.go` | `TestHasRepeat`, `TestHasDuplicateRailPos` | the shared duplicate check and its railPos caller |
| `groups_rig_test.go` | `assertConsistent` (helper) | now accepts the groups a launch holds back: the store holds visible plus held, and held pos values stay unique |

**Fails on old code** (throwaway copy under the scratchpad, since deleted; this worktree untouched). With `SetGroupsOrder` reverted to validate against every group and slot nothing back, and `runBatch`'s repeat refusal disabled:

```
TestBatch_ARepeatedIDIsRefusedBeforeAnythingRuns   10 of 10 subtests FAIL   Expected error with "invalid order" in chain but got nil.
TestSetGroupsOrder_WithLaunchHeldGroups            4 of 4 subtests FAIL      Received unexpected error (order must list every group id and 0 exactly once)
TestSetGroupsOrder_HeldGroupIsNotPartOfTheClientsOrder/naming_the_held_group FAIL
TestSetGroupsOrder_UnchangedOrderWithAHeldGroupBroadcastsNothing FAIL
TestSetGroupsOrder_TheHeldGroupIsAnnouncedWhereTheReorderLeftIt FAIL
```

**Server side of the move**: no test edit needed. `TestBatchEndpoints_RefuseABadIDsList` (`internal/server/sessions_batch_test.go`) still pins the duplicate rule over HTTP, rows "a duplicate id" `{"ids":[1,2,1]}` and "a repeated pair" `{"ids":[7,7]}`, each asserting 400 `invalid_request` with the contract message, the session still existing, no broadcast and no kill. `TestEndSessions_EmptyListsSerialiseAsArrays` still pins `toWireBatch` / `nonNil` after their move to `sessionwire.go`. `hasDuplicateRailPos` stays pinned by the rebuild duplicate-railPos cases and now directly by `TestHasDuplicateRailPos`.

**Not covered**: the 500 branch of `writeBatchError` (a non-`ErrInvalidOrder` error from `EndMany` / `RemoveMany`). `runBatch` returns an error only for a repeated id, so no fake can reach it; the handler is correct by reading and has no seam to provoke it.

**Size warnings naming my files** (warn-only): `funlen` on `assertConsistent` (41 > 40) and `TestSetGroupsOrder_WithLaunchHeldGroups` (64 > 60), a table whose rows are the point. No `dupl` line names them.

**Gates** (foreground, last run on the final tree): `go build ./...` exit 0; `make lint` 0 issues; `make test` every package ok, none FAIL.

## Fix Attempt 2 (review cycle 2)

**Verdict**: pass

**Change**: the doc comment on `TestCreateSession_AfterRailReorderStillExceedsEveryExistingRailPos` in `internal/session/manager_writeorder_test.go` said `rebuild()` renumbers the whole rail 0..n-1 every time. It now says `rebuild()` hands each section back the railPos values it already held, so a reorder never raises a value, and only a corrupt duplicate-railPos row is renumbered 0..n-1. The conclusion (a new session lands strictly above every existing railPos, because `nextRailPos` is a monotonic counter) is unchanged, and no assertion changed. The comment has no paired backticks.

**Gates** (foreground, final tree):

```
go build ./...                       exit 0
make lint                            0 issues.
go test ./internal/session/          ok  github.com/Zalaras/muster/internal/session  13.312s
comment-checks.py --gates            comment-checks: clean
```

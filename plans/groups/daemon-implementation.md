# Daemon Implementation: Rail groups

**Plan**: groups
**Mode**: initial
**Pack**: kb: pack 47457 words (budget 20000) — WARN: pack exceeds budget of 20000 words (rules 1295 · features 17333 · decisions 15909 · facts 10268 · lessons 2644)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/store/migrations/0013_groups.sql` | created | `rail_group` table and `session.group_id` (ON DELETE SET NULL), exactly as the plan's Schema Changes |
| `internal/store/group.go` | created | `GroupRow`, `UngroupedLayout`, `GroupLayout`; `ListGroups`, `ReadUngroupedLayout`, `InsertGroup`, `SaveGroups`, `DeleteGroup`. Every write rewrites the whole layout in one transaction |
| `internal/store/session.go` | modified | `group_id` in `SessionRow`, `InsertSessionParams`, insert, update, select and scan |
| `internal/session/session.go`, `row.go`, `writeorder.go` | modified | `Session.GroupID *int64`; row mapping both ways; `GroupID` added to `restoreChangedFields` and `restoredSessionFields` so the field-coverage check stays whole |
| `internal/session/railorder.go` | modified | `railEntry.GroupID`; `rebuild` is per-section; `applyOrder` takes an optional join section; new `applyGroupMove` and `validateSessionIDs`; `diffChanged` compares the group |
| `internal/session/manager_rail.go` | modified | `SetOrder(ctx, ids, pinnedCount, *GroupRef)`; rail writes carry `GroupID` |
| `internal/session/grouplayout.go` | created | Pure section algebra: order, insert above Ungrouped, remove, validate `order`, renumber |
| `internal/session/groups.go` | created | Types (`Group`, `UngroupedLayout`, `GroupRef`, `GroupDisposition`, `GroupDeleteResult`), sentinel errors, `NormalizeGroupName`, `Groups`, `GroupExists`, `LoadAll`'s `loadGroups`, the persist-and-adopt helpers |
| `internal/session/groupops.go` | created | `CreateGroup`, `UpdateGroup`, `SetGroupsOrder`, `SetAllCollapsed`, `SetSessionsGroup`, `DeleteGroup` |
| `internal/session/grouplaunch.go` | created | `CreateLaunchGroup`, `DiscardLaunchGroup`, and the announce step `RecordLaunch` calls |
| `internal/session/manager.go` | modified | `Config.OnGroups`, `groupsMu` / `groups` / `ungrouped` / `launchGroups`, `LoadAll` loads groups, `CreateParams.GroupID` |
| `internal/session/actions.go` | modified | `BatchResult`, `EndMany`, `RemoveMany` over a shared `runBatch`; `RecordLaunch` announces a launch-held group first |
| `internal/server/groups.go` | created | `groupsFeature` (five routes, `contribute`), wire types `groupWire` / `ungroupedWire` / `groupsMessage` / `batchWire`, error texts, `decodeGroupID`, `writeBodyError` |
| `internal/server/sessions.go` | modified | `PUT /api/sessions/group`, `POST /api/sessions/end`, `POST /api/sessions/remove`, `groupId` on `PUT /api/sessions/order`; the remove tail is now `teardownRemoved` |
| `internal/server/launcher.go`, `launcherpast.go`, `launcherrors.go`, `launchergroup.go` | modified, created | `groupId` / `newGroup` on both request forms; `checkLaunchRequest` / `checkResumeRequest` run the pure prefix; group created before the session loop, discarded on failure; `unknownGroup` |
| `internal/server/sessionwire.go`, `state.go`, `respond.go`, `server.go` | modified | `groupId` on the Session wire object; `groups` / `ungrouped` on the snapshot; `writeInvalidRequest`; `OnGroups` closure and one registration line |
| `internal/session/CLAUDE.md`, `internal/server/CLAUDE.md`, `internal/store/CLAUDE.md` | modified | One line each: the per-section invariant and the group lock, the new files, the store's new rows |

REQ coverage, daemon side: REQ-21 (rows, whole-list broadcast, membership as `groupId`), REQ-22 (batches), REQ-23 (per-section invariant, unique `railPos`), REQ-1 / REQ-2 / REQ-3 / REQ-4 (create, rename, collapse and empty group endpoints), REQ-5 / REQ-6 / REQ-7 (delete dispositions, ungroup, Stop all through the batch), REQ-8 (section order), REQ-9 (card moves), REQ-11 (launch group, both or neither), REQ-13 / REQ-14 (batch Stop and Remove, Remove all), REQ-20 (restart persistence). REQ-10, 12, 15 to 19 and 24 to 27 are web-only; nothing on the daemon side.

## Decisions

deviation: the plan's Implementation Notes hint for `rebuild` (per section, then renumber 0..n-1 globally) is not taken. A section reuses the railPos values it already holds, in ascending order, so a change in one section never renumbers another. Measured with the plan's own interleaving (new sessions land at the end, so sections interleave): after creating groups the layout read `{"1":["1@6","2@7"],"2":["3@8","4@9"],"U":["5@4","6@5"]}`, and a contiguous renumber would have rewritten every one of those sessions on the next move, against I3 and D6. After the change, ungrouping a group left the five sessions of the other groups byte-identical (`I3 bystanders unchanged: true` in the scratch-daemon probe). A candidate that already holds one railPos twice, which only a corrupt row can, falls back to the contiguous renumber. The existing test `TestHandleSetOrder_SuccessIs204AndAppliesTheOrder` seeds two rows both at railPos 0 and fails without that fallback; with it, all existing session tests pass. → kb:adr/rail-pin-invariant-scoped-per-section (amended by the orchestrator: option C′)

deviation: `groupId` on `PUT /api/sessions/order` and on the launch request decodes as `json.RawMessage`, not the hint's `*json.RawMessage`. A pointer cannot tell a null from an absent key:

```
{}                 *RawMessage nil=true   RawMessage=""
{"groupId":null}   *RawMessage nil=true   RawMessage="null"
{"groupId":3}      *RawMessage nil=false  RawMessage="3"
```

`setTitleRequest` already uses the non-pointer form for the same reason. → kb:adr/connection-absent-vs-null-json-fields-decode-as-raw-message

deviation: `POST /api/groups` answers an unknown `sessionIds` entry with message `unknown session` (the contract's wording) while the existing endpoints answer the same code with `unknown session id` (`msgUnknownSession`). The code is identical; only the text differs, and I implemented the contract as written. Flagging in case the two should be one string. → no ADR: the approved contract was implemented verbatim; the wording split is proposed in plans/groups/proposed-backlog.md (orchestrator)

deviation: a launch whose record step fails after `RecordLaunch` announced the new group (a store write failure, which a fake spawner cannot provoke) deletes the group and announces it gone, because clients were already told of it. A spawn failure, a refused model, a missing directory and an id-collision exhaustion never announce it. Measured with the tmux socket directory removed so the spawn fails: status 500, no `Ghost` row in `rail_group`, no `groups` message naming it.

```
launch with newGroup while tmux spawn fails -> {"status":500,"body":{"error":{"code":"launch_failed",...}}}
db after: 1|Keep|0 / ung|{"pos":1,"collapsed":false}
```

Known limitation: a daemon crash between `CreateLaunchGroup` and the end of the launch leaves an empty group row, which is visible after the restart. The developer can delete it; nothing sweeps it. → kb:adr/launch-new-group-created-with-the-row-or-not-at-all (consequences amended by the orchestrator)

design: `internal/session/grouplayout.go` is the pure section algebra (order, insert above Ungrouped, remove, validate, positions), applied by the group methods under `groupsMu`. It matches `railorder.go`, which does the same for the rail's own writes. `rg -n 'rail_group|GroupRow|type Group|GroupID' internal cmd` at HEAD: 0 hits, so nothing to reuse.

design: group state is guarded by `groupsMu`, declared with the field in `manager.go`. Writers: the group methods in `groupops.go` / `grouplaunch.go`, `loadGroups`, and `CreateSession` (holds it across the row insert so a delete cannot remove the group in between). Lock order is `groupsMu` then `mu`; no method holds `groupsMu` while waiting on a per-session lock (`deleteGroupRemoving` releases it around `RemoveMany`). `groupsMu` serialises database write, in-memory update and broadcast, so two group changes cannot reach a client out of order. A scratch daemon built with `-race` took about 70 concurrent mixed group, order, pin, launch and delete requests: no race report, no deadlock, invariants OK (`inv: "OK"`).

design: `launchGroups` (guarded by `mu`, written under `groupsMu` too) holds a group a launch has inserted but not yet recorded, and `visibleGroupsLocked` leaves it out of every snapshot and broadcast. Problem it answers: the contract wants `groups` before the session upsert and no `groups` message naming a group whose launch failed, while another window's group change broadcasts the whole list in between. Without the filter that broadcast would show a group the failed launch then deletes silently. `RecordLaunch` announces the group before drawing its write ticket, never inside the turnstile, so no lock is taken while a ticket is held.

design: `EndMany` / `RemoveMany` share `runBatch`, which takes each id's per-session lock and classifies the sibling `End` / `Remove` bodies' errors (`endLocked`, `removeLocked`) rather than copying them. `git grep -E 'func \(m \*Manager\) (End|Remove)' HEAD -- internal/session` finds `End`, `EndAll` (every alive session, no id list or per-id result) and `Remove`; none takes a list. The server side moved the old inline remove tail (terminals, shell, write log) into `sessionsFeature.teardownRemoved`, so DELETE `/api/sessions/{id}`, the batch remove and delete-group's remove share one tail. `rg -n closeSessionAndShell` at HEAD showed the tail only in `handleRemoveSession`.

design: `groupsFeature` is a handler type with `mount` and `contribute` in its own file, registered in one line in `server.go`, matching `usageFeature`, `prefsFeature` and `reposFeature`. It takes `sessionsFeature.teardownRemoved` as a function, not the feature, so the two features stay independent.

design: `writeBodyError` maps a wrong-typed JSON field to that field's message (`collapsed`, `name`, `sessionIds`) and anything else to `invalid JSON body`. `git grep UnmarshalTypeError HEAD -- internal`: 0 hits, no sibling does this; `prefs.go` validates values after decoding but cannot see type errors. `writeInvalidRequest` is new in `respond.go`; HEAD has 26 literal `"invalid_request"` writes and no helper, and I left those call sites alone, so only the new handlers use it.

design: `store.GroupLayout` writes every group and the Ungrouped kv blob in one transaction for rename, collapse, reorder, collapse-all, insert and delete. A group list is a dozen long, so a diff would only add a way to leave two sections on one place after a crash. `InsertGroup` and `DeleteGroup` take the displaced layout so the row and the renumbering commit together. Sibling shape: `repo.go` and `usage.go` (a `*Row` struct plus methods with inline SQL).

design: size warnings. `Launch` stayed under 60 lines by moving the whole pure prefix (rules, model check, group) into `checkLaunchRequest`; `launchResume` is 62 against a baseline of 61, an existing warning, with the same move into `checkResumeRequest`; `New` is 45 against 44, an existing warning that carries its documented reason (one line per feature). `launcher.go` (559 to 606) and `manager.go` (580 to 623) were already over 500; the group launch pieces went to `launchergroup.go` and `grouplaunch.go` rather than grow them further. `make size-warn` shows no `dupl` hit on any file I touched.

doc-delta: the plan's Doc Delta says nothing about how `railPos` values are assigned inside a section. After this work a section keeps the values it already has (gaps from a Remove survive any move) and a group move puts the movers at `nextRailPos`, the end of everything. If `kb:ref/data-model` or the rail spec states that a rebuild renumbers 0..n-1, that sentence is now wrong; the invariant sentence in the delta is still exact.

doc-delta: `kb:anchor/groups.collapsed` is the anchor name in `docs/protocol.md` for `PUT /api/groups/collapsed`; the plan's anchor list and Affected Files use the same name, so no change, noted only because `groups.collapse-all` reads naturally and is wrong.

## Handoff

**Build status**: `go build ./...` exits 0. `gofmt -l .` is empty. `make lint` stops at the first typecheck failure (the sanctioned test breaks below), so this is the production-only run:

```
$ golangci-lint run --tests=false ./...
0 issues.
```

Sanctioned test breakage (the plan's own signature change, named in its Affected Files for `railorder_test.go`; the test agent updates the call sites):
- `internal/session/railorder_test.go`: 13 calls of `applyOrder(sessions, ids, pinnedCount)` need a fourth argument, `nil` for no join section. The per-section rebuild table and the I1 table (D4) are new work there.
- `internal/session/manager_test.go` (2637, 2668), `manager_writeorder_test.go` (162, 359), `manager_writeturnstile_interleave_test.go` (579): `mgr.SetOrder(ctx, ids, n)` needs a fourth argument, `nil` for no `*GroupRef`.

Sanctioned test breakage from the Protocol Contract and Schema Changes (assertions only):
- `internal/server/state_test.go` `TestBuildSnapshot_M0Shape`: the snapshot gains `groups` (`[]`) and `ungrouped` (`{"pos":0,"collapsed":false}`), per the contract's "WS snapshot gains two keys". The pinned JSON is correct as shipped; the assertion is stale.
- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): the migration count is 13, not 12.

Evidence the rest is sound: with those call sites patched in a scratch copy of the tree, `go test -race -count=1 ./...` passes everywhere except those four named tests. No test file in the worktree was edited.

Measured against a scratch daemon (real tmux, stub claude, `-race` build for the concurrency run): every endpoint's success and error shapes in the contract; `groups` before the upserts that join and after the `sessionRemoved`s that leave; no broadcast on a no-op `PUT`; membership, section order, collapsed state and the Ungrouped layout identical after a daemon restart; the snapshot carries `groups` / `ungrouped`.

Not covered by me, for the test agent: D7 (clear-rebind, straggler, late `SessionEnd(clear)`, resume leave `GroupID` unchanged) is true by construction, since no state-machine path writes the field and the whole-row persist carries it through, but I wrote no test for it.

Files I did not touch and left alone: `plans/groups/orchestration-state.json`, everything under `web/`.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: correctness Minor 1 (a held launch group fails every section reorder); maintainability Minors 8 and 9; the `groupsMu` comment naming the wrong writer files.

**Changes made**:

| File | Change |
|------|--------|
| `internal/session/groupops.go` | `SetGroupsOrder` validates `order` against the visible groups, then slots every held group back just above Ungrouped before assigning positions. `deleteGroupRemoving` handles `RemoveMany`'s new error |
| `internal/session/groups.go` | new `heldGroupIDsLocked` (ids in `launchGroups`, ascending, read under `mu`) |
| `internal/session/grouplayout.go` | new pure `withHeldAboveUngrouped`, built on `insertBeforeUngrouped` |
| `internal/session/actions.go` | `EndMany` / `RemoveMany` now return `(BatchResult, error)`; `runBatch` refuses a repeated id with `ErrInvalidOrder` before running anything |
| `internal/session/railorder.go` | new `hasRepeat`; `hasDuplicateRailPos` uses it |
| `internal/server/sessions.go` | `hasDuplicateIDs` deleted; `decodeBatchRequest` checks non-empty only; new `writeBatchError` maps `ErrInvalidOrder` to the same 400 text and anything else to 500 |
| `internal/server/groups.go`, `sessionwire.go` | `batchWire`, `toWireBatch`, `nonNil` moved verbatim from `groups.go` to `sessionwire.go` |
| `internal/session/manager.go` | `groupsMu` comment now names `groupops.go`, `grouplaunch.go`, `loadGroups` (via `LoadAll`) and `CreateSession` as the writers |

**Every path to Minor 1**: only `SetGroupsOrder` validated against the full map. The other readers of the held group already use `visibleGroupsLocked` (snapshot, `emitGroupsLocked`). `CreateGroup`, `UpdateGroup` and `SetAllCollapsed` take `groupListLocked()` as the set to write back, which is right for them: they rewrite every row and change no pos. `DiscardLaunchGroup` and `announceLaunchGroup` act on the held id directly. So the reorder was the one door; with two held groups at once (two launches in flight) both are slotted above Ungrouped in ascending id order.

**Blast radius of the `EndMany` / `RemoveMany` signature**:

```
internal/server/sessions.go     handleEndSessions, handleRemoveSessions   -> write 400 / 500 via writeBatchError
internal/session/groupops.go    deleteGroupRemoving                       -> members are unique by construction; error returned, not expected
internal/session/groups_invariants_test.go:203-207   ignore the return value, still compile
internal/session/actions_batch_test.go               see Handoff
```

Wire unchanged: a duplicate id still answers 400 `invalid_request` with the same message, the empty list still 400, and `docs/protocol.md` already says so.

**Reviewer's repro for Minor 1** (a throwaway test, deleted after; one launch group held, client reorders the sections it knows of). Before the fix this list failed `order must list every group id and 0 exactly once`, since the check counted the held group. After:

```
held=1 client order=[0]
SetGroupsOrder err=<nil>
all groups=map[1:{ID:1 Name:Held Pos:0 Collapsed:false}] full order=[1 0]
```

The held group stays above Ungrouped, still hidden from `Groups()`.

**Decisions**:

design: the duplicate rule lives in `runBatch`, beside the other manager-owned list rules, and the handler maps `ErrInvalidOrder` as `handleSetOrder` / `handleSetSessionsGroup` do. `rg -n 'seen\[' internal/session internal/server` found the seen-map loop in `applyOrder` and `validateSessionIDs` (both interleave the duplicate check with an unknown-id check in one pass, so a shared helper would change which error wins) and in `hasDuplicateRailPos`; only the pure duplicate checks (`runBatch`, `hasDuplicateRailPos`) share `hasRepeat`. Emptiness stays in the handler because `handleSetSessionsGroup` also rejects a missing list there.

design: `heldGroupIDsLocked` and `withHeldAboveUngrouped` sit with `visibleGroupsLocked` and `insertBeforeUngrouped`, which they complement. Shared state: `launchGroups` keeps its writers and guard (`mu`, written under `groupsMu` too); the new reader takes `mu` inside `groupsMu`, the existing lock order.

design: batch wire placement. `sessionwire.go` already holds the session endpoints' wire shapes; `groups.go` uses the same package-level names, so no import change.

doc-delta: none. The wire is unchanged, so `docs/protocol.md` and the plan's Doc Delta stay exact.

## Handoff (fix wave 1)

**Build status**: `go build ./...` exits 0; `gofmt -l .` empty. `make lint` stops at the typecheck failure in the test file named below, so the production-only run:

```
$ golangci-lint run --tests=false ./...
0 issues.
```

`go test -race -count=1 ./internal/server/...` passes. `./internal/session/...` passes except one test when the call sites are patched in a scratch copy (restored; no test file edited).

Sanctioned breakage for daemon-tests (wave 2), the plan-visible rule moving into the manager:
- `internal/session/actions_batch_test.go`: `EndMany` / `RemoveMany` now return `(BatchResult, error)`; calls at lines 23, 45, 57, 69, 82, 101, 112, 126, 135, 167, 189 need the second value. The subtest "a repeated id is removed once and skipped the second time" (line 123) is stale: a repeated id now returns `ErrInvalidOrder` with an empty result and nothing runs. Replace it with that assertion for both methods.
- New tests wanted: `SetGroupsOrder` with a held launch group (accepts the list of visible sections, the held group stays above Ungrouped, `groups` message omits it) and with two held groups.

Files left alone: `plans/groups/orchestration-state.json`, everything under `web/`.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: review-work Major 1 (the `applyPin` comment states a rebuild behaviour option C' removed) and the maintainability Note that the `ErrInvalidOrder` comment omits `runBatch`.

**Changes made**: comments only, both in `internal/session/railorder.go`, no behaviour change.
- `applyPin`: the false claim that rebuild "renumbers every entry as a contiguous 0..n-1 index" is gone. The short circuit is now explained by what `rebuild` does after option C': it re-derives every section, renumbers 0..n-1 only on a corrupt duplicate-railPos row, and moves entries in a section that already breaks the invariant. A same-flag call names nothing to change, so running it would let `diffChanged` report bystanders.
- `ErrInvalidOrder`: names `applyOrder`, `validateSessionIDs` and `runBatch` (`actions.go`, repeated id in an End or Remove batch) as sources. The over-long unwrapped line from cycle 1's Note 5 is rewrapped.

**Paths reaching the defect**: the stale rationale appeared in one place. `rg -n "closes the gap|renumbers every|contiguous 0" internal docs` found two other hits: `internal/store/group_test.go:169` (store group delete, unrelated and true) and `internal/session/manager_writeorder_test.go:150` (see Handoff). `ErrInvalidOrder` consumers are unchanged since only its comment moved.

**Repro**: reading the new `applyPin` comment against `rebuild` (`railorder.go:193-242`): a section satisfying the invariant keeps every railPos, duplicates trigger the 0..n-1 renumber, so the comment now matches.

**Gates** (foreground):
```
$ go build ./...            -> exit 0
$ gofmt -l .                -> empty
$ make lint                 -> 0 issues.
$ python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates -> comment-checks: clean
$ go test -race -count=1 ./internal/session/ -> ok (114.3s)
```

**Decisions**: design: none new. doc-delta: none.

**Handoff**: `internal/session/manager_writeorder_test.go:150` (test file, not mine) has a comment saying `rebuild()` "renumbers the whole rail as a contiguous 0..n-1 index every time". That is the same stale claim; daemon-tests should restate it (rebuild reuses each section's railPos values; the test's conclusion that nextRailPos stays above every value still holds).

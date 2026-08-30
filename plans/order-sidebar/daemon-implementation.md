# Daemon Implementation: order-sidebar

**Plan**: order-sidebar
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/store/migrations/0006_rail_order.sql` | created | Adds `pinned`/`rail_pos` columns, backfills `rail_pos = id` (Schema Changes). |
| `internal/store/session.go` | modified | `SessionRow.Pinned/RailPos`; `InsertSessionParams.RailPos`; both columns read/written in insert/update/select/scan. |
| `internal/session/session.go` | modified | `Session.Pinned bool` / `RailPos int64` (display-only; `Clone`'s value-copy already covers them). |
| `internal/session/railorder.go` | created | Pure `applyPin`/`applyOrder` over `railEntry{ID,Pinned,RailPos}`: rebuild pinned-block++unpinned-block, `railPos = index`, diff against the input to return only changed entries (INV-1/2/5). `ErrInvalidOrder` sentinel; reuses the existing `ErrUnknownSession`. |
| `internal/session/manager.go` | modified | `CreateSession` computes `RailPos = max(existing)+1` under `m.mu` before insert; `maxRailPosLocked`, `railEntriesLocked`, `applyRailChangesLocked`, `persistAndBroadcastRail` helpers; `SetPinned`/`SetOrder` public methods; `rowToSession`/`sessionToRow` carry `Pinned`/`RailPos`. |
| `internal/server/sessionwire.go` | modified | `sessionWire.Pinned`/`RailPos` (never-null per §5.3 delta); `toWireSession` populates both. |
| `internal/server/sessions.go` | modified | `handlePinSession` (`PUT /api/sessions/{id}/pin`), `handleSetOrder` (`PUT /api/sessions/order`); decode/delegate/encode only, business logic lives in `Manager.SetPinned`/`SetOrder`. |
| `internal/server/server.go` | modified | Registered both new routes (`order` literal registered ahead of the `{id}/pin` wildcard, per plan's routing note). |
| `internal/server/prefs.go` | modified | `defaultRailSort = "manual"`; `validRailSort`; `prefsRequest.RailSort`; `loadPrefs` defaults an invalid/missing value; `handlePutPrefs` validates and merges it. |
| `internal/server/state.go` | modified | `PrefsInfo.RailSort` (`json:"railSort"`); `defaultPrefs()` sets it. |

## Decisions

- `applyOrder` with an empty `ids` list short-circuits to "no changes" *before* the rebuild, rather than running the general rebuild-and-diff path on the full session set. Reasoning: the spec's own "Empty ids is valid (a no-op ...)" language demands a literal no-op, but gaps in `railPos` are permitted after Remove (REQ-14); running the general rebuild on an empty request would silently close those gaps and broadcast every bystander whose position shifted, which is not what "no-op" promises. The bounds check (`pinnedCount` must be in `[0, len(ids)]`) still runs first, so `pinnedCount != 0` with empty `ids` is still rejected as `ErrInvalidOrder`.
- `CreateSession`'s `RailPos = max+1` is computed under `m.mu` and then the lock is released before the DB insert (matching every other manager method's lock-then-I/O-outside-lock shape). This does not fully serialize two concurrent `CreateSession` calls against each other (a narrow window exists between reading `max` and the new row being registered into `m.sessions`), but Muster is a single-user local tool (SPEC/CLAUDE.md) and launches happen through one UI click at a time; I did not add cross-call serialization beyond what "compute using the in-memory registry instead of a separate SQL MAX() query" (the plan's literal ask) requires.
- `SetPinned`/`SetOrder` persist+broadcast each changed session in a loop (not a single transaction). A persist failure partway through returns a wrapped error after having already persisted and broadcast the earlier rows in the batch — matches the file-per-row `UpdateSession`/`broadcast` shape used everywhere else in `manager.go` (no existing method wraps multiple rows in one DB transaction), and a partial-order failure here is a should-never-happen SQLite-write error, not a validation path.

## Handoff

**Build status**: `go build ./...` exits 0.

`go vet ./...`, `gofmt -l .`, and `make lint` are all clean (0 issues).

**Sanctioned breakage — frozen tests contradicted by this plan's approved Protocol Contract** (do not fix in daemon-impl; daemon-tests updates them next):
- `internal/server/prefs_test.go`: `TestHandlePutPrefs_PersistsToKVUnderOneJSONKey` and `TestHandlePutPrefs_UsageModelPersistsToKVAlongsideViewAndDensity` assert the persisted-to-kv JSON blob is exactly `{"view":...,"density":...,"usageModel":...}` with no `railSort` key. The plan's §3.3 delta adds `railSort` to every persisted/broadcast prefs object (default `"manual"`), so the persisted blob now always includes it — these two assertions are stale, not a bug in `handlePutPrefs`.
- `internal/server/state_test.go`: `TestBuildSnapshot_M0Shape` asserts the M0-baseline prefs map has exactly 3 keys (no `railSort`). Same cause: `defaultPrefs()` now includes `railSort:"manual"` per the approved delta.
- `internal/store/migrate_test.go`: `TestMigrate_AppliesInitSchema` and `TestMigrate_SecondCallIsANoOp`, and `internal/store/store_test.go`: `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations` all assert a fresh database records exactly 5 migrations / schema version 5. Adding `0006_rail_order.sql` (this plan's Schema Changes) makes the true count 6 — confirmed by running `go test ./internal/store/...`, which reports `expected: 5 / actual: 6` for all three.

Ran `go test ./internal/...`: only the 6 tests above fail, all for the reasons above (verified by reading each assertion, pasted above); `internal/session`, `internal/store` (other tests), `internal/tmux`, `internal/termbridge`, `internal/usage` all pass unchanged.

No test files were edited by this agent (none needed an import-path fix — no symbol was moved/renamed/deleted).

## Fix Attempt 1

**Failures addressed**:
- `internal/session/railorder_test.go::TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing`
- `internal/session/manager_test.go::TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing`

**Root cause**: `applyPin` (internal/session/railorder.go) unconditionally ran
`sortedByRailPos` → flip target's flag → `rebuild` → `diffChanged`, even when the
target's `Pinned` already matched the requested value. `rebuild` renumbers every entry
as a contiguous `0..n-1` index, so if a bystander's `railPos` had a pre-existing gap
(legal per REQ-14, produced by an earlier `Remove`), a same-flag pin/unpin call still
closed that gap and `diffChanged` reported the untouched bystander as "changed" —
violating §3.10/REQ-3's "already in the requested state → 204 and no broadcast".

**Fix**: `applyPin` now captures the target's current `railEntry` while checking
existence, and returns `nil, nil` immediately if `current.Pinned == pinned` — before
`sortedByRailPos`/`rebuild` ever run — mirroring the short-circuit `applyOrder` already
uses for its empty-`ids` no-op case (documented in this file's original Decisions
entry). This is a single change in one function; every code path that reaches the
defect goes through this exact function, and each is closed by it:

| Code path | How it's closed |
|---|---|
| `applyPin(sessions, id, true)` where id is already pinned (pin→pinned) | `current.Pinned == pinned` is `true == true` → short-circuits to `nil, nil` before rebuild |
| `applyPin(sessions, id, false)` where id is already unpinned (unpin→unpinned) | `current.Pinned == pinned` is `false == false` → short-circuits to `nil, nil` before rebuild |
| `Manager.SetPinned` (internal/session/manager.go:779-790) | Calls `applyPin` directly with no other logic in between (verified by reading the function body); `changed == nil` flows into `applyRailChangesLocked(nil)` → returns `[]*Session{}` (loop over nil is a no-op) → `persistAndBroadcastRail(ctx, [])` → loop over empty slice issues no `UpdateSession` call and no `m.broadcast` call |
| `handlePinSession` HTTP handler (internal/server/sessions.go) | Delegates to `Manager.SetPinned` with no rail-order logic of its own (decode/delegate/encode only, per this plan's Changes table) — inherits the fix transitively, no separate change needed |

Confirmed no other caller of `applyPin` exists: `grep -rn "applyPin(" internal/` returns
only the definition in `railorder.go` and the one call site in `manager.go:781`.

**Verification**:
- `go build ./...`, `go vet ./...`, `gofmt -l .` all clean (no output).
- `make test` → full suite green, including both previously-failing tests:
  ```
  ok  	github.com/Zalaras/muster/internal/session	4.262s
  ```
  (all other packages also `ok`, matching the pre-fix run's all-`ok` set).
- Reran the two named tests directly in isolation:
  ```
  === RUN   TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing
  --- PASS: TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing (0.01s)
  === RUN   TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing
  --- PASS: TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing (0.00s)
  PASS
  ok  	github.com/Zalaras/muster/internal/session	0.435s
  ```
- `make lint` → `0 issues`.

**Files changed**: `internal/session/railorder.go` only (verified via `git status`:
only this file modified; `masthead.png` untouched).

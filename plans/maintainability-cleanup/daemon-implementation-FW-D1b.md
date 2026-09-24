# Daemon Implementation: Maintainability Cleanup — FW-D1b (session write turnstile fix)

**Plan**: maintainability-cleanup
**Mode**: fix (review cycle 2, wave b)
**Pack**: not re-fetched for this wave — read `review.work.cycle2.md` (Majors 1, 2, 4, Minor 5) and `daemon-implementation-FW-D1.md` directly per the team lead's spawn message, plus `review.maintainability.a-session.cycle2.md` Majors 1–2 for the original bug write-ups.

## Scope

FW-D1's rewrite of the write turnstile (`writeorder.go`) fixed the two bugs cycle-2's
review named (a-M1: `cloneRestore` reverting a later write's field; a-M2: removal not
sequenced with the turnstile) but, in doing so, introduced two new regressions the cycle-2
verification pass caught: broadcasting moved to *after* `finishWrite`'s deferred `done()`
release, and restoring a failed write's field reverted to that write's own stale
pre-mutation clone instead of whatever the chain had actually committed since. This wave
fixes both, without reopening either of FW-D1's original fixes, and fixes the named false
comments.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/writeorder.go` | modified | `wholeRowPersist` now takes `broadcast bool` and, on a successful store write, records the persisted clone into the new `m.lastPersisted[id]` and — if `broadcast` — sends it, both *inside* the persist closure `finishWrite` calls, before `finishWrite`'s own deferred `done()` runs (Major 2). `persistWholeRow` no longer broadcasts itself after `finishWrite` returns. `restoreIfUnchanged`/`restoreChangedFields` are now `(field *T, post, target T)`/a `*Manager` method `restoreChangedFields(id int64, prev, post *Session)`: the revert target is `m.lastPersisted[id]` (falling back to `prev` only when nothing has persisted for `id` yet), not `prev` itself (Major 1). Fixed the `Critical 1's rule` review-ID citation (Minor 1) to name `applyBind`'s doc and `Session.Clone`'s contract directly. |
| `internal/session/manager_rail.go` | modified | `railPersist` (already broadcasting inside its own closure, unaffected by Major 2) now also calls `m.recordPersistedLocked` there, so the rail batch's `m.lastPersisted` entries stay in step with whole-row writes on the same id. `persistAndBroadcastRail` now treats `ErrUnknownSession` from a single write as "skip this one, keep going" instead of "abort and roll back the rest of the batch" — a session removed out from under one entry of a `SetOrder`/`SetPinned` batch no longer fails the other entries (item (d)). A genuine failure (any other error) still aborts and rolls back every write still queued behind it, unchanged. Both call sites of `restoreChangedFields` updated to the new method signature. |
| `internal/session/apply.go` | modified | `Apply` now calls `m.wholeRowPersist(ctx, musterSessionID, sess, true)` and drops its own external `m.broadcast(*result)` call — the broadcast now happens inside `wholeRowPersist`'s closure, same as every other whole-row setter, closing the same window Major 2 found there. `fieldRestore := m.restoreChangedFields(musterSessionID, prev, post)` (method, not free function). Fixed two false ADR citations (Minor 2): "Rebinding is monotonic" → `kb:adr/ingest-monotonic-rebind`; "status posts never drive the state machine" → `kb:anchor/state.transitions`. |
| `internal/session/liveness.go` | modified | `storeSnapshot`'s `finishWrite` call uses `m.restoreChangedFields(id, prev, post)` (method) so its own narrow write shares the same lastPersisted-aware restore as every whole-row setter, in case it races one on the same id. |
| `internal/session/manager.go` | modified | Added `lastPersisted map[int64]*Session` (guarded by `mu`, same discipline as `writeChain`) with its own field doc. `dropSessionFromMemory` now also deletes `id`'s `lastPersisted` entry, and its doc says so. |
| `internal/session/session.go` | modified | `LastPrompt`'s doc now cites `kb:adr/rail-activity-line-turn-aware-default-with-pref` instead of the Unread ADR it never mentions prompts in (Major 4). |
| `internal/store/session.go` | modified | Same `LastPrompt` citation fix, split from `Unread`'s (correct) citation instead of sharing one comment (Major 4). |

`internal/server/terminal.go`'s `errRegistryClosed` comment (the other Major 4 item in
scope) was already fixed in the shared worktree by a concurrent agent (visible in
`git diff HEAD -- internal/server/terminal.go`: a new `closeShutdown` helper plus a
corrected, accurate comment) before I reached it — not touched here, and not mine to
re-do or take credit for.

## The fix, precisely

Both new regressions traced to the same root cause: FW-D1's whole-row tail
(`persistWholeRow`) called `finishWrite` with `snapshot=nil` and then broadcast *outside*
it, after `finishWrite` had already returned — which is after its `defer done()` had
already released the next queued write's turn. `railPersist` never had this problem (it
already broadcasts inside its own closure); `wholeRowPersist` now matches it.

- **Major 2 (broadcast/persist ordering, and the ghost-upsert-after-removal case).** Moving
  the broadcast into the closure `finishWrite` invokes as `persist()` means it runs before
  `finishWrite`'s `defer done()` fires (Go defers run at function return, which is after
  the function body — including any blocking call inside `persist()` — has completed). A
  write's persist *and* its broadcast now both complete before the next write on the same
  id can even attempt its own persist. This closes all three interleavings the review
  measured: broadcast order now follows ticket order (Probe C), a write drawn ahead of a
  removal broadcasts before the removal (Probe B), and — as a side effect — the live-read
  row a later write's persist sees is now guaranteed to reflect the earlier write's
  *finished* (persisted and broadcast) outcome, not a half-applied one.

- **Major 1 (memory/DB/broadcast divergence on a later write's failure).** `wholeRowPersist`
  and `railPersist` now record the exact row they just persisted into `m.lastPersisted[id]`
  before broadcasting, in the same locked section as the record — and
  `restoreChangedFields` looks it up (falling back to `prev` only when nothing has ever
  persisted for `id`, e.g. a fresh session or the id's very first write) as the value a
  failed write's own field reverts *to*, rather than that write's own pre-mutation `prev`.
  Case table (see `writeorder.go`'s `restoreChangedFields` doc for the same table in situ):

  | Case | Outcome |
  |------|---------|
  | earlier write succeeds, later write (same or different field) fails | later write's restore target is the earlier write's committed value (`m.lastPersisted[id]`), not its own stale `prev` — memory ends up matching the DB and the last broadcast |
  | earlier write fails, later write succeeds | earlier write's restore leaves the later write's already-mutated field alone (unchanged since `post`), same as before |
  | both fail | `m.lastPersisted[id]` never moved, so both restores land on the same pre-chain value `prev` already held — matching a DB that never saw either write |
  | a rail write behind a plain setter's write (or vice versa) on the same id | `m.lastPersisted[id]` makes no distinction by setter shape — it is a per-id update, not a per-setter one, so the CAS is symmetric across `persistWholeRow`/`railPersist` |

- **Item (c) (no upsert after a removal's broadcast).** Already correct in FW-D1
  (`removeSessionRecord` draws its own ticket and its `onRemoved` call happens before its
  own `done()`, since `onRemoved` isn't deferred) — what was missing was Major 2's fix, so
  a write drawn *ahead* of the removal actually finishes broadcasting before releasing the
  removal's ticket. No change to `removeSessionRecord` itself was needed.

- **Item (d) (a batch behind a Remove keeps its other entries).** `persistAndBroadcastRail`
  distinguishes `ErrUnknownSession` (this one entry's session is gone — `finishWrite`'s own
  identity check already declined to persist/broadcast/restore it, so there is nothing to
  roll back) from every other error (a genuine failure, which still aborts and rolls back
  the rest of the batch, unchanged from before).

## Verification

**The three probes, reproduced against `git archive HEAD` (pre-this-wave, i.e. FW-D1's own
code) in a scratch copy** (`/private/tmp/.../scratchpad/fwd1b-old`), plus a fourth I wrote
for item (d) (not in the reviewer's `zz_probe_test.go`):

```
=== RUN   TestProbe_BatchQueuedBehindRemovalSkipsOnlyThatSession
    persisting rail order for session 1: unknown session          --- FAIL
=== RUN   TestProbe_EarlierSucceedsLaterFails
    memory Unread=true  db Unread=false  lastBroadcast Unread=false --- FAIL (memory != DB)
=== RUN   TestProbe_WriteAheadOfRemovalGhostUpsert
    order=[removed upsert]                                         --- FAIL (ghost upsert after removal)
=== RUN   TestProbe_BroadcastOrder
    broadcast titles=[second first] memory=second                  --- FAIL (broadcast order inverted)
```

All four against this wave's fixed tree:

```
=== RUN   TestProbe_BatchQueuedBehindRemovalSkipsOnlyThatSession
--- PASS (0.21s)
=== RUN   TestProbe_EarlierSucceedsLaterFails
    memory Unread=false  db Unread=false  lastBroadcast Unread=false
--- PASS (0.15s)
=== RUN   TestProbe_WriteAheadOfRemovalGhostUpsert
    order=[upsert removed]
--- PASS (0.64s)
=== RUN   TestProbe_BroadcastOrder
    broadcast titles=[first second] memory=second
--- PASS (0.64s)
```

I could not commit these four as test files (test-file constraint) — they were run from a
scratch copy and from a temporary copy inside the real worktree, then deleted before
finishing (`git status --short internal/session/*.go` below shows no stray files). Their
full bodies are handed to daemon-tests in `## Handoff`.

## Decisions

- This wave makes no new plan deviation. FW-D1's existing `deviation:` line (keeping
  `finishWrite`'s exact signature frozen because `manager_writeorder_test.go`'s
  `TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder` calls it
  directly) still holds and was not touched — the team lead's spawn message lifted that
  constraint if needed, but it wasn't: both regressions were fixable entirely in what
  callers pass to `finishWrite` (`wholeRowPersist`'s and `railPersist`'s own closures,
  `restoreChangedFields`'s revert target), the same shape FW-D1 already used. `finishWrite`
  itself is byte-identical to FW-D1's version.
- design: `m.lastPersisted map[int64]*Session` (manager.go) — a new field, not a bigger
  `railWrite`/whole-row-setter struct threading the last-known-good row through call
  arguments. `rg -n 'lastPersisted|last.?[Pp]ersisted' internal/session` before this change
  returned nothing — there was no existing "what did we actually commit" cache to reuse.
  Guarded by `mu` itself, matching `writeChain`'s own doc'd discipline (map access only,
  under the same lock every other `mu`-guarded field uses) rather than a separate mutex —
  every read and write of it in this diff already holds `mu` for an unrelated reason
  (`wholeRowPersist`/`railPersist`'s post-store-write re-lock, `restoreChangedFields`'s
  caller — `finishWrite`'s failure branch — already locked), so a second lock would only
  add contention with no independent critical section of its own.
- design: `restoreChangedFields` became a `*Manager` method (was a free function taking
  `prev, post *Session`) rather than threading `m.lastPersisted[id]` in as a third
  parameter at each of its four call sites. `rg -n 'restoreChangedFields\(' internal/session`
  before this change showed 4 call sites (`writeorder.go`, `manager_rail.go` ×2,
  `apply.go`, `liveness.go`); making it a method needed touching the same 4 call sites
  either way (to add `m.` and `id`), but keeps the lookup itself — and its "fall back to
  prev" rule — in one place rather than repeated at each call site.
- Not done, deliberately: `internal/server/terminal.go`'s `errRegistryClosed` comment
  (also named in the team lead's spawn message) was already corrected by a concurrent
  agent in this shared worktree before I reached it (see `git diff HEAD -- internal/server/terminal.go`)
  — left as-is, not mine to redo.

## Handoff

**Build status**: `go build ./...` exits 0.

`gofmt -l .` — clean, no output.

`golangci-lint run ./internal/session/... ./internal/store/...` — `0 issues`.
`golangci-lint run --tests=false ./...` (repo-wide, since other agents have in-progress
changes elsewhere in this shared worktree) — `0 issues`.
`golangci-lint run ./...` (with tests, repo-wide) — also `0 issues` — no test file
anywhere in the tree is currently broken, so this and the `--tests=false` run carry the
same signal right now.

`go test -race -count=1 ./internal/session/... ./internal/server/...`:
```
ok  	github.com/Zalaras/muster/internal/session	32.834s
ok  	github.com/Zalaras/muster/internal/server	137.063s
```
No sanctioned white-box breakage — every existing test in both packages passes unmodified
against this wave's diff, including `manager_writeorder_test.go`'s frozen
`TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder` (finishWrite's
signature is unchanged) and `manager_writeturnstile_interleave_test.go`'s existing four
tests.

**For daemon-tests — an Interleavings section, four tests, each proven above to fail on
pre-this-wave code and pass now.** I could not add these myself (test-file constraint).
Suggested home: `manager_writeturnstile_interleave_test.go` (its existing helpers —
`drawWriteTicket`, `waitForTicketDrawn`, `requireChainIdle`, `currentTicketChan`,
`canceledContext` — cover three of the four already; `withOnRemoved` is in
`manager_test.go`).

1. **Earlier write succeeds carrying a later write's field (live read), later write
   fails: memory must equal the DB.** Lift `TestProbe_EarlierSucceedsLaterFails` from
   `review.work.cycle2.md`'s scratchpad probes
   (`/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/19425776-7e9e-4c9a-ba2a-caac13ee2f5e/scratchpad/cw2/internal/session/zz_probe_test.go`)
   verbatim — it seeds `Unread=true` via a closing-turn `Apply`, draws a gate ticket,
   queues `SetTitle` (succeeds) then `MarkSeen` on a canceled context (fails) behind it,
   and asserts `mem.Unread == db.Unread`.
2. **A write drawn ahead of a `Remove` broadcasts before `sessionRemoved`.** Lift
   `TestProbe_WriteAheadOfRemovalGhostUpsert` from the same file — asserts
   `order == []string{"upsert", "removed"}`, never the reverse.
3. **Two successful writes broadcast in ticket order.** Lift
   `TestProbe_BroadcastOrder` from the same file — asserts the last broadcast title equals
   memory's.
4. **A `SetOrder`/`SetPinned` batch queued behind a `Remove` for one of its own sessions
   keeps its other entries.** New (not in the reviewer's file) — full body:

   ```go
   func TestProbe_BatchQueuedBehindRemovalSkipsOnlyThatSession(t *testing.T) {
       st := openTestStore(t)
       rec := &upsertsRecorder{}
       var mu sync.Mutex
       var removedIDs []int64
       mgr := newTestManager(t, st, nil, rec.record, withOnRemoved(func(id int64) {
           mu.Lock()
           removedIDs = append(removedIDs, id)
           mu.Unlock()
       }))
       ctx := context.Background()
       dir := t.TempDir()
       a := createLaunchedSession(t, mgr, st, dir)
       b := createLaunchedSession(t, mgr, st, dir)
       c := createLaunchedSession(t, mgr, st, dir)

       gateWait, gateDone, gateChan := drawWriteTicket(mgr, a.ID)
       requireChainIdle(t, gateWait)

       var wg sync.WaitGroup
       var errRemove, errOrder error
       wg.Add(1)
       go func() {
           defer wg.Done()
           errRemove = mgr.removeSessionRecord(ctx, a.ID, true)
       }()
       waitForTicketDrawn(t, mgr, a.ID, gateChan)

       wg.Add(1)
       go func() {
           defer wg.Done()
           errOrder = mgr.SetOrder(ctx, []int64{c.ID, b.ID, a.ID}, 0)
       }()
       // Give SetOrder a moment to draw its own ticket for a (behind the removal) before
       // the gate opens — best-effort, since there's no chain-head signal to poll for a
       // batch call the way drawWriteTicket gives one for a single id.
       time.Sleep(50 * time.Millisecond)

       gateDone()
       wg.Wait()

       require.NoError(t, errRemove)
       require.NoError(t, errOrder, "one removed session in the batch must not fail the whole SetOrder call")
       mu.Lock()
       gotRemoved := append([]int64(nil), removedIDs...)
       mu.Unlock()
       assert.Equal(t, []int64{a.ID}, gotRemoved)

       _, ok := mgr.Get(a.ID)
       assert.False(t, ok, "a must still be gone")

       bAfter, ok := mgr.Get(b.ID)
       require.True(t, ok)
       cAfter, ok := mgr.Get(c.ID)
       require.True(t, ok)

       persistedB, err := st.GetSession(ctx, b.ID)
       require.NoError(t, err)
       persistedC, err := st.GetSession(ctx, c.ID)
       require.NoError(t, err)
       assert.Equal(t, bAfter.RailPos, persistedB.RailPos, "b's rail write must have persisted despite a's removal in the same batch")
       assert.Equal(t, cAfter.RailPos, persistedC.RailPos, "c's rail write must have persisted despite a's removal in the same batch")
   }
   ```

   Measured: fails on pre-this-wave code with `persisting rail order for session 1: unknown
   session` (the whole `SetOrder` call erroring out because one entry was removed); passes
   on this wave's tree.

No other test files need changes.

## Fix Attempt 2 (cycle 3 maintainability fix-wave verification)

**Scope**: the team lead relayed a subset of `review.maintainability.fixwave.md` (cycle 3)
naming `internal/session`/`internal/store` items only: Major 3 (`railPersist` duplicates
`wholeRowPersist`), Major 4 (`Store.SetLogger` is a post-construction poke), and named
Minors (`persistWholeRow`'s lost `Locked` suffix, `restoreChangedFields`' hand-maintained
field list, `session.PermissionModes` dead, the wave's own comments carrying a finding tag /
test-name-as-reason / grep command / history). Everything else in that report (web, most of
internal/server, internal/claudecode, boundedwait) belongs to other agents and isn't touched
here. Note: that review ran against committed `HEAD` (`0872f3d`), before Fix Attempt 1's
changes existed in this shared worktree as anything but uncommitted edits — its Major 1/2 and
the `writeorder.go:156`/`apply.go:34,143`/`session.go:150`/`store/session.go:99` items it
also re-raises were already closed by Fix Attempt 1 and are not re-addressed here.

**Failures addressed**: Major 3, Major 4, Minor 1, Minor 2, Minor 3 (the session/store
subset only — `boundedwait.go`'s "four pollers" residue named in the same Minor 3 is
`internal/boundedwait`, not mine), Minor 5.

**Changes made**:

- **Major 3** (`internal/session/manager_rail.go`): deleted `railPersist` entirely.
  `persistAndBroadcastRail`'s loop now calls `m.wholeRowPersist(ctx, w.id, w.sess, true)`
  directly — the exact identity-checked live read, DB write, `m.lastPersisted` record and
  in-turn broadcast every whole-row setter already uses, discarding the `result` pointer
  the rail path doesn't need. `w`'s own write ticket was already drawn by
  `applyRailChangesLocked`, so this calls `wholeRowPersist` rather than
  `persistWholeRowLocked`, which would draw a second one. One identity-checked read now
  exists in the package, not two.
- **Major 4** (`internal/store/store.go`, `cmd/musterd/main.go`): deleted `SetLogger`.
  `Open` now takes `log zerolog.Logger` as its third parameter, matching
  `session.NewManager(cfg Config)`'s `Config.Logger` and internal/server's `newXFeature(...,
  log zerolog.Logger)` constructors (the review counted 19 of the latter). `Store.log` is
  set once, in `Open`, and never written again — the struct field doc says so.
  `cmd/musterd/main.go`'s one production call site now passes `log` directly and no longer
  calls the deleted `SetLogger`.
- **Minor 1** (`internal/session/writeorder.go` and its 12 callers): renamed
  `persistWholeRow` → `persistWholeRowLocked` throughout — every non-test caller
  (`actions.go`, `apply.go`, `liveness.go`, `manager.go`'s doc, `manager_rail.go`,
  `reader.go` ×4, `reconcile.go` ×2, `title.go`) — so the name itself says what its doc
  already said: entered with `m.mu` held, matching the package's `nextWriteTurnLocked`/
  `railEntriesLocked`/`applyRailChangesLocked` naming rule.
- **Minor 2** (`internal/session/writeorder.go`): added `restoredSessionFields`/
  `immutableSessionFields` (the two lists partitioning `Session`'s fields between "restored
  on failure" and "never changes after creation") and `CheckSessionFieldCoverage()`, an
  exported function that reflects over `Session`'s actual field list and reports any field
  named in neither list, or in both. See Decisions for why this is a callable check rather
  than an `init()`.
- **Minor 3** (session/store subset): removed the finding-tag citation
  (`review.maintainability.a-session.cycle2.md's Major 1 found`) and the test-name-as-reason
  citation (`manager_writeorder_test.go's TestPersistFailure_...`) from
  `restoreChangedFields`' doc (`writeorder.go`), restating both reasons in the code's own
  terms. Removed the history narration from `manager.go`'s `Config.OnUpsert`/`OnRemoved`/
  `Watcher` doc ("before the ports became required") and from `collectSessions`' doc ("each
  of which used to hand-write..."). Removed the embedded `rg` command from `reader.go`'s
  `SetPlan` doc, restating the same fact without it (re-verified: `rg '\.SetPlan\(' internal
  -g '!*_test.go'` still returns nothing). `store.go:27`'s wrong-caller claim is gone
  entirely along with `SetLogger` (Major 4).
- **Minor 5** (`internal/session/session.go`): deleted `session.PermissionModes` — `rg -n
  'session\.PermissionModes' internal cmd` found zero non-doc references, and its own doc's
  claim ("internal/server validates incoming requests against it") was false:
  `internal/server/launcher.go:139` builds its error text from `claudecode.PermissionModes`
  directly, never from this package's copy. `ValidPermissionMode`'s doc no longer names the
  deleted var.

**Verification**:

- `go build ./...` exits 0.
- `gofmt -l .` clean.
- `golangci-lint run --tests=false ./...` (repo-wide): `0 issues`. `golangci-lint run
  ./...` (with tests) now stops at `typecheck` on the sanctioned `store.Open` break (see
  Handoff) and reports nothing beyond it — expected, and why `--tests=false` is this
  attempt's lint evidence.
- **Isolated scratch verification** (since the `store.Open` signature change breaks test
  compilation for `internal/session`, `internal/store`, `internal/server`, `cmd/musterd`
  and `internal/usage` all at once, in the real worktree I could not run any of their test
  suites at all): `rsync`'d the whole working tree (uncommitted changes included) to a
  scratch copy, mechanically patched every one of the 27 `store.Open`/`Open` two-arg test
  call sites there to pass a third `zerolog.Logger{}` argument (plus one `zerolog` import
  `cmd/musterd/onexit_test.go` needed and one hand-restructured test —
  `store_test.go`'s `TestScanSession_CorruptStoredTimeReadsAsZeroAndLogsWarning`, which
  called the now-deleted `SetLogger` on a store `openTestStore` already built — see
  Handoff), and ran the suites there. This scratch copy was never in the real worktree and
  is now deleted (`rm -rf`); the real worktree's test files are untouched.
  - `go build ./...` and `go vet ./...`: clean, in the scratch copy.
  - `go test -race -count=1 ./internal/session/... ./internal/store/...`: both `ok`
    (32.9s, 10.0s) — including the corrupt-time-logging test against its
    constructor-injected logger.
  - `go test -race -count=1 ./internal/usage/...`: `ok` (5.1s).
  - `go test -race -count=1 ./internal/server/...`: `ok` (145.0s).
  - The four Interleavings probes from Fix Attempt 1 (`zz_probe_test.go` +
    `zz_probe_batch_test.go`, copied in, run, then removed) all still pass against the
    Major 3 `railPersist` consolidation — the merge didn't reintroduce the ordering or
    memory-divergence bugs Fix Attempt 1 closed.
  - `CheckSessionFieldCoverage()` returns `[]` — confirmed via a throwaway
    `cmd/zzcheck/main.go` in the real worktree (internal packages can't be imported from
    outside the module), built, run once, then `rm -rf`'d; `git status` after showed no
    trace of it.
- `size-warn.sh`: no new hits in any file this attempt touched.

## Decisions

- design: `CheckSessionFieldCoverage()` is a plain exported function, not a package
  `func init()`. `rg -n '^func init\(\)' internal cmd` before adding it found zero existing
  `init()` functions anywhere in the tree, and `CLAUDE.md` states "wiring happens in `main`,
  no `init()` magic" — a package-load-time panic is exactly the "magic" that rule is naming,
  even though the rule's own example is about `cmd/musterd`. The team lead's ask offered two
  shapes ("either derive it, or make a test fail…"); this is the second one. daemon-tests
  adds one assertion (`assert.Empty(t, session.CheckSessionFieldCoverage())`) rather than me
  adding a `_test.go` file myself (constraint).
- design: `CheckSessionFieldCoverage()` checks completeness rather than deriving
  `restoreChangedFields` itself via reflection. A fully-derived version would still need a
  per-field type switch to preserve two existing, deliberate exceptions:
  Model/Context/Attention/Failure compare by pointer identity (not `reflect.DeepEqual`,
  which would treat two structurally-equal-but-distinct allocations as "unchanged" and
  wrongly decline to restore/permit a real change through), and `closedPromptIDs` is a
  `[]string`, not `comparable`, so it can't go through the same generic at all — the
  existing code already special-cases it with `slices.Equal`. A reflection-driven restore
  would reintroduce both special cases via `reflect.Kind` branching instead of Go's own type
  system, for no reduction in what has to be hand-maintained (the exception list, not the
  full field list, is what actually needs care) — and `rg -rl reflect` over
  `internal/session`/`internal/store` before this change found no existing use of the
  `reflect` package in either, so a hand-rolled generic reflection-based field walker would
  also be a new pattern for the package, not one there's a sibling for.
- Not done, deliberately: `boundedwait.go`'s "four pollers" residue (the review's Minor 3,
  same finding-tag/history bucket as the session/store items) is `internal/boundedwait`,
  outside this wave's assigned scope (session/store) and not mine to edit in this shared
  worktree.

## Handoff (Fix Attempt 2)

**Build status**: `go build ./...` exits 0.

**Sanctioned test breakage — `store.Open`/`Open` now take a third `zerolog.Logger`
argument.** 27 call sites, all two-arg today, need a third argument added (`zerolog.Logger{}`
for every one — none of them need real logging):

```
cmd/musterd/onexit_test.go:373               (needs a new "github.com/rs/zerolog" import too)
internal/server/browse_test.go:148
internal/server/fakes_test.go:280
internal/server/helpers_test.go:68
internal/server/ingest_sessionid_logging_test.go:31
internal/server/ingest_sessionid_logging_test.go:34
internal/server/issue_test.go:42
internal/server/prefs_test.go:267
internal/server/prefs_test.go:278
internal/server/sessions_test.go:205
internal/server/sessions_test.go:691
internal/server/shells_remove_lock_test.go:89
internal/server/shellscroll_test.go:97
internal/server/state_test.go:98
internal/server/staticserve_test.go:25
internal/server/terminal_test.go:38
internal/server/themepoll_test.go:249
internal/server/update_test.go:436
internal/server/update_test.go:746
internal/server/usage_test.go:29
internal/server/usagepoll_test.go:287
internal/session/manager_test.go:34
internal/store/store_test.go:20   (bare Open, package store)
internal/store/store_test.go:37   (bare Open, package store)
internal/store/store_test.go:41   (bare Open, package store)
internal/store/store_test.go:62   (bare Open, package store)
internal/usage/aggregator_test.go:26
```

**One test needs restructuring, not just an added argument** —
`internal/store/store_test.go`'s `TestScanSession_CorruptStoredTimeReadsAsZeroAndLogsWarning`
(around line 363): it currently does `st := openTestStore(t)` then
`st.SetLogger(zerolog.New(&logBuf))` to capture the warning after the fact. `SetLogger` no
longer exists — the test needs to build its own `*Store` directly with the buffer-backed
logger already wired at construction, e.g. (verified working in the scratch copy):
```go
var logBuf bytes.Buffer
st, err := Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"), zerolog.New(&logBuf))
require.NoError(t, err)
t.Cleanup(func() { _ = st.Close() })
```
in place of the `openTestStore(t)` + `SetLogger` pair, leaving the rest of the test body
(the corrupt-column update, the `GetSession`/`ListSessions` assertions, the log-content
assertions) unchanged.

**One stale comment in a test file** (not a build break, so not strictly "sanctioned
breakage", but worth a one-line fix while touching this area):
`manager_writeturnstile_interleave_test.go:74` still says "combined with `persistWholeRow`'s
live-at-persist-time read" — the function is now `persistWholeRowLocked` (the live-read
itself is `wholeRowPersist`, which `persistWholeRowLocked` calls).

`golangci-lint run ./internal/session/... ./internal/store/...` (with tests) stops at the
same sanctioned `typecheck` break as the repo-wide run above (`internal/store/store_test.go`
and `internal/session/manager_test.go` both call the old two-arg `store.Open`), so it isn't
usable evidence right now. `golangci-lint run --tests=false ./internal/session/...
./internal/store/...` (production only): `0 issues`. `golangci-lint run --tests=false ./...`
(repo-wide): `0 issues`.
`go test -race -count=1 ./internal/session/... ./internal/store/...`: verified `ok` in an
isolated scratch copy only (see Verification above) — cannot run in the real worktree until
daemon-tests applies the 27-site fix above, since every one of those packages' own test
binaries fails to compile without it.

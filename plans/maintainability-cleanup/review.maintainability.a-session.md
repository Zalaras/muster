# Maintainability review: maintainability-cleanup (scope a: session + store)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 1 (standalone cleanup read, no diff)
**Pack**: `kb: pack 21927 words (budget 8000)` — `--features lifecycle,rail`; WARN over budget (rules 1874 · features 4620 · diagrams 3904 · decisions 6612 · facts 4555 · lessons 354)
**Scope**: `internal/session`, `internal/store`: 10 non-test Go files, every one read in full with its siblings open. The 9 `migrations/*.sql` files were listed but not read; the schema belongs to kb:diagram/store-schema. Test files were read only where a finding names them.

## Files

| File | Siblings opened | design: line | Size warnings (baseline `size.log`) | Result |
|------|-----------------|--------------|-------------------------------------|--------|
| internal/session/manager.go | machine.go, session.go, status.go, railorder.go | n/a (cleanup) | filelen 1809; funlen `rowToSession` 67, `sessionToRow` 42 stmts. No reason holds (Minor 1) | fail |
| internal/session/machine.go | manager.go, status.go | n/a | funlen `applyInput` 56 stmts. The reason holds (nolint + ADR) | fail (Critical 1) |
| internal/session/session.go | machine.go, manager.go | n/a | — | pass (notes) |
| internal/session/status.go | machine.go, session.go | n/a | — | pass (note) |
| internal/session/railorder.go | manager.go | n/a | — | pass |
| internal/store/store.go | session.go, repo.go, usage.go, migrate.go | n/a | — | pass (notes) |
| internal/store/session.go | store.go, repo.go, usage.go | n/a | funlen `InsertSession` 63. No reason holds (Major 3) | fail |
| internal/store/repo.go | session.go, usage.go | n/a | — | fail (Minor 7) |
| internal/store/usage.go | store.go, session.go | n/a | — | pass (note) |
| internal/store/migrate.go | store.go | n/a | — | fail (Minor 6) |

In-scope test files have 15 funlen warnings (machine_test ×4, manager_test ×6, manager_rail_test ×1, railorder_test ×2, title_test ×2 — invariant matrices) plus `store/session_test.go` ×1. There are no dupl hits in scope, so no change is requested for them.

## Seed check

- **S1 confirmed, and wider than seeded.** There are 14 persist sites after `m.mu.Unlock()`: 13 `UpdateSession` calls plus `storeSnapshot`'s `UpdateSnapshot` at manager.go:1145. Two things were missed:
  - **Broadcasts invert with the persists.** The wire is whole-object replace-by-id (kb:adr/connection-whole-object-session-upserts), so the last broadcast wins on every client. Concrete interleaving:
    1. The ingest worker runs `Apply(KindTurnClosed)`: `Unread=true`, snapshots R1, unlocks (manager.go:836).
    2. An HTTP attach runs `MarkSeen` (943): `Unread=false`, snapshots R2, persists R2, broadcasts S2.
    3. The worker persists R1 and broadcasts S1.

    The DB and every client now say `unread:true`, memory says false, and a restart reloads true.
  - **Two persist-failure policies.** Only `RecordLaunch`:312, `RecordResume`:1396 and `markEnded`:1637 roll back. `Apply`, `ApplyStatus`, `SetTitle`, `MarkSeen`, `SetTranscript`, `SetPlan`, `ApplyPlanScan`, `RepairOwnedSession` and the rail tail (`persistAndBroadcastRail`:1454, which stops mid-list with memory fully mutated) leave memory ahead of the DB.

  D1 must make three things true: persist order and broadcast order both follow mutation order, `last_snapshot*` has one writer path, and one persist-failure policy applies to every setter.
- **S2 confirmed.** `internal/server/reader.go:177` calls `Get`, then line 191 calls `SetPlan(…, sess.PlanPath, true)` with the path it read earlier. `SetPlan` takes a caller-read path, so the rule that `ApplyPlanScan`'s doc (manager.go:1030-1033) claims as "the sole place" is bypassed. This is kb:lesson/retention-rule-decided-outside-the-owners-lock recurring. The fix must make the exists-flip a decision made under `m.mu` against the committed `PlanPath`.
- **S3 confirmed.** 1809 lines. The sibling files already split by concern (`machine.go` transitions, `status.go` status refresh, `railorder.go` rail algebra), and manager.go alone holds registry, reconcile, liveness, actions, setters, snapshot and row mapping.
- **S4 confirmed.** `sessionTmuxName` (manager.go:344) duplicates `tmux.SessionName` (tmux.go:199–200), and the `"muster-"` prefix check at manager.go:537 is a third spelling. Outside scope, `tmux.go:113` also inlines the prefix instead of calling `SessionName`.
- **S5 confirmed.** manager.go:302, 796 and 869 build `fmt.Errorf("… unknown session %d")`. Every other lookup returns `ErrUnknownSession`.
- **S6 confirmed, plus a fifth copy.**
  - Repair (586–620) and revive (625–664).
  - Kill-with-timeout: 1192–1199 and 1340–1349.
  - Capture: `captureSnapshot` 1111–1121 and `endLocked` 1181–1190.
  - Collect-alive: `EndAll` 1225–1232 and `checkLiveness` 1543–1549.
  - Missed: three near-identical value-copy row structs, `reconcileRow` (499), `classifySessions`' local `row` (675) and `livenessTarget` (1539).
- **S7 confirmed; no rationale found.** `DeleteSession` (322–325) and `actOnReconcile` (451–452) drop memory first. `removeLocked` (1355–1358) deletes the row first. `git log -S` puts the reorder at acc541e, and session-lifecycle REQ-14's text names only `Remove`: nothing records why the launch rollback and the sweep kept the old order. See also Minor 4.
- **S8 confirmed.** 98 comment lines in manager.go (the seed said 97). See the count line under Notes.
- **G1, G2, G4: not applicable** — there is no exec, HTTP client or hex id in scope.
- **G3 judged: no change for `Manager.Stop`** (manager.go:202). It is the only copy outside `internal/server`. The others are themepoll.go:124, shellactivity.go:108, update.go:197 and usagepoll.go:62. Sharing across `session` and `server` would need a new package, a new diagram edge, for about 12 lines. Whether server's four copies should share one helper is the server reviewer's call.
- **G5**: see the count line under Notes.

## Issues

### Critical

1. **[daemon-impl]** `applyBind` mutates a `*Model` that published clones still share. The race is real and `make test-race` does not see it.
   - **Where:** `internal/session/machine.go:138`, `sess.Model.ID = *input.Model`.
   - **What it breaks:** `Session.Clone`'s contract (session.go:141–143, "Model [is a pointer] to otherwise-immutable snapshots") and `applyStatusUpdate`'s "always replaced with a fresh pointer, never mutated in place" (status.go:15–17). `ApplyStatus`'s broadcast test `beforeModel != sess.Model` (manager.go:893) depends on that pointer rule. It also breaks the conventions line § Design, "Shared state names its writers and its guard."
   - **Concrete interleaving:**
     1. A WS client connects. `state.go:119` calls `Manager.List()`, which returns clones sharing pointer P, and `toWireSession` reads `P.ID` at sessionwire.go:142 with no lock.
     2. Meanwhile the ingest worker runs `Apply` with a `KindBind`/`KindClearRebind` carrying a model (a SessionStart after `/clear` or a resume). `applyBind` writes `P.ID` holding only `m.mu`.

     Any broadcast in flight from an HTTP goroutine (`SetTitle`, `SetPinned`, `RecordResume`) reads P the same way.
   - **Gate evidence:** the baseline `race.log` has 0 `DATA RACE` lines. No test runs `Apply` with a model concurrently with `List`/`Get`/`OnUpsert`.
   - **Fix must make true:** no code path mutates a field of a `Model`/`Context`/`Attention`/`Failure` reachable from a clone; a changed model is a fresh pointer; a race test would fail on the old line. Whether `DisplayName` should reset on a bind is review-work's question (see Notes).

### Major

1. **[daemon-impl]** Production branches exist only because tests build a `Manager` without its ports, and one of them is the unsafe reconcile.
   - **Where:** `internal/session/manager.go` has 13 nil-port branches: 410, 694, 1112, 1181, 1192, 1201, 1252, 1340, 1521, 1529, 1561, plus the `targetResolver` type-assertions at 477 and 587.
   - **What the code shows:** `internal/server/server.go:163–170` always wires `PaneChecker`, `PaneSnapshotter` and `SessionKiller` to the same `*tmux.Client`. Reconcile's own doc (manager.go:387–390) says the `classifySessions` fallback (674–709) exists for "a handful of tests predating REQ-9". Its unconditional `!alive → sweep` is the orphan class that doc warns about at 392–397. `targetResolver` is discovered by assertion because "Killer test doubles … never implement it" (362–366). So the adapter's shape is set by a fake, and `reviveOwnedSession` takes `(resolver, canResolve)` as a pair of parameters.
   - **Naming:** `Killer` also serves as the reachability probe (`checkLiveness` 1529) and the lister, so `m.sessionKiller.ListSessions` reads as a misnomer.
   - **Cites:** conventions § Design, "seams where a test needs one and nowhere else". Here it is inverted: the seam's absence is reachable only from tests.
   - **Fix must make true:**
     - The tmux ports are required at construction.
     - Reconcile has one classification path.
     - Target resolution is part of a declared port, not a type-assertion.
     - The port's name says what it does.
     - Tests supply fakes (see Minor 8).
2. **[daemon-impl]** `CreateSession` reads `maxRailPosLocked` and registers the session in two separate `m.mu` scopes, so concurrent launches get the same `railPos`.
   - **Where:** `internal/session/manager.go:247–249` (read) and `269–271` (register), with `InsertSession` in between.
   - **Interleaving:**
     1. Launch A (dir X) locks, gets max=4, so railPos 5, and unlocks.
     2. Launch B (dir Y) locks, still sees max=4 because A is not registered until after its insert, gets railPos 5, and unlocks.
     3. Both rows persist with `rail_pos=5`.

     Launches are not globally serialized: `sessionLauncher.Launch` has no lock before `CreateSession`, `LockSession` needs an id that does not exist yet, and `TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows` exercises exactly this concurrency. `railEntriesLocked` iterates a map, so the tie then breaks randomly in `sortedByRailPos`'s stable sort, and a later `applyPin` reports a bystander as changed.
   - **Cites:** § Design "Shared state names its writers and its guard" and kb:lesson/retention-rule-decided-outside-the-owners-lock (the same read, release, write shape). It is invisible to `-race`, since every access is locked.
   - **Fix must make true:** the railPos a new session gets is decided in the same critical section that makes it visible to the next caller's max.
3. **[daemon-impl]** The session-id watermark is read and parsed by two copies, and the bump is a non-atomic read-modify-write.
   - **Where:** `internal/store/session.go:137–147` (inside `InsertSession`'s tx) and `195–205` (`BumpIDWatermark`, outside any tx). Only the call spelling differs (`kvGet(ctx, tx, …)` vs `s.KVGet(…)`); `dbTx` (store.go:69–76) already exists so this logic need not be duplicated.
   - **The race:** `BumpIDWatermark` reads, then writes `minID` in two statements. An `InsertSession` committing between them (watermark 7) is overwritten by a bump of `minID=6`, which lowers the watermark. That reopens id reuse once row 7 is rolled back, the bug kb:adr/lifecycle-session-ids-monotonic-never-reused exists to close. It is unreachable today, only because `Reconcile` runs before serving (server.go:241–247).
   - **Size:** `InsertSession`'s funlen 63 comes from inlining this cohesive allocation block. No reason is stated.
   - **Cites:** § Design "Reuse before add" and "One owner per concept".
   - **Fix must make true:** one reader of the watermark; the bump cannot lower a concurrently raised value, whatever the call order.

### Minor

1. **[daemon-impl]** The row↔domain mapping hand-writes nil↔zero conversions about 20 times, and its complexity split is not cohesive.
   - **Where:** `internal/session/manager.go:1649–1809`.
   - **Evidence:** `applyReaderRowFields` (1649) exists "to keep [rowToSession] under the gocyclo ceiling": two fields moved out for the count, not for cohesion. Conventions § Go allows "extracting a *cohesive* block". The funlen reasons fail for `rowToSession` (67) and `sessionToRow` (42 stmts).
   - **Fix must make true:** each direction's optional-field mapping is expressed once, so neither function needs an arbitrary split. The mapping belongs with S3's split.
2. **[daemon-impl]** Time-as-text encoding has no owner in `internal/store`, and parse failures are silent.
   - **Where:** 13 `.UTC().Format(time.RFC3339[Nano])` sites (session.go 124/227/230/234/240/364, repo.go:52, usage.go 26/33/34/62/72, migrate.go:92, store.go:141). There are 8 `time.Parse` sites: 7 discard the error (`repo.go:131–132`, `session.go:342–353`) and one checks it and drops the value (`store.go:183`).
   - **Cites:** conventions § Go "no silent failures". The package CLAUDE.md gotcha states the rule ("RFC3339 UTC text … parse on read"), but no function owns it.
   - **Fix must make true:** one encode and one decode helper own the format, and a corrupt stored time surfaces as a scan error, or the helper's doc states why a zero time is safe.
3. **[daemon-impl]** `Reconcile` returns `(ReconcileReport, error)`, but the error is always nil.
   - **Where:** `internal/session/manager.go:407–433`. All four returns are `report, nil`.
   - **Evidence:** the only caller (`internal/server/server.go:244`) branches on an error that cannot occur and discards the report.
   - **Fix must make true:** the signature says what the function can return.
4. **[daemon-impl]** Launch rollback leaks its per-id lock, beyond S7.
   - **Where:** `spawnAndRecordLaunch` (`internal/server/sessions.go:312`) takes `LockSession(id)` and then rolls back through `Manager.DeleteSession` (manager.go:322), which never deletes `idLocks[id]`. `Remove` does, at 1320.
   - **Evidence:** ids are never reissued (kb:adr/lifecycle-session-ids-monotonic-never-reused), so every failed launch leaves a mutex that nothing can ever contend on.
   - **Cites:** § Design "One owner per concept": three removal paths and three different tails.
   - **Fix must make true (with S7):** one removal routine owns the row delete, the memory drop, the lock reclaim and the `OnRemoved` decision, in one stated order.
5. **[daemon-impl]** `Manager.mu` does not say what it guards.
   - **Where:** `internal/session/manager.go:98–100`. `idLocks` (102–106) documents "guarded by mu itself", but `mu`, `sessions` and `byClaude` carry no guard note.
   - **What is missing:** nothing states that a `*Session` in the map is mutable only under `mu` while every exported read hands out `Clone()`s. That is the rule Critical 1 broke. `LockSession` also lazily creates `idLocks` (132–134), while `NewManager` eagerly creates the other two maps (165–166).
   - **Cites:** § Design "Shared state names its writers and its guard".
   - **Fix must make true:** the guard and its reach (map entries and the pointed-to `Session` fields) are stated where they are declared.
6. **[daemon-impl]** `loadMigrations` accepts two files with the same version.
   - **Where:** `internal/store/migrate.go:32–53`.
   - **Evidence:** given `0010_a.sql` and `0010_b.sql`, `Migrate` applies the first, records version 10, and silently skips the second (`applied > 0 → continue`, line 78).
   - **Cites:** conventions § Go "no silent failures".
   - **Fix must make true:** a duplicate version is a load error.
7. **[daemon-impl]** `GetRepo` has no production caller, and its doc names one that does not exist.
   - **Where:** `internal/store/repo.go:74–76`. The doc says "used when building a Session's repo/branch wire fields".
   - **`rg` evidence:** `rg '\.GetRepo\(' -g '!*_test.go'` finds only its definition, and every caller is a test (`repo_test.go:118,132`, `server/sessions_test.go:292,333,494,496`).
   - **Fix must make true:** production code holds no test-only API under a false claim. Either the method goes and the tests read through `ListRepos`, or its doc says it exists for tests.
8. **[daemon-tests]** `Manager` construction is repeated inline 31 times across the session tests (`manager_test.go` 26, `reconcile_shell_test.go` 3, `manager_rail_test.go` 2).
   - **Evidence:** there are two helpers, and `newTestManagerWithWatcher` (manager_rail_test.go:40–51) says it "mirrors manager_test.go's newTestManager, adding the one Config field that helper leaves unset".
   - **Cites:** § Design "a helper or fixture is grepped for before it is written".
   - **Fix must make true (and Major 1 depends on it):** one constructor supplies default fakes for every port, with per-test overrides.

### Notes

1. **[note]** For review-work or `[orchestrator:decision]` (likely Critical by the package CLAUDE.md's own rule): `machine.go:113–116` sets `Alive=false` from a `SessionEnd` payload.
   - kb:adr/lifecycle-liveness-from-pane-existence says SessionEnd "never sets or clears alive" and "any code path that would set alive from a payload is a boundary violation". `internal/session/CLAUDE.md` repeats it.
   - `docs/protocol.md:1305` and `machine_test.go:890` say the opposite (`alive := false`).
   - Options: (A) supersede the ADR and fix the package CLAUDE.md, or (B) delete the arm and the protocol row.
2. **[note]** Comment truth, for review-work:
   - `store/session.go:17–19` says "internal/server converts between the two", but the converter is `internal/session/manager.go:1658`.
   - `store/CLAUDE.md` names `usage.go` as the exemplar for `Insert*`/`List*`, but `usage.go` has no `List*`.
   - `Reconcile`'s doc (manager.go:396–397) says "the next successful poll reconciles", but `Reconcile` runs only at `server.go:244`.
3. **[note]** Correctness, for review-work:
   - `truncate` (session.go:217–222) slices bytes, so a 200-byte cut can split a UTF-8 rune in `LastPrompt`/`LastActivity`.
   - `applyBind` (machine.go:136–139) leaves `DisplayName` empty on a new model and stale on an id change.
4. **[note]** `status.go:21` spells out nullable-string equality inline beside `stringPtrEqual` (session.go:210). Using the helper would make "did the title change" read the same in `ApplyStatus`, `SetTitle` and here.
5. **[note]** `store.go:208–211` hand-reverses a slice, where `slices.Reverse` would do. Its comment ("the wire wants oldest-first") puts wire ordering in the store; `EventSummary` could return oldest-first by query, or the caller could order it.
6. **[note]** Transaction cleanup has two idioms in one package: a deferred `Rollback` in `session.go:130`, and an explicit per-error `Rollback` in `usage.go:73` and `migrate.go:87,94`.
7. **[note]** `Remove` deletes `idLocks[id]` (manager.go:1320) while a concurrent `End` may already hold the old mutex pointer, blocked in `l.Lock()`. A later `LockSession` then mints a second mutex. This is benign, because the row is gone and both callers get `ErrUnknownSession`, but the "nothing can ever contend" comment (1317–1318) is not literally true.
8. **[note]** The size warnings on `applyInput` (funlen 56 statements, and it is the gocyclo exemption) have a reason that holds: the `//nolint` at machine.go:21 plus kb:adr/process-go-lint-complexity-ceiling-fifteen.
9. **[note]** The kb:diagram/daemon-components edges hold. `session` imports `store`, `tmux` and `claudecode`, and `store` imports nothing internal.
10. **[note]** Plan-ID comment lines in scope, for X1's sweep: **161**. By file: manager.go 98, store/session.go 23, session.go 13, machine.go 8, railorder.go 7, usage.go 6, store.go 3, repo.go 3.

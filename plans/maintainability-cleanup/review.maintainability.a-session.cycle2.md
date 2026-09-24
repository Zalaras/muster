# Maintainability review: maintainability-cleanup (scope a: session + store, cycle 2)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 2 (re-review after the fix wave)
**Pack**: `kb: pack 22379 words (budget 8000)` — `--features lifecycle,rail`; WARN over budget (rules 1938 · features 4622 · diagrams 4290 · decisions 6612 · proposed 0 · facts 4555 · lessons 354 · runbooks 2)
**Scope**: `internal/session internal/store internal/keyedlock internal/boundedwait internal/evict` — 22 non-test Go files (session 14, store 5, one each for the three new leaf packages). Every file was read in full, with its siblings open. I read test files only where a finding names them. Decisions read: daemon-implementation-{F1,F2,F3,D2,D3,D10,D11}.md.

## Cycle-1 findings: verdicts

| Cycle-1 item | Verdict | Evidence (now) |
|---|---|---|
| Critical 1 — `applyBind` mutates a shared `*Model` | **fixed** | `machine.go:141-145` builds a fresh `Model` and assigns the pointer. `rg '\.(Model\|Context\|Attention\|Failure)\.[A-Za-z]+ *(=\|\+\+\|\+=)'` over non-test session files returns nothing. |
| Major 1 — nil-port branches, unsafe fallback reconcile, `targetResolver` assertion, `Killer` misnomer | **fixed** | `manager.go:176-179` panics on a missing port. `classifySessions` and `targetResolver` are gone (their only remaining mention is in history comments). `ResolveSessionTarget` is on `TmuxSessions` (`manager.go:42-46`). No `== nil` / `!= nil` port branches remain. Residue: Minor 7 (the other three nil-tolerant Config fields) and Minor 8 (the test double is still called `fakeKiller`). |
| Major 2 — `CreateSession` railPos read/register split | **fixed** | `manager.go:249-252` decides and advances `nextRailPos` in one critical section, and `LoadAll` seeds it (216). Stale comments at 244 and `store/session.go:122-126` are in Minor 2. |
| Major 3 — watermark read twice; bump is a non-atomic RMW | **fixed** | `readIDWatermark` (`store/session.go:21-34`) is the only reader. `BumpIDWatermark` reads and writes in one tx (214-235). The funlen on `InsertSession` is gone from `size.log`. |
| Minor 1 — row mapping hand-writes nil↔zero ~20×, arbitrary `applyReaderRowFields` split | **fixed** | `row.go` has `derefOrZero`/`ptrOrNil` plus one cohesive `*FromRow`/`*ToRow` pair per nested type. The `LastSnapshotAt` exception is stated at 192-194. Neither function has a size warning now. The `row.go:10` tag is in Minor 1. |
| Minor 2 — time encoding has no owner; parse failures are silent | **fixed** | `store.go:75-106` has one encode/decode pair per format, and every `time.Parse` goes through them. `scanSession`/`scanRepo`/`EventSummary` return decode errors. Nullable-time repetition is Note 6. |
| Minor 3 — `Reconcile` returns an always-nil error | **fixed** | `reconcile.go:51` returns `ReconcileReport` only, and `server.go:233` calls it bare. |
| Minor 4 — three removal paths, three tails, leaked lock | **fixed** | `removeSessionRecord` (`manager.go:311-330`) is the single path: store first, then memory, `Forget`, `writeChain` reclaim, and `notify`. All three callers use it (`manager.go:283`, `actions.go:216`, `reconcile.go:88`). Removal is still not sequenced with the write turnstile: see Major 2. |
| Minor 5 — `mu` does not say what it guards | **fixed** | `manager.go:106-111` names the guard and how far it reaches. `writeChain`'s lazy init against the eagerly made maps is Note 11. |
| Minor 6 — duplicate migration version accepted | **fixed** | `migrate.go:50-53` rejects a duplicate version. The `:36` tag is in Minor 1. |
| Minor 7 — `GetRepo` doc names a caller that doesn't exist | **fixed** | `repo.go:74-77` now says the method is test-only. The same defect is back for `SetPlan`: see Major 5. The comment has a finding tag and an `rg` command in it (Minor 1). |
| Minor 8 — `Manager` construction repeated 31× in tests | **fixed** | `newTestManager` + `testManagerOpt` (`manager_test.go:200-255`). `rg 'NewManager\(' internal/session/*_test.go` now returns only that helper and the panic test. |
| S1 — persists and broadcasts invert; two persist-failure policies | **partially** | The turnstile (`writeorder.go`) puts persist and broadcast order in mutation order for every setter, and one restore policy covers every setter. Two gaps remain. The shared whole-object restore reverts later writers' mutations (Major 1). Removal bypasses the turnstile, so an upsert can follow `sessionRemoved` (Major 2). |
| S2 — the exists-flip decided outside the lock | **fixed** | `internal/server/reader.go:119` calls `MarkPlanWritten`, a compare-and-set under `m.mu` (`reader.go:89-113`). The bypassing writer is still exported with no production caller (Major 5). |
| S3 — manager.go 1809 lines | **fixed** | The package is now split by concern: manager.go 429 lines, the largest sibling reconcile.go 296. No file-length hits in scope. |
| S4 — `sessionTmuxName` duplicates `tmux.SessionName` | **partially** | The logic now lives once, in `tmux.go:208`. `sessionTmuxName` (`manager.go:335-337`) survives as a pass-through alias (Minor 4). The prefix check now calls `tmux.HasSessionPrefix` (`reconcile.go:164`). |
| S5 — ad-hoc "unknown session %d" errors | **fixed** | `rg 'unknown session %d' internal/session` returns nothing. |
| S6 — five duplicate pairs | **partially** | Repair/revive now share `persistAndFinishLocked`, kill goes through `killSessionWithTimeout`, capture through `captureAndStoreSnapshot`, collect through `collectLocked`, and the row structs are one `sessionSnapshot`. But the tail that was extracted is still hand-written at 8 more sites (Major 3), and `collectLocked`'s name inverts the package's `*Locked` convention (Major 4). |
| S7 — removal orderings differ, no rationale | **fixed** | One order, with its rationale in `manager.go:300-310`. |
| S8 / Note 10 — plan-ID comments | **partially** | The older plan IDs are gone from production comments. This run's own finding tags were added after or missed by the sweep: 13 production lines (Minor 1) plus new test comments (Minor 8). |
| G3 — `Manager.Stop` bounded wait | **fixed (beyond ask)** | `liveness.go:32` → `boundedwait.Wait`. That is shared with `bgloop.go:37`, `ingest.go:113` and `updatemanager.go:160`. |
| Note 1 — SessionEnd writes alive | **fixed** | `machine.go:114-119` is a no-op arm (F3). |
| Note 2 — comment truth (store/session.go:37, store CLAUDE.md exemplar, Reconcile "next poll") | **not fixed** | `store/session.go:37-38` still says "internal/server converts", but the converter is `internal/session/row.go:122,161`. `store/CLAUDE.md:13` still names `usage.go` as the `List*` exemplar. `reconcile.go:45-46` is unchanged. These belong to review-work; see Note 1. |
| Note 3 — `truncate` splits runes; DisplayName on bind | **partially** | `truncate` is rune-safe (`session.go:240-248`). DisplayName is now parked as "a separate, undecided question" in a code comment (`machine.go:139-140`); see Note 2. |
| Note 4 — `status.go:21` inline nullable equality | **not fixed** (note only) | `status.go:21` is unchanged. |
| Note 5 — hand-reversed slice | **not fixed** (note only) | `store.go:249-252` is unchanged. |
| Note 6 — two tx idioms | **fixed** | `applyOneMigration` (`migrate.go:101-121`) uses the deferred-Rollback idiom `session.go`/`usage.go` use. |
| Note 7 — the "nothing can contend" claim on lock reclaim | **not fixed; now a package contract** | Moved into `keyedlock.Forget`'s precondition, and both callers violate it (Minor 3). |
| Note 8 — `applyInput` size reason | **holds** | funlen is now 52 statements (was 56), with the same nolint and ADR reason (`machine.go:14-22`). |
| Note 9 — diagram edges | **holds** | `docs/diagrams/daemon-components.md:74-76,101-112` shows all three new packages and their edges. `session` imports `keyedlock`, `boundedwait`, `store`, `tmux` and `claudecode`, and the three leaf packages import nothing internal. |

## Files

| File | Siblings opened | design: line | Size warnings (cycle-2 `size.log`) | Result |
|------|-----------------|--------------|------------------------------------|--------|
| internal/session/writeorder.go | all session files | yes (F1: turnstile, `cloneRestore`) | — | fail (Major 1) |
| internal/session/manager.go | all session files | yes (D2, D3: required ports, `removeSessionRecord`, `collectLocked`, `sessionSnapshot`) | — | fail (Majors 2, 4; Minors 1, 2, 3, 4, 6, 7) |
| internal/session/actions.go | liveness.go, reconcile.go, title.go | D2 (move) | — | fail (Major 3; Minors 1, 2) |
| internal/session/apply.go | title.go, reader.go, status.go | D2 (move) | — | pass (Major 1's interleaving runs through it) |
| internal/session/liveness.go | actions.go, reconcile.go | D2/D3 (`captureAndStoreSnapshot`) | — | fail (Major 3; Minor 1) |
| internal/session/reconcile.go | actions.go, liveness.go, writeorder.go | D3 (`persistAndFinishLocked`) | — | fail (Major 3; Minor 4) |
| internal/session/reader.go | title.go, apply.go | yes (F1: `MarkPlanWritten`) | — | fail (Majors 3, 5) |
| internal/session/title.go | reader.go, manager_rail.go | D2 (`MarkSeen` placement) | — | fail (Major 3; Minor 5) |
| internal/session/manager_rail.go | railorder.go, writeorder.go | yes (F1: `railWrite`) | — | pass (Major 1 also applies to the batch) |
| internal/session/row.go | store/session.go | yes (D2: generics, cohesive helpers) | — | fail (Minor 1) |
| internal/session/machine.go | status.go, session.go | F3 | funlen `applyInput` 52; reason holds | pass (note) |
| internal/session/status.go | machine.go, session.go | n/a | — | pass (note) |
| internal/session/session.go | machine.go, writeorder.go | n/a | — | pass (note) |
| internal/session/railorder.go | manager_rail.go | n/a | — | pass |
| internal/store/store.go | session.go, repo.go, usage.go, migrate.go | yes (D3: two format pairs) | — | fail (Minor 1) |
| internal/store/session.go | store.go, repo.go, usage.go | F1 (bump in tx) | — | fail (Minor 2) |
| internal/store/repo.go | session.go, usage.go | D3 (GetRepo kept) | — | fail (Minor 1) |
| internal/store/migrate.go | store.go, session.go | D3 (`applyOneMigration`) | — | fail (Minor 1) |
| internal/store/usage.go | store.go | n/a | — | pass |
| internal/keyedlock/keyedlock.go | boundedwait.go, evict.go; callers manager.go, shells.go, terminal.go | yes (F2) | — | fail (Minor 3) |
| internal/boundedwait/boundedwait.go | keyedlock.go, evict.go; 4 callers | (pre-existing to this cycle) | — | pass (Minor 1 lists its doc) |
| internal/evict/evict.go | boundedwait.go, keyedlock.go; callers issuecapture.go, writelog.go | yes (D11) | `evict_test.go` TestOldest funlen 76 (test, no dupl) | pass |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `cloneRestore` reverts the mutations of writes queued behind a failed one, which then persist and broadcast what memory no longer holds.
   - **Where:** `internal/session/writeorder.go:37-38,54-55`.
   - **The mechanism:** `finishWrite`'s identity check `cur == sess` only detects removal. `m.sessions[id]` is the same pointer for a session's whole life, and every setter mutates it in place. So `*cur = *prev` also rolls back every mutation made after `prev` was cloned, including those of writers whose tickets are already queued behind this one.
   - **Concrete interleaving** (the trigger is realistic: `MarkSeen` persists on `r.Context()` at `internal/server/terminal.go:332`, so closing the tab fails its write):
     1. The ingest worker's `Apply(7, TurnActivity)` draws ticket T1 and persists.
     2. The attach calls `MarkSeen(7)`: it clones prev2, sets `Unread=false`, draws T2 and waits on T1.
     3. The worker's `ApplyStatus(7)` sees a new model and sets `Model=M2`. It builds row3 containing `Unread=false`, M2, draws T3 and waits on T2.
     4. The tab closes, and `MarkSeen`'s `UpdateSession` fails on the cancelled ctx. The restore runs `*cur = *prev2`, so memory now holds `Unread=true` and `Model=M1`.
     5. T3 persists row3 and broadcasts `Unread=false`/M2.

     The DB and every client now say `Unread=false`/M2 while memory says `true`/M1. The next write (any hook) persists and broadcasts memory's view, which flips `unread` back on every card. `MarkSeen`'s caller was told the write failed, but its effect was persisted by T3.
   - **The same holds for the rail batch:** the abort loop at `manager_rail.go:88-90` restores followers inside the batch, but not a different setter queued on the same id.
   - **Cites:** F1's `design:` line claims "an old clone is always a complete, correct undo". That holds only when nothing is queued behind the write, and the code's own `writeChain` exists because something can be. It also breaks `finishWrite`'s doc (writeorder.go:24-25): "memory never claims what the DB doesn't hold", and here the DB holds what memory does not.
   - **Fix must make true:** once the queue for an id drains, memory, the last persisted row and the last broadcast agree, whichever write in the chain failed. A write that failed never reaches the DB or the wire through a later writer's row.
2. **[daemon-impl]** Removal is not sequenced with the write turnstile, so a `sessionUpsert` can follow `sessionRemoved` and re-add a deleted session on every client.
   - **Where:** `internal/session/manager.go:311-330`, together with `store/session.go:248-292`. `UpdateSession` does not check rows affected, so an update to a deleted id returns nil.
   - **Interleaving:**
     1. The ingest worker's `Apply(7, …)` mutates, draws its ticket, and unlocks at `apply.go:97-98`.
     2. `DELETE /sessions/7` runs `Remove`, which holds only the per-id lock (Apply never takes it). `removeSessionRecord` deletes the row, calls `removeFromMemory`, deletes `writeChain[7]` and fires `onRemoved(7)`, so clients drop the card.
     3. Apply's `finishWrite` runs. `UpdateSession` affects 0 rows and returns nil, so the function broadcasts the snapshot of 7.
   - **Consequence:** the wire is whole-object replace-by-id (kb:adr/connection-whole-object-session-upserts), so each client re-adds a session the daemon no longer has until it reconnects.
   - **History:** the window predates this run, but cycle-1 S1 asked that "persist order and broadcast order both follow mutation order". Removal is a mutation with a broadcast, and it bypasses the chain. `finishWrite` already handles removal on its failure path (writeorder.go:22-24, "id may have been removed entirely"), but not on its success path.
   - **Fix must make true:** no `sessionUpsert` for an id is broadcast after its `sessionRemoved`. A write ticket drawn before a removal either completes before the removal's broadcast, or is dropped.
3. **[daemon-impl]** `persistAndFinishLocked` was extracted as "the identical tail", but 8 other setters still hand-write that same tail byte for byte. It also sits in the file that is not the write-order home.
   - **The helper:** `internal/session/reconcile.go:285-296` builds `row := sessionToRow(sess)`, `snapshot := sess.Clone()` and `wait, done := m.nextWriteTurnLocked(id)`, unlocks, builds `persist := …UpdateSession(ctx, row)`, then calls `finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev))`.
   - **The hand-written copies of that sequence:** `actions.go:25-31` (RecordLaunch) and `240-248` (RecordResume), `liveness.go:210-216` (markEnded), `reader.go:67-73` (SetPlan), `102-109` (MarkPlanWritten) and `160-166` (ApplyPlanScan), `title.go:32-38` (SetTitle) and `62-68` (MarkSeen). The helper has 2 callers; there are 10 identical tails.
   - **The reason given does not hold:** D3's `design:` line says they are "F1's already-reviewed/tested writers … scope creep". That is a scheduling reason, not a shape reason, and the helper's own doc ("the identical tail RepairOwnedSession and reviveOwnedSession both built by hand") is contradicted by 8 more copies.
   - **Placement:** D2's `design:` line put the write-order primitives in `writeorder.go` so no domain file "owns the shared primitive". This primitive went into `reconcile.go` anyway.
   - **Cites:** conventions § Design "Reuse before add" and "One owner per concept". A newcomer adding a setter sees two ways to finish a write.
   - **Fix must make true:** a whole-row setter's persist tail exists once, beside `finishWrite`. Only setters with a real difference (Apply's `byClaude` restore, ApplyStatus's conditional broadcast, the rail batch) spell theirs out, and they state why.
4. **[daemon-impl]** `collectLocked` inverts the package's `*Locked` convention, and misuse deadlocks.
   - **Where:** `internal/session/manager.go:352-357`, doc: "Must be called without m.mu already held". It takes `m.mu` itself.
   - **The convention it inverts:** every other `*Locked` function in the package means the caller already holds `m.mu`. `writeorder.go:3` (`nextWriteTurnLocked`: "must be called with m.mu held"), `manager_rail.go:14` (`maxRailPosLocked`), `:26` (`railEntriesLocked`), `:56-57` (`applyRailChangesLocked`) and `reconcile.go:284` (`persistAndFinishLocked`) all say so. `endLocked`/`removeLocked` mean the per-id lock is held.
   - **Why it matters:** `sync.Mutex` is not reentrant, so a caller that trusts the suffix and calls `collectLocked` inside a locked region hangs every session operation. That failure is invisible to `-race`.
   - **Cites:** § Design "Match the siblings … naming".
   - **Fix must make true:** a function's name says whether it takes `m.mu` or expects it held, the same way as every sibling.
5. **[daemon-impl]** `SetPlan` is now a test-only writer that bypasses the sticky-plan rule, and two docs claim a production caller it no longer has.
   - **The caller evidence:** `rg '\.SetPlan\(' internal -g '!*_test.go'` finds nothing. The test callers are `internal/session/reader_test.go` ×9, `manager_writeorder_test.go` ×3 and `internal/server/reader_test.go` ×8.
   - **The false docs:** `reader.go:48-51` says "Callers that already know the real path to write (observeWrite's exists-true flip) call this directly", but observeWrite calls `MarkPlanWritten` (`internal/server/reader.go:119`). `reader.go:86-87` says SetPlan "is unchanged and still used by callers that already hold the real, current path", and there are none.
   - **Why it matters:** `SetPlan(path="")` can clear a named plan, which is exactly what `ApplyPlanScan` (reader.go:116, "the sole place the sticky-once-named retention rule is decided") exists to prevent. Keeping it exported leaves cycle-1 S2's bypass one call away for the next caller.
   - **The design line is contradicted:** F1's `design:` line justified keeping it on the grounds that "every other caller already holds a real, current path", and the grep shows there is no other caller.
   - **Cites:** § Design "One owner per concept". It is the same defect as cycle-1 Minor 7 (`GetRepo`), which was fixed there.
   - **Fix must make true:** production code has one writer path for PlanPath/PlanExists per rule, `ApplyPlanScan` and `MarkPlanWritten`. No exported method can write PlanPath without the retention rule, unless its doc truthfully says it is test-only.

### Minor

1. **[daemon-impl]** Production comments still carry this run's finding tags and narrate history.
   - **Cites:** conventions § Comments, "don't narrate history", and the sweep's own rule ("code comments cite no plan IDs").
   - **Finding tags:**
     - `manager.go:171` "(a-M1)", `:302` "(S7/a-m4)", `:342` "Critical 1's rule", `:345` and `:355` "(S6)".
     - `actions.go:95` "(S6)" and `liveness.go:54` "(S6)".
     - `row.go:10` "(a-m1: …)".
     - `store/store.go:72` and `:80` "(a-m2 …)".
     - `store/migrate.go:36` "a-m6:" and `:98` "(a-note-6: …)".
     - `store/repo.go:74-75`, "(a-m7: `rg '\.GetRepo\('` …)", which is a grep command in a doc comment.
   - **History narration:**
     - `manager.go:37-41` ("used to be a separate targetResolver … since Killer test doubles never implemented it") and `:108-109` ("the rule applyBind used to break").
     - `manager.go:171-174` ("used to fork Reconcile onto … classifySessions, since removed"), `:303-306` ("`git log -S` … found no rationale") and `:343-345` ("Replaces three near-identical copies …").
     - `row.go:10-13`, and `reader.go:85-87` ("observeWrite used to call SetPlan directly").
     - `reconcile.go:283` ("both built by hand"), `actions.go:94-95`, `liveness.go:53-54` and `store/migrate.go:97-99`.
     - `boundedwait.go:3-5` ("each hand-wrote … extracting the duplicated pattern here removes that repetition"). The "four pollers" it counts now all go through the single `bgloop.go:37`.
   - **Fix must make true:** each comment states the current why, or cites a kb record, and none cites a finding ID or describes what the code used to be.
2. **[daemon-impl]** Comments that are now false. The lead asked for these here, though comment truth is otherwise review-work's.
   - `manager.go:244` says "RailPos = max(existing)+1", but it is the monotonic `nextRailPos` its own field doc describes (138-140). `store/session.go:122-126` also says the caller "computes max(existing)+1".
   - `manager.go:286-288` says `removeFromMemory` is "Shared by removeSessionRecord … and apply.go's Apply". `rg 'removeFromMemory\('` finds one caller (manager.go:315).
   - `actions.go:123` says "reportAndSweepUnknown above", but since the split that function is in `reconcile.go:183`.
   - **Fix must make true:** each sentence describes the code as it is.
3. **[daemon-impl]** `keyedlock.Forget` states a precondition that both its callers violate. The real reason reclaiming is safe goes unsaid.
   - **The precondition:** `keyedlock.go:38-41`: "Callers must only call this once key can never be locked again".
   - **The callers break it:** `Manager.LockSession` (manager.go:166) is called with a client-supplied id before any existence check (`internal/server/launcher.go:308,362`, `shells.go:250`), so a removed id is locked again by any stale request. `manager.go:120-121` and `317-320` still say "nothing after that could ever contend on it again" (cycle-1 Note 7).
   - **Interleaving:**
     1. `Remove(7)` holds M1, and `End(7)` is queued on M1.
     2. `Remove` calls `Forget(7)` and unlocks.
     3. `End` acquires M1 while a shell-create for 7 makes and holds a fresh M2, so two holders of "7's lock" exist at once.
   - **Why it is benign today:** every action re-checks existence under `m.mu` after locking and gets `ErrUnknownSession`. Nothing says so.
   - **Cites:** § Design "Shared state names its writers and its guard".
   - **Fix must make true:** the `Forget` contract and both comments state the condition that actually makes reclaiming safe, and every caller meets it.
4. **[daemon-impl]** `sessionTmuxName` is a pass-through alias for `tmux.SessionName`.
   - **Where:** `manager.go:332-337`.
   - **Evidence:** `reconcile.go` spells the same convention two ways 28 lines apart, `tmux.ShellSessionName(shellID)` at 189 and `sessionTmuxName(id)` at 217. D2's line explains the alias's file placement, not why it exists.
   - **Cites:** § Design "One owner per concept".
   - **Fix must make true:** callers name tmux sessions through `internal/tmux`'s functions directly, or the wrapper's doc states what it adds.
5. **[daemon-impl]** `MarkSeen` sits in `title.go`.
   - **Evidence:** the other split files group by concept: `reader.go` holds the transcript/plan setters, `manager_rail.go` the rail setters, `liveness.go` the snapshot/alive ones. Unread is a rail concept (kb:adr/rail-unread-inferred-from-live-terminal-client, set in `apply.go:92-94`). D2's reason, "same shape as SetTitle", groups by shape, and every file in this package is shaped that way.
   - **Cites:** § Design "Match the siblings".
   - **Fix must make true:** a reader who looks for `Unread`'s writers finds them where the package's layout says they would be.
6. **[daemon-impl]** `sessionSnapshot` gives "snapshot" a third meaning in one package.
   - **Where:** `manager.go:346`.
   - **The other two meanings:** "snapshot" already names the pane screen (`Snapshot`, `storeSnapshot`, `LastSnapshot`, `liveness.go:37-99`) and the broadcast clone (`snapshot := sess.Clone()` in every setter, plus `finishWrite`'s `snapshot` parameter). This type is neither: it holds an id, `alive` and a target.
   - **Cites:** § Design "Match the siblings … naming".
   - **Fix must make true:** the type's name does not collide with either existing meaning.
7. **[daemon-impl]** `Watcher`, `OnUpsert` and `OnRemoved` keep test-only nil branches after the three tmux ports were made required.
   - **Where:** `manager.go:51-52,86-87`; the branches are at `apply.go:93`, `manager.go:326` and `426`.
   - **Evidence:** `server.go:174-183` always wires all three, and `newTestManager` now exists to supply defaults. One `Config` now has two policies for "a dependency production always wires".
   - **Cites:** § Design "seams where a test needs one and nowhere else" (the same principle as cycle-1 Major 1).
   - **Fix must make true:** either these are required like the ports and tests get a default through `newTestManager`, or the `Config` doc states why they differ.
8. **[daemon-tests]** New test comments carry this run's finding tags, and the `TmuxSessions` double keeps the retired port's name.
   - **The tags:** `manager_writeorder_test.go:19,29,31,58,65,100,111,114,179-182,212,258-274,341,347,400` (a-C1, a-M2, b-M1/a-S2, S1, "Critical 1"), `manager_test.go:202,232,257,1135,3142` ("review Minor 8", a-M1), `manager_rail_test.go:252`, `machine_test.go:1110` (a-note-3), `store/migrate_test.go:77` (a-m6), `store/store_test.go:309` (a-m2), `store/session_watermark_test.go:14` (a-M3) and `internal/evict/evict_test.go:10` ("Minor 4").
   - **The name:** `fakeKiller`/`fakeResolvingKiller` (`manager_test.go:95-163`, `manager_writeorder_test.go:16-21`) implement `TmuxSessions`. The `manager_test.go:95` doc still calls it "a Killer double".
   - **Fix must make true:** new test comments state the invariant they guard, and the double's name matches the port it fakes.

### Notes

1. **[note]** For review-work: comment and doc truth left over from cycle-1 Note 2.
   - `store/session.go:37-38` ("internal/server converts between the two"). The converter is `internal/session/row.go`.
   - `store/CLAUDE.md:13` names `usage.go` as the `List*` exemplar, but it has no `List*`.
   - `reconcile.go:45-46` ("the next successful poll reconciles"). `Reconcile` runs only at `server.go:233`.
2. **[note]** For review-work: `machine.go:139-140` parks an open product question in a code comment. On a model-id change, DisplayName is "stale", and the comment calls this "a separate, undecided question". It is a card-visible choice, so a decision record or backlog item fits it better than a comment (§ Comments).
3. **[note]** `Session.Clone`'s doc (`session.go:162-164`) lists Attention, Failure and Model as the shared pointees. It omits `Context`, which `status.go:15-17` includes, and the shared `closedPromptIDs` backing array. No reader outside the lock touches the slice today.
4. **[note]** `status.go:21` still spells nullable-string equality inline beside `stringPtrEqual` (`session.go:230`).
5. **[note]** `store.go:249-252` still hand-reverses a slice where `slices.Reverse` would do.
6. **[note]** The "nullable time ↔ nullable text" step is written 3× in `UpdateSession` (`store/session.go:250-264`) and 3× in `scanSession` (371-391). The format has one owner now. The nil-handling around it does not, unlike the session side's `derefOrZero`/`ptrOrNil`.
7. **[note]** The `keyedlock` and `boundedwait` package docs give "internal/session must never import internal/server" as the reason for a leaf package. `server` already imports `session`, so a type exported from `session` would have needed no new edge. The real reason is that a generic per-key mutex and a wait tail are not session-domain concepts. The leaf shape is right; only the stated reason is off.
8. **[note]** `NewManager` panicking on a missing port (D3) is accepted. It fails at construction, production cannot trip it, and the reason is stated.
9. **[note]** `applyInput`'s funlen of 52 statements has a reason that holds (`machine.go:14-22`, kb:adr/process-go-lint-complexity-ceiling-fifteen).
10. **[note]** `internal/evict/evict_test.go` `TestOldest` has funlen 76. It is a test file moved from `internal/server`, with no dupl hit, so no change is requested.
11. **[note]** `writeChain` is lazily made in `nextWriteTurnLocked` (`writeorder.go:9-11`), while `sessions`/`byClaude` are made in `NewManager` (194-195). `removeSessionRecord` also takes `m.mu` twice in succession (`removeFromMemory`, then the `writeChain` delete, `manager.go:315-324`). Both are harmless; they could be one critical section each.
12. **[note]** `row.go`'s `*ToRow` helpers return pointers into the Model/Context/Attention/Failure pointees (`&m.ID`, `&c.UsedPct`), so a persisted `SessionRow` aliases session memory. That is sound only under the "pointees are never written through" rule that Critical 1's fix restored, and nothing next to the helpers says they depend on it.

# Correctness review: Maintainability Cleanup (cycle 2, fix-wave verification)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: I did not re-fetch it for this verification pass. Cycle 1 recorded `kb: pack 74587 words (budget 8000)`.
**Diff**: `git diff 6db870d..HEAD` (5937f25, 603685f, 27a1c69, 0872f3d). HEAD is `0872f3d`.

The spawn prompt set the scope: verify every blocking item from `review.work.md` and every Critical or Major in the five `review.maintainability.*.cycle2.md` reports, then hunt for anything new the fix wave introduced.

I spot-checked whether the new tests fail on the old code. I did not take the logs' word for it. I ran them against a `git archive 6db870d` copy in the scratchpad, never in the worktree. The copy held the old code plus the new test files (`manager_writeturnstile_interleave_test.go`, `updatemanager_race_test.go`, `tmux_test.go`). I also wrote three probe tests for interleavings the new tests do not cover, and ran them against both trees. They are in `scratchpad/cw2/internal/session/zz_probe_test.go` (HEAD copy) and `scratchpad/cw2old/…` (6db870d copy). The fix agents can lift them.

## Verification table

### review.work.md (cycle 1) blocking items

| Item | Status | Evidence | Test, and does it fail on the old code |
|------|--------|----------|----------------------------------------|
| Major 1 `[daemon-impl]` F1: stale-clone restore when a successor is queued | **not closed**. Both interleavings I reported are fixed, but the fix creates a new divergence (Major 1 below). The fix criterion said "for any queue depth", and that is not met. | `writeorder.go:80-115` (`persistWholeRow`/`wholeRowPersist` read the row live at persist time), `:145-183` (`restoreChangedFields`, a per-field CAS) | `TestPersistFailure_LaterQueuedWriteSurvivesAnEarlierFailedRestore` (both subtests) and `TestPersistFailure_RailWriteSurvivesAnUnrelatedSetterFailedRestore`. **I ran them against 6db870d: all three FAIL** (`Unread` regressed; `Expected nil, but got *string`). |
| Major 2 `[daemon-tests]` no test for a failed persist with a successor queued | **closed** as asked: both the fail→succeed and the fail→fail cases exist. The new interleavings are uncovered (Major 3 below). | `manager_writeturnstile_interleave_test.go:87-190` | Same run: both fail on 6db870d. |
| Major 3 `[daemon-impl]` rollback `kill-session -t muster-<id>` prefix-matches another session | **closed** | `tmux.go:106-111` `exactTarget` gives `=name:` for a colonless name and `=name:@w` otherwise; `KillSession` `:627`. The launcher rollback (`launcher.go:195`) now kills exactly `muster-<id>`. | `TestExactTarget_RealTmux_NeverPrefixMatchesADifferentLiveSession` (both subtests) and `TestResizeWindow_RealTmux_…`. **I ran them against 6db870d's tmux.go: all FAIL** (muster-12 / muster-1-shell killed, `elements differ`). HEAD passes. |
| Major 4 `[daemon-impl]` false comments in daemon code | **partly closed.** Fixed: `main.go` keychain citation, `update.go` restart citation, `tmux.go:451` (was :403/:411), `termbridge.go:5-7`, `updatemanager.go:32`, `actions.go:118` `ShellNames`, `main.go:47` `IssueAPIURL`, `settings.go:119` `HookURL`. **Not fixed:** `session/session.go:150` and `store/session.go:99` still cite `kb:adr/rail-unread-inferred-from-live-terminal-client` for `LastPrompt`, and that ADR does not contain the word "prompt" (`grep -ci prompt` → 0). `session.go` is not in the diff at all. See Major 4 below. | the files named | n/a |
| Major 4, the two `apply.go` citations | re-graded **Minor** | On re-read, `ingest-envelope-authoritative-binding`'s Consequences name "the monotonic guard" and refs `kb:adr/ingest-monotonic-rebind`. Its `tests:` list includes `TestApplyStatus_INV4_NeverTouchesBindingOrStateFromAnyState`. So `apply.go:34` and `:143-144` are imprecise, not false. See Minor 2 below. | n/a |
| Major 5 `[web-impl]` `focuskeep.ts:40` names `restoreIfLost` | **closed** | `focuskeep.ts:40` now names `restoreFocusIfLost`, which is defined at `:61` | n/a |
| Major 6 `[orchestrator]` ADR `accepted` on a plan branch | **open** (non-blocking) | `docs/adr/process-adapter-run-seam-constructor-default.md:4` still reads `status: accepted` | n/a |
| Major 7 `[orchestrator]` `removeLocked` prefix-kills a live session | **closed** as a side effect | `actions.go:96` → `KillSession(tmux.SessionName(id))` → `=muster-<id>:` | the same real-tmux test |
| Minor 1 `[daemon-impl]` plan and review IDs in daemon comments | **closed**, with one new ID added | Every site listed in cycle 1 is clean. **New:** `writeorder.go:156` "(Critical 1's rule, …)". See Minor 1 below. | n/a |
| Minor 2 `[web-impl]` plan IDs in web comments | **closed** | `permission.ts:1-5`, `format.ts:77-80` and `connection.ts:70-72` are clean | n/a |
| Minor 3 `[web-impl]` double diagram re-render per snapshot | **closed** | `features/theme.ts:20-40`: `themeChanged` fires only when the resolved theme or family moved | `features/theme.test.ts` case 2. By reading, the old unconditional emit gives 2, not 1. `web-tests-FW-W.md:133-139` records 2 of 4 failing on the old code. |
| Minor 4 `[daemon-impl]` `applyWG.Add` after `Unlock` | **closed** | `updatemanager.go:370` `Add` comes before the `:371` `Unlock` | `TestUpdateManager_StopNeverRacesAnApplyThatHasRegistered`. **I ran it -race against 6db870d: FAIL with `WARNING: DATA RACE`** (30.9 s). HEAD passes (`race.log`, server `ok`). |
| Minor 5 `[daemon-impl]` a takeover installs a conn after `closeAll` | **closed** for the attach-in-flight window. The pre-attach branch's comment is false (Major 4 below). | `terminal.go:139-143` and `:158-163`, `closed` set at `:233` | `TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode`. On the old code it does not compile (`errRegistryClosed` is undefined). By reading, the conn would also never be closed there. |
| Minor 6 `[daemon-tests]` prefs broadcast test asserts nothing | **closed** | `prefs_concurrency_test.go`: the second frame must carry both `view:"tiles"` and `density:"3x2"` | n/a |
| Minor 7 `[daemon-impl]` launch rollback deletes the store row first | **closed** | `manager.go:347-371`: with `announced=false`, memory drops even when the delete fails | `TestDeleteSession_StoreFailureStillDropsMemory` and `TestReconcile_SweptRowStoreFailureStillDropsMemory`. **I ran them against 6db870d: both FAIL.** |
| Minor 8 `[orchestrator]` gate logs missing | improved | `$GATES_LOG_DIR` now holds `bl.log`, `race.log` and `e2e.log`. Web unit tests are still not logged there. | n/a |

### Critical and Major items from the five maintainability cycle-2 reports

| Item | Status | Evidence | Test, and does it fail on the old code |
|------|--------|----------|----------------------------------------|
| a-session Major 1 `[daemon-impl]` `cloneRestore` reverts queued writes | **not closed** | The same finding as cycle-1 Major 1 above; correctness Major 1 below | as above |
| a-session Major 2 `[daemon-impl]` removal not sequenced with the turnstile | **not closed for the interleaving the finding reported** (a write drawn *before* the removal). The write-behind case is fixed. See Major 2 below. | `manager.go:347-371` draws a ticket. But `persistWholeRow` (`writeorder.go:88-89`) and `Apply` (`apply.go:120`) broadcast *after* `finishWrite`'s deferred `done()` (`writeorder.go:39`) has released the next ticket. | `TestRemoveSessionRecord_QueuedWriteBehindARemovalNeverPersistsOrBroadcasts` fails on 6db870d (ran: `Condition never satisfied`). It covers only the write-behind case. My probe for the write-*ahead* case **fails at HEAD**: `order=[removed upsert]`. |
| a-session Major 3 `[daemon-impl]` one whole-row tail | **closed**; the shape verdict belongs to maintainability | `writeorder.go:80` `persistWholeRow` sits beside `finishWrite` and has 12 callers. `Apply` and the rail batch state why they differ (`apply.go:99-105`, `manager_rail.go:33-38`). The shared tail is where Major 2's defect lives. | n/a |
| a-session Major 4 `[daemon-impl]` `collectLocked` naming | **closed** | `manager.go:377` `collectSessions` | n/a |
| a-session Major 5 `[daemon-impl]` `SetPlan` test-only and false docs | **closed** | `reader.go:41-52` truthfully says no production caller exists. `rg '\.SetPlan\(' internal -g '!*_test.go'` returns nothing. | n/a |
| b-server Major 1 `[daemon-impl]` `applyWG` window | **closed** | same as cycle-1 Minor 4 | same test, which fails on the old code |
| c-adapters Critical 1 `[daemon-impl]` `.claude/settings.local.json` spelled in `internal/server` | **closed** | `claudecode.ProjectSettingsPath` (`settings.go:51-53`). `launcher.go:437` calls it. The temp-file name `"."+filepath.Base(path)+".tmp-*"` is byte-identical to before. `rg 'settings\.local\.json\|"\.claude"' internal cmd -g '!*_test.go'` outside claudecode → none. | n/a |
| c-adapters Major 1 `[daemon-impl]` second production `execFunc` | **closed** | `version.go:29` `newVersionChecker` → `runCommand`. `runCommand` keeps `WaitDelay=2s`, and stderr is not inherited in either version, so there is no observable difference. | n/a |
| d-webcore Major 1 `[web-impl]` WS→app mapping split | **closed** | `wsapp.ts:64-86` `dashboardWsHandlers`. `main.ts` now holds only `new WsClient(wsUrl("/ws"), dashboardWsHandlers(app, connection, actions))`. | n/a |
| e-webui | no Critical or Major | n/a | n/a |

## Build & Tests

- **E2E tests:** pass, 446/446 (`$GATES_LOG_DIR/e2e.log`, 17:21, after 0872f3d was committed at 17:17; the team lead says this run is at HEAD).
- **Daemon tests (race):** pass (`race.log`: every package `ok`).
- **Web tests:** 72 files and 1765 tests passing, per `web-tests-FW-W.md:184-185`. This is not in `$GATES_LOG_DIR`.
- **Daemon build and lint:** pass (`bl.log`: `0 issues`).
- **Web build:** pass (`e2e.log` opens with `tsc --noEmit && vite build`).
- **Tree identity:** `bl.log` and `race.log` built `v0.18.2-42-g27a1c69-dirty` at 17:14-17:16. That is the tree *before* 0872f3d was committed. I cannot prove that the dirty tree was byte-identical to 0872f3d.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| — | no ```checks block in the plan | carried: cycle-1 Minor 8 `[orchestrator]` |
| E2E | `make e2e` at HEAD | pass, 446/446 |
| RACE | `make test-race` | pass (at `27a1c69-dirty`) |
| DOC | doc upkeep | **FAIL**: `daemon-implementation-FW-D1.md:31` has a `deviation:` line ending "→ ADR: pending" (Major 5 `[orchestrator]`). cycle-1 Major 6 is still open. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The settings path moved into `claudecode` (c-C1 closed). Outside claudecode, the remaining `permission_mode` hits are comments or SQL column names. |
| 2 | No state from terminal output | pass |
| 3 | Non-blocking hooks | pass (untouched) |
| 4 | tmux `-L muster`; sizing | pass. Every `-t` in `tmux.go` goes through `exactTarget`; the other calls (`new-session -s`, `list-sessions`, `list-panes -a`, `set-option`) take no target. What callers pass: <br>• Claude surface (`termbridge.go:60` attach, `:96` resize) and liveness (`liveness.go:60` capture, `:166` PaneExists): the `TmuxTarget` `muster-<id>:@<w>`, which becomes `=muster-<id>:@<w>`. <br>• Shell surface (`shells.go:97/125/141/294` PaneExists, `:186` kill, `:365` cancel, `:400` scroll, shell attach): `muster-<id>-shell`, which becomes `=muster-<id>-shell:`. <br>• Reconcile (`reconcile.go:193/220/254`) and actions (`:96/150`): `muster-<id>` or the shell name, which become `=…:`. <br>No production call passes a bare pane id (`%N`) or window id (`@N`), which `=…:` would break. The empty placeholder target is caught by `PaneExists`'s `target == ""` guard. The real-tmux tests (tmux, termbridge) and 446 E2E, including `plain-shell.spec.ts`, pass. Sizing is unchanged. |
| 5 | No payload logging | pass. The new ingest warnings add `session_id` only. The store warning logs table, row id and column. |
| 6 | Empty-gauge honesty | pass. Note 4 covers the corrupt-time zero value. |
| 7 | Identity on tmux target | pass. `exactTarget` closes the path where `ResolveSessionTarget` could hand a row another session's window. |
| 8 | No settings.json / CLAUDE_CONFIG_DIR | pass |
| 9 | Real `claude` only in canary | pass (untouched) |

## Issues

### Critical
None.

### Major

1. **[daemon-impl] The F1 fix introduced a new memory/DB/wire divergence. An earlier write now persists and broadcasts a later write's field, and when that later write fails, its restore reverts memory only.** This is a regression against 6db870d, where the same interleaving stayed consistent.
   - **Where:** `internal/session/writeorder.go:101-115` (`wholeRowPersist` reads the *whole* live row at its own turn) and `:145-183` (`restoreChangedFields` on the later write's failure). `railPersist` (`manager_rail.go:79-94`) has the same shape.
   - **Interleaving** (the same trigger as cycle 1: `MarkSeen` on `r.Context()`, `terminal.go:365`):
     1. t0 is in flight.
     2. `SetTitle` (t1) mutates and queues.
     3. `MarkSeen` (t2) sets `Unread=false` and queues.
     4. t0 finishes. t1 reads the live row, which already holds `Unread=false`, persists it and broadcasts it.
     5. The tab closes and t2's `UpdateSession` fails. `restoreChangedFields` puts `Unread` back to `true`.
   - **Result:** memory says `Unread=true`. The DB and every client say `false`. The next hook persists memory and flips the badge back on.
   - **Measured:** probe `TestProbe_EarlierSucceedsLaterFails` gives `memory Unread=true  db Unread=false  lastBroadcast Unread=false`, FAIL at HEAD. **The same probe PASSES on 6db870d** (`true/true/true`), because there t1's frozen row did not carry t2's field.
   - This breaks the fix criterion ("once the queue for an id drains, memory, the last persisted row and the last broadcast agree, whichever write in the chain failed"). It also breaks `finishWrite`'s own doc (`:28-29`, "memory never claims what the DB doesn't hold").
   - **Related edge (a note, not a separate item):** if t1 and t2 both change the *same* field x→y→z and both fail, t2's CAS restores y, which is t1's failed value. That holds at both base and HEAD.
   - **Fix must make true:** for any queue depth and any mix of success and failure, memory, the DB and the last broadcast agree once the chain for an id drains.
2. **[daemon-impl] Whole-row setters and `Apply` now broadcast *after* releasing their write ticket. Two consequences: upserts can reach clients out of mutation order, and a write drawn ahead of a removal can broadcast its `sessionUpsert` after `sessionRemoved`.** That second case is a-session Major 2's own interleaving, still open.
   - **Where:** `persistWholeRow` calls `finishWrite(…, snapshot=nil, …)`, then `m.broadcast(*result)` (`writeorder.go:85-89`). `finishWrite`'s `defer done()` (`:39`) has already let the next ticket run by then. `Apply` does the same at `apply.go:119-120`.
   - At 6db870d, `finishWrite` broadcast `snapshot` *before* its deferred `done()`, so persist order and broadcast order both followed ticket order, as cycle-1 S1 required. `railPersist` still broadcasts inside persist, so the rail batch is unaffected.
   - **Measured, out-of-order upserts:** `TestProbe_BroadcastOrder` gives `broadcast titles=[second first] memory=second`, FAIL at HEAD, PASS on 6db870d (`[first second]`). Clients end on the stale title, and memory and DB on the new one.
   - **Measured, ghost card:** `TestProbe_WriteAheadOfRemovalGhostUpsert` gives `order=[removed upsert]` at HEAD. The fix drew a ticket for removal (`manager.go:348-350`), but the write ahead of it releases the ticket before broadcasting. The removal then deletes the row and fires `onRemoved`, and the stale upsert follows it (kb:adr/connection-whole-object-session-upserts: each client re-adds the card).
   - **False comment tied to this:** `finishWrite`'s doc (`writeorder.go:30-31`) says "every whole-row setter passes nil here and broadcasts itself from inside persist instead (persistWholeRow's doc says why)". `persistWholeRow` broadcasts *outside* persist, and its doc gives no reason.
   - FW-D1's `deviation:` line (keeping `finishWrite`'s signature frozen for a white-box test) is what pushed the broadcast outside the ticket.
   - **Fix must make true:** every broadcast for an id happens before that write's `done()`, and no `sessionUpsert` for an id follows its `sessionRemoved`.
3. **[daemon-tests] The new turnstile tests miss the three interleavings above, and all three are red at HEAD.** `manager_writeturnstile_interleave_test.go` covers the earlier write failing, both failing, and a write *behind* a removal. Add:
   - (a) the earlier write succeeds and the later one fails: memory equals the DB.
   - (b) a write drawn *ahead* of `removeSessionRecord`: no upsert after `onRemoved`. Block `onUpsert` until `onRemoved` fires, with a timeout, which makes the order deterministic.
   - (c) two successful writes: broadcast order equals ticket order, and the last broadcast equals memory.

   My probes in `scratchpad/cw2/internal/session/zz_probe_test.go` show one way to gate each. Each fails at HEAD. Probes (a) and (c) pass on 6db870d.
4. **[daemon-impl] False comments.**
   - `internal/session/session.go:150` and `internal/store/session.go:99` still cite `kb:adr/rail-unread-inferred-from-live-terminal-client` for `LastPrompt`. That ADR never mentions the prompt; the source is `kb:adr/rail-activity-line-turn-aware-default-with-pref`. This is carried from cycle-1 Major 4.
   - `internal/server/terminal.go:348-351`: "closeAll already closed c with the shutdown code (or is about to, via takeover's own second check)". This is false for takeover's *first* `closed` check (`:139-143`). That branch returns before `attach` builds a `terminalConn`, so `c` was never registered, `closeAll` never saw it, and the second check never runs. `c` is closed only by the deferred `CloseNow` (`:338`), with no close frame. Either close it with the shutdown code in that branch, or make the comment say what happens.
   - `writeorder.go:30-31` (see Major 2).
5. **[orchestrator] `daemon-implementation-FW-D1.md:31`: a `deviation:` line ends "→ ADR: pending"** and has no `kb:adr/…` record. Either write the `proposed` ADR, or reclassify the line as `design:` if keeping a test-frozen signature is not a plan deviation. Note that this constraint is what caused Major 2. This does not block approval.

### Minor

1. **[daemon-impl] New review-ID citation:** `internal/session/writeorder.go:156`, "(Critical 1's rule, Session.Clone's doc)". Cite the rule itself (Session.Clone's doc, or `mu`'s field doc) instead.
2. **[daemon-impl] Imprecise ADR citations:**
   - `internal/session/apply.go:34` credits "Rebinding is monotonic" to `kb:adr/ingest-envelope-authoritative-binding`. The decision is `kb:adr/ingest-monotonic-rebind`, which that ADR only references.
   - `apply.go:143-144` credits "status posts never drive the state machine" to the same binding ADR. `kb:anchor/state.transitions` is the rule.

### Notes

1. **[note] Unsanctioned behaviour change (web), not recorded in `web-implementation-FW-W.md`.** `render/focusview.ts:42` writes a real NBSP (`c2 a0`). The base code at both 47325f7 and 6db870d (`features/focus.ts:182/185`) wrote an ASCII space (`20`), although its comment demanded an NBSP. `git log -S` shows `a7ba245` (feat(reader), before this plan) regressed NBSP to a space. This wave restores the documented intent: the sizenote line now actually reserves its height before the first `refit()`, which can change first-attach terminal geometry by one row. E2E is green. For review-browser to measure; for the orchestrator to record as sanctioned.
2. **[note] Behaviour change from the removal fix.** A `SetPinned`/`SetOrder` whose ticket queues behind a concurrent `Remove` now fails with `ErrUnknownSession`, where it used to succeed with a ghost upsert. `persistAndBroadcastRail` then aborts and rolls back the rest of that batch. Base answered 204 and re-added the removed card. Whole-row setters return the live persist-time clone, which can carry a queued writer's field, so the launcher's 201 body can include a concurrent change. Neither is a wire-shape change.
3. **[note] Lock order and deadlock review of the new code. I found no cycle.**
   - `removeSessionRecord` waits on its predecessor ticket while holding the per-id `keyedlock` (via `Remove`), never `m.mu`. No ticket holder ever needs the per-id lock to reach `done()`.
   - `wholeRowPersist` and `railPersist` take `m.mu` only inside persist, after the caller released it.
   - `terminalRegistry.closed` is read and written under `mu` only. `takeover` holds keyLock → `mu` briefly, `closeAll` holds `mu` only, and both socket closes run outside `mu`.
4. **[note] Corrupt stored times.** FW-D1 item (b), sanctioned by the team lead. A corrupt non-null session time column now reads as `time.Time{}` and ships on the wire as `0001-01-01T00:00:00Z`. A corrupt nullable column reads as nil. Only hand-edited data reaches this.
5. **[note] Wire bytes I checked, all identical to base:**
   - the permission-mode 400 text (`strings.Join(claudecode.PermissionModes, ", ")` gives `default, plan, acceptEdits, auto`)
   - `msgUnknownSession`
   - `emptyUsageInfo`'s `"subscription"`/`"subscription-api"`
   - `capturedAt` and `docChanged.at` (`now` was already UTC, and `wireTime` is `UTC().Format(RFC3339)`)
   - the web enum guards (`isReaderListingKind`, `isAttentionReason`, `isPermissionModeSource`, `isPermissionMode`), which accept exactly what the inline checks accepted
   - `musterd -update`, which now passes GitHub's own tag (this closes cycle-1 Note 8's delta)
6. **[note] Pre-existing and out of scope.** `terminalRegistry.closeAll` sends `StatusNormalClosure` (1000), while `docs/protocol.md:1169` and `:1229` say "Normal close (1001)". The code and the doc disagree. Proposed for `proposed-backlog.md`; it is the developer's to file.
7. **[note] For review-maintainability:**
   - `render/tiles.test.ts:28` still says `updateTileChrome` "reads `nameEl.dataset["editing"]`". This wave removed that attribute's only writers (`render/rename.ts`), and `tiles.ts` never reads it now.
   - `features/theme.test.ts`'s describe title cites "(review.work.md Minor 3)".
   - `web/src/features/CLAUDE.md`'s new Owns line names only files and functions that exist (checked each).
8. **[note] Test runtime.** `TestUpdateManager_StopNeverRacesAnApplyThatHasRegistered` runs 200 trials of about 150 ms each, roughly 31 s under `-race`, and its detection is probabilistic. It did fail on the old code in my one run.

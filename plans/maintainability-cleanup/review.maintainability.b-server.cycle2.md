# Maintainability review: maintainability-cleanup — internal/server + internal/reader (cycle 2)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 2 (re-review after the fix wave; cycle-1 report is `review.maintainability.b-server.md`)
**Pack**: `kb: pack 18417 words (budget 8000)` — WARN over budget; sections rules 1938 · features 5683 · diagrams 4290 · decisions 5976 · proposed 0 · facts 168 · lessons 354 · runbooks 2 (`--features connection,surfaces`)
**Scope**: `internal/server` (30 non-test `.go` files) and `internal/reader` (2), read at `6db870d`. Every sibling in both packages was open. For comparison I also opened the three new leaf packages (`internal/keyedlock`, `internal/boundedwait`, `internal/evict`), `internal/locate/locate.go`, `internal/session/{manager,reader,liveness}.go`, `internal/selfupdate/lock.go`, `internal/claudecode/{launch,theme}.go` + `CLAUDE.md`, and `docs/diagrams/daemon-components.md`. Decisions read: `daemon-implementation-{F2,D4,D5,D6,D7a,D7b,D10,D11}.md`, including the D10b and D11-evict follow-ups.

## Cycle-1 findings: verdicts

| # | Cycle-1 finding | Verdict | Evidence |
|---|-----------------|---------|----------|
| C1 | `PUT /api/prefs` lost update | **fixed** | `prefs.go:203-210` names the guard where the struct declares it. `prefs.go:322-323` holds it from `loadPrefs` through broadcast and `SetCheckEnabled`. `KVSet(prefsKVKey)` is written only at `prefs.go:343`. `prefs_concurrency_test.go` forces the race. The lock sits inside the handler body, which is Minor 5 below. |
| M1 | `observeWrite` writes back a stale plan path | **fixed** | `reader.go:119` calls `MarkPlanWritten(…, sess.PlanPath)`. That function re-checks `PlanPath == expectedPath` under `Manager.mu` (`session/reader.go:90-100`). |
| M2 | `terminalRegistry.mu` held across close/attach; lock order unnamed | **fixed** (server half) | `terminal.go:88-101`: `keyLocks` serialises the takeover, and `mu` covers only the map (`:123-126`, `:138-140`). The lock order is written at the registry's declaration. `session/manager.go:106-112` (`Manager.mu`) still does not say that `Watcher.Watched` is called under it, but that file is session scope. The fix opened one new interleaving, filed as Minor 3 below. |
| M3 | `shellRegistry.lockID` copies `LockSession`; shell spawned after Remove | **fixed** | Both now use `keyedlock.Locks[int64]` (`shells.go:62`, `session/manager.go:122`). `handleCreateShell` holds `manager.LockSession(id)` across `sessionOr404` + `Ensure` (`shells.go:249-262`). `shells_remove_lock_test.go` forces it. What is left is two locks for one sequence (Minor 6). |
| M4 | Background-loop lifecycle ×4, wait tail ×6 | **fixed** | `bgloop.go:16-59` holds `bgLoop` + `runTicked`, and `boundedwait.Wait` is called from `bgloop.go:37`, `ingest.go:113`, `updatemanager.go:160` and `session/liveness.go:32`. `rg 'wg.Wait\(\)' internal --glob '!*_test.go'` now finds only `boundedwait.go:25`. The "pattern copied from" doc comments stayed behind and are now false (Minor 9). |
| M5 | Terminal/shell handler bodies duplicated; shell frames in `terminal.go` | **fixed** | `attachAndPump` (`terminal.go:304-356`) and `applyResize` (`:465`) each exist once. Shell frame types moved to `shells.go:323+`. The `funlen` hit on `handleShellTerminal` is gone from `size.log`. |
| M6 | Permission-mode enum has three owners | **fixed** | `claudecode/launch.go` owns the constants. `session.ValidPermissionMode` delegates to it, and `launcher.go:135` validates through it. `rg '"acceptEdits"' --type go -g '!*_test.go'` finds one production hit (per D7b, re-run here). The 400 message at `launcher.go:136` still spells the four values, but that is protocol text (Note 5). |
| M7 | `readerRunGit` duplicates `gitutil.runGit` | **fixed** | `rg 'exec.CommandContext\(ctx, "git"' --glob '!*_test.go' internal` finds only `gitutil/gitutil.go:107`. The reader consumes `gitutil.ListFiles` through `reader.ListFilesFunc` (`reader.go:39,53`). |
| M8 | No success-JSON helper; envelope declared twice; id→404 and dir-missing copied | **partially fixed** | `respond.go` now holds `errorResponse` (one struct, optional `Paths`), `writeJSON`, `sessionOr404` and `writeDirectoryMissing`. `rg 'json.NewEncoder\(w\)' internal/server --glob '!*_test.go'` finds only `respond.go:38`. But `parseSessionID` stayed in `sessions.go:83`, and 7 sites still hand-write the `unknown_session` 404 beside the helper (Minor 4). |
| M9 | `server.New` pokes other features' fields; mapping, defaults and store I/O in the root | **fixed** | No line in `New` (`server.go:132-218`) writes another feature's field. Wire mapping is in `sessionwire.go` (`sessionUpsertWire`/`sessionRemovedWire`). Queue size, `claudeBin` and scroller defaults moved into their consumers. The prefs read moved into `newUpdateFeature` (`update.go:72`). The `features` doc (`server.go:110-115`) states that start order is registration order. What remains: `New` is still 67 lines with no recorded reason (Minor 8), and the `ShellScroll` default is resolved differently from its three neighbours (Minor 7). |
| m1 | Siblings diverge on logger, 5xx phrase and ctor order; handlers on `*Server` | **mostly fixed** | Every feature now has a logger (`locate.go:32`, `prefs.go:201`, `browse.go:44`). `msgInternalError` is in `respond.go:31`. `newIngestFeature` takes the logger last (`ingest.go:262`). `CLAUDE.md` states the core-route exception. Still open: `issue.go:132` answers the ad-hoc 5xx text `"generating capture id"`, and `newIngestQueue(st, log, size, manager, files, usage)` (`ingest.go:67`) now has three parameters after its logger (Note 4). |
| m2 | `sessions.go` holds three concerns; V7 spawn/kill copies | **fixed** | The file split into `sessions.go` (318 lines), `launcher.go` (485) and `launcherrors.go` (65). `spawnSession` (`launcher.go:175`) and `killSessionAfterRecordFailure` (`:189`) each exist once. The split separated `Launch` from its doc comment (Minor 9). |
| m3 | `update.go` duplicates the client default, the remedy builder and install | **fixed** | `buildUpdateInfo`/`remedyPointer` (`updatewire.go:45-66`) is the one builder for both the enabled and the disabled object. `New` defaults `httpClient` once (`server.go:165-168`). `newUpdateManager` still keeps its own `http.DefaultClient` fallback, only for `update_test.go`'s direct construction (Minor 10). |
| m4 | `issue.go` mixes four concerns; disabled shape; eviction ×2; `handleCreateIssue` funlen | **fixed** | The file split into `issue.go`, `issuecapture.go` and `issuesnapshot.go`. `client` is nil when disabled (`issue.go:85-93`). `fileIssue` (`:172`) holds reserve/post/consume. `evict.Oldest` is the one eviction loop (`issuecapture.go:49`, `reader/writelog.go:39`). `handleCreateIssue` is gone from `size.log`. Handlers still gate on `f.apiURL == ""` rather than on `f.client == nil`, so a reader has two ways to spell "disabled" (Note 6). |
| m5 | Production surface only tests use | **partially fixed** | `Server.buildIssueSnapshot`, `Server.loadPrefs`, `Server.browseRoot` and `ingestQueue.Drain` are gone from production (`Drain` is now `ingest_test.go:273`). Several remaining items are listed in Minor 10. |
| m6 | Wire types have split homes; `buildSnapshot` re-spells usage defaults | **partially fixed** | Each wire type now lives with its feature: `usagewire.go:11-42`, `prefs.go:91`, `themepoll.go:30`, `updatewire.go:13-31`, and `ClaudeCodeInfo` at `server.go:26`. But `emptyUsageInfo` (`usagewire.go:50-54`) still re-spells `"subscription"`/`"subscription-api"`, whose owners are `usage/aggregator.go:15` and `usage/modelscoped.go:17`. The literals moved; they were not removed. Tracked in Minor 10. |
| m7 | `ev.Type == "status_line"` compared in server | **fixed** | `ingest.go:159` now compares `job.kind == claudecode.KindStatus`. |
| m8 | `handleRestartImpact` has its own shell lister | **fixed** | `restartImpactShells` (`update.go:224`) asks `session.Manager.ShellNames`, and the `tmuxLister` seam is gone. |
| m9 | `handleShellTerminal` reaches `registry.tmux` without a bound | **fixed** | `shellRegistry.PaneExists` (`shells.go:84-88`) applies `shellTmuxTimeout`, and `shells.go:293` goes through it. |
| m10 | `wsHub.closeAll` closes sockets under `h.mu` | **fixed** | `ws.go:81-90` copies the map and closes outside the lock. `wshub_closeall_test.go` covers it. |
| m11 | Apply goroutine outside `Stop` | **partially fixed** | `Stop` now cancels and bounded-waits `applyWG` (`updatemanager.go:151-163`). But `applyWG.Add(1)` runs after `m.mu` is released (`updatemanager.go:358-362`), so `Stop` can miss an apply it has already cancelled. Filed as Major 1. |
| m12 | Dead `_ = walkErr` branch | **fixed** | The branch is gone. `reader/reader.go:115-120` keeps a single comment on the ignored `WalkDir` result. |
| m13 | Wire time format spelled 19× | **partially fixed** | `wireTime`/`wireTimePtr` (`respond.go:87-99`) exist, but `rg 'RFC3339' internal/server --glob '!*_test.go'` still finds two call sites outside `respond.go`: `issue.go:139` and `reader.go:124` (Minor 2). |
| m14 | Handlers doing domain work (browse, restart-impact, reader) | **fixed** | `browseDirectory` (`browse.go:81`) and `restartImpactShells` (`update.go:224`) take the domain work out of those handlers. The reader's scope and confinement rules are in `internal/reader` (`Scope.PathQualifies`/`Confine`, `ListMarkdown`, `WriteLog`) and are tested in-package (`reader/reader_test.go` is `package reader`). |

### Seed check items

| Seed | Verdict | Evidence |
|------|---------|----------|
| V1 | fixed | See M8: `writeJSON` is the one encoder. |
| V2 | fixed | See m1: `locate`, `prefs` and `browse` now log their 500s (`locate.go:88+`, `prefs.go:339,344`, `browse.go:69`). |
| V3 | fixed | See M7. |
| V4 | fixed | See M5. |
| V5 | fixed | See M9. |
| V6 | fixed | See m3. |
| V7 | fixed | See m2. |
| V8 | fixed | `internal/server/CLAUDE.md` invariant 1 now names the four core routes as the exception. |
| V9 | not fixed (no change asked) | The parse → `not_found` pair is still written once in each terminal handler (`terminal.go:259-267`, `shells.go:281-289`). `attachAndPump` starts after validation, so Major 5 did not fold it. Note 7. |
| S2 | fixed | See M1. |
| G1, G2, G4 | as agreed | G2's in-package half is done (one `httpClient` default in `New`). |
| G3 | fixed | See M4. |
| T1 | fixed | `size.log` has no `dupl` line for `internal/server` test files. |
| Plan-ID comments | **partially fixed** | The X1 sweep removed the REQ/INV/D-number citations: my grep finds none in scope. Plan names and plan-section citations remain, plus comments that narrate the refactor itself (Minor 9). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| server.go | all package files | D6 (reader-before-sessions, usage-before-ingest, httpClient once) | funlen `New` 67, no reason recorded | Minor 7, Minor 8, Minor 10 |
| respond.go (new) | auth.go, sessions.go, locate.go | D4 (`writeJSON`, `errorResponse`, `sessionOr404`, `writeDirectoryMissing`, `wireTime`) | — | Minor 4, Minor 9 |
| bgloop.go (new) | usagepoll.go, themepoll.go, shellactivity.go, updatemanager.go | D7b (`bgLoop`/`runTicked`) | — | pass (Minor 9 comment) |
| auth.go / state.go / ws.go | server.go, respond.go | D6 (defaults beside feature) | — | Minor 9 (state.go) |
| prefs.go | update.go, issue.go, state.go | F2 (`mu`) | — | Minor 5 |
| sessions.go | launcher.go, shells.go, respond.go | D7a (pure move) | — | Minor 4 |
| launcher.go (new) | sessions.go, shells.go, launcherrors.go | D7a (`spawnSession`, kill helper) | funlen `Launch` 83, reason holds (Note 1) | Minor 1, Minor 9 |
| launcherrors.go (new) | respond.go, browse.go | D7a (pure move) | — | pass |
| shells.go | terminal.go, sessions.go, session/manager.go | F2 (handler-level lock), D5 (`PaneExists`), D6 (`scroll, realScroll`) | — | Minor 6, Minor 7, Minor 9 |
| terminal.go | shells.go, ws.go, keyedlock | F2 (two-guard split), D5 (`attachAndPump`, `terminalPump`, `applyResize`) | — | Minor 3, Note 3, Minor 9 |
| ingest.go | usagepoll.go, reader.go, server.go | D4/D6 | — | Note 4 |
| usage.go / usagepoll.go / usagewire.go | themepoll.go, shellactivity.go | D6 (`emptyUsageInfo`) | — | Minor 9, Minor 10 |
| themepoll.go / shellactivity.go | usagepoll.go, bgloop.go | D7b | — | Minor 9 |
| update.go / updatewire.go / updatemanager.go (split) | usage*.go, prefs.go | D7a (`buildUpdateInfo`), D7b (split), F2 (`applyCancel`/`applyWG`), D10b (`probeVersionFunc`) | — | **Major 1**, Minor 9, Minor 10 |
| issue.go / issuecapture.go / issuesnapshot.go (split) | update.go, usage.go, reader/writelog.go | D7a (`fileIssue`), D11 (`evict.Oldest`) | funlen `buildIssueSnapshot` 76, reason holds (Note 1) | Minor 2, Minor 4, Minor 9 |
| reader.go / readerwire.go | locate.go, internal/reader | D11 (`reader.Scope`, `ListMarkdown` gitErr) | — | Minor 2 |
| browse.go / locate.go / repos.go | each other, respond.go | D7b (sentinels) | funlen `handleLocateFile` 41, reason holds (Note 1) | pass (Minor 9 locate.go) |
| sessionwire.go | usagewire.go, readerwire.go | D6 (`sessionUpsertWire`) | — | Minor 9 |
| internal/reader/reader.go, writelog.go (new pkg) | internal/locate, internal/evict | D11 (`Scope`, `evict` follow-up) | — | Minor 9, Note 8 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** Minor 11's fix leaves a window in which `Stop` returns without waiting for an apply it has already cancelled, and that window breaks `sync.WaitGroup`'s contract.
   - **Where:** `RequestApply` releases `m.mu` at `updatemanager.go:360` and only then calls `m.applyWG.Add(1)` at `:362`. `Stop` reads `applyCancel` under `mu` (`:152-155`) and then calls `boundedwait.Wait(&m.applyWG)` (`:160`).
   - **Interleaving:**
     - A `POST /api/update/apply` goroutine sets `applyInFlight`/`applyCancel` and unlocks (`:358-360`).
     - SIGTERM → `Server.Shutdown` → `um.Stop` locks, sets `shuttingDown`, reads the non-nil `applyCancel`, unlocks and cancels it.
     - `boundedwait.Wait` starts `wg.Wait()` with the counter at 0, so it returns at once, and `Stop` returns.
     - The HTTP goroutine then runs `applyWG.Add(1)` and `go m.runApply(...)` against a daemon that has already finished shutting down.
   - **Why this is a defect:** a positive `Add` concurrent with a `Wait` on a zero counter is the WaitGroup misuse the stdlib doc forbids ("calls with a positive delta that occur when the counter is zero must happen before a Wait"). The race detector models that first `Add` as a read against `Wait`, so `-race` flags it whenever a test hits the window. `updatemanager_stop_test.go` only calls `Stop` after the apply is already blocked in the transport, so it never covers this window.
   - **Why Major, not Critical:** the escaping apply runs on a context that is already cancelled, and `AcquireLock` is an `flock` the kernel drops at exit (`selfupdate/lock.go:29`), so nothing is left behind on disk.
   - **Cites** conventions § Design, "Shared state names its writers and its guard": the declaration says the apply state is "guarded by mu like every other apply-state field" (`:85-86`), and `applyWG`'s increment is the one write outside it.
   - **A fix must make true:** the `Add` that registers an apply happens in the same `m.mu` critical section that checks `shuttingDown` and publishes `applyCancel`. After `Stop` has read `shuttingDown`, no apply can register with the WaitGroup.

### Minor

1. **[daemon-impl]** `launcher.go:431` spells Claude Code's project settings location, `filepath.Join(dir, ".claude", "settings.local.json")`, inside `internal/server`.
   - `internal/claudecode/CLAUDE.md:3,8` claims "`settings.local.json` entries" and "Settings land in the project-scoped `.claude/settings.local.json`" as `claudecode`'s knowledge. `claudecode` already owns the sibling paths (`plan.go:75,101` for `.claude/plans`, `theme.go:21` for `DefaultConfigPath`).
   - `rg 'settings.local.json"' --glob '!*_test.go' internal cmd` finds only `launcher.go:431`.
   - I missed this in cycle 1: it was `sessions.go` then. It is filed at cycle-1 Minor 7's severity for the same kind of small vocabulary leak.
   - **Cites** the CLAUDE.md hard rule "All Claude-Code-format knowledge … lives in `internal/claudecode/`".
   - **A fix must make true:** `internal/server` asks `claudecode` for the settings file's location and does not spell it.

2. **[daemon-impl]** The wire time rule still has two call sites outside its home.
   - `issue.go:139` writes `CapturedAt: now.Format(time.RFC3339)`, and `reader.go:124` writes `At: now.Format(time.RFC3339)`. Both sit beside `wireTime` (`respond.go:87`), which D4's log says replaced "all 19".
   - `rg -n 'RFC3339' internal/server --glob '!*_test.go'` shows `issue.go:139`, `reader.go:124` and `respond.go:86,88`. Both leftovers are correct today only because `now` was already `.UTC()`.
   - **Cites** § Design, "One owner per concept" (cycle-1 Minor 13).
   - **A fix must make true:** `respond.go` is the only file in `internal/server` that formats a wire timestamp.

3. **[daemon-impl]** Since F2 split `terminalRegistry`'s guard, a takeover that races `Shutdown` installs a socket that `Shutdown` never closes.
   - **Where:** `takeover` releases `r.mu` across the attach (`terminal.go:123-136`) and then re-inserts at `:138-140`. `closeAll` swaps the map (`:202-206`).
   - **Interleaving:**
     - A tab opens `/ws/terminal/7`, and `takeover` deletes the old entry, unlocks, and enters `termbridge.Attach`.
     - SIGTERM → `Server.Shutdown` → `s.terminal.closeAll()` swaps the map and closes the sockets it held.
     - `takeover` locks and installs its new `terminalConn` into the fresh map.
     - `attachAndPump` goes on to `MarkSeen` and pumping. No 1001 "musterd shutting down" is ever sent, and the pump runs until the process exits.
   - **What changed:** under the old single lock, `closeAll` waited for the install and then closed it. `closeAll`'s own comment (`:199-201`) was written for the old shape.
   - **Cites** § Design, "Shared state names its writers and its guard". `terminal_registry_lock_test.go` covers `Watched`, not `closeAll`.
   - **A fix must make true:** a connection installed after `closeAll` has run is closed with the shutdown code, or the install refuses. The rule is stated at the registry's declaration.

4. **[daemon-impl]** The `unknown_session` 404 has a helper that only 3 of 10 sites use, and the id-parse half of the pair lives in a feature file.
   - `rg -n '"unknown session id"' internal/server --glob '!*_test.go'` finds `respond.go:70`, `sessions.go:86,108,139,181,214,309` and `issue.go:119`, plus four `not_found` spellings in the two terminal handlers.
   - `issue.go:116-121` is exactly `sessionOr404`'s Get-or-404 written out by hand.
   - `parseSessionID` (`sessions.go:83`) is called by `reader.go:157,212`, `locate.go:51` and `shells.go:245`, always directly before `sessionOr404`. It lives in a feature file, not the transport file.
   - **Cites** § Design, "Reuse before add" and "One owner per concept". Cycle-1 Major 8's fix text asked that "id-to-session-or-404 … each exist once, next to the envelope".
   - **A fix must make true:** the `unknown_session` code+message pair is spelled once in `respond.go`, `parseSessionID` sits beside `sessionOr404`, and `issue.go` uses the helper rather than a copy of it.

5. **[daemon-impl]** Critical 1's fix put the atomic merge rule inside the HTTP handler.
   - `handlePutPrefs` (`prefs.go:289-359`) now owns a critical section: lock, `loadPrefs`, apply fields, marshal, `KVSet`, broadcast, `SetCheckEnabled`.
   - The sibling `locate.go:43-49` states the rule it follows ("Business logic … lives entirely in internal/locate; this handler only decodes, delegates and encodes"). `issue.go:166-171` (`fileIssue`) was extracted for this same reason in this run.
   - The same serialisation is also explained twice, at the field (`:203-209`) and again at the lock site (`:318-321`).
   - **Cites** conventions § Go, "Business logic never lives in HTTP handlers; handlers decode, delegate, encode".
   - **A fix must make true:** the handler decodes and validates, then calls one method that performs the locked merge-persist-broadcast and returns what the handler encodes. The guard's rationale is written once, at `mu`.

6. **[daemon-impl]** Every production shell spawn now runs under two per-id locks, and the inner one is dead weight.
   - `handleCreateShell` holds `session.Manager.LockSession(id)` (`shells.go:249`) and calls `Ensure`, which takes `shellRegistry.locks` for the same id (`shells.go:117`, via `lockID`, a one-line pass-through at `:78-80`).
   - `Ensure` has one production caller (`shells.go:262`). `Kill` runs only after `Manager.Remove` has returned (`sessions.go:148`), so the inner lock serialises nothing the outer one does not already serialise.
   - `Kill`'s doc comment (`:175-181`) now argues its `Forget` is safe from the outer lock, while the field comment (`:55-61`) still says the inner lock is what serialises check-then-spawn/kill. A newcomer has two owners of one rule to reconcile.
   - F2's Decisions kept the registry standalone for its unit tests, which is a reason for the registry to exist, not for the second lock.
   - **Cites** § Design, "One owner per concept".
   - **A fix must make true:** the shell surface's per-session serialisation has one named owner. If the registry keeps a lock, its declaration says which production caller already holds `LockSession` and what the inner lock adds. `lockID` either earns its name or goes.

7. **[daemon-impl]** `New` resolves three `Config` overrides in the root and a fourth in its consumer, through a fallback parameter.
   - `spawner`, `attach` and `httpClient` are defaulted inline (`server.go:147-168`).
   - `ShellScroll` goes out as two arguments, `cfg.ShellScroll, tmuxClient` (`server.go:193`), which `newShellFeature(…, scroll, realScroll shellScroller, …)` (`shells.go:223-228`) resolves.
   - D6's `design:` line says this "matches the shape `newSessionLauncher`/`ingestQueue`'s size default already use". It does not: those constructors default to a constant (`launcher.go:98-101`, `ingest.go:68-70`), and none of them takes the root's fallback as a second parameter.
   - A reader of `New` cannot tell that the second argument is only a fallback without opening `shells.go`.
   - **Cites** § Design, "Match the siblings"; the reason given does not hold on the code.
   - **A fix must make true:** every `Config` override whose default is another root-built object is resolved in one place and one way.

8. **[daemon-impl]** `server.go:132` `New` carries a `funlen` warning (67 lines), and no Decisions log records a reason for it.
   - D6 owns `New`'s shape but gives no size reason. D7b defers to "Major 9 … not assigned to D7b".
   - A reason that holds is available on the code: the body is one construction-plus-`register` line per feature (13 features) plus the three dependency defaults Minor 7 names.
   - **Cites** § Design, "Size is read, not obeyed", and kb:adr/process-size-linters-warn-never-fail. No split is asked for.
   - **A fix must make true:** the warning has a recorded reason that the code bears out.

9. **[daemon-impl]** Comments still cite plan names or plan sections, narrate this refactor, or have become false. Comment truth is `review-work`'s row, but the team lead asked for these to be listed, and the fix agent needs the lines.
   - **Plan names or plan sections cited instead of a kb anchor** (§ Comments):
     - `state.go:16` ("new in the auto-update plan (2026-09-10…)") and `state.go:19` ("new in terminal-fixes-cleanup").
     - "Schema Changes:" at `reader/writelog.go:15`, `issuecapture.go:31` and `sessionwire.go:113`.
     - "Protocol Contract" at `locate.go:47,119`, `terminal.go:331` and `reader.go:112`.
   - **Refactor history narrated in place of the why** (§ Comments, "don't narrate history"):
     - `boundedwait.go:3-5` ("each hand-wrote … extracting the duplicated pattern here removes that repetition").
     - `bgloop.go:13-14,41-42` ("each hand-wrote", "each wrote out by hand").
     - `respond.go:65-66` ("the parse-id/Get/404 pattern … each repeated") and `respond.go:76-80`.
     - `updatewire.go:43-44` ("Both halves were assembling the same shape … by hand").
     - `updatemanager.go:144-150` ("before this, RequestApply's goroutine ran under…").
     - `terminal.go:111-114` ("an earlier version evicted and installed atomically…").
     - `shells.go:241-243` ("Without this, the earlier sessionOr404 check…") and `shells.go:59-61`.
     - `launcher.go:86-88,205-206` ("exactly as before this check existed") and `launcher.go:171-174`.
   - **Now false:**
     - `usagepoll.go:21-22` says "Pattern copied from internal/session.Manager's liveness poll (manager.go:126-151 … :715-726)". The poller uses `bgLoop`, and those lines hold something else.
     - `themepoll.go:101-102` and `shellactivity.go:64-65` say "pattern copied from usagePoller…". Both now embed `bgLoop`.
     - `updatemanager.go:141-143` says an in-flight apply "observes errShuttingDown". `runApply` never reads `shuttingDown`: it is cancelled. This is cycle-1 Note 5's item, still standing.
     - `updatemanager.go:38-39` says "a nil *updateManager on Server". The nil pointer is `updateFeature.um`.
     - `respond.go:77` says "sessions.go's Resume path", and `terminal.go:396` says "sessions.go's rollback". Both now live in `launcher.go`.
     - `launcher.go:117-124`: `Launch`'s doc comment ("Launch validates req, runs the model check…") now sits on top of `validateLaunchRequest`, and `Launch` (`:198`) has none.
   - **A fix must make true:** no comment in scope cites a plan's name, date or section heading, or narrates the change that produced the code. Each false sentence above is corrected or deleted.

10. **[daemon-impl] [daemon-tests]** Production surface that only tests read, left over from cycle-1 Minor 5.
    - `Server.ingestToken` (`server.go:101,137`) and `Server.prefs` (`:120,204`) are written and never read anywhere, tests included (`rg '\.ingestToken\b|\.prefs\b' internal/server`).
    - `Server.store`, `tmuxClient`, `sessions`, `ingest`, `usage`, `theme`, `shellActivity`, `issue`, `locate` and `reader` are read only by `*_test.go`. My per-field `rg` shows 0 production reads apart from `terminal` and `update`.
    - `paneSpawner.KillWindow` (`launcher.go:28`) has no production caller. D10 kept it for the tests that kill panes through `srv.tmuxClient`.
    - `newUpdateManager`'s own `http.DefaultClient` fallback (`updatemanager.go:101-104`) exists for `update_test.go`'s direct construction (D6 and D7a both say so).
    - `emptyUsageInfo` (`usagewire.go:50`) is always overwritten, because usage is always registered (`state.go:32-41`). It survives only for `TestBuildSnapshot_M0Shape`, and it keeps the two re-spelled usage literals alive (m6).
    - **Cites** § Design, "seams where a test needs one and nowhere else".
    - **A fix must make true:**
      - No `Server` field is write-only.
      - A field kept for tests says so at its declaration, or the test reaches the feature through the object that already holds it.
      - The usage defaults are spelled only in `internal/usage`.

### Notes

1. **[note]** Size warnings whose reasons hold:
   - `Launch` (83 lines): an unchanged linear pipeline, cycle-1 Note 1.
   - `buildIssueSnapshot` (76): a byte-identical move of the allowlist copy.
   - `handleLocateFile` (41 statements): decode plus one error-mapping switch.
   - No file in scope is over 500 lines any more (`launcher.go` 485, `terminal.go` 471, `updatemanager.go` 460).
   - Test-file `funlen` hits (`shells_remove_lock_test.go:85`, 47 statements, and others) are outside my diff.
2. **[note]** The three new leaf packages each state the problem they answer: a layering boundary that forbids the caller's package (`keyedlock.go:1-6`, `boundedwait.go:1-8`, `evict.go:1-6`). That meets § Design's "a pattern earns its name". Their package docs enumerate their callers, which will drift. `boundedwait` has no test file, while its two siblings do (coverage is `review-work`'s). The diagram now draws all four new packages (`daemon-components.md:24-31,55,74-76`), so there is no DIAG note.
3. **[note]** `terminalRegistry.keyLocks` gains up to two entries per session ever attached and never reclaims them. Its siblings `Manager.locks` (`session/manager.go:321`) and `shellRegistry.locks` (`shells.go:187`) call `Forget`. The growth is bytes per session over the daemon's life. `Forget`'s own contract (`keyedlock.go:38-41`) explains why reclaiming is not trivially safe here, because `handleTerminal` holds no session lock. If it is left as is, the declaration should say why.
4. **[note]** `newIngestQueue(st, log, size, manager, files, usage)` (`ingest.go:67`): D6 appended three collaborators after the logger, so this is now the only constructor with the logger in the middle. D4 left it for test churn.
5. **[note]** `launcher.go:136`'s 400 text "permissionMode must be one of default, plan, acceptEdits, auto" re-lists the set. It is protocol text, so no change is asked unless the contract lets it be built from `claudecode.PermissionModes`.
6. **[note]** The issue feature builds a nil `client` when disabled, but its handlers gate on `f.apiURL == ""` (`issue.go:104,191`), while usage gates on its nil component (`usage.go:111`). `issue.go:129-134`'s `"generating capture id"` 500 is both off-phrase and dead on go 1.27 (cycle-1 Note 3).
7. **[note]** V9: the parse → `not_found` block is written in both terminal handlers (`terminal.go:259-267`, `shells.go:281-289`). The contract codes differ from `unknown_session`, so it sits outside Minor 4, but it is four identical lines twice.
8. **[note]** `internal/reader` matches `internal/locate`'s shape, with one departure: its package doc ends "Features: reader." (`reader/reader.go:4`), a CLAUDE.md idiom inside godoc. `WalkMarkdown` is exported although every caller, tests included, is in-package (`reader_test.go` is `package reader`). D11 exported it for tests that then moved into the package.
9. **[note]** `claudeCodeWire` (`ws.go:25-30`) mirrors `ClaudeCodeInfo` (`server.go:26-31`) field for field, and `handleWS` copies across by hand (`ws.go:128-133`). `issueSnapshotClaudeCode` is a third copy, but it is deliberate (allowlist, "assemble by copy"). This predates the run, and no change is asked.

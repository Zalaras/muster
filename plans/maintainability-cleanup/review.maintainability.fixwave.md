# Maintainability review: Maintainability Cleanup (fix-wave verification)

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: `kb: pack 25230 words (budget 8000)` (WARN: over budget; `--features lifecycle,connection`)
**Scope**: 123 files from `git diff --name-only 6db870d..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, across four commits (5937f25, 603685f, 27a1c69, 0872f3d). I opened the siblings of each touched package or directory.

Gates read: `$GATES_LOG_DIR/race.log` (`go test -race ./...`, every package `ok`) and `bl.log` (golangci-lint, `0 issues`). There is no size log in the fw dir, so I ran `make size-warn` at HEAD; the output is in the scratchpad as `fw-size.log`.

## Files

| Area | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session (writeorder, manager, manager_rail, apply, reader, title, actions, liveness, reconcile, row) | whole package | FW-D1: persistWholeRow, restoreChangedFields, removeSessionRecord `announced` | applyInput 52 (reason holds) | **fail**: Majors 1–3, Minors 1–3 |
| internal/store (store, session, migrate, repo) | whole package | FW-D1: SetLogger, scanSession method | none | **fail**: Major 4 |
| internal/keyedlock, internal/boundedwait | each other, evict | n/a (doc-only) | none | pass, apart from the boundedwait residue in Minor 3 |
| cmd/musterd (main, preflight, update, webdist) | package | FW-D1 one line | `run` 45 (was 44, see Note 3); parseFlags 41 | pass |
| internal/server (21 files) | whole package | FW-D3 | New 41, terminal.go 504, Launch 83, handleLocateFile 41, buildIssueSnapshot 76 (all have reasons that hold) | **fail**: Minors 4–6 |
| internal/claudecode, tmux, gitutil, ghissue, selfupdate, usage, reader, termbridge | each package | FW-D2 (shape reasons), FW-D3 (usage aliases) | tmux.go 757 (reason holds), claudecodetest.go 536 | pass, notes only |
| web/src/protocol, api, root modules (main, wsapp, doc, storage, ws, theme, dragmime) | each dir | FW-W | none | **fail**: Minors 7, 9 |
| web/src/features, render, sessions, reader, terminal | each dir | FW-W (density control, rename ownership, features/ rule) | features/reader.ts 645 (cycle-2 reason covers it) | **fail**: Minors 8, 10–13 |

## Cycle-2 findings: closed or not

Only [daemon-impl]/[web-impl] rows are listed. a-session Minor 8 and d-webcore Minor 13 are test-file rows ([daemon-tests]/[web-tests]) and are left to those agents.

### a-session

| ID | Verdict | Evidence |
|----|---------|----------|
| a-M1 | **not closed** | The fix moved the window rather than closing it. See Major 2: an *earlier* write now carries a *later* write's mutation into the DB and onto the wire, and that later write can then fail and roll back. |
| a-M2 | **not closed** | Removal now goes through the turnstile (`manager.go:347-354`), and a write queued *behind* a removal finds the session gone (`writeorder.go:106-108`). But a write queued *ahead* of the removal broadcasts only after it has released its ticket, so its `sessionUpsert` can land after `onRemoved` (`manager.go:367-368`). See Major 1. |
| a-M3 | partly | `persistWholeRow` is at `writeorder.go:80`, beside `finishWrite`, and has 12 callers. Apply (`apply.go:99-105`) and storeSnapshot (`liveness.go:71-73`) state why they spell out their own tails. But `railPersist` (`manager_rail.go:79-96`) is a second copy of `wholeRowPersist`. See Major 3. |
| a-M4 | closed | `collectSessions` (`manager.go:377`) takes `m.mu` itself and carries no `Locked` suffix. The new tail's name has the opposite problem; see Minor 1. |
| a-M5 | closed | The `SetPlan` doc (`reader.go:46-51`) now truthfully says it is test-only. Residue: its doc embeds an `rg` command (Minor 3). |
| a-m1 | partly | Every named tag is gone: `store.go`, `migrate.go`, `repo.go`, `row.go`, the `actions.go`/`liveness.go` "(S6)" tags, and the `manager.go` narration at :37-41, :108-109, :171-174, :303-306. Still present: `manager.go:376` "each of which used to hand-write" (the rewrite of :343-345) and `boundedwait.go:3-4` "ingest queue and four pollers" (the pollers all reach it through `bgloop.go`). New instances are in Minor 3. |
| a-m2 | closed | `manager.go:251-254` and `store/session.go:122-126` now describe `nextRailPos`. The `removeFromMemory` doc (`manager.go:292-295`) names its one caller truthfully. `actions.go:115-119` no longer says "above". |
| a-m3 | closed | The `Forget` doc (`keyedlock.go:38-47`) and the `LockSession` doc (`manager.go:170-173`) state the re-validate-after-lock condition, and every caller meets it: `shells.go:251-255` runs `sessionOr404` after the lock, `launcher.go:313,367` and `actions.go:47,181` re-check existence. |
| a-m4 | closed | `rg sessionTmuxName internal` finds nothing. `actions.go:97` and `reconcile.go` call `tmux.SessionName` directly. |
| a-m5 | closed | `MarkSeen` now sits at `manager_rail.go:158`. |
| a-m6 | closed | The type is now `sessionRef` (`manager.go:393`). |
| a-m7 | closed | The Config doc (`manager.go:82-88`) states why the three hooks stay nil-tolerant. Residue: the phrase "before the ports became required" (Minor 3). |

### b-server

| ID | Verdict | Evidence |
|----|---------|----------|
| b-M1 | closed | `updatemanager.go:370` calls `applyWG.Add(1)` before `mu.Unlock()`, in the critical section that checks `shuttingDown`. |
| b-m1 | closed | `launcher.go:437` calls `claudecode.ProjectSettingsPath(dir)`. Outside claudecode, `rg '"\.claude"\|settings\.local\.json'` finds only prose. |
| b-m2 | closed | `rg RFC3339 internal/server` (non-test) finds only `respond.go:108,110`. |
| b-m3 | partly | `closed` is declared at `terminal.go:107` and guarded by `mu` (:91). The takeover refuses at :139 and :158. The first-check path's comment is false, and the socket it refuses gets no close code (Minor 4). |
| b-m4 | partly | `writeUnknownSession`/`msgUnknownSession` and `parseSessionID` now sit beside `sessionOr404` (`respond.go:59-76`), and `issue.go:117` uses the helper. The launcher still spells the pair a second time: the code at `launcherrors.go:45` and the message at `launcher.go:372`. |
| b-m5 | closed | `(*prefsFeature).applyAndPersist` (`prefs.go:331`) matches `issue.go:171`'s `fileIssue` shape. The rationale is stated once, at `mu` (:204-211). |
| b-m6 | closed | `shells.go:57-67` names two distinct guarantees, and the reason given (the direct concurrent Ensure test) holds. |
| b-m7 | closed | `server.go:182-185` resolves `shellScroll` beside the other three, and `newShellFeature` takes one `scroll` value. |
| b-m8 | closed | The reason is recorded in FW-D3's Decisions and in the doc for `New`. The doc's count is wrong (Note 5). |
| b-m9 | closed for every named line | Residues the sweep regex still finds, none of them named in cycle 2: `tmux.go:651,655,700` "used to", `claudecode/settings.go:55`, `claudecode/interpret.go:175`, `prefs.go:294`. |
| b-m10 | closed | `ingestToken` and `prefs` are gone. The test-only fields are named at `server.go:99-106`. `launcher.go:29-32` documents `KillWindow`, `updatemanager.go:104-106` documents the DefaultClient fallback, and `usagewire.go:52-53` reads `usage.DefaultSource`. |

### c-adapters

| ID | Verdict | Evidence |
|----|---------|----------|
| c-C1 | closed | `claudecode/settings.go:51` defines `ProjectSettingsPath`, the same shape as `plan.go:100`'s `DefaultPlansDir`. The temp-file prefix is derived from it (`launcher.go:465`). |
| c-M1 | closed | `version.go:29` builds `versionChecker{run: runCommand}`, and `runInstalledVersion` is deleted. `runCommand` keeps its `WaitDelay`. |
| c-m1 | closed | Stdout-only is `([]byte, error)` everywhere, and both-streams is `([]byte, []byte, error)` in tmux and ghissue. The dir-taking shape is structurally identical in `gitutil.go` and `modelcheck.go:40`, so FW-D2's two-shape reason holds. |
| c-m2 | closed | `claudecode/CLAUDE.md:3` names the ingest path shape and `MusterSessionEnvVar`. |
| c-m3 | partly | `launch.go:24` uses `slices.Contains`. The doc at `launch.go:18-19` still names a nonexistent user: "ValidPermissionMode's error text". It has none; the text is in `validateLaunchRequest`. |
| c-m4 | closed for every named line | The residues are the ones listed under b-m9. |

### d-webcore

| ID | Verdict | Evidence |
|----|---------|----------|
| d-M1 | closed | `main.ts:97` is one line, `new WsClient(wsUrl("/ws"), dashboardWsHandlers(app, connection, actions))`. Every emit/render body is in `wsapp.ts:30-86`, and the pop-out difference is stated in `wsapp.ts:1-5` and `doc.ts:9-11`. |
| d-m1 | closed | doc.ts does no lookup, branch or mount. `mountStandaloneReader` (`features/reader.ts:632-645`) owns them. |
| d-m2 | closed | `PERMISSION_MODES`/`isPermissionMode` are at `protocol/session.ts:335-340`. `rg 'from "\.\./sessions' web/src/api` finds nothing, and `sessions/permission.ts:17` narrows with the guard. |
| d-m3 | closed | The lists are `ATTENTION_REASONS` (`session.ts:309`), `PERMISSION_MODE_SOURCES` (:322) and `READER_LISTING_KINDS` (`api/reader.ts:82`). A search for the duplicated unions finds nothing. |
| d-m4 | closed | The primitives are only in `protocol/decode.ts:12-28`, and the concept modules import them from there. |
| d-m5 | closed | No re-exports remain. `basename` is defined in `reader/paths.ts:9`, but the move created a directory cycle (Minor 7). |
| d-m6 | closed | `storage.ts:65` has `removeItem`, used by `reader/memory.ts:55`. `theme.ts:49` is typed on `StorageLike`. No storage try/catch exists outside `storage.ts`. |
| d-m7 | partly | `isClaudeFamily` is now private. The `agoSuffix` doc now truthfully says it is test-only (`format.ts:46-50`); the rest is blocked on [web-tests] (`format.test.ts:3`). **`putPrefs` (`api/prefs.ts:16`) is untouched**: its only production caller is `sendPrefsPatch` in the same file, and nothing says it is test-only. |
| d-m8 | closed | It is now `sendPrefsPatch`, with the naming reason at `api/prefs.ts:20-26`. `refreshUsage` moved to `api/usage.ts`. |
| d-m9 | closed | `buildUsageBucketViewModel(bucket: UsageBucket \| null, …)` (`sessions/usage.ts:26`). |
| d-m10 | closed | `repoLine` is exported (`sessions/card.ts:106`). The `mode` default states a current reason (:249-251). |
| d-m11 | partly | Every named plan or finding citation is fixed. History narration left: all seven protocol headers ("split out of the former protocol.ts": `hello.ts:2-3`, `prefs.ts:3`, `session.ts:2`, `theme.ts:3`, `update.ts:3`, `usage.ts:3`, `messages.ts:6`), plus `api/http.ts:1-3`, `protocol/usage.ts:85`, `dom.ts:26-28` and `decode.ts:2-3`. |
| d-m12 | closed | `ws.ts:1-5`, `dragmime.ts:3`, the `decode.ts` header, `prefs.ts:98,143`, `messages.ts:97,111` and `sort.ts:8` are all true now. |

### e-webui

| ID | Verdict | Evidence |
|----|---------|----------|
| e-m1 | closed | `rg 'onAction\?'` finds nothing, and `isEditingName` is required (`mainhead.ts:57`). `updateTileChrome` and `render/launch.ts` use `requireElement`. |
| e-m2 | closed | `rg 'findDeadSurfaceRefs\|ActionsDeps'` finds nothing. Each view passes its own lookup (`focus.ts:94`, `tiles.ts:269`). |
| e-m3 | closed | `buildSessionCardElement` is module-private (`sessions.ts:240`). `rg 'data-editing\|dataset\["editing"\]'` over src, e2e and index.html finds nothing. |
| e-m4 | closed | `ViewsDeps` is named (`views.ts:33`). `SurfacesDeps`/`ReaderDeps` and `TilesDeps.renameHandlers` take real values. The main.ts header now lies about this (Minor 8). |
| e-m5 | closed | `installTerminalDrop` is called in `features/surfaces.ts:216`. `pane.ts` no longer imports `dropwire`. |
| e-m6 | partly | Five derivations moved to `sessions/card.ts:116-167`. `render/dead.ts:81,85,91` still compose endbar and cap text from raw `PaneState` (Minor 11). |
| e-m7 | closed | `rename.ts` holds no editor and has no `isEditing`. Focus attaches and cancels its own editor (`focus.ts:113-117`), as tiles does. |
| e-m8 | partly | The sizenote and the rail density control each have one render writer now (`focus.ts:196`, `sessions.ts:398`). The main slot's `hidden` still has two writers (Minor 12). |
| e-m9 | closed (reason stated) | `showDeadSurfaceNotice` is kept, and `dead.ts:106-111` states a structural reason; the rest is blocked on `dead.test.ts` ([web-tests]). `MountTileDeadSurfaceOptions` is named (`tiles.ts:318`). |
| e-m10 | closed | `features/CLAUDE.md:3` states the inline versus `<owner><concern>.ts` rule, and the directory follows it. |
| e-m11 | partly | Every named line is fixed except two, which are still false: `features/update.ts:35` names "render/update.ts's `CheckState` doc comment", which is at `features/updateview.ts:23`, and `render/update.ts:51` says "see the field's own doc comment", but `toggle` (:40) has none. FW-W's Decisions claims 0 `UI Specifications\|Testable UI Elements` hits outside style.css, but there are 10 in 8 `.ts` files: `terminal/overlay.ts:15`, `terminal/pane.ts:56`, `render/update.ts:46`, `render/dead.ts:62`, `render/reader.ts:359`, `render/sessions.ts:191`, `render/tiles.ts:134`, `render/surfaceseg.ts:26,35`. The wave's own `views.ts:88` says "main.ts formerly registered this". |

## Issues

### Critical

None.

### Major

1. **[daemon-impl] [daemon-tests]** Whole-row writes and Apply now broadcast after releasing their write ticket, so the upsert order no longer follows persist order.
   - **Where:** `persistWholeRow` broadcasts at `writeorder.go:88-89` and Apply at `apply.go:120`. Both run after `finishWrite` returns, and `finishWrite`'s deferred `done()` (`writeorder.go:39`) has already let the next queued write run.
   - **What changed:** at 6db870d, `finishWrite` broadcast at :49-51, inside the turn, before `done()`.
   - **The sibling that still does it right:** the rail tail broadcasts inside the turn (`manager_rail.go:93`), so the two tails in one package now disagree.
   - **Interleaving (stale card):**
     1. `MarkSeen(7)` reaches its turn. Its persist reads live memory (state `working`), writes, and `finishWrite` returns and releases the ticket.
     2. The ingest worker's `Apply(7, TurnClosed)` has already set `idle` and drawn the next ticket. It persists, and `apply.go:120` broadcasts `idle`.
     3. MarkSeen's goroutine resumes and broadcasts its clone, which still says `working`.
     4. Every client shows `working` while memory and the DB say `idle`, until the next upsert. For an idle session that can be minutes.
   - **The same gap keeps a-M2 open:** the removal (`manager.go:351-368`) waits on a ticket that is released before the earlier write's broadcast. So `sessionRemoved` can go out, and the earlier write's `sessionUpsert` can then follow it and re-add the card on every client (kb:adr/connection-whole-object-session-upserts).
   - **Why the gates miss it:** `-race` cannot see a broadcast-order interleaving. The new tests in `manager_writeturnstile_interleave_test.go` assert persisted rows and memory, not broadcast order after a ticket is released.
   - **Now-false docs:**
     - `writeorder.go:29-32` says whole-row setters broadcast "from inside persist". They broadcast after it.
     - `manager.go:132-133` says two setters "can never persist — or broadcast — out of that order".
   - **Dead parameter:** `finishWrite`'s `snapshot` parameter is now `nil` at every caller: `writeorder.go:85`, `liveness.go:98`, `manager_rail.go:106,108`, `apply.go:117` and the one test call, `manager_writeorder_test.go:445`. Its in-turn broadcast branch (:49-51) is dead code. FW-D1 kept the signature "frozen" for that test, but the test passes `nil` too.
   - **Cites:** § Design, "Shared state names its writers and its guard". The turnstile's declared guarantee (`manager.go:127-136`) no longer holds for broadcasts.
   - **A fix must make true:**
     - Every `sessionUpsert` for an id is sent before that id's next write ticket is released, on every tail.
     - No `sessionUpsert` for an id follows its `sessionRemoved`.
     - `finishWrite` carries no parameter that every caller passes as `nil`. The one test call site is [daemon-tests].

2. **[daemon-impl]** Reading the row live at each write's turn moves a-M1's hazard onto the *earlier* writer: a write that later fails now reaches the DB and the wire through an earlier writer's row. a-M1 is therefore not closed.
   - **Where:** `wholeRowPersist` (`writeorder.go:101-115`) and `railPersist` (`manager_rail.go:79-96`) build the row from live memory when their turn comes. Live memory by then already holds the mutations of every writer queued *behind* them, which have not yet persisted.
   - **Interleaving** (the cycle-2 trigger, with the order reversed):
     1. The ingest worker's `Apply(7)` persists as T1.
     2. `SetTitle(7)` (rename, on the worker's context, so it succeeds) mutates the title, draws T2 and waits on T1.
     3. The tab attach's `MarkSeen(7)` sets `Unread=false`, draws T3 and waits on T2. It persists on `r.Context()` (`internal/server/terminal.go:365`).
     4. At T2's turn, SetTitle's persist reads live memory. The row now contains `Unread=false`, which is T3's mutation. It is persisted, and SetTitle broadcasts `Unread=false`.
     5. The tab closes, and T3's `UpdateSession` fails on the cancelled context. `restoreChangedFields` puts `Unread` back to `true` (`writeorder.go:174`).
   - **Result:** the queue has drained. Memory says `Unread=true`, while the DB and every client say `false`. The next write persists memory's view and brings the badge back on every card. That is the cycle-2 symptom exactly, and MarkSeen's caller was told its write failed even though its effect was persisted.
   - **The stated reason does not hold on the code:** the doc at `writeorder.go:63-72` justifies the live read with "A row frozen at mutation time could otherwise bake in a different write's mutation before that write is even known to succeed". The live read does precisely that, for writers queued behind.
   - **Why the tests miss it:** `manager_writeturnstile_interleave_test.go:73-86,192-196` cover "the earlier write fails". Neither covers "the earlier write succeeds and the later one fails".
   - **Cites:** § Design, "Shared state names its writers and its guard". Also `finishWrite`'s own contract (`writeorder.go:28-29`, "memory never claims what the DB doesn't hold").
   - **A fix must make true** (unchanged from cycle 2, now in both directions):
     - Once the queue for an id drains, memory, the last persisted row and the last broadcast agree, whichever write in the chain failed.
     - A failed write never reaches the DB or the wire through any other writer's row, earlier or later.

3. **[daemon-impl]** `railPersist` is a second copy of `wholeRowPersist`'s identity-checked live read, and `wholeRowPersist`'s own doc says it exists so that read "lives in one place".
   - **The two bodies:**
     - `writeorder.go:103-113`: `m.mu.Lock(); cur, ok := m.sessions[id]; if !ok || cur != sess { …; return ErrUnknownSession }; row := sessionToRow(cur); out = cur.Clone(); m.mu.Unlock(); return m.store.UpdateSession(ctx, row)`.
     - `manager_rail.go:81-93` is the same sequence, differing only in that it broadcasts inside the closure.
   - **The contradicted reason:** `wholeRowPersist`'s doc (`writeorder.go:99-100`) says it was "Split out of persistWholeRow so this identity-checked read lives in one place regardless of which restore a caller needs". The rail tail needs a different failure path (the batch abort, :107-109), not a different read.
   - **The divergence is where Major 1 lives:** the one real difference between the copies is broadcast placement, and the copy that got it right is the rail one.
   - **Cites:** § Design, "Reuse before add" ("A second implementation of an existing idea is a defect even when both work").
   - **A fix must make true:** the identity-checked live read, persist and broadcast for one session write exist once. The rail batch differs from the whole-row setters only in the batch-abort path it actually needs.

4. **[daemon-impl] [daemon-tests]** `Store.SetLogger` brings back a post-construction poke, the shape D6 removed from this codebase. Its doc names the wrong caller.
   - **Where:** `store.go:22-35`, called at `cmd/musterd/main.go:235`.
   - **Siblings:** every other component gets its logger at construction. `session.Config.Logger` is one example (`manager.go:75`). So are `newXFeature(…, log zerolog.Logger)` across internal/server (`rg -c 'func new.*log zerolog.Logger\)' internal/server --glob '!*_test.go'` totals 19 constructors) and `newShellRegistry(…, log)`. `rg 'func \(.*\) SetLogger'` finds this one method and nothing else.
   - **D6's direction:** D6 fixed V5 ("post-construction pokes", `findings.md:35`) in two ways. It moved `sessionsFeature`'s reader to a constructor argument "instead of a post-construction write" (`daemon-implementation-D6.md:18`). It also deleted `browseRoot`'s pointer, which "existed only so browse_test.go could mutate … post-construction" (:20).
   - **The reason given is test churn:** FW-D1's `design:` line says there are 21 two-arg `store.Open` test calls. That is the "seam where a test needs one" rule inverted (§ Design, "Small interfaces at the consumer; seams where a test needs one and nowhere else"). Here production's shape was chosen to spare the tests.
   - **The doc is false:** it says "internal/server/server.go calls this once, right after Open, the same way it wires every other package's logger". The caller is `cmd/musterd/main.go`, and no other package is wired this way.
   - **Unnamed guard:** `s.log` is written after `Open` returns and read by `scanSession` from any goroutine. It is safe today only because `main` calls `SetLogger` before `prepareServing` starts anything, and the declaration (§ Design, "Shared state names its writers and its guard") does not say so.
   - **A fix must make true:**
     - The store receives its logger at construction, as its siblings do.
     - No field of `Store` is written after `Open` returns.
     - Updating the test call sites is [daemon-tests].

### Minor

1. **[daemon-impl]** `persistWholeRow` expects `m.mu` held and releases it, but its name no longer says so.
   - **Where:** `writeorder.go:59-61` ("Called with m.mu still held … releases the lock").
   - **The name:** the cycle-2 name was `persistAndFinishLocked`. The package's rule, which a-M4 enforced, is that a function's name says whether it expects `m.mu` held: `nextWriteTurnLocked`, `railEntriesLocked`, `applyRailChangesLocked`.
   - **Why it matters:** each of the 12 callers now does `m.mu.Lock()` with no matching `Unlock()` on its success path (for example `manager_rail.go:159-175` and `title.go`). A newcomer reads that as a leaked lock.
   - **Cites:** § Design, "Match the siblings … naming".
   - **A fix must make true:** the tail's name says it is entered with `m.mu` held, the same way its siblings' names do.

2. **[daemon-impl]** `restoreChangedFields` hand-lists 27 `Session` fields (`writeorder.go:147-181`), a second list that must agree with the struct in `session.go`.
   - Its doc (:137-139) leaves fields out on the claim that they never change after creation. Nothing checks either that claim or the list's completeness, so a new mutable field added to `Session` would silently escape rollback.
   - **Cites:** § Design, "One owner per concept" ("Two places that must agree will not").
   - **A fix must make true:** adding a mutable `Session` field cannot leave it out of the failure restore without a build or test failure.

3. **[daemon-impl]** The fix wave's own comments reintroduce the a-m1 defects: finding tags, history, test names used as reasons, and a grep command in a doc comment. They also name wrong locations.
   - **Finding tag:** `writeorder.go:156`, "(Critical 1's rule, …)".
   - **A test name given as the reason:** `writeorder.go:142-144`, "manager_writeorder_test.go's TestPersistFailure_… asserts full byte-identity". FW-D1's Decisions say this is why the guard fields are restored. The code-level reason, keeping them in step with the state fields, should stand on its own.
   - **History:** `manager.go:83-85` ("forced a whole second, unsafe classification path before the ports became required") and `manager.go:376` ("used to hand-write").
   - **A grep command in a doc:** `reader.go:46-47` ("No production code calls SetPlan today (`rg '\.SetPlan\(' …`)"). This is the same thing a-m1 cited in `repo.go`.
   - **Now false or stale:** `store.go:27` names the wrong caller (Major 4), and `boundedwait.go:3-4` counts "four pollers" that reach it only through `bgloop.go`.
   - **Cites:** § Comments, "don't narrate history".
   - **A fix must make true:** each of these comments states the current reason once, with no finding ID, test name, grep command or past shape.

4. **[daemon-impl]** The takeover's first `closed` refusal drops the socket with no shutdown close, and the comments claim that it does get one.
   - **Where:** `terminal.go:348-352` says "closeAll already closed c with the shutdown code (or is about to, via takeover's own second check)". The declaration (:97-101) also covers only the second check.
   - **Interleaving:**
     1. `closeAll` sets `closed`.
     2. A new `/ws/terminal/7` upgrade is accepted.
     3. `takeover` refuses at :139-142, before `attach` runs, so `c` was never in `conns`, and neither `closeAll` nor the second check closes it.
     4. `attachAndPump` returns silently, and the deferred `c.CloseNow()` (:338) drops it with no close frame.
   - **The close is also now written twice:** once at :160-161 and once at :237-238. `rg -n StatusNormalClosure internal/server --glob '!*_test.go'` finds `ws.go:88`, `terminal.go:160` and `terminal.go:237`.
   - **Cites:** § Design, "Shared state names its writers and its guard" and "Reuse before add".
   - **A fix must make true:** every socket the registry refuses after `closeAll` gets the same shutdown close, that close is written once in the registry, and the comments describe each path truthfully.
   - **For review-work:** `closeAll`'s doc and protocol.md:1169,1229 say "1001", but `StatusNormalClosure` is 1000. This predates the wave.

5. **[daemon-impl]** Permission modes have two owners, used on adjacent lines, and one of them is dead with a false doc.
   - `launcher.go:136` checks through `session.ValidPermissionMode`, a pass-through to claudecode (`session/session.go:52-54`). The line below (:139) builds the text from `claudecode.PermissionModes`.
   - `session.PermissionModes` (`session.go:44-47`) has no user: `rg 'session\.PermissionModes' internal cmd` finds nothing. Yet its doc says "internal/server validates incoming requests against it".
   - `claudecode/launch.go:18-19` names "ValidPermissionMode's error text", which does not exist (the c-m3 residue).
   - **Cites:** § Design, "One owner per concept".
   - **A fix must make true:** the launcher gets both the check and the list from one owner, every exported list has a user, and each doc names only real users.

6. **[daemon-impl]** The `unknown_session` pair is still spelled a second time in the launcher: the code at `launcherrors.go:45` and the message at `launcher.go:372`. This is the b-m4 residue.
   - **Cites:** § Design, "One owner per concept".
   - **A fix must make true:** the code and message pair is spelled only in `respond.go`.

7. **[web-impl]** Moving `basename` created a directory cycle between `sessions/` and `reader/`.
   - `sessions/card.ts:7` imports `basename` from `../reader/paths`, and `reader/freshness.ts:5` imports `ageAgo` from `../sessions/format`.
   - kb:diagram/web-components says "The graph is acyclic" and draws only reader → sessions. `sessions/` is the shared derivation layer below `reader/`.
   - **Cites:** § Design, "Match the siblings".
   - **A fix must make true:** the directory graph is acyclic, and `basename`'s owner is a module both directories may depend on without an upward edge.

8. **[web-impl]** The `main.ts` header, rewritten in this wave, is false.
   - `main.ts:10-16` says "`tiles`, `focus`, `surfaces` and `reader` instead take a small thunk … from a controller constructed *after* them".
   - `surfaces` (`main.ts:58`) and `reader` (:59) take real values, and their own headers say so (`features/surfaces.ts:7-10`, `features/reader.ts:45-47`). A newcomer would go looking for the cycle that e-m4 removed.
   - **Cites:** § Comments.
   - **A fix must make true:** the header names exactly the controllers that take forward-reference thunks.

9. **[web-impl]** Exports with no importer, one of them documented with a consumer that does not exist.
   - `FocusHandle.nameEl` (`features/focus.ts:66-67`, returned at :263) is documented "For `rename.ts`'s mainhead editor attachment". `rename.ts` no longer reads it, and `rg '\.nameEl\b' web/src` finds no reader outside `render/mainhead.ts`'s own `elements.nameEl`.
   - `isNumber` (`protocol/decode.ts:12`) is newly exported and used only inside `decode.ts`.
   - `putPrefs` (`api/prefs.ts:16`) is the d-m7 residue.
   - **Cites:** § Design, "seams where a test needs one and nowhere else".
   - **A fix must make true:** every export has a caller outside its file (or a test that needs it, stated at the export), and no doc names a consumer that does not exist.

10. **[web-impl] [web-tests]** `endDialogBody`/`removeDialogBody` take a `_now: Date` that no body reads (`features/actionscopy.ts:18,29`).
    - The stated reason is circular: they share `dispatch`'s signature, and `actions.ts:147,149` passes `new Date()` only because that signature asks for it. What actually keeps the parameter is `actionscopy.test.ts`.
    - This is the shim reasoning d-m10 rejected.
    - **Cites:** § Design, "One owner per concept" / cycle-2 d-m10.
    - **A fix must make true:** no parameter exists that no body reads. Dropping it from the fixtures is [web-tests].

11. **[web-impl]** The dead-surface text still has two composers, the e-m6 residue.
    - `sessions/card.ts:156` `deadEndbarText` builds the base, and `render/dead.ts:81` appends `` ` · captured ${ageAgo(pane.capturedAt, now)}` ``. `render/dead.ts:85,91` compose the cap body from raw `PaneState`.
    - **Cites:** `render/CLAUDE.md:3` ("a builder here takes the computed value, never the raw data") and conventions § Composition roots bullet 4.
    - **A fix must make true:** each dead-surface string is composed in one module outside `render/`, and the render function only assigns it.

12. **[web-impl]** `setMainSlotHidden(el, hidden)` (`render/focusview.ts:22-24`) is exactly `el.hidden = hidden`. The main slot's `hidden` still has two writers.
    - `renderFocusMain` (:15) is the other writer, and which one wins depends on the order of `features/focus.ts:177,192,221,236`. The helper's own doc concedes the second writer.
    - That meets e-m8's "one writer" by label only, and it is a wrapper that adds no behaviour (the cycle-1 Minor 2 rule).
    - **Cites:** § Design, "One owner per concept".
    - **A fix must make true:** the slot's `hidden` is decided by one `render/` function from the computed slot state.

13. **[web-impl]** The web comment sweep is incomplete, and the wave's new comments narrate history.
    - **Named in cycle 2 and still present:** the d-m11 and e-m11 residues in the tables above.
    - **Added by this wave:**
      - `features/rename.ts:5` ("the same way a tile already did before this module owned the mainhead's too").
      - "never reached through `features/actions.ts`, which carries no dead-surface API", written at `focus.ts:78-80,101-102` and `tiles.ts:74-76,101-104`, and restated at `actions.ts:17-19`.
      - `render/mainhead.ts:59-60` ("Required, not optional — the one production caller always passes it").
      - `render/sessions.ts:21-23` ("unconverted").
      - `views.ts:88` ("main.ts formerly registered this").
    - **A why lost in the move:** the rename cancel subscriptions moved to `focus.ts:114-117` without their reason ("must not let a blur-driven commit through", kb:adr/views-active-segment-click-commits-rename).
    - **Cites:** § Comments, "don't narrate history".
    - **A fix must make true:** no in-scope comment cites a plan section or finding, describes a removed API or a past shape, or names a location that is not true. The mainhead cancels keep their `kb:adr` reason.

### Notes

1. **[note]** `Store.decodeRowTime`/`decodeRowTimePtr` take a `table` parameter that every call passes as `"session"` (`store/session.go:393-406`). `scanSession` now logs a corrupt time and reads it as zero, while its sibling `scanRepo` (`repo.go:121-139`) still fails the row. That split was mandated, and `decodeTime`'s doc (`store.go:94-97`) states it. No change is requested.
2. **[note]** `restoreIfUnchanged` compares values, so it cannot tell "unchanged since post" from "changed back to post's value by a later write". Today every setter short-circuits a no-op before drawing a ticket, so I found no path that hits this. It is worth one line at the helper.
3. **[note]** `cmd/musterd/main.go` `run` grew from 44 to 45 statements with the `SetLogger` line, and no FW log records a reason. Cycle 1's reason still holds, and Major 4's fix would remove the line anyway.
4. **[note]** `usage.DefaultSource = defaultSource` (`aggregator.go:20`, `modelscoped.go:22`) gives one literal two names, only because `aggregator_test.go:70` uses the unexported one. The literal still has one owner. Retiring the unexported name is [daemon-tests]'s job.
5. **[note]** The doc for `New` (`server.go:137-142`) says "13 features", but `rg -n 'register\(s,' internal/server/server.go` finds 14 calls in `New` (:207-231). It also says the overrides are resolved "nowhere else", yet `updatemanager.go:107` keeps a test-only fallback. Counts and absolutes in godoc drift. The funlen reason belongs in Decisions, where FW-D3 also records it.
6. **[note]** `exactTarget` (`tmux.go:73-111`) covers all 11 `-t` sites in the package, and `rg '"="' internal` finds no second copy. Its 35-line doc embeds a tmux 3.7b probe transcript, though. § Comments wants measured behaviour kept as a `kb:fact` and cited, and the transcript is most of `tmux.go`'s growth to 757 lines.
7. **[note]** `release.go:90-93` names "internal/server's RequestApply" as the site that rebuilds the release tag, but the rebuild is in `runApply` (`updatemanager.go:403`). `credentials.go:30-32`'s Keychain-only reason for discarding stderr now also covers `InstalledVersion`.
8. **[note]** In the web code:
   - `renderRailDensityControl` (`render/sessions.ts:394-404`) has the same body shape as `render/masthead.ts:104-126`. FW-W's `design:` reason (a variable-length, dataset-keyed rail control) holds, but the `render/sessions.ts:1-2` header no longer covers everything the module holds.
   - `features/theme.ts:16-21` keeps its previous state in named closure variables (`appliedTheme`/`appliedFamily`), states the reason, and runs single-threaded, so it needs no guard.
   - `main.ts` is registration-only now.
9. **[note]** For review-work's DIAG row, kb:diagram/web-components is now wrong in three places:
   - `wsapp` is described as "then layer their own handlers on top", but `main.ts` no longer layers.
   - The new `wsapp → features` edge (a type-only import, `wsapp.ts:10`) is not drawn.
   - The `sessions → reader` edge (Minor 7) is not drawn.

    On the daemon side, no new package or import edge was added.

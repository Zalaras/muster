# Maintainability review: maintainability-cleanup — internal/server

**Plan**: maintainability-cleanup
**Verdict**: needs-changes
**Cycle**: 1 (standalone cleanup read, no diff)
**Pack**: `kb: pack 17969 words (budget 8000)` — WARN over budget; sections rules 1874 · features 5685 · diagrams 3904 · decisions 5976 · proposed 0 · facts 168 · lessons 354 · runbooks 2 (`--features connection,surfaces`)
**Scope**: `internal/server`, all 22 non-test `.go` files, with every sibling in the package open. For comparison I also opened `internal/session/manager.go`, `internal/session/session.go`, `internal/gitutil/gitutil.go`, `internal/claudecode/launch.go`, `internal/claudecode/ingest.go`, `cmd/musterd/main.go:629`, `internal/triage/artifact.go:30` and `web/src/features/{views,rail,settings}.ts`.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| server.go | all package files | n/a (cleanup) | funlen `New` 48 stmts; reason contradicted (V5) | Major 9, Minor 1 |
| auth.go | ws.go, state.go, locate.go | n/a | — | Major 8 (envelope lives here), Minor 1 |
| state.go | usagewire.go, update.go, prefs.go, themepoll.go | n/a | — | Minor 6 |
| ws.go | terminal.go, state.go | n/a | — | Minor 1, Minor 6, Minor 10 |
| usage.go / usagepoll.go / usagewire.go (exemplar) | themepoll.go, shellactivity.go, update.go, manager.go | n/a | — | Major 4, Minor 13 |
| themepoll.go | usagepoll.go, shellactivity.go | n/a | — | Major 4, Note 2 |
| shellactivity.go | usagepoll.go, themepoll.go | n/a | — | Major 4 |
| ingest.go | usagepoll.go, reader.go, server.go | n/a | — | Major 4 (Stop tail), Major 9, Minor 5, Minor 7 |
| prefs.go | update.go, issue.go, state.go | n/a | — | **Critical 1**, Minor 1, Minor 5 |
| sessions.go | shells.go, terminal.go, locate.go, reader.go | n/a | file 814, no reason holds; funlen `Launch` 83 and `Resume` 41, reasons hold | Major 6, Major 8, Minor 1, Minor 2 |
| shells.go | terminal.go, sessions.go, manager.go | n/a | funlen `handleShellTerminal` 45, no reason holds | Major 3, Major 5, Minor 9 |
| terminal.go | shells.go, ws.go, manager.go | n/a | file 515 (resolves with Major 5) | Major 2, Major 5 |
| reader.go / readerwire.go | locate.go, gitutil.go, manager.go | n/a | — | Major 1, Major 7, Major 8, Minor 12, Minor 14 |
| locate.go | browse.go, repos.go, auth.go | n/a | funlen `handleLocateFile` 42, reason holds | Major 8, Minor 1 |
| browse.go | locate.go, repos.go | n/a | — | Minor 1, Minor 5, Minor 14 |
| repos.go | browse.go | n/a | — | Major 8 |
| issue.go | update.go, usage.go, prefs.go, ws.go | n/a | file 694; funlen `buildIssueSnapshot` 45 (holds), `handleCreateIssue` 44 (contradicted) | Minor 4, Minor 5 |
| update.go | usage.go, usagepoll.go, prefs.go | n/a | file 738, no reason holds | Major 4, Minor 3, Minor 8, Minor 11, Minor 14 |
| sessionwire.go | usagewire.go, issue.go | n/a | — | Minor 13 |

## Seed check

Each seed from `findings.md` is confirmed or refuted, with its evidence.

- **V1** confirmed. The package has 17 `json.NewEncoder(w)` sites, and 16 of them are hand-written success paths (`state.go:136-138`, `repos.go:72-74`, `reader.go:281-283`, `locate.go:106-108`, `browse.go:96-98`, `shells.go:232-234`, `sessions.go:564-566/610-612/661-663/683-685`, `issue.go:580-582/691-693`, `update.go:649-651/735-737`, `auth.go:74-76`). `locate.go:151-166` declares the error envelope a second time, next to `auth.go:38-52`. Filed as Major 8.
- **V2** confirmed, and it goes further than the seed. `locateFeature`, `prefsFeature` and `browseFeature` have no logger field, so their 500s cannot be logged (`locate.go:88,101`; `prefs.go:302,306`; `browse.go:53`). Filed as Minor 1.
- **V3** confirmed. `reader.go:41-47` duplicates `gitutil.runGit` (`gitutil.go:49-60`). Filed as Major 7.
- **V4** confirmed. From the upgrade to the teardown, `terminal.go:266-324` and `shells.go:263-315` are the same body. Filed as Major 5.
- **V5** confirmed. Filed as Major 9.
- **V6** confirmed. `update.go` defaults the client twice (`:153`, `:551`) and builds the remedy twice (`:500-509`, `:606-620`). Filed as Minors 3 and 4.
- **V7** confirmed. The two spawn blocks are `sessions.go:315-317` and `:407-409`; the two kill-after-record-failure blocks are `:342-348` and `:433-439`. Filed as Minor 2.
- **V8** confirmed as a real contradiction. `internal/server/CLAUDE.md` says a handler is "never on `*Server`", yet four handlers are on it (`auth.go:73,83`, `state.go:135`, `ws.go:115`), and `server.go:3` says the root "owns the core routes". Filed as Minor 1.
- **V9** confirmed, no change. The `not_found` code is the terminal contract's, and `terminal.go:251-255` uses the same parse. If Major 5 lands, that parse exists once.
- **S2** (session scope, but it cites `reader.go:176-198`) confirmed with a concrete interleaving. Filed as Major 1.
- **G1** agreed, no change. The only in-scope site is `reader.go:42-45`, and Major 7 removes it.
- **G2** agreed for the cross-package sites. Inside this package I disagree: `usage.go:71`, `issue.go:513`, `update.go:551` and `update.go:153` all default the same `cfg.HTTPClient`, so one default is enough. That is part of Minor 3.
- **G3 (background-loop Stop ×6): fix.** In this package, `usagepoll.go:50-76`, `themepoll.go:112-138`, `shellactivity.go:96-122` and `update.go:180-215` have the same Start (`WithCancel` → `cancel` field → `wg.Add` → `go loop`) and the same Stop (`cancel` → `wg.Wait` in a goroutine → select on ctx → Warn). The only differences are the warn string and the extra lines at the top of update's Start/Stop. `ingest.go:121-133` and `session/manager.go:197-217` repeat the wait-with-deadline tail. The loop bodies also repeat: tick, then a ticker, with an optional refresh channel (`usagepoll.go:91-105`, `themepoll.go:148-160`, `shellactivity.go:137-149`, `update.go:216-231`). The doc comments say plainly that they were copied (`usagepoll.go:22`, `themepoll.go:86`, `shellactivity.go:64`, `update.go:193`). Filed as Major 4.
- **G4 (random hex IDs ×3): no change.** They are three 5-line functions in three packages (`cmd/musterd/main.go:629`, `issue.go:470`, `triage/artifact.go:30`). Each has a different length (32, 16 and 12 bytes) and a different error text. `internal/triage` is a tools package, and a shared helper would couple it to the daemon for five lines. There is one note below about the error branches.
- **T1** confirmed, `[daemon-tests]`. `size.log` names three duplicated bodies: `prefs_test.go:439/555/738`, `shellscroll_test.go:201/247` and `terminal_test.go:298/326`. They should become table rows (conventions § Design, "Tests: duplicated bodies become table rows"). Fix D9 owns them.
- **Plan-ID comments:** 219 non-test comment lines and 422 test comment lines in `internal/server` cite REQ, INV, Edge Case, D-numbers, review cycles or plan names. The X1 sweep owns them.

## Issues

### Critical

1. **[daemon-impl]** `PUT /api/prefs` is an unguarded read-modify-write of one kv blob, so two in-flight PUTs lose an update. The code is `prefs.go:287-310`: `loadPrefs` → apply the changed fields → `KVSet`. Nothing serialises it. `rg -n 'KVGet|KVSet' internal/server` shows only `prefs.go:116` and `:305`, and `store.go:105-110` offers no compare-and-set. The web client sends one field per PUT, fire-and-forget, with no queue (`web/src/features/views.ts:36,43`, `rail.ts:35,42`, `settings.ts:146,152,161`, `usage.ts:43`).
   - **Interleaving:** request A (`{view:"tiles"}`) and request B (`{density:"3x2"}`, sent within one round-trip, for example the view switch and then the density toggle in Tiles) both load `{view:focus, density:2x2}`. A writes `{view:tiles, density:2x2}`. B writes `{view:focus, density:3x2}`. A's view is lost, and so is the `prefs` broadcast that carried it. For `updateCheck`, B's `updateCheckChanged` compares against a stale read, so `SetCheckEnabled` can fire for a transition that did not happen, or miss one that did.
   - **Why the race detector cannot see it:** the state lives in SQLite, not in Go memory.
   - **Cites** conventions § Design, "Shared state names its writers and its guard".
   - **A fix must make true:** from load to persist to broadcast, one PUT's merge is atomic against every other PUT. The guard is named where `prefsFeature` is declared. A test with two concurrent single-field PUTs ends with both fields applied.

### Major

1. **[daemon-impl]** `observeWrite` reads the session, then later writes `SetPlan(sess.PlanPath, true)` with the path it read. Those are two separate lock scopes (`reader.go:177`, `:189-195`), so the write can move the plan back to a path it has already left.
   - **Interleaving:** the ingest worker runs `observeWrite(P)` and `Get` returns `PlanPath=P, PlanExists=false`. Meanwhile `GET /api/sessions/{id}/reader` (`reader.go:262-263`, on an HTTP goroutine) runs `scanPlan`, and `ApplyPlanScan` commits `P2`. The worker then calls `SetPlan(P, true)`. At `manager.go:1008`, `P2 != P` and the ClaudeSessionID still matches, so it writes `PlanPath=P` back.
   - `ApplyPlanScan` has a doc comment (`manager.go:1026-1038`) that exists to rule out this class of bug for scans. The exists-flip path does not get the same guarantee.
   - **Cites** conventions § Design, "Shared state names its writers and its guard".
   - **A fix must make true:** the exists-flip commits only if the plan path is still the one `observeWrite` qualified, checked in the same `Manager.mu` critical section as the write. That is seed fix D1.

2. **[daemon-impl]** `terminalRegistry.mu` is held across closing the old socket and attaching the new one (`terminal.go:120-136`, deliberately, for REQ-2). But `Manager.Apply` takes that same lock through `Watched` while it holds `Manager.mu` (`manager.go:832` → `terminal.go:141-147`). The lock order `Manager.mu → terminalRegistry.mu` is not named at either declaration (`terminal.go:101-104`, `manager.go`).
   - **Interleaving:** a second tab opens `/ws/terminal/7` while the first tab's peer is unresponsive (a sleeping laptop with TCP still up). `takeover` holds `r.mu` inside `old.ws.Close(closeSuperseded)`, which waits out coder/websocket's close handshake. The ingest worker's `Apply` for any session reaches `Watched` under `m.mu` and blocks. Every `manager.Get`/`List` then blocks too: `/api/state`, the `/ws` snapshot, every session handler. It lasts as long as the handshake timeout.
   - **Cites** conventions § Design, "Shared state names its writers and its guard".
   - **A fix must make true:** `Watched` never waits on a takeover's close or attach, and the lock order is written where both mutexes are declared.

3. **[daemon-impl]** `shellRegistry.lockID` (`shells.go:60-74`) is a line-for-line copy of `Manager.LockSession` (`manager.go:130-144`). `rg -n 'idLocks' internal` finds only these two. The copy also adds a behaviour the original does not have: `Kill` deletes the lock entry (`shells.go:169-172`). The comment justifying that ("nothing can contend on it again", `:156-157`) is contradicted by `handleCreateShell`, which checks `manager.Get` (`shells.go:215`) before `Ensure` with no lock between them.
   - **Interleaving:** a shell POST passes `Get(7)`. `DELETE /api/sessions/7` removes the row and runs `shells.Kill(7)`, which locks, kills nothing, unlocks and deletes the map entry. The POST's `Ensure(7)` then builds a new lock, finds no pane and spawns `muster-7-shell` for a removed session. `activeIDs` is re-marked, so `HasAny` stays true and the shell-activity poller execs tmux every second until the daemon restarts.
   - **Cites** § Design, "Reuse before add" and "Shared state names its writers and its guard".
   - **A fix must make true:** one keyed-lock implementation serves both callers. A shell cannot be spawned for a session id after its Remove has succeeded.

4. **[daemon-impl]** The background-loop lifecycle is implemented four times in this package, and the wait tail six times across the tree (G3 above, where the `rg -n 'wg.Wait\(\)'` output is quoted: `manager.go:209`, `themepoll.go:130`, `update.go:207`, `usagepoll.go:68`, `ingest.go:125`, `shellactivity.go:114`). Each copy carries its own `cancel`/`wg` fields and its own "did not stop before shutdown deadline" string.
   - **Cites** § Design, "Reuse before add". The copies call themselves copies (`usagepoll.go:22`, `themepoll.go:86`, `shellactivity.go:64`).
   - **A fix must make true:** start, cancel, bounded-wait-with-warn and the tick/ticker/refresh loop each exist once. The four pollers keep only their `tick`. Update keeps its extra pre-Stop step (`shuttingDown`) and its dev-install skip. Manager and ingest reuse the bounded wait. That last part crosses into `internal/session`, so coordinate with that scope.

5. **[daemon-impl]** `handleTerminal` (`terminal.go:250-325`) and `handleShellTerminal` (`shells.go:241-316`) share their whole body after validation: Accept, takeover with an attach closure, the two defers, MarkSeen, the ptyDone goroutine and the teardown order. `shells.go:312` even says "Same teardown ordering as handleTerminal — see its comment". The resize case is written twice as well (`terminal.go:420-424` and `:496-500`).
   - The layout splits the shell surface in two: its handler is in `shells.go`, but its socket pump and frame types (`pumpShellSocketToPTY`, `applyShellTextFrame`, `shellTextFrame`, `clampScrollLines`) are in `terminal.go:427-515`.
   - **Size reason:** the `funlen` hit on `handleShellTerminal` (45) has no reason that holds, because the length is the copy.
   - **Cites** § Design, "Reuse before add".
   - **A fix must make true:** the attach-and-pump lifecycle exists once, parameterised by surface (target, nudge, socket-to-PTY pump). Each surface's frame handling sits next to that surface's handler.

6. **[daemon-impl]** The permission-mode enum has three owners.
   - `sessions.go:170` validates `case "default", "plan", "acceptEdits", "auto":` as string literals.
   - `internal/session/session.go:24-32` declares `PermissionDefault` … `PermissionAuto` as typed constants.
   - `internal/claudecode/launch.go:34` switches on the same four literals again.
   - `rg -n '"acceptEdits"' --type go -g '!*_test.go'` finds exactly these three.
   - Adding a mode means editing three files, and nothing fails if one is missed: `BuildArgv` silently drops an unknown mode's flag.
   - **Cites** § Design, "One owner per concept".
   - **A fix must make true:** `internal/server` validates against the `session` package's set and does not re-spell it. Whether `claudecode` also asks that owner is for the adapters scope.

7. **[daemon-impl]** `readerRunGit` (`reader.go:41-47`) is a second git runner beside `gitutil.runGit` (`gitutil.go:49-60`), with the same `exec.CommandContext` + `WaitDelay = 2s` + `Output()`. The only difference is `-C dir` instead of `cmd.Dir`. `rg -n 'exec.CommandContext\(ctx, "git"'` finds exactly these two.
   - `gitutil`'s package doc says it answers "the small set of questions [the daemon] needs about a launch directory", and the markdown listing is one more of those questions.
   - **Cites** § Design, "Reuse before add".
   - **A fix must make true:** the daemon has one place that runs git, and the reader's `runGit` test seam stays available.

8. **[daemon-impl]** There is no JSON response helper beside `writeJSONError`, so all 16 success paths copy set-header, WriteHeader, Encode (the list is at V1 above). `writeLocateAmbiguous` (`locate.go:151-166`) re-declares the envelope struct to add `paths`.
   - The shared envelope helper lives in `auth.go:38-52`, the cookie-auth file. Nine feature files call a transport helper from there.
   - The same few lines also repeat in two other patterns:
     - Parse the id, `manager.Get`, then 404 `unknown_session`. This appears at `locate.go:49-57`, `reader.go:246-254` and `:304-312`, and `shells.go:211-219`.
     - Stat the session directory, then 409 `directory_missing`, with two different messages: `"%s no longer exists"` at `reader.go:256-259` and `shells.go:220-222`, and `"session directory no longer exists"` at `sessions.go:389-390`.
   - **Cites** § Design, "Reuse before add" and "One owner per concept" (the envelope).
   - **A fix must make true:** the envelope is declared once, with an optional extra field. Success encoding, id-to-session-or-404 and directory-missing each exist once, next to the envelope, in a file named for transport rather than auth.

9. **[daemon-impl]** `server.New` (`server.go:121-229`) goes beyond "build dependencies and register each feature in one line" (kb:adr/process-composition-roots-registration-only, conventions § Composition roots).
   - It writes five fields into other features after construction: `s.sessions.reader` (`:198`), `s.ingest.queue.manager/files/usage` (`:218-221`, reaching two levels into ingest's internals) and `s.prefs.updateChecker` (`:225`).
   - It holds mapping logic: the `OnUpsert`/`OnRemoved` closures build wire envelopes (`:171-176`).
   - It holds defaults: queue size, `claudeBin`, scroller.
   - It does store I/O: `loadPrefs(context.Background(), cfg.Store)` at `:224`.
   - The pokes are forced by one ordering: registration order is also Start/Stop order (REQ-11, `:213-216`), and features are constructed in that order.
   - **Size reason:** the `funlen` reason implied by "composition root" is contradicted, because the length is wiring that belongs in the features.
   - **Why Major, not Critical:** nothing here decides runtime behaviour, and the ADR allows the root to build dependencies. What it breaks is "each server feature a small type with explicit dependencies".
   - **A fix must make true:** every feature receives all its collaborators through its constructor, and no line in `New` writes a field of another feature. Wire mapping lives in a `*wire.go` file. Start order is stated as a property of registration, not of construction.

### Minor

1. **[daemon-impl]** The error path and logging diverge between feature siblings.
   - `sessionsFeature` and `reposFeature` log every 500 before answering (`sessions.go:603`, `repos.go:47`). `locateFeature`, `prefsFeature` and `browseFeature` have no logger at all (`locate.go:29-32`, `prefs.go:172-176`, `browse.go:32-34`), so their 500s are silent (`locate.go:88,101`, `prefs.go:302,306`, `browse.go:53`).
   - 5xx message text follows the fixed-phrase discipline in `sessions.go:78-84` (`msgInternalError`, used by `handleSetTitle`, `handleShellTerminal`). Siblings answer with ad-hoc phrases instead: `"pinning session"` (`sessions.go`), `"setting rail order"`, `"encoding prefs"`, `"locating file"`, `"could not list repos"`, `"starting update apply failed"`.
   - `newIngestFeature(st, log, size, token)` is the only constructor with the logger anywhere but last.
   - Separately, the core handlers sit on `*Server` (`auth.go:73,83`, `state.go:135`, `ws.go:115`), against `internal/server/CLAUDE.md`'s invariant "never on `*Server`" (V8). The kb feature list already names a `connection` feature for exactly those routes.
   - **Cites** § Design, "Match the siblings".
   - **A fix must make true:** every feature that can answer 5xx has a logger and logs the cause. 5xx text uses the fixed phrases. The core routes and the package invariant agree, whether by moving the core handlers into a feature type or by stating the core exception in the invariant.

2. **[daemon-impl]** Beyond the V7 spawn and kill copies (seed check), `sessions.go` holds three concerns in one 814-line file: the launch/resume service (`:127-521`: validation, env, retry, atomic settings write), the launch error vocabulary (`:64-125`), and the sessions HTTP feature (`:523-814`).
   - **Size reason:** the file-length warning has no reason that holds, because the file is three files.
   - **Cites** § Design, "Match the siblings". The exemplar splits feature, wire and worker into separate files (`usage.go` / `usagewire.go` / `usagepoll.go`).
   - **A fix must make true:** spawn-under-timeout and kill-after-record-failure each exist once. The launcher and the HTTP feature are separable files.

3. **[daemon-impl]** `update.go` duplicates within itself:
   - `http.DefaultClient` is defaulted at both `:551` and `:153`.
   - `remedy *string` is built at both `:500-509` and `:606-620`.
   - `updateFeature.install` duplicates `updateManager.install`.
   - Across the package, `usage.go:69-72`, `issue.go:511-514` and `update.go:549-552` all default the same `cfg.HTTPClient`.
   - **Cites** § Design, "One owner per concept".
   - **A fix must make true:** the disabled `update` object and the enabled one come from one builder. The nil-client default happens once per daemon.

4. **[daemon-impl]** `issue.go` mixes four concerns and diverges from its own stated shape.
   - The four concerns: snapshot assembly (`:142-223`), markdown rendering (`:230-356`), the capture store (`:376-474`) and the handlers.
   - `IssueConfig`'s comment says it "mirrors UsageConfig.APIURL's shape". Usage builds nothing when disabled (`usage.go:67-85`). `issueFeature` builds the token reader and `ghissue.Client` regardless (`issue.go:510-525`), then re-checks `apiURL == ""` in each handler (`:547`, `:608`).
   - The evict-oldest-by-time loop is written twice: `captureStore.put` (`issue.go:414-429`) and `writeLog.record` (`reader.go:71-82`).
   - **Size reason:** `handleCreateIssue`'s `funlen` (44) reason is contradicted. It runs the capture lifecycle (reserve, release, consume) inside the handler, which conventions § Go ("handlers decode, delegate, encode") puts outside handlers. `buildIssueSnapshot`'s 45 statements have a reason that holds: they are a flat allowlist copy, and the allowlist rule is "Assemble by copy".
   - **A fix must make true:** issue's disabled state has the nil-component shape its siblings use. Reserve, post, consume sits behind one call the handler delegates to. The eviction loop exists once.

5. **[daemon-impl] [daemon-tests]** Production code carries surface that only tests use.
   - `deadcode ./cmd/...` reports `Server.buildIssueSnapshot` (`issue.go:541`) and `Server.loadPrefs` (`prefs.go:192`) as unreachable.
   - `Server.browseRoot` exists, and is passed as a `*string` into `browseFeature` (`server.go:206`, `browse.go:28-37`), only so `browse_test.go:144` can mutate it after `New`. A newcomer reads a pointer to a string as live shared state.
   - `ingestQueue.Drain` (`ingest.go:94-113`) is documented "Test-only".
   - Of the 14 per-feature `Server` fields, `shell`, `theme`, `shellActivity`, `locate`, `browse` and `repos` are assigned and never read in production code.
   - **Cites** § Design, "seams where a test needs one and nowhere else". Each of these is a seam no test needs: the test could set `Config.Launch.BrowseRoot`, or call the feature directly.
   - **A fix must make true:** no production method or field exists only for a test. Tests construct through `Config`, or reach the feature under test directly.

6. **[daemon-impl]** Wire types have split homes.
   - `state.go:29-88` declares the wire structs for usage (`UsageBucket`, `UsageModelWindow`, `UsageInfo`), prefs (`PrefsInfo`) and theme (`ClaudeThemeInfo`).
   - `update.go:56-83` keeps `UpdateInfo` with its feature. The exemplar's mapping file `usagewire.go` does not hold the type it builds.
   - `buildSnapshot` (`state.go:95-110`) re-spells the usage package's defaults as literals (`"subscription"`, `"subscription-api"`; the owners are `usage/aggregator.go:15` and `usage/modelscoped.go:17`), even though every feature's `contribute` overwrites them.
   - `ClaudeCodeInfo` (a `Config` type) is declared in `ws.go:16`.
   - **Cites** § Design, "One owner per concept".
   - **A fix must make true:** each feature's wire type and its empty/default answer live with that feature. `buildSnapshot` owns only the core fields.

7. **[daemon-impl]** `ingest.go:174` branches on `ev.Type == "status_line"`, a string that `internal/claudecode/ingest.go:83` mints from `kind == KindStatus`. `rg -n '"status_line"'` shows the literal's only other homes are in `internal/claudecode`. The typed value, `job.kind`, is already in hand.
   - **Cites** the CLAUDE.md hard rule that Claude-Code-format knowledge stays in `internal/claudecode`. This is a small leak of the event vocabulary.
   - **A fix must make true:** `internal/server` does not compare against a `claudecode`-minted event-type string.

8. **[daemon-impl]** `handleRestartImpact` (`update.go:715-737`) re-implements "which shells are on the socket" through its own `tmuxSessionLister` seam, `Server.tmuxLister` (`server.go:98,148`, `update.go:46-51`). `session.Manager.shellNamesOnSocket` (`manager.go:1250-1265`) already answers that question for `ShellCount` and `KillAllShells`, which is the on-exit prompt's count of the same shells.
   - **Cites** § Design, "One owner per concept". The restart dialog and the exit prompt count shells in two places that must agree.
   - **A fix must make true:** one owner lists shell sessions, and restart-impact asks it. If the seam loses its last caller, it goes.

9. **[daemon-impl]** `handleShellTerminal` calls `f.registry.tmux.PaneExists(r.Context(), …)` directly (`shells.go:252`). That reaches through `shellRegistry` to its tmux field and skips the `shellTmuxTimeout` bound that every registry call applies (`shells.go:101-103`, `:112-114`).
   - **Cites** § Design, "Match the siblings".
   - **A fix must make true:** shell-pane checks go through the registry and are time-bounded like its other tmux calls.

10. **[daemon-impl]** `wsHub.closeAll` (`ws.go:90-96`) holds `h.mu` while it calls `c.Close` on each client. Each call waits for the close handshake, and during that wait `broadcast` blocks: that includes the ingest worker and the manager's `OnUpsert`. The sibling `terminalRegistry.closeAll` (`terminal.go:193-203`) copies the map out under the lock and closes outside it.
   - **Interleaving:** `Shutdown` → `hub.closeAll` holds `h.mu` on an unresponsive peer. The ingest worker (not stopped until later in `Shutdown`) processes a job, and `OnUpsert` → `broadcast` blocks. Ingest drain time is then consumed by the handshake.
   - **A fix must make true:** no socket is closed while holding the hub lock.

11. **[daemon-impl]** `RequestApply` starts `go m.runApply(...)` (`update.go:424`) outside `m.wg`. Its ctx is `WithoutCancel` (`update.go:689`). `Stop` (`update.go:197-215`) therefore neither cancels nor waits for an apply that is still downloading, and `runApply` never reads `shuttingDown`.
   - **Interleaving:** apply is downloading, then SIGTERM → `Shutdown` → `um.Stop` returns once the tick loop exits → the process exits in the middle of `selfupdate.Apply`, leaving its temp file behind.
   - **Cites** § Design, "Shared state names its writers": the apply goroutine is a writer that Stop does not know about.
   - **A fix must make true:** Stop either waits, bounded, for an in-flight apply, or the apply goroutine is named as deliberately outliving Stop, with the consequence stated.

12. **[daemon-impl]** `reader.go:438-444` is an `if` block whose body is `_ = walkErr`, preceded by a comment explaining why it does nothing.
   - **Cites** conventions § Comments ("don't narrate").
   - **A fix must make true:** the dead branch is gone, and whatever the comment says worth keeping sits on the return.

13. **[daemon-impl]** The protocol's timestamp rule (`UTC().Format(time.RFC3339)`) is spelled out 19 times across 7 files: `issue.go` ×6, `usagewire.go` ×5, `sessionwire.go` ×4, and one each in `repos.go`, `reader.go`, `update.go` and `sessions.go`. The optional-pointer form (`if x != nil { v := …; out.F = &v }`) is spelled out 5 times (`issue.go:184,215`, `usagewire.go:38,58`, `sessionwire.go:128`).
   - **Cites** § Design, "One owner per concept": the wire time format is a single protocol rule.
   - **A fix must make true:** the wire time format has one home.

14. **[daemon-impl]** Two handlers do domain work in the handler body, where the sibling `locate.go:42-47` explicitly delegates to its own package.
   - `handleBrowse` (`browse.go:48-99`) does the directory walk, dot-filter, per-entry git probe, sort and parent computation.
   - `handleRestartImpact` (`update.go:715-737`) does the tmux enumeration and filtering.
   - The reader's whole domain also lives in `internal/server`: `writeLog`, `readerPathQualifies`, `confine`, `listMarkdown`/`walkMarkdown` (`reader.go:49-448`). Its siblings `locate`, `usage` and `session` each keep their domain in their own package.
   - **Cites** conventions § Go, "handlers decode, delegate, encode", and § Design, "Match the siblings".
   - **A fix must make true:** each of these handlers delegates to one call that returns the wire-ready result, and the reader's scope and confinement rules are testable without an HTTP server.

### Notes

1. **[note]** Size warnings whose reasons hold on the merits:
   - `handleLocateFile` (42 statements): decode plus one error-mapping switch.
   - `buildIssueSnapshot` (45): a flat allowlist copy.
   - `Launch` (83 lines): one linear pipeline with a comment per step.
   - `Resume` (41).
   - `terminal.go` at 515 lines drops under the threshold once Major 5 moves the shell-frame code.
   - Test-file `funlen` hits are not in the diff, so no finding is filed for them.
2. **[note]** File naming for the theme feature diverges from the exemplar. It lives in `themepoll.go` alone, holding feature and poller, while usage is split `usage.go`/`usagepoll.go`. `shellactivity.go` also holds both. `theme` and `shellActivity` mount nothing but still carry an empty `mount` (`themepoll.go:42`, `shellactivity.go:53`), because `feature` requires it.
3. **[note]** G4: on go 1.27.1 (`go.mod`), `crypto/rand.Read` never returns an error, so all three error branches are dead. `rand.Text()` exists. No change requested.
4. **[note]** Seams are mixed: function types (`attachFunc`, `themeReader`, `paneActivityLister`, `readerExecFunc`, `updateExecFunc`) sit beside interfaces (`paneSpawner`, `shellScroller`, `readerManager`). Both fit § Testing's run-func model. The three tmux overrides in `Config` (`TmuxClient`, `ShellScroll`, and the always-real `tmuxLister`) take a newcomer three rules to learn (`server.go:39-47,148`). Minor 8 removes one of them.
5. **[note]** Belongs to `review-work` (comment truth):
   - `usagepoll.go:22-23` cites `manager.go:126-151`/`:715-726`; those lines now hold `LockSession`/`NewManager`.
   - `reader.go:35-39` says "runGit is" for `readerRunGit`, and cites a `usage.go` "execFunc" pattern that does not exist.
   - `update.go:193-196` says an in-flight apply "observes errShuttingDown", which is not true (see Minor 11).
   - `prefs.go:165` cites `daemon-implementation.md`.
6. **[note]** Belongs to `review-work`: `handleIngest` reads the body with an unbounded `io.ReadAll(r.Body)` (`ingest.go:305`), unlike `locate.go:59`'s `MaxBytesReader`.
7. **[note]** Every one of these findings stays inside `internal/server` and its existing edges, so the component diagram (`kb:diagram/daemon-components`) is unaffected. Majors 3, 4 and 6 and Minor 8 may add a shared helper or move an owner into `internal/session`/`internal/gitutil`. If a new package appears, the diagram's owner is `review-work`'s DIAG row.

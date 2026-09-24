# Daemon Implementation: Maintainability Cleanup — FW-D3 (server/reader/evict/boundedwait fix wave, cycle 2)

**Plan**: maintainability-cleanup
**Mode**: fix (review cycle 2)
**Pack**: `go run ./tools/kb pack --plan maintainability-cleanup --role daemon-impl` — pack is over budget for this plan shape (Units, no REQ block); worked from the team lead's brief plus `review.maintainability.b-server.cycle2.md` and the server-scoped rows of `review.work.md`, both read in full.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/updatemanager.go` | modified | Major 1: `RequestApply` now calls `m.applyWG.Add(1)` before `m.mu.Unlock()`, in the same critical section that checked `shuttingDown` — closes the window where `Stop`'s `Wait` could observe a zero counter concurrently with a still-pending `Add`. Comment fixes: `probeVersionFunc`'s stale "reader.go's gitFilesFunc" reference (field no longer exists under that name), `updateManagerConfig`'s "a nil *updateManager on Server" (the field is `updateFeature.um`), `Stop`'s doc corrected — only a *new* `RequestApply` racing shutdown observes `errShuttingDown`; an apply already in flight is canceled, not shutting-down-flagged — and its history-narrating "before this, RequestApply's goroutine ran under context.WithoutCancel..." rephrased to state the current risk, not the past shape. Added a one-line doc note on `newUpdateManager`'s `http.DefaultClient` fallback (kept for `update_test.go`'s direct construction). |
| `internal/server/issue.go` | modified | Minor 2: `handleCreateCapture`'s `CapturedAt` now uses `wireTime(now)` instead of a second `now.Format(time.RFC3339)`. Minor 4: `handleCreateCapture`'s hand-written Get-or-404 for `req.SessionID` now calls `sessionOr404`. |
| `internal/server/issuecapture.go` | modified | Minor 9: `captureStore`'s doc no longer cites "Schema Changes" (a plan section name) — cites `kb:adr/issue-capture-then-file-server-held` instead, already this file's own vocabulary. |
| `internal/server/reader.go` | modified | Minor 2: `observeWrite`'s `docChanged` broadcast now uses `wireTime(now)`. Minor 9: two "(Protocol Contract)" citations replaced with the real anchor, `kb:anchor/ws.doc-changed`. |
| `internal/server/respond.go` | modified | Minor 4: added `msgUnknownSession`/`writeUnknownSession` (the one code+message pair) and moved `parseSessionID` here from `sessions.go`, beside `sessionOr404` — both now call `writeUnknownSession`. `sessionOr404`'s doc updated to name `issue` among its callers. Minor 9: `writeDirectoryMissing`'s stale "sessions.go's Resume path" reference fixed to `launcher.go`'s. |
| `internal/server/sessions.go` | modified | Minor 4: `parseSessionID` moved out (respond.go); its 5 remaining hand-spelled `writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")` call sites now call `writeUnknownSession(w)`. Dropped the now-unused `strconv` import. |
| `internal/server/shells.go` | modified | Minor 6: `shellRegistry.locks`' field doc rewritten to name its own, single guarantee (same-id Ensure/Kill mutual exclusion, verified directly by this package's tests) as distinct from `session.Manager.LockSession`'s guarantee (holding off a concurrent Remove) — no longer two owners of one claimed rule. `handleCreateShell`'s doc trimmed of its history-narrating last sentence (Minor 9). Minor 7: `newShellFeature` no longer takes a `realScroll` fallback parameter — it now takes one already-resolved `scroll shellScroller`. |
| `internal/server/server.go` | modified | Minor 7: `New` now resolves `ShellScroll`'s default (`cfg.ShellScroll` else `tmuxClient`) in the same place as `spawner`/`attach`/`httpClient`, and passes the single resolved value to `newShellFeature`. Minor 8: `New`'s doc comment now states the recorded reason for its funlen warning. Minor 10: dropped the write-only `Server.ingestToken` and `Server.prefs` fields (nothing ever reads either); added a doc note on the `store`/`tmuxClient`/`sessions`/`ingest`/`usage`/`theme`/`shellActivity`/`issue`/`locate`/`reader` fields naming them test-only, versus `terminal`/`update` which production still reads. |
| `internal/server/prefs.go` | modified | Minor 5: `handlePutPrefs`'s locked load-merge-persist-broadcast sequence extracted into `(*prefsFeature).applyAndPersist` — the handler now only decodes, validates, calls it, and encodes the result. The lock's rationale is now stated once, at the `mu` field, not repeated at the call site. |
| `internal/server/terminal.go` | modified | Minor 3: `terminalRegistry` gained a `closed bool` (guarded by the same `mu`), set by `closeAll`. `takeover` checks it twice — once before evicting the old connection, once again after `attach` returns — so a takeover whose attach finishes after `closeAll` has run closes its new connection with the shutdown code instead of installing it into `conns`. New sentinel `errRegistryClosed`; `attachAndPump` treats it as teardown (no error log, no second `Close`). Minor 9: `takeover`'s doc no longer narrates "an earlier version..."; the "Protocol Contract delta" phrase dropped; the stale "sessions.go's rollback" comment fixed to `launcher.go`'s. |
| `internal/server/launcher.go` | modified | FW-D2's deferred item: `validateLaunchRequest`'s permission-mode 400 text is now built from `claudecode.PermissionModes` (`strings.Join`) instead of a hand-spelled four-value list — byte-identical output (`default, plan, acceptEdits, auto`), one owner for the set. Minor 9: `Launch` got its own doc comment (previously shared with, and now separated from, `validateLaunchRequest`'s); `checkModel`'s two "exactly as before this check existed" phrasings and `spawnSession`'s "were identical... by hand" phrasing rewritten to state the current contract, not the refactor history. Minor 10: `paneSpawner.KillWindow`'s doc now says it has no production caller and exists for this package's own tests. |
| `internal/server/locate.go` | modified | Minor 9: two "Protocol Contract" citations replaced — one points at `kb:anchor/sessions.locate` (already this handler's own anchor), the other dropped in favour of the same anchor. |
| `internal/server/sessionwire.go` | modified | Minor 9: `toWireSession`'s "(Schema Changes: ...)" citation dropped — the sentence already stands on its own beside the `kb:anchor/ws.session` reference two lines up. |
| `internal/server/state.go` | modified | Minor 9: `Update`/`ShellsBusy` field docs no longer cite a plan name/date ("new in the auto-update plan (2026-09-10)", "new in terminal-fixes-cleanup") — kept only the `kb:anchor` citations and the behavioural sentence. |
| `internal/server/usagepoll.go`, `themepoll.go`, `shellactivity.go` | modified | Minor 9: the three false "pattern copied from usagePoller('s Start/Stop/loop/tick shape)" comments (usagePoller's own said it copied from `internal/session.Manager`'s liveness poll, which no longer describes the code — all three now embed `bgLoop`) replaced with an accurate one-line pointer at `bgloop.go`. |
| `internal/server/bgloop.go` | modified | Minor 9: `bgLoop`/`runTicked`'s "usagePoller, themePoller, shellActivityPoller and updateManager each hand-wrote / each wrote out by hand" narration rephrased to state what is shared now, not what was duplicated before. |
| `internal/server/updatewire.go` | modified | Minor 9: `buildUpdateInfo`'s "Both halves were assembling the same shape ... by hand" narration rephrased. |
| `internal/boundedwait/boundedwait.go` | modified | Minor 9: package doc's "each hand-wrote ... extracting the duplicated pattern here removes that repetition" narration rephrased to state the shared need directly. |
| `internal/reader/writelog.go` | modified | Minor 9: `WriteLog`'s "(Schema Changes: \"the write log is not persisted\")" citation replaced with a plain statement of the same fact. |
| `internal/server/usagewire.go` | modified | Minor 10/m6: `emptyUsageInfo` now reads `usage.DefaultSource`/`usage.DefaultModelScopedSource` instead of re-spelling `"subscription"`/`"subscription-api"`; doc comment updated to match. |
| `internal/usage/aggregator.go`, `internal/usage/modelscoped.go` | modified | Added `DefaultSource`/`DefaultModelScopedSource`, each defined as `= defaultSource` / `= defaultModelScopedSource` — the existing unexported constants (and the tests that reference them by that name) are untouched; the new exported names are internal/server's one way to read the same literal without keeping its own copy. |

## Decisions

- Every item this wave was assigned is addressed above: Major 1 (applyWG), Minor 2 (wire time, issue.go/reader.go), Minor 3 (closeAll/takeover race), Minor 4 (unknown_session helper + parseSessionID location), Minor 5 (prefs handler body), Minor 6 (shell lock ownership doc), Minor 7 (ShellScroll default resolution), Minor 8 (New's funlen reason), Minor 9 (the full comment list — plan-name citations, "Protocol Contract" citations, refactor-history narration, and every named false/stale comment), Minor 10 (dead production surface + usage literal duplication), plus review.work.md's server-scoped Major 4 (`updatemanager.go:32`'s stale `gitFilesFunc` reference) and FW-D2's deferred permission-mode text item. Minor 1 (`settings.local.json` path leak) was already fixed by FW-D2 (`claudecode.ProjectSettingsPath`) — verified still in place, untouched here.
- **Minor 6, kept the registry lock rather than removing it**: `TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce` (`shells_test.go:176`) calls `shellRegistry.Ensure` directly and concurrently, with no `session.Manager.LockSession` wrapper — a frozen test I may not edit. Removing `locks` would make that test's own concurrency guarantee false. The finding's own fix text allows keeping the lock "if... its declaration says which production caller already holds LockSession and what the inner lock adds" — I named the two guarantees as separate (registry self-consistency vs. Ensure-vs-Remove serialisation) rather than one rule with two owners, which is what the finding actually objected to. No behaviour change; `lockID` and `locks` are unchanged in shape.
- **Minor 3's fix closes the race at both points it can occur, not just the one the finding measured**: the finding's interleaving has the attach already in flight when `closeAll` runs, but a takeover could equally start (and see `closed == false`) a moment before `closeAll` flips it and then still be evicting/attaching when `closeAll` drains the map — the second `closed` check inside `takeover`, taken right before installing into `conns`, catches every such interleaving regardless of exactly when `closeAll` ran relative to the start of `takeover`, not only the one timing the finding measured.
- **usage.DefaultSource/DefaultModelScopedSource defined as aliases of the existing unexported constants, not renames**: `rg -n 'defaultSource\b' internal/usage` showed `aggregator_test.go:70` asserts against the unexported identifier directly (same package, not an import I could fix); renaming would have been a test-file edit I'm not allowed to make. Defining the exported constant as `= defaultSource` keeps exactly one string literal while leaving the existing name (and its test) untouched.
- **`New`'s funlen and `terminal.go`'s filelen warnings, both grown by this wave's own fixes, kept without a split** (kb:adr/process-size-linters-warn-never-fail): `make size-warn` now additionally reports `server.go:143 New has too many statements (41 > 40)` (Minor 7 added the four-line `shellScroll` resolution) and `terminal.go:1 file is 504 lines (threshold 500)` (Minor 3 added the `closed` field, its two checks, and their doc comments). Both are the minimal code the assigned fixes require; `New`'s reason is now recorded in its own doc comment (Minor 8), and `terminal.go` still holds one cohesive concern (the takeover registry plus the attach/pump lifecycle it serialises) per D5's original design line — no split asked for either.
- Not touched, deliberately: review-work's V9/Note 7 items (the `not_found` parse-then-404 pair repeated in `terminal.go`/`shells.go`, and `terminalRegistry.keyLocks`'s unreclaimed growth) were explicitly out of scope for this wave's brief and are unrelated to any item assigned here.

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l .
(no output — clean)

$ go build ./...
(exit 0)

$ go vet ./...
(no output — clean; FW-D2's earlier sanctioned test-file breakage in gitutil/ghissue/selfupdate/claudecode has since been fixed by the test agents)

$ go vet -tags=canary ./test/...
(no output — clean)

$ golangci-lint run --tests=false ./...
0 issues.

$ golangci-lint run ./...
0 issues.

$ go test -race -count=1 ./internal/server/... ./internal/reader/...
ok  	github.com/Zalaras/muster/internal/server	108.339s
ok  	github.com/Zalaras/muster/internal/reader	5.310s

$ go test -race -count=1 ./internal/boundedwait/... ./internal/evict/... ./internal/usage/... ./internal/keyedlock/...
?   	github.com/Zalaras/muster/internal/boundedwait	[no test files]
ok  	github.com/Zalaras/muster/internal/evict	1.711s
ok  	github.com/Zalaras/muster/internal/usage	5.195s
ok  	github.com/Zalaras/muster/internal/keyedlock	2.679s

$ go test -race -count=1 ./...
(all packages ok; full tail pasted below)
ok  	github.com/Zalaras/muster/cmd/musterd	67.091s
ok  	github.com/Zalaras/muster/internal/claudecode	11.074s
ok  	github.com/Zalaras/muster/internal/evict	1.893s
ok  	github.com/Zalaras/muster/internal/ghissue	1.543s
ok  	github.com/Zalaras/muster/internal/gitutil	5.228s
ok  	github.com/Zalaras/muster/internal/kb	5.768s
ok  	github.com/Zalaras/muster/internal/keyedlock	4.737s
ok  	github.com/Zalaras/muster/internal/locate	5.418s
ok  	github.com/Zalaras/muster/internal/reader	9.873s
ok  	github.com/Zalaras/muster/internal/selfupdate	6.474s
ok  	github.com/Zalaras/muster/internal/server	115.893s
ok  	github.com/Zalaras/muster/internal/session	43.930s
ok  	github.com/Zalaras/muster/internal/store	16.978s
ok  	github.com/Zalaras/muster/internal/termbridge	8.861s
ok  	github.com/Zalaras/muster/internal/tmux	18.122s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	5.858s
ok  	github.com/Zalaras/muster/internal/triage	6.291s
ok  	github.com/Zalaras/muster/internal/tty	6.732s
ok  	github.com/Zalaras/muster/internal/usage	10.475s
ok  	github.com/Zalaras/muster/internal/webui	3.895s
ok  	github.com/Zalaras/muster/tools/kb	3.994s
ok  	github.com/Zalaras/muster/tools/triage	4.016s
ok  	github.com/Zalaras/muster/tools/versions	8.574s

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 1896 references checked, 0 missing

$ make refs
dead-refs: 3127 references checked, 0 missing

$ make check-kb
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass

$ make size-warn   (new hits in my scope only; every other hit is pre-existing/out of scope)
WARN internal/server/server.go:143:6: Function 'New' has too many statements (41 > 40) (funlen)   — reason recorded in New's own doc comment and in Decisions above; no split asked
WARN internal/server/terminal.go:1: file is 504 lines (threshold 500) (filelen)   — reason recorded in Decisions above; no split asked
```

No test file needed changes for this wave's fixes — every signature I touched (`newShellFeature`, `parseSessionID`'s location, `sessionOr404`'s callers) is only ever called from non-test production code, and `-race` above is green across the whole tree with no assertion changes required.

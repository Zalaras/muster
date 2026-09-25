# Maintainability review: Settings update failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 16076 words (budget 8000) — WARN pack exceeds budget; sections rules 1938 · features 5124 · diagrams 4297 · decisions 3642 · proposed 0 · facts 71 · lessons 354 · runbooks 644
**Scope**: 22 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. 17 are code. Of the 5 `CLAUDE.md` files, 4 changed only their generated trailer; `internal/selfupdate/CLAUDE.md` has hand edits to Owns and Exemplar and was read. `internal/server/updatereclassify.go` from cycle 1 is gone: it was merged back into `updatemanager.go`.

## Cycle 1 findings, re-checked

| Cycle 1 | State now | Evidence |
|---|---|---|
| Major 1: plan-ID comments | resolved | `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' \| grep '^+' \| grep -nE "REQ-[0-9]\|\bW[0-9]+\b\|settings-update-failures\|soak\|web-tests\|daemon-tests"` prints nothing. |
| Major 2: `updaterestart.ts` is a controller with a helper's name | resolved | The web Fix Attempt 1 `design:` line and the file's header comment (`updaterestart.ts:1-13`) both say why the update feature has two controllers. `kb:diagram/web-components` now says "17 stateful per-feature controllers (the update feature has two…)". See Note 1 for the remaining doc sentence. |
| Minor 1: `drainOutboxes` gave up silently | resolved | It now logs at warn (`ws.go:169`), and `closeDrainTimeout`'s comment (`ws.go:127-136`) says why the bound is fixed rather than taken from ctx. It still has its own wait loop; see Minor 2. |
| Minor 2: reclassify seam claimed constructor-default | resolved | The comment (`updatemanager.go:38-48`) no longer claims that model. The reason it gives, that the closure reuses the `home` value `Classify` resolved, holds. |
| Minor 3: two homes for one failure sentence | resolved | `MissingSignatureError.Error()` (`apply.go:72-74`) is now log-only. `DescribeApplyFailure`'s doc says which shape a new failure takes, and the package CLAUDE.md Exemplar is updated. |
| Minor 4: file split vs size reason | resolved | Reclassification is merged back into `updatemanager.go`. The filelen 551 warning's reason (Decisions, Fix Attempt 2) now agrees with the layout. |
| Minor 5: `onHelloArrived` / `"helloReceived"` | resolved | The name is `helloArrived` end to end (`ws.ts:41`, `wsapp.ts:88`, `app.ts:64`). |
| Minor 6: daemon-absence clause written twice | resolved | It has one home, `render/banner.ts:16` (`DAEMON_ABSENCE_CLAUSE`). Text constants in `render/` have a precedent: `render/issue.ts:12-13` `DASHBOARD_SCOPE_TEXT`/`DASHBOARD_SCOPE_VALUE`. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | preflight.go, onexit.go | n/a (plumbing) | filelen 502, reason holds; funlen `parseFlags` 41 / `run` 44 were already over on main | pass |
| internal/selfupdate/apply.go | verify.go, lock.go, release.go | yes | — | pass |
| internal/selfupdate/failure.go (new) | verify.go, release.go, apply.go | yes (typed errors; `://` guard placement) | — | pass (Note 5) |
| internal/selfupdate/install.go | exeversion.go, semver.go | yes (via reclassify lines) | — | pass |
| internal/selfupdate/release.go | apply.go, CLAUDE.md exemplar | yes | — | pass |
| internal/selfupdate/CLAUDE.md | — | n/a | — | pass |
| internal/server/server.go | usage.go, ingest.go, update.go, and 20 `new*(…, log zerolog.Logger)` constructors | yes (Fix Attempt 2, `wsHub.log` zero value) | funlen `New` 42 (41 on main); the doc-comment reason does not cover the added statement | Minor 1 |
| internal/server/update.go | updatewire.go, usage.go | yes | — | pass (Note 4) |
| internal/server/updatemanager.go | updatewire.go, usagepoll.go, ingest.go, bgloop.go | yes | filelen 551, reason holds (Fix Attempt 2) | pass |
| internal/server/ws.go | ingest.go (`drainAck`, `Stop`), terminal.go `closeAll`, bgloop.go, internal/boundedwait | partial (drain marker yes; no line on not reusing `boundedwait.Wait`) | — | Minor 1, Minor 2 |
| web/src/app.ts | wsapp.ts | yes | — | pass |
| web/src/features/connection.ts | connectionrestore.ts, connectionversion.ts, tiles.ts, focus.ts, rail.ts | yes | — | pass |
| web/src/features/updaterestart.ts (new) | update.ts, updateview.ts, usage.ts, theme.ts, storage.ts | yes (Fix Attempt 1) | — | pass (Notes 1-3) |
| web/src/main.ts | (composition root) | n/a | — | pass |
| web/src/render/banner.ts | render/masthead.ts, render/issue.ts | yes | — | pass |
| web/src/style.css | (itself) | n/a | — | pass |
| web/src/ws.ts | wsapp.ts | yes | — | pass |
| web/src/wsapp.ts | ws.ts, app.ts | yes | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** `wsHub` gets its logger by a patch after construction, not through its constructor: `internal/server/server.go:154-157` sets `s.hub.log = cfg.Logger` after `hub: newWSHub()`.
   - **Sibling shape:** every other logger-bearing type in the package takes the logger as a constructor parameter. `rg -n "func new[A-Z][a-zA-Z]*\(" internal/server -g '!*_test.go' | rg -i "log"` lists 20 of them, for example:
     - `ingest.go:67` `newIngestQueue(st *store.Store, log zerolog.Logger, …)`
     - `shells.go:82` `newShellRegistry(tmuxClient paneSpawner, log zerolog.Logger)`
     - `themepoll.go:47` `newThemeFeature(cfg ThemeConfig, hub *wsHub, log zerolog.Logger)`
   - **Why it stands out:** `rg -n "^\s+s\.[a-zA-Z]+\.[a-zA-Z]+ = " internal/server/server.go` finds exactly one line, this one. It is the only post-construction field patch in the composition root, whose rule is "build dependencies and register each feature in one line" (`docs/conventions.md` § Composition roots, first bullet).
   - **Why the stated reason doesn't hold:** the Decisions reason (Fix Attempt 2, "`newWSHub()`'s signature could stay untouched for `shellactivity_test.go`'s existing bare call") keeps one test call site compiling. The same wave changed `drainOutboxes`' signature and accepted breaking `wshub_drain_test.go:154,175` to do it.
   - **Cost of the zero-value default:** a hub built by `newWSHub()` drops the "ws outbox drain did not finish" warning without a trace. That warning is what cycle 1's Minor 1 asked to make observable.
   - **Size:** the patch also grows `New`'s funlen from 41 to 42. `New`'s own size reason (`server.go:136-142`) lists exactly what its length consists of: one line per feature plus four Config overrides. This statement is in neither group.
   - **A fix must make true:**
     - `wsHub` receives its logger at construction, like its siblings.
     - `New` holds no post-construction field patch.
     - The one bare call at `shellactivity_test.go:439` is updated with it. That line is the `[daemon-tests]` half of this fix.

2. **[daemon-impl]** `drainOutboxes` has its own bounded-wait-with-warn loop (`internal/server/ws.go:152-183`: `time.After(closeDrainTimeout)` plus a warn on expiry). The package already has one shared shape for this.
   - **What the code and docs claim:** the function's doc comment (`ws.go:148-151`) names `boundedwait.Wait`'s ingest/apply/bgloop callers as its siblings. `internal/boundedwait/boundedwait.go:1-3` calls itself "the one piece of a background-loop shutdown that crosses package boundaries: bounded-wait-with-warn". `rg -n "boundedwait\.Wait" internal/server -g '!*_test.go'` shows three callers: `ingest.go:113`, `updatemanager.go:194` and `bgloop.go:37`.
   - **Why not reusing it may be right:** `boundedwait.Wait`'s contract is "the caller is responsible for making wg eventually reach zero". That fails here. A peer whose `handleWS` loop returns on `ctx.Done()` never reads its marker, so a WaitGroup-based drain would leave `Wait`'s watcher goroutine blocked forever.
   - **What's missing:** neither the comment nor Decisions says this. A newcomer who reads "like every other bounded shutdown wait in this package" will ask why it doesn't call the helper, and may "fix" it into a leak.
   - **Rule broken:** `docs/conventions.md` § Design, "reuse before add". A divergence needs its stated reason.
   - **A fix must make true:** either `drainOutboxes` uses `boundedwait.Wait` and every marker it enqueues is guaranteed to complete (including when `handleWS` exits first), or the code comment or a `design:` line says why the shared helper's contract does not fit here.

### Notes

1. **[note]** For review-work (doc truth): `web/src/features/CLAUDE.md`'s hand-written Owns line still defines `<owner><concern>.ts` files as "a pure decision with exactly one controller caller". `updaterestart.ts` is the one file with that name shape that is a controller. The diagram and the file header now say so, but this sentence does not. It is a doc-reconcile edit, not a code change.
2. **[note]** `safeSessionStorage()` sits in `features/updaterestart.ts:35-51`, while `web/src/storage.ts:1` calls itself "the one localStorage seam and safe-JSON helper pair".
   - The same throwing-accessor hazard applies to `theme.ts:49` (`= localStorage`) and `features/reader.ts:165` (`window.localStorage`). A second caller would look for the helper in `storage.ts`.
   - No change is requested while there is one caller.
   - For review-work: the web log's Fix Attempt 1 Changes table says the helper was added to `storage.ts`, but the diff does not touch that file.
3. **[note]** `initUpdateRestart(app, storage = safeSessionStorage())` (`updaterestart.ts:118-121`) is the only controller whose second parameter is a test seam rather than a named `<Name>Deps` (features/CLAUDE.md Gotcha "One `init<Name>(app, deps)` shape"). It's harmless: `main.ts` never passes it.
4. **[note]** For review-work: `UpdateConfig.Install`'s comment (`internal/server/update.go:33`) still says installer/unmanaged are "re-derived from it". They are re-derived by `Reclassify` from exePath/home, not from `Install`. This is carried over from cycle 1's Note 2.
5. **[note]** `networkCause`'s `strings.Contains(cause, "://")` (`failure.go:29`) is the one string check in a classifier whose `design:` line says "`errors.As` rather than string-matching". It guards the fallback text against a URL leak rather than classifying anything, and the Fix Attempt 2 `design:` line explains where it sits. No change requested.
6. **[note]** Concurrency:
   - `wsHub.log` is written once in `New`, before `Start` launches any goroutine.
   - `updateManager.install` is under `m.mu` at every read and write, and the guard is named at its declaration (`updatemanager.go:95-100`).
   - The gates' `go test -race -count=1 ./...` passed `internal/server` (152.1s, `02-test.log`).
   - `drainOutboxes` sends only on channels `closeAll` has already removed from `h.clients` under `h.mu`, and outbox channels are never closed, so the send cannot panic.
   - `reclassify`'s probe outside the lock can still finish out of order, as in cycle 1's Note 4. That is last-writer semantics shared with `available`/`checkedAt`, not a race.
7. **[note]** `ConnectionDeps.restartBanner` is wired to `updateRestart.bannerOverride` (`main.ts:85`). Renaming a method when passing it as a dep has a precedent in the same file: `promoteTile: tiles.promote`, `tilesLive: tiles.liveIds`.
8. **[note]** Size warnings on this branch (`14-size.log`), besides Minor 1:
   - `main.go` filelen 502: reason holds.
   - `updatemanager.go` filelen 551: reason holds now that reclassification is back inside the machine it belongs to.
   - `parseFlags`/`run` funlen: already over on main.
   - Test funlen hits (`TestClassify_Table`, `TestBuildServerConfig_…`, and two in `updatereclassify_test.go`) are outside this diff. No `dupl` hit.
   - For review-work: the test name `TestHandleCheckUpdate_ExactREQ8Message` (`updatereclassify_test.go:441`) carries a plan ID.

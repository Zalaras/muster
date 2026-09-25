# Maintainability review: Settings update failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 16072 words (budget 8000) — WARN pack exceeds budget; sections rules 1938 · features 5124 · diagrams 4293 · decisions 3642 · proposed 0 · facts 71 · lessons 354 · runbooks 644. The pack carried no § Design, so it was read directly from `docs/conventions.md:110-141`.
**Scope**: 22 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. 5 of them are `CLAUDE.md` files where only the generated `kb:hash` changed, so 17 were read as code.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | preflight.go, onexit.go | n/a (plumbing) | filelen 502, reason holds; funlen `parseFlags`/`run` both on main already, statement count unchanged here | Major 1 (REQ refs) |
| internal/selfupdate/apply.go | verify.go, lock.go, release.go, CLAUDE.md | yes (typed errors) | — | Major 1, Minor 3 |
| internal/selfupdate/failure.go (new) | verify.go, release.go, apply.go | yes | — | Major 1, Minor 3 |
| internal/selfupdate/install.go | exeversion.go, semver.go | partial (Reclassify covered only by the server-side line) | — | Major 1 |
| internal/selfupdate/release.go | apply.go, CLAUDE.md exemplar line | yes | — | Major 1, Minor 3 |
| internal/server/update.go | updatewire.go, usage.go | yes (via updatereclassify line) | — | Minor 2 |
| internal/server/updatemanager.go | updatewire.go, usagepoll.go, ingest.go, bgloop.go | yes | filelen 504, reason contradicted by the extraction (Minor 4) | Major 1, Minor 4 |
| internal/server/updatereclassify.go (new) | usage.go / usagewire.go / usagepoll.go, updatemanager.go | yes | — | Major 1, Minor 2, Minor 4 |
| internal/server/ws.go | ingest.go, terminal.go (`closeAll`), server.go (`Shutdown`), internal/boundedwait | yes (drain marker) | — | Minor 1 |
| web/src/app.ts | wsapp.ts | yes (hello wiring) | — | Major 1, Minor 5 |
| web/src/features/connection.ts | connectionrestore.ts, connectionversion.ts, tiles.ts, focus.ts | yes | — | Major 1, Minor 6 |
| web/src/features/updaterestart.ts (new) | update.ts, updateview.ts, usage.ts, theme.ts, features/CLAUDE.md | partial (signature and wiring only, not the module itself) | — | Major 1, Major 2, Minor 6 |
| web/src/main.ts | (composition root) | n/a | — | pass |
| web/src/render/banner.ts | render/masthead.ts, render/update.ts | yes | — | Major 1, Note 5 |
| web/src/style.css | (itself) | n/a | — | pass (REQ-number comments already there on main) |
| web/src/ws.ts | wsapp.ts | yes | — | Major 1, Minor 5 |
| web/src/wsapp.ts | ws.ts, app.ts | yes | — | Major 1, Minor 5 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl] [web-impl]** Plan-ID comments are back in production code. Last cycle's cleanup removed them from both trees on purpose.
   - **What the diff adds:** about 45 `REQ-N` / `W-N` / "plan settings-update-failures" references in comments across 12 production files:
     - `internal/selfupdate/{apply,failure,install,release}.go`
     - `internal/server/{updatemanager,updatereclassify}.go`
     - `cmd/musterd/main.go:448`
     - `web/src/{app,ws,wsapp}.ts`
     - `web/src/features/{connection,updaterestart}.ts`
     - `web/src/render/banner.ts`
     - Examples: `updatereclassify.go:14-19` "(REQ-4 …) (REQ-6) … (REQ-5) … (REQ-7)"; `updaterestart.ts:43` "table-tested directly (web-tests W1, W2, W5)"; `updaterestart.ts:91` "// W7: …".
   - **Why it matters:** `ws.go:130-132` also narrates history ("observed once in 250 soak runs"). On main, `git grep -c "REQ-[0-9]" main -- internal cmd web/src ':!*_test.go' ':!*.test.ts'` finds these only in `style.css` and two test-helper packages. Commits `49fcb2b` ("replace plan-ID comments in server and the adapters with the why or a kb citation") and `40eb7de` (the same across `web/src`) removed exactly this pattern on 2026-09-24.
   - **Why a reader can't use them:** `plans/` on main holds dozens of plans, each with its own REQ-4, so the pointer can't be followed. The sibling comments in the same files cite kb records, e.g. `updatemanager.go:149` "(kb:adr/update-install-kinds-decide-who-may-apply)".
   - **Rule broken:** `docs/conventions.md` § Comments: cite `kb:fact/<slug>` / `kb:adr/<slug>`, don't narrate history.
   - **A fix must make true:** no production Go/TS comment added by this branch names a plan REQ, a test-spec ID or a soak run. Each one either states the why or cites the kb record (four proposed ADRs exist for this plan: `update-failure-one-sentence-chain-in-log`, `update-install-rechecked-on-every-check`, `update-remedy-names-path-and-cause`, `update-restart-reloads-dashboard`).

2. **[web-impl]** `web/src/features/updaterestart.ts` is a stateful controller, but its name follows the pattern `features/` reserves for pure helpers.
   - **What `features/CLAUDE.md` says:** "one controller per feature"; `<owner><concern>.ts` files are "a pure decision with exactly one controller caller" (`actionscopy.ts`, `connectionrestore.ts`, `connectionversion.ts`, `launchcrumbs.ts`, `launchrestore.ts`, `updateview.ts`); "The name matches the server handler file, E2E spec prefix and helper (kb:adr/process-one-name-per-feature)".
   - **What the file actually is:** `updaterestart.ts` reads as update.ts's second helper beside `updateview.ts`. It is in fact a 17th controller:
     - `initUpdateRestart(app, storage)` at :85
     - three `app.on` subscriptions, one of them on `"update"` exactly as `update.ts` already has
     - module state (`record`, `confirmation`, `reloaded`, `handoffChecked`)
     - `location.reload()`
     - registered in `main.ts:45`
   - **Missing design line:** the web Decisions cover `computeBannerOverride`'s signature, the hello wiring, the deps typing and `renderBanner`. None covers the choice of a new controller rather than extending `update.ts`, or its name. A newcomer who knows the directory's convention would open the wrong file.
   - **A fix must make true:** the module's placement and name match `features/CLAUDE.md`'s controller/helper split, or a `design:` line says why the update feature has two controllers and why the second is named like a helper.

### Minor

1. **[daemon-impl]** `internal/server/ws.go:140-160`: `drainOutboxes` gives up silently when its bound expires. Every other bounded shutdown wait in the package logs a warning.
   - **Sibling shape:** `ingest.go:113` `boundedwait.Wait(ctx, &q.wg, q.log, "ingest queue drain did not finish before shutdown deadline")`, `updatemanager.go:180` and `:182` do the same. The package doc at `internal/boundedwait/boundedwait.go:1-8` names "bounded-wait-with-warn" as the shared shape.
   - **How this one differs:** `drainOutboxes` returns on `closeDrainTimeout` with no log line. It has no logger, and it ignores the `ctx` that `Server.Shutdown(ctx)` (`server.go:315`) already has.
   - **Missing design line:** the Decisions line compares it with a per-client `WaitGroup` but says nothing about `boundedwait` or the silent give-up.
   - **Why it matters:** the one failure this drain exists to prevent (a queued restarting-phase `update` not reaching a peer) took a 250-run soak to find. When the bound fires in production, it leaves no trace.
   - **A fix must make true:** a drain that hits its bound is observable in the daemon log like its siblings, or Decisions says why this one wait is silent. It must also say either that the bound comes from the shutdown ctx or why it has a fixed timeout of its own.

2. **[daemon-impl]** `internal/server/updatereclassify.go:5-10` and `updatemanager.go:52-56`: the seam claims a model it does not follow.
   - **What the comment says:** the doc comment calls `reclassifyFunc` "docs/conventions.md § Testing's constructor-default run seam", then says it is "threaded through updateManagerConfig".
   - **What that section actually says:** "The constructor sets the production run func … the composition root never passes a run func" (kb:adr/process-adapter-run-seam-constructor-default).
   - **What the code does instead:** production reclassification is built in `cmd/musterd/main.go:180-182` and passed through `resolveInstall` (now five return values) → `buildServerConfig` (now eight params) → `UpdateConfig.Reclassify` → `updateManagerConfig.Reclassify`. The nil default "returns Install unchanged", so every same-package test manager silently has no reclassification.
   - **Why the stated reason doesn't hold:** "it needs runtime values only cmd/musterd resolves" is contradicted for `exePath`, which `UpdateConfig.ExePath` (`update.go:36-38`) already carries into the manager as `m.exePath`. Only `home` is missing.
   - **A fix must make true:** either production reclassification is the constructor's default, built from values the manager already holds (plus whatever it still lacks), or the comment and `design:` line stop claiming the constructor-default model and state a reason that holds.

3. **[daemon-impl]** `internal/selfupdate` now has two ways of producing user-facing failure text, and one sentence is written twice.
   - **The two ways:**
     - verify.go's sentinels still "double as UI status" (`internal/selfupdate/CLAUDE.md:12`, the package exemplar; `DescribeApplyFailure` falls back to `err.Error()` for them at `failure.go:76`).
     - The six new typed errors carry a log-only `Error()` while `failure.go` composes a separate wire sentence.
   - **The duplicate:** "this release has no signature, refusing to apply" is spelled out in `apply.go:69` (`MissingSignatureError.Error`) and again in `failure.go:71`. That is two places that must agree (§ Design "One owner per concept").
   - **Missing design line:** the `design:` line justifies typed errors over string matching, but not the split with the package's stated exemplar. A newcomer adding a seventh failure can't tell which way to write it.
   - **A fix must make true:** each user-facing failure sentence has one home. Decisions or code say which of the two ways a new selfupdate failure takes (the stale exemplar line in `CLAUDE.md` is review-work's; see Note 2).

4. **[daemon-impl]** `internal/server/updatereclassify.go` (37 lines, one `updateManager` method plus its seam type): the reason for extracting it contradicts the reason given for not splitting `updatemanager.go` further.
   - **Reason A:** the extraction's `design:` line says it matches the `usage.go`/`usagewire.go`/`usagepoll.go` "one file per concern" split.
   - **Reason B:** the size reason for `updatemanager.go` (504 lines) says the file "holds one cohesive state machine (checks, …)" and "splitting further would fragment that machine".
   - **Why they conflict:** `reclassify()` is step one of `checkAvailability` (`updatemanager.go:226`). It writes `m.install` under `m.mu`, and its own doc points back at "every other read of m.install in updatemanager.go". It is part of that machine, not a separate concern like `usagewire.go`'s wire shape. The sibling seam type `probeVersionFunc` stays in `updatemanager.go:30-36`, so the two seam types now live apart.
   - **A fix must make true:** the file layout and the two Decisions reasons agree. This is not a request to split anything (kb:adr/process-size-linters-warn-never-fail). If reclassification belongs to the machine, it can live there and the filelen warning can stand with its reason.

5. **[web-impl]** One signal now has two names: `WsClientHandlers.onHelloArrived` (`ws.ts:41`) is relayed as `app.emit("helloReceived")` (`wsapp.ts:88`, `app.ts:62`).
   - **Sibling shape:** every other relay in `wsapp.ts` keeps one name end to end: `onUsage`→`"usage"`, `onUpdate`→`"update"`, `onPrefs`→`"prefs"`, `onClaudeTheme`→`"claudeTheme"`, `onDocChanged`→`"docChanged"`, `onShellActivity`→`"shellActivity"`.
   - **Why it matters:** grepping one name misses the other end.
   - **A fix must make true:** the handler and the event share one name (§ Design "Match the siblings").

6. **[web-impl]** The daemon-down clause "hook output in open panes is Muster's absence, not session failure." is written out in two modules: `features/connection.ts:14` (`DAEMON_DOWN_TEXT`) and `features/updaterestart.ts:40` (`restartingText`).
   - **Rule broken:** § Design "One owner per concept": two places that must agree will not.
   - **A fix must make true:** the shared clause has one home that both banner texts draw from. The "no controller imports a sibling" invariant (`features/CLAUDE.md`) constrains where that home can be.

### Notes

1. **[note]** Size warnings read against their reasons:
   - `cmd/musterd/main.go` filelen 502 (492 on main): reason holds (plumbing for the new closure and `exe` log field).
   - `main.go` funlen `parseFlags` (41) and `run` (44): both over on main already. `parseFlags` is untouched and `run` only has existing statements edited, so there's nothing to explain.
   - Test funlen `TestClassify_Table` (86 lines on main → 102) and `TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig` (63 → 70): both already over on main, grown by table rows. No `dupl` hit in the size log.
2. **[note]** For review-work (doc truth), no change requested here:
   - `internal/selfupdate/CLAUDE.md:12`'s exemplar "sentinel errors whose text doubles as UI status" no longer describes `release.go`.
   - `TransportError.Error()` (`release.go:24`) drops the URL that the old `"requesting %s: %w"` put in the log chain, which kb:adr/update-failure-one-sentence-chain-in-log says the log keeps.
   - `UpdateConfig.Install`'s comment (`update.go:31-34`) says installer/unmanaged are "re-derived from it"; they are re-derived from exePath/home.
3. **[note]** For review-work's DIAG row: `kb:diagram/web-components` still says `features/` is "22 modules … 16 stateful per-feature controllers, plus 6 DOM-free helpers". It is now 23 modules / 17 controllers. The diagram also has no `features → storage` edge, though `updaterestart.ts` imports `../storage` (and `storage.ts:1` still calls itself "the one localStorage seam" while now carrying a `sessionStorage` use too).
4. **[note]** Concurrency on `updateManager.install`:
   - **What's fine:** the guard is named where the field is declared (`updatemanager.go:83-86`), and every reader and writer I found takes `m.mu` (`installKind`, `Remedy`, `RequestApply:363`, `Current`, `reclassify`). The gates' `go test -race -count=1 ./...` covers the paths.
   - **The remaining gap:** a logical ordering gap, not a data race. `reclassify` probes outside the lock (`updatereclassify.go:27`), so a manual check and a tick overlapping across a permission change can finish in reverse order. The earlier probe's stale result then wins until the next check.
   - **Why no finding:** `available`/`checkedAt` in the same function already have the same last-writer semantics.
5. **[note]** `render/banner.ts` gained `renderBannerContent` beside `renderBanner` rather than one builder taking the view-model, and the stated reason is keeping a web-tests file compiling unmodified. That's a test-ownership reason shaping a production API; it's harmless at two call sites.
6. **[note]** Reuse checks that came back clean:
   - `rg -n "errors\.Unwrap|Timeout\(\)|net\.DNSError|\"timed out\"|host not found|DeadlineExceeded" internal cmd -g '!*_test.go' -g '!internal/webui/**'` finds only `failure.go` (plus two comments in `tmux.go`). `networkCause`/`innermostCause` duplicate nothing.
   - The `wsDrainAck` marker reuses `ingest.go:27-30,98-100`'s `drainAck` shape, as its `design:` line says.
   - `updaterestart.ts` reuses `storage.ts`'s `readJson`/`writeJson`/`removeItem` and `protocol/decode.ts`'s `isRecord` rather than rolling its own.

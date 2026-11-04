# Daemon Implementation: Restart Latest Claude

**Plan**: restart-latest-claude
**Mode**: initial
**Pack**: kb: pack 28607 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/status.go` | modified | `StatusUpdate.Version`: leading major.minor.patch of the status line's `version` (REQ-1); nil when missing or unparseable |
| `internal/claudecode/version.go` | modified | `LeadingVersion` and `OlderVersion` on the existing `parseSemver`/`compareSemver` (REQ-3) |
| `internal/claudecode/claudecodetest/statusline.go` | modified | `StatusLineFullOpts.Version` so render scenarios post a chosen running version |
| `internal/session/session.go` | modified | `ClaudeVersion`, `ClaudeBehind`, `RestartPending` on `Session` |
| `internal/session/restart.go` | created | free rule, version adoption, behind settling, `SetInstalledClaude`, `ClassifyRestart`, `SetRestartPending`, `RestartDue`, `IsRestartDue` (REQ-1..6) |
| `internal/session/status.go`, `apply.go` | modified | status post adopts the version and settles `behind`; the wire-visible comparison moved to `statusWireChanged` (D1) |
| `internal/session/actions.go`, `liveness.go` | modified | `RecordLaunch`, `RecordResume`, `markEnded` clear the version and mark (REQ-2, D2, D8); `endLocked` exported as `EndLocked` |
| `internal/session/manager.go` | modified | `OnRestartDue` callback fired from `broadcast`; `installedClaude`/`installedChecked`; `LoadAll` seeds `ClaudeBehind` from the persisted mark (REQ-5, REQ-6, D10) |
| `internal/session/row.go`, `writeorder.go` | modified | row mapping and failed-write restore for the three fields |
| `internal/store/session.go`, `migrations/0019_restart.sql` | modified/created | `claude_version`, `restart_pending` columns (REQ-2, REQ-6) |
| `internal/server/sessionwire.go` | modified | `claudeVersion {running, behind} \| null` and `restartPending` on the wire, after `effortWarning` |
| `internal/server/claudeversion.go` | modified | `followInstalled`: a changed claude result tells the manager the installed version (REQ-3, D4) |
| `internal/server/launcher.go` | modified | `Resume` split into lock + `ResumeLocked` |
| `internal/server/restart.go` | created | `POST /api/sessions/restart`, the queue worker, the start-up sweep (REQ-4..6) |
| `internal/server/server.go` | modified | `s.restart = register(...)`, `OnRestartDue`, `followInstalled` wiring |
| `internal/server/renderfix_scenarios_restart.go` | created | scenarios `claude-restart`, `claude-restart-queued`, `claude-restart-down`, `claude-restart-many` (14 behind sessions, 7 free and 7 busy, for edge case 29 / R3) |
| `web/render/fixtures/*.json` | regenerated | every fixture gains the two keys; four new `claude-restart*` fixtures. `make check-render-fixtures`: up to date (110 scenarios) |

All REQs on the daemon side (REQ-1 to REQ-6) appear above. REQ-7 to REQ-13 are web.

## Decisions

- design: restart feature is `internal/server/restart.go`, a handler type with `mount` plus `Start`/`Stop`, registered by one line in `server.go`, matching `claudeVersionFeature`/`repoRefreshFeature` (`bgLoop`, lifecycle). `rg -n 'restart|Restart' internal --glob '!*_test.go'` before writing: only unrelated update-restart code (`update.go`), nothing reusable.
- design: the queue is a mutex-guarded id slice plus a capacity-1 `wake` channel drained by one `bgLoop` goroutine. Writers: `enqueue` (manager upsert callback on the ingest worker goroutine, and `Start`'s sweep); guard: `restartFeature.mu`; one consumer, `run`. A bounded channel would drop on overflow and lose a restart; no sibling queue fits (`ingest` drops on full by design). Dedup is by value: `fire` re-checks `IsRestartDue` under the session lock, so a duplicate enqueue is a no-op.
- design: "becomes free" is detected in one place, `Manager.broadcast` (`restartDue(s)` on every upsert), because every state or `backgroundTasks` change ends in an upsert; the alternative of hooking each `applyInput` arm would miss paths. `rg -n 'onUpsert' internal/session` shows `broadcast` is the single caller.
- design: `Session.ClaudeBehind` is stored (not persisted) beside `ClaudeVersion`, recomputed by `settleClaudeBehindLocked` on a status post and in `SetInstalledClaude`, so `toWireSession` stays free of the installed version. `Manager.installedClaude`/`installedChecked` guarded by `mu`; writer `SetInstalledClaude` only.
- design: until the first `SetInstalledClaude`, `settleClaudeBehindLocked` changes nothing, so a persisted pending mark survives the seconds between daemon start and the first `claude --version` (a status post in that window would otherwise clear it). `LoadAll` seeds `ClaudeBehind = RestartPending` and settles; the render rig's `markDead` calls `LoadAll` mid-run and relies on the settle.
- design: restart = `Manager.EndLocked` (was private `endLocked`, renamed in place) then `sessionLauncher.ResumeLocked` (extracted from `Resume`), both under one `LockSession`; V3 holds: no second copy of either half. Terminal sockets close through `terminals.closeSession` as `handleEndSession` does.
- design: `statusWireChanged(prev, sess)` replaces eight `before*` locals in `ApplyStatus` (the new version/behind comparison pushed `ApplyStatus` and `applyStatusUpdate` to gocyclo 16); `prev` was already the pre-mutation clone, so pointer-identity comparisons are unchanged.
- design: duplicate-id check in the restart handler is a sort-and-compact on the decoded ids; `session.hasRepeat` is private and its test file may not be touched, so no export. Body and empty checks reuse `decodeBatchRequest`/`msgBatchIDs`.
- Size: `internal/server/launcher.go` (630), `internal/session/manager.go` (647) and `internal/store/session.go` (561) were over 500 before this work and grew by 8, 15 and 8 lines; no split asked for a plan this size.
- A failed Stop half clears the pending mark by `SetRestartPending(false)`; a failed Resume half leaves the session ended, and `markEnded` has already cleared the mark (D6).
- A queue-fired failure is logged at warn with `session_id` and the error, no payload (V4).
- Edge case 5 (straggler status post from the pre-restart process) is accepted as the plan states: `adoptClaudeVersion` accepts any post for an alive session.
- `claude-restart-down` is the same drive function as `claude-restart`: the daemon-down state is the render test taking the connection away, not a different recording.

doc-delta: `docs/protocol.md` needs `kb:anchor/sessions.restart-many` and the two new Session keys; the plan's Delta is implemented byte-for-byte (`claudeVersion` is an explicit-null key, `restartPending` always present).
doc-delta: lifecycle `## Wire` / the `ws.session` table should say a status post also sets `claudeVersion`; "Status posts … never a state-machine field" stays true.
doc-delta: the Doc Delta's "a pending mark persists across a daemon restart" is true only once the first installed-version check has completed or never completed; before it, no clearing happens (see the `installedChecked` design line).

## Handoff

**Build status**: `go build ./...` exits 0. `make lint`: 0 issues. `golangci-lint run --tests=false ./...`: 0 issues. `gofmt -l .` empty. `go run -tags renderfix ./tools/renderfix check`: up to date (110 scenarios). `go test -race` green for `internal/session` (subset run: Status|Cache|Effort|AddedDirs|Title and Resume|End|Reconcile|Field|Record|Liveness|Added; the whole package passes without `-race` in 95 s), `internal/claudecode`, `cmd/musterd`.

Sanctioned breakage (migration 0019, the plan's Schema Changes; a new lifecycle feature):
- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): expect 18 applied migrations, now 19.
- `internal/server/server_test.go` `TestNew_RegistersLifecycleFeaturesInStartOrder`: expects exactly seven lifecycle features; `restart` is the eighth, registered right after `actions` and so first in start order (measured failure: `should have 7 item(s), but has 8`).
- No frozen JSON-shape test failed in `internal/server` (`sessionwire_test.go` does not pin the full object).
- Under full-suite load `TestWrapperScriptsShellRoundTrip`, `..._UnmanagedSessionProducesZeroRequests` and `TestWrapperReply_AnAnswerThatNeverComesPrintsNothing` failed in `internal/server`; each passes alone (`ok 3.294s`). They do not touch this plan's code; recorded, not fixed.
- New unit tests needed (daemon-tests): D1 to D12 have none yet.

Smoke run of `web/e2e/claude-restart.spec.ts` (`make e2e SPECS=e2e/claude-restart.spec.ts`, daemonOptions `stubClaudeVersion: "2.1.318"`): 3 passed (the two Ignore journeys and the keyboard journey), 6 failed. Mismatches:
1. Dialog markup (web-impl, in progress): tests 1, 3, 4 and 5 fail at `dialogSection(dialog, "Restart now · N")` / `rowOf(...)`: `dialog.locator("details")` with a `summary` hit found no element, so the dialog the daemon-side test drives has no such `<details>` yet.
2. `expectRestartedInPlace` (e2e helper, `web/e2e/helpers/claude-restart.ts`) polls `paneId()` after `tmuxPaneExists()`. When the restarted session is the only one on the tmux socket, `EndLocked` kills it, the tmux server exits, and `tmux display-message` throws `no server running` until `ResumeLocked` spawns a new server; the throw escapes the poll. Reproduced 3 of 3 for `:324` (daemon-restart journey) and in `:608`. This is inherent to Stop-then-Resume, not a defect in the restart; the poll should treat that error as "not alive yet".
3. Daemon behaviour, driven through the real stub and `page.request` (temporary spec, deleted): `POST /api/sessions/restart` with `[]`, `"x"` and `[1,1]` gave `400 invalid_request` with the contract message; `[idle, working, current, 99]` gave `{"done":[1],"queued":[2],"skipped":[3,99],"failed":[]}`; a second post for the queued id gave `{"done":[],"queued":[2],...}` with no new upsert; a Stop reporting no tasks then restarted it, `restartPending` went false and the session was alive again. A daemon restart reloaded `claudeVersion {running:"2.1.317",behind:true}` and `restartPending:true` with the same pane.
4. Fixtures: the orchestrator's two additions are done: `web/render/fixtures/*.json` regenerated from final code and committed with the scenarios (every fixture gains `claudeVersion` and `restartPending`; new `claude-restart.json`, `claude-restart-queued.json`, `claude-restart-down.json`), and the new scenario `claude-restart-many` (14 behind sessions, seven idle and seven working) with its fixture, for edge case 29 / R3.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: `TestClaudeVersion_FirstFailedCheckTellsTheManagerThatInstalledIsUnknown` (edge case 13; protocol: `behind` true only while `claudeCode.installed` is non-null). Before: `go test ./internal/server -run FirstFailedCheck` failed with `behind` and `restartPending` still true.

**Changes made**: `internal/server/claudeversion.go` only. `tick` told the manager only `if changed`; the held initial value is already "unknown", so a first failed check (or a first tick with an unresolvable binary) never reached `SetInstalledClaude`, and the reloaded pending mark kept `behind: true` beside `installed: null` and stayed `IsRestartDue`. New loop-goroutine field `toldInstalled` and a one-line `tellInstalled` helper (sets the flag, calls `onInstalled`). The broadcast stays on change only.

Paths that reach the defect (a daemon start with a reloaded pending mark, installed unknown), and how each closes:
1. First check runs and reports unknown (result equals the initial not-checked value): `changed` false, now `!toldInstalled` tells the manager `nil` once. Closed (the failing test).
2. First tick cannot resolve the binary identity (no claude on PATH, bad `-claude-bin`): no check runs, nothing was ever told. The unresolved branch now tells the manager the held value (`nil`) once if not yet told. Closed; same protocol violation, would have fired a restart at an unknown installed version.
3. First check known: `changed` true, told as before (unchanged).
4. Later changes, repeats, rollbacks: `changed` gates as before; `toldInstalled` is true so no extra call (`TestClaudeVersion_FollowInstalledIsToldEveryChangedResult` still passes: no extra calls on "it fails again").
5. Unresolved after a known result: `toldInstalled` already true, held value kept, manager not re-told (unchanged).
6. Context cancelled during the check: returns before telling, flag unset; the loop is stopping.

**Blast radius**: `rg 'followInstalled|onInstalled|SetInstalledClaude' --glob '!*_test.go'` consumers: `server.go:230` (wires `s.manager.SetInstalledClaude`; now also receives one call on a first unknown/unresolved tick: with no sessions it is a no-op, with sessions it clears `behind` and the mark in one upsert each, as `SetInstalledClaude(nil)` already does), `renderfix_scenarios_restart.go:35` (calls the manager directly; untouched), `claudeversion.go` (the feature itself). `SetInstalledClaude(nil)` also sets `installedChecked`, so a status post after a first failed check now settles `behind` false instead of holding the reloaded mark; that is the intended end of the "held until first result" window.

**Re-run**: `go test -race -count=1 -run 'FirstFailedCheck|FollowInstalled|ClaudeVersion|TestNew_' ./internal/server` -> `ok`. Full `internal/server` without `-race`, skipping `TestHandleTerminal*|Wrapper*`: `ok 204s`; `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` timed out in the full run under machine load (load average 13-18) and passes alone (`ok 10.4s`). A full `-race` run of the package hit the 600 s ceiling under the same load (`locate_test.go` goroutines blocked); `-run Locate` alone under `-race` is `ok 33.8s`. `make lint`: 0 issues. `gofmt -l .` empty.

**Decisions**: design: `toldInstalled` sits beside `haveSeen`/`unresolved` (loop goroutine alone, no guard needed); `tellInstalled` keeps the flag and the nil-check of `onInstalled` in one place so the two tell sites cannot drift. No `deviation:`. doc-delta: the earlier line on "a pending mark persists across a daemon restart … before the first check no clearing happens" is now bounded by the first tick (check result or unresolved binary), not only by a completed check.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: user Decision 1 (Option B, pending marks held until the installed version is known); code Major 1 (stale `store-schema` diagram); maintainability Major 1 (second batch runner in `internal/server/restart.go`); maintainability Minor 1 (`followInstalled` setter), Minor 2 (`statusLineFullPayload` funlen), Minor 3 (missing `design:` lines for `RestartClass`, `LeadingVersion`, `OlderVersion`).

**Changes made**:

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/session.go` | modified | unexported `restartHeld`: a mark reloaded from the store, off the wire, never due |
| `internal/session/manager.go` | modified | `LoadAll` moves the reloaded mark into `restartHeld` (`RestartPending` false, `ClaudeBehind` false); the old "seed `ClaudeBehind` from the mark" line is gone |
| `internal/session/restart.go` | modified | `settleClaudeBehindLocked` resolves a held mark on the first result (behind: `RestartPending` true; not behind, unknown or dead: dropped) and reports `changed` so the store is rewritten; `clearClaudeVersion` clears the hold |
| `internal/session/row.go` | modified | `restart_pending` is written as `RestartPending \|\| restartHeld`, so a crash before the first result keeps the mark |
| `internal/session/writeorder.go` | modified | `restartHeld` restored on a failed write and listed in `restoredSessionFields` |
| `internal/session/actions.go` | modified | `RunBatch` (exported) is the one loop for End, Remove and Restart; `BatchOutcome` (`BatchDone`/`BatchQueued`/`BatchSkipped`), `BatchResult.Queued`; `runBatch` is now a three-line adapter |
| `internal/server/restart.go` | modified | the handler calls `Manager.RunBatch`; own sort-and-compact, own `LockSession`, own outcome enum, own bucket loop and own three-list wire type deleted; `installedKnown` replaces the Start-time sweep |
| `internal/server/sessionwire.go` | modified | `restartBatchWire` embeds `batchWire` and adds `queued` |
| `internal/server/actions.go` | modified | `writeBatchError` is a function taking the logger, so the restart handler maps `ErrInvalidOrder` to the same 400 |
| `internal/server/claudeversion.go`, `server.go` | modified | `newClaudeVersionFeature` takes `onInstalled` in its constructor; `followInstalled` deleted; `server.go` passes `s.restart.installedKnown` |
| `docs/diagrams/store-schema.md` | modified | summary, prose and the `session` entity show 0019 (`claude_version`, `restart_pending`) |

Render fixtures: `go run -tags renderfix ./tools/renderfix check` -> `render fixtures up to date (110 scenarios)`; no scenario's output changed (the rig sets the installed version before it restarts anything, so its marks never sat held).

**Decision 1, paths that reach the defect (a reloaded mark visible or fired before the installed version is known) and how each closes:**
1. Start: `LoadAll` no longer sets `ClaudeBehind` or `RestartPending` from the row; the mark is `restartHeld`. The wire carries `behind: false`, `restartPending: false`; `RestartDue` and `restartDue` (the `broadcast` offer) read `RestartPending`, so nothing is due.
2. Status post before the first result: `settleClaudeBehindLocked` returns early (`!installedChecked`), so the hold stays and `behind` stays false; the store write that post causes still writes `restart_pending = 1`.
3. A manual restart or queue request before the first result: `ClassifyRestart` and `SetRestartPending` read `ClaudeBehind`, false, so a batch skips the id.
4. First result known and still behind: `restartHeld` becomes `RestartPending`, `ClaudeBehind` true, one upsert; `broadcast` offers `restartDue` and `installedKnown`'s sweep enqueues every free marked session. First result known and not behind, or `nil` (failed check, Fix Attempt 1 path 1), or an unresolvable binary on the first tick (path 2): the hold is dropped and persisted as 0.
5. Death or launch/resume while held: `clearClaudeVersion` clears the hold with the mark.
6. Failed store write: `restartHeld` is in the restore list and the coverage list.
7. A mid-run `LoadAll` once the result is known (the render rig's `markDead`): the same settle runs at the end of `LoadAll` and resolves the hold at once.

**Blast radius**: `rg -n 'RestartPending|ClaudeBehind|installedChecked|restartHeld' internal cmd -g '!*_test.go'` consumers: `row.go` (write), `manager.go` LoadAll (the one setter), `restart.go` (settle, classify, `SetRestartPending`, `restartDue`), `apply.go:158` and `status.go:68` (settle and wire-change comparison; held state changes nothing there), `writeorder.go` (restore), `sessionwire.go:182-185` (wire reads `RestartPending`/`ClaudeBehind`, both false while held). `rg -n 'runBatch|BatchResult|writeBatchError'`: `EndMany`/`RemoveMany` (via the adapter, behaviour unchanged), `groupops.go:204` (`BatchResult{Done: members}`, unchanged), `toWireBatch` (ignores `Queued`), the two batch handlers in `actions.go` (same 400/500 mapping through the function form).

**Re-run (the reviewer's repro is Decision 1's contradiction and the daemon-restart journey)**: `make e2e SPECS=e2e/claude-restart.spec.ts` -> `9 passed (11.8s)`, including `:324` "a pending restart survives a daemon restart and still fires when the session becomes free (REQ-2, REQ-6, REQ-9, D10)". `go test -race -count=1 -run 'Batch|EndMany|RemoveMany|FieldCoverage|Group.*Delete|DeleteGroup|WriteOrder|Persist' ./internal/session` -> `ok 46.0s`. `go test -race ./internal/claudecode/...` -> ok. With a temporary shim for the changed constructor (reverted; no test file is modified), `go test -run 'Restart|ClaudeVersion|TestNew_|Batch|EndSessions|RemoveSessions' ./internal/server` passed everything except the three held-mark fixtures listed in the Handoff.

**Decisions**:
- design: held mark is `Session.restartHeld`, an unexported bool beside `RestartPending`, not a manager-side map: it clones with the session, is restored by the same `restoreIfUnchanged` list, is cleared by `clearClaudeVersion` where every other restart field already is, and is persisted through the existing `restart_pending` column (`RestartPending || restartHeld`), so no migration and no second store. `rg -n 'held|Held' internal/session -g '!*_test.go'` found nothing to reuse. Writers: `LoadAll` (sets), `settleClaudeBehindLocked` (resolves), `clearClaudeVersion` (clears), all under `Manager.mu`.
- design: the first-result release is `settleClaudeBehindLocked`'s job, so a status post, `SetInstalledClaude` and `LoadAll` resolve a hold in one place. `restartFeature.installedKnown` (`SetInstalledClaude` then enqueue `RestartDue`) is the start sweep's new home; the manager's upsert callback already enqueues each session the release turns pending, so the sweep states it explicitly and keeps `RestartDue` the single question "who is due".
- design: `session.Manager.RunBatch` (exported) is the one owner of repeated-id refusal, per-id lock and done/queued/skipped/failed bucketing, generalising `runBatch` (`rg -n 'hasRepeat|ErrInvalidOrder|LockSession' internal -g '!*_test.go'` found the three rules there). It stays in `session` because `hasRepeat` and the lock live there; the restart op needs the launcher and terminals, so it is passed in as the closure, not moved. `BatchOutcome` carries what a nil-error op did (`Done`/`Queued`/`Skipped`); an error still decides skipped (`ErrUnknownSession`, `ErrSessionNotAlive`) or failed. The restart wire reuses `batchWire` by embedding and adds `queued`; JSON key order is `done, skipped, failed, queued` (the protocol example lists `queued` second; keys are unordered). The restart failure log now comes from `RunBatch` at error level (it was warn).
- design: `newClaudeVersionFeature` takes `onInstalled` as a constructor argument like `newGroupsFeature(…, actions.teardownRemoved, …)` and `newIssueFeature(…, claudeVersion.Current, …)`; `s.restart` is registered before it, so no ordering cycle. `followInstalled` is deleted.
- design: `session.RestartClass` (`RestartSkip`/`RestartQueue`/`RestartNow`) from `Manager.ClassifyRestart`: the decision "skip, queue or run now" reads `ClaudeBehind`, `ClaudeSessionID` and the free rule, all `Manager.mu` state, so it is answered under the manager's lock in one call; the server's `restartOne` only switches on it and acts. A bool pair would let a caller ask the two questions at different instants. Nothing existing classifies a session for an action (`rg -n 'func \(m \*Manager\) Classify' internal` found none); the free rule itself is `restartFree`, shared with `restartDue`.
- design: `claudecode.LeadingVersion` and `claudecode.OlderVersion` are the boundary package's new public surface, both thin wrappers over the existing `parseSemver`/`compareSemver` in `version.go`: `LeadingVersion` for the status line's `version` (the leading major.minor.patch, which `session` must not parse), `OlderVersion` for the one comparison `session` needs. Format knowledge stays in `internal/claudecode`; `session` holds opaque strings.
- Size: `internal/claudecode/claudecodetest/statusline.go` `statusLineFullPayload` is 42 > 40 statements (40 on main). The function is a flat run of default-then-assign, one block per `StatusLineFullOpts` field, with the payload assembled at the end; the new `Version` branch is one more field of that shape. Splitting would move field defaults away from the one place that lists them, and a test-fixture builder is not logic to read in pieces. Kept.
- REQ-6 as amended by plan.md and the proposed ADR `restart-pending-marks-held-until-installed-known`: implemented; a queued restart after a daemon restart waits for the first installed result (30 s at most).
- doc-delta: `docs/protocol.md` `restartPending`/`claudeVersion.behind` need no change (contract unchanged: both stay false until the first installed result). The lifecycle/actions text should say a pending mark reloaded at daemon start is held daemon-side, off the wire, until the first installed-version result: still behind then becomes pending and a free session restarts at once; not behind, unknown or an unresolvable binary on the first tick drops it. This replaces the earlier doc-delta lines about "a pending mark persists across a daemon restart ... before the first check no clearing happens" and about a start sweep after reconcile, both now wrong.
- doc-delta: `docs/diagrams/store-schema.md` is updated in this commit; `kb:diagram/daemon-components` and the plan's restart state diagram need no change (no new package or edge).

**Handoff (fix wave)**: `go build ./...` exits 0; `golangci-lint run --tests=false ./...` -> `0 issues.`; `gofmt -l .` empty. `make lint` is blind here (test files do not compile, see below), hence the `--tests=false` run.

Sanctioned breakage, for the test agent (all from Option B or from the constructor change; no test file edited by me):
- `internal/server/claudeversion_test.go:130` and `:547`: `newClaudeVersionFeature` takes `onInstalled` before the logger (pass `nil`). `internal/server/restart_installed_test.go:35, 68, 98, 119, 135`: `followInstalled` is gone; pass the callback to the constructor (`calls.record`, `h.mgr.SetInstalledClaude`). The package does not compile until these are repaired.
- `internal/server/restart_installed_test.go` `TestClaudeVersion_FirstFailedCheckTellsTheManagerThatInstalledIsUnknown` (`:66`) and `TestClaudeVersion_UnresolvedBinaryOnFirstTickClearsAReloadedPendingMark` (`:117`): the fixture asserts the reloaded row is `RestartPending` before the first result; it is held now (`restartPending: false`, `behind: false`). Assert the hold through the store (`restart_pending = 1`) and the cleared mark after the tell.
- `internal/server/restart_test.go` `TestRestartStart_SweepsTheFreePendingSessionsOnceAfterADaemonRestart` (`:658`): `Start` no longer sweeps; the sweep is `installedKnown`'s, run on the first installed result. Drive it with `h.feature.installedKnown(ctx, &installed)`.
- `internal/session/restart_invariants_test.go` `TestRestartInvariants_EveryInputFromEveryState` (`:194`, `:256`) and `TestLoadAll_ReloadsTheRestartStateAndSweepsTheFreePendingOnes` (`:340`, `:373-374`): a reload now yields `RestartPending false, ClaudeBehind false` for a stored mark until `SetInstalledClaude` runs; the store column still holds the mark. `internal/session/restart_test.go` `TestRestartDeath_ClearsVersionAndMarkAndNothingRefillsThem`, `TestRestartLaunchAndResume_ClearVersionAndMark`, `TestSetRestartPending_MarksAndUnmarksWithOneUpsertPerChange` and `TestSetInstalledClaude_ClearsThePendingMarkInTheUpsertThatTurnsBehindFalse` failed in the same run from the same reload shape (measured: `the store holds the mark`, `a held mark is behind until the installed version says otherwise`).
- New tests needed: held mark stays off the wire and undue before the first result; first result known-behind releases and fires a free session; not behind, unknown and an unresolvable first tick drop it; death while held; a status post before the first result keeps the store column; `RunBatch` outcomes (`Queued` bucket, repeated id) and the restart handler's repeated-id 400 through it.

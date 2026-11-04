# Correctness review: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 74822 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `claudecode.InterpretStatus` reads `version` through `LeadingVersion`; `adoptClaudeVersion` sets it only on an alive row | Yes: `TestInterpretStatus_Version*`, `TestApplyStatus_ClaudeVersionAdoption` (D1) | pass |
| REQ-2 | Yes: `clearClaudeVersion` in `RecordLaunch`, `RecordResume`, `markEnded` (every death goes through `checkOneLiveness` to `markEnded`); `/clear` rebind does not touch it; `LoadAll` reloads it | Yes: `TestRestartDeath_*`, `TestRestartLaunchAndResume_*` (D2); E2E daemon-restart journey | pass |
| REQ-3 | Yes: `settleClaudeBehindLocked` on status post and `SetInstalledClaude`; `followInstalled` wiring with the first-tick tell | Yes: `TestClaudeBehind_*` (D3), `TestSetInstalledClaude_*` (D4), `restart_installed_test.go` | pass, see Decision 1 for the start-up window |
| REQ-4 | Yes: `POST /api/sessions/restart` (`internal/server/restart.go`), literal route, always 200, four arrays always present | Yes: `TestRestartSessions_*` (D5, D6, D12); E1, E2, mixed batch | pass |
| REQ-5 | Yes: `Manager.broadcast` offers `restartDue`; queue `fire` re-checks `IsRestartDue` under the session lock | Yes: `TestRestartQueue_*`, `TestRestartDue_*` (D7, D8); E2E | pass |
| REQ-6 | Yes: `restart_pending` column (0019), `LoadAll` seeds, `restartFeature.Start` sweeps after `Reconcile` (`Server.Start` order verified) | Yes: `TestLoadAll_ReloadsTheRestartState*`, `TestRestartStart_*` (D10); E2E daemon-restart journey | pass, see Decision 1 |
| REQ-7 | Yes: `renderNotice` button, `restartnotice.ts` label, `restartpanel.ts` | Yes: W1/W2 Vitest, R1/R2, E1 + keyboard journey | pass |
| REQ-8 | Yes: `restartdialog.ts` two `<details open>` sections, rows as of opening | Yes: W3, R3/R4, E1, mixed batch, edge-28 journey | pass |
| REQ-9 | Yes: `claude ↻N queued`, panel queued list, no cancel | Yes: W2, R5, E2, mixed, Ignore-with-pending | pass |
| REQ-10 | Yes: `muster.claude-restart-ignored` in session storage keyed by installed; pending shown regardless | Yes: W4, E3, Ignore-with-pending | pass |
| REQ-11 | Yes: `min-width: calc(18ch + 4px)` in every shape; only neutral tokens, the one amber is each surface's `.btn.key` | Yes: R1 width at 4 viewport widths, R7 computed colours | pass |
| REQ-12 | Yes: `notice.disabled = !frame.connected`; panel closed on `status` and in the render phase | Yes: R6 (two tests) | pass |
| REQ-13 | Yes: `restartConfirmLabel` | Yes: W3, R3, E1 (`Restart 2`), E2 (`Queue 1`), mixed (`Restart 1, queue 2`) | pass |
| DIAG | `kb:diagram/store-schema` (stale: 0019 missing), `kb:diagram/daemon-components`, `kb:diagram/web-components`, `kb:diagram/containers`, `kb:diagram/one-launch-end-to-end`; plan `## Diagrams` state diagram | — | fail (Major 1) |

## Build & Tests

E2E tests: fail (331 run: 330 passed, 1 failed, scoped to 37 files) · Daemon tests (race): fail (`internal/server` and `internal/session` hit the 10 m package timeout; every other package ok) · Web tests: pass (3140) · Daemon build: pass · Web build: pass · Lint: pass — all read from `$GATES_LOG_DIR` (`/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-restart-latest-claude-c1`)

Gate lines: `build` pass · `test` (`make test-race`) **FAIL** · `lint` pass · `web-build` pass · `web-test` pass · `render-fixtures` pass (110 scenarios) · `render-lint` pass · `render-test` pass (441) · `web-lint` pass · `contrast` pass (0 failures in 3 themes) · `features-inventory` pass · `versions` pass · `e2e-honest` pass · `kb-check` pass (0 problems) · `e2e-lint` pass · `features` pass · `comments` pass · `comment-ledger` pass (15 kept) · `size` WARN (review-maintainability's) · `e2e-level` WARN (census of pre-existing specs only; no `claude-restart` test flagged) · `e2e` **FAIL**.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (ran on its own, `22-D1.log`: every package ok, `internal/server` 142.9 s, `internal/session` 84.5 s) |
| D2 | `go build ./...` | pass (deduped to `build`) |
| D3 | `make lint` | pass (deduped to `lint`, 0 issues) |
| D4 | `make check-render-fixtures` | pass (deduped to `render-fixtures`) |
| D5 | `make check-kb` | pass (deduped to `kb-check`) |
| W1 | `make web-build` | pass (deduped to `web-build`) |
| W2 | `make web-test` | pass (deduped to `web-test`, 3140 tests) |
| R1 | `make render-test` | pass (deduped to `render-test`, 441 passed) |
| E1 | `make e2e` | FAIL (the scoped e2e gate: `e2e/cache-warmth.spec.ts:204` — Critical 2) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL — #88 is still open in `TODO.md:63` and not moved to `docs/history/todo-done.md`; the Doc Delta lacks four log `doc-delta:` claims (Major 2) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | Status line `version` key and its parsing only in `internal/claudecode/` | pass | `statusPayload.Version` + `LeadingVersion` in `internal/claudecode/status.go`/`version.go`; `internal/session` sees only `StatusUpdate.Version *string` and calls `claudecode.OlderVersion`; `rg` over changed non-test files outside `internal/claudecode` for `"version"`/`json:"version"`/hook field names finds only pre-existing SQL column names and comments |
| V2 | No `any` in new web code | pass | `rg '\bany\b'` over added lines of `web/src` (non-test), `web/e2e`, `web/render`: no hit |
| V3 | Restart reuses Stop and Resume, no second copy | pass | `restartLocked` = `manager.EndLocked` (the private `endLocked` renamed in place, also used by `End`, `EndMany`, `removeLocked`) + `terminals.closeSession` (as `handleEndSession`) + `launcher.ResumeLocked` (body extracted from `Resume`, which now locks and calls it) |
| V4 | Queue-fired failure logged at warn with session id, no payload | pass | `restart.go` `fire`: `f.log.Warn().Err(err).Int64("session_id", id).Msg("queued restart failed")`; the error is an `EndLocked`/`launchError`, no hook or status text reaches it; `TestRestartSessions_FailedHalves` asserts no `prompt` in the log |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass — no new `capture-pane` use; the version comes from the status line |
| 3 | Blocking hook handler | pass — no ingest change; `onRestartDue` only appends to a slice and does a non-blocking send on a capacity-1 channel |
| 4 | Bare tmux | pass — restart goes through the existing `EndLocked`/`ResumeLocked` tmux paths; no new invocation |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass — `claudeVersion` null renders no notice; installed null renders no notice and the readout keeps `claude unknown` |
| 7 | Session identity on `session_id` | pass — queue and pending mark key on the Muster row id; restart resumes the same row and `muster-<id>` |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — E2E uses the stub (`stubClaudeVersion: "2.1.318"`), render scenarios use `claudecodetest`, Go tests use the fake tmux |

## Issues

### Critical
1. **[daemon-tests]** `make test-race` fails: `internal/session` (608.9 s) and `internal/server` (608.6 s) both hit go test's 10 m per-package timeout (`02-test.log:15`, `:331`). Neither dump shows a stuck restart goroutine: session was mid-`TestRestartRemove_OfAPendingSessionLeavesNothingToFire/needs_input` (1 s in), server mid-`TestHandleWS_MultipleClientsEachGetHelloAndSnapshot` (0 s); the only long-blocked goroutines are the pre-existing `buildOversizeLocateRequest` writers. The cause is the run's total length, and this plan's tests are most of the increase. I measured them alone with `go test -race -count=1 -run <the plan's tests>`. The 16 new `internal/session` tests took **389.6 s wall and 749 s user CPU** at load 10 to 12: `TestClassifyRestart_EveryStateAndCondition` 42.4 s, `TestSetInstalledClaude_ClearsThePendingMarkInTheUpsertThatTurnsBehindFalse` 38.1 s, `TestRestartDeath_*` 33.9 s, `TestRestartDue_Fires*` 14.8 s, and `TestRestartInvariants_EveryInputFromEveryState`'s 481 parallel subtests take most of the rest. The 18 new `internal/server` tests took 39.9 s at load 20. The non-race `make test` (D1) is green, so this is cost, not correctness. Required: the gate's `make test-race` finishes both packages inside the 10 m timeout, and the D3/D4/D5/D9 crossings keep every starting condition and input they cover now. Cut the per-cell setup cost (e.g. one store and manager per table, not per cell), not the crossed rows. Re-measure `internal/server` once session's CPU share drops; if it still times out, it is the same owner's.
2. **[e2e-specs]** Scoped e2e gate red: `e2e/cache-warmth.spec.ts:204` "a changed cache is broadcast as exactly one session upsert…" got 7 upserts where it expected 6 (`21-e2e.log:474-489`). The failure is deterministic and caused by this plan, but the daemon matches the contract. `helpers/cache-warmth.ts:94-97` writes `payload.version = "2.1.296"` only on posts that carry a cache. The final `postStatus(..., null)` therefore carries the builder's default `version: "2.1.233"` (`helpers/payloads.ts:654`). That changes `claudeVersion.running`, and REQ-1/D1 require exactly one upsert for that change. I triaged it against the approved protocol delta (kb:lesson/concurrent-build-invalidates-running-e2e: "pre-existing specs asserting the old way are the E2E agent's too"). The tagging rule's default for a spec this plan did not author is an impl tag, but neither impl agent can fix this without breaking D1. The fixture is also unrealistic: one process never changes its version mid-life (kb:fact/running-session-version-sources). Required: every status post one session receives in this test reports the same `version`, and the test still asserts exactly one upsert for a changed cache and none for an absent one. Process gap: the plan's "Existing tests this breaks" list omitted `cache-warmth.spec.ts`, and E2E Validate ran `claude-restart.spec.ts` only (`E2E Scope: new-specs`), so nothing before the gate ran the spec against the new key. The full Completion sweep should also be watched for other specs that mix `effort.ts`'s `2.1.300` with default-version posts while counting upserts.

### Major
1. **[daemon-impl]** Stale diagram: `kb:diagram/store-schema` (`docs/diagrams/store-schema.md`) still says "final shape after migrations 0001-0018", and its `session` entity lacks 0019's `claude_version TEXT` and `restart_pending INTEGER NOT NULL DEFAULT 0`. `kb for internal/store/migrations/0019_restart.sql` names it. Required: the diagram's summary, prose ("0003-0018") and `session` entity show 0019, in the same commit as the code. The other depicting diagrams (`daemon-components`, `web-components`, `containers`, `one-launch-end-to-end`) still hold: no new package or import edge, `Resume` still the launcher's entry. The plan's own restart state diagram matches what shipped.
2. **[orchestrator]** Log `doc-delta:` lines the plan's `## Doc Delta` does not reflect. `doc-reconcile` promotes the delta verbatim, so these would be lost:
   - daemon-impl: lifecycle `## Wire` (`docs/features/lifecycle/spec.md:159-160`, "Status posts refresh title, model, context and Claude's directory") should say a status post also sets `claudeVersion`. Lifecycle is in **Features** but has no Doc Delta block.
   - daemon-impl (both Decisions and Fix Attempt 1): a reloaded pending mark is not settled until the first installed-version tick (check result or unresolved binary). This depends on Decision 1's outcome.
   - web-impl: the connection spec's readout sentence ("keeps one width … the widest realistic version plus its glyph", `docs/features/connection/spec.md:72-75`). In the notice shape the `⚠` glyph now hangs outside the 18ch box instead of inside it. The accepted ADR names no width, so no ADR is affected.
   - The two web-impl lines about globs and `CLAUDE.md` were done in commits `3bfb6e13`/`9fc8103e`, and daemon-impl's `protocol.md` line was done at planning (`abff7884`). Those need nothing.

### Minor
1. **[orchestrator]** Promote `ingest` from **Touches** to **Features** and add an ingest Doc Delta line. The plan adds an ingested signal: the status line's top-level `version` is now read and stored. The ingest spec's "Signals and their sources" table (`docs/features/ingest/spec.md:22-29`) has no row for it. The line should read roughly "Running Claude Code version | the status line's top-level `version`, leading major.minor.patch, read in `internal/claudecode` alone (kb:fact/running-session-version-sources)".
2. **[orchestrator]** The Doc Delta's connection line says the readout reads `claude <oldest>→<installed>`. What shipped, as the plan's Views specify, is `claude <oldest>→<installed patch>` when major.minor match (`claude 2.1.316→318`) and `claude →<installed>` otherwise (`restartnotice.ts` `behindLabel`). Reword the delta before it is promoted verbatim.
3. **[orchestrator]** The **Render fixtures** header names `claude-restart`, `claude-restart-queued` and `claude-restart-down`, but `web/render/restart.spec.ts` also opens `claude-restart-many`. That scenario was added at the orchestrator's request for edge case 29 / R3, and it is generated, not hand-edited. Add it to the header so the header and the spec agree.
4. **[daemon-tests]** `TestRestartSessions_RestartsWithTheLatchedModeAndEffortAndClosesTheTerminal` (`internal/server/restart_test.go:338-340`) skips every leading `alive:true` upsert for the session, after `h.wire.reset()`, before it asserts `[false, true]`. The test log says the source of that upsert was not traced. As written, the test would accept any number of extra upserts the restart emits before the kill. Required: trace the upsert (likely the terminal attach in setup) and either wait it out before `reset()` or assert it by name, so D6's "Stop path exactly as `sessions.end`" upsert sequence is checked exactly.

### Decisions
1. **[orchestrator:user-decision]** The start-up window contradicts the contract. The Protocol Contract says `behind` is "true iff alive AND `claudeCode.installed` is non-null AND running < installed" and `restartPending ⇒ … claudeVersion.behind`. REQ-6 says the pending mark persists across a daemon restart and that a free pending session restarts once reconcile completes. At start the installed version is unknown until the background check returns: up to 30 s, and about 11 s on a newly updated binary (kb:fact/new-claude-binary-first-run-slow-on-macos). Both cannot hold during that window. daemon-impl chose silently, as a `design:` line rather than a `deviation:` line. `LoadAll` seeds `ClaudeBehind = RestartPending` and `settleClaudeBehindLocked` changes nothing until the first `SetInstalledClaude` (`internal/session/restart.go`, `manager.go:LoadAll`). So the wire carries `behind: true` beside `hello.claudeCode.installed: null`, and `restartFeature.Start` restarts free pending sessions before any version is known. The dashboard needs `installed` to draw the notice, so it shows no `↻N queued` during that window. The proposed ADR `restart-behind-means-older-than-installed` ("An unknown installed version makes nothing behind") does not describe this either. This touches the protocol contract, so it is the user's decision.
   - **Option A — keep as shipped and amend the contract.** Until the daemon's first installed-version result, a reloaded pending session keeps `behind: true` with `installed` null and may be restarted by the start sweep. The protocol's `behind` line and the ADR gain that one exception, staged in the Doc Delta. Trade-offs: REQ-6 holds as written, with no wait on a `--version` that can take about 11 s; no new code. The wire breaks its own `behind ⇒ installed non-null` for up to 30 s, and the masthead shows `claude unknown` with no queued notice while a restart may fire.
   - **Option B — keep the contract and reword REQ-6.** Reloaded pending marks stay off the wire (`restartPending: false`, `behind: false`) and are held daemon-side until the first installed result. That result re-derives them, and the start sweep runs on it rather than right after reconcile. Trade-offs: both invariants hold at every instant, and no restart fires at an unknown version. A queued restart after a daemon restart is delayed by the check (worst case 30 s). It needs a new held-mark state in the manager and new tests. An unresolvable binary on the first tick drops the queue, which is already true today (Fix Attempt 1, path 2).

### Notes
1. **[note]** `statusWireChanged` (`internal/session/status.go`) compares `ClaudeVersion` and `ClaudeBehind` but not `RestartPending`. This is correct today only because a status post clears the mark in the same step that flips `behind` from true to false. That is review-maintainability's guard question if it wants it.
2. **[note]** The panel and dialog sentences use the singular for one session ("1 live session runs … picks it up"). This is a grammar-only departure from the plan's plural text, logged by web-impl. The plural is unchanged.
3. **[note]** In the notice shape the version-warning glyph is absolutely positioned left of the readout box (`.claude-notice ~ .version-warn`). Whether it overlaps the Settings control at every width is review-browser's to measure.
4. **[note]** Repairs honesty: rows 1 to 5 of `test-specs.md`'s `## Repairs` were read against `web/e2e/helpers/claude-restart.ts`. Each still verifies its requirement: the section locator now resolves, and the vacuous `toHaveCount(0)` was proven red. Pane identity uses `pane_id/pane_pid`, and a tmux error or empty fields mean "not alive yet". The final assertions (`claudeVersion` null, `restartPending` false, a new real pane) are unchanged. No assertion was weakened, and the status post's `version` is a measured key.

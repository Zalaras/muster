# Review: restart-latest-claude

**Plan**: restart-latest-claude
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 2 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Restart Latest Claude

**Plan**: restart-latest-claude
**Part verdict**: needs-changes
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

## Browser review

# Browser review: Restart Latest Claude

**Plan**: restart-latest-claude
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14061 words (budget 30000)
**Rig**: `make web-build build` at 18a79b48 (`v0.27.3-28-g18a79b48-dirty`, dirty = orchestration-state.json only); per-test scratch `bin/musterd` from `helpers/fixtures.ts` on `$TMPDIR/muster e2e-55a1b6f1-*` (space-bearing data dir), private `-tmux-socket` at `<data dir>/tmux.sock` (removed by the fixture's teardown, `kill-server` included), harness stub `claude` answering `--version` with `2.1.318` (one test with `stubClaudeVersionFails`); headless Chromium 1280×900 (one cell at 900×700). Throwaway spec deleted; no daemon or scratch dir left behind.

Gates log read (not re-run): `21-e2e.log` is red on `e2e/cache-warmth.spec.ts:204` (7 upserts where 6 were expected); `02-test.log` timeouts. The `web-build` line is green, so the dashboard driven here is the one that ships.

Installed `2.1.318` is above the verified range on this tree, so the readout always carried the `⚠` glyph. That is the realistic case: the auto-updater installs a version newer than the verified range and leaves sessions behind. Every cell below was measured with the glyph present.

## Matrix

Hosts: **focus** and **tiles** (the masthead is shared, so the readout, panel and dialog were measured in both views). The **pop-out** (`/doc.html`) has no `#claude-version` and no masthead, so every pop-out cell is N/A: the plan gives the surface no pop-out host.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| States: no data | focus | no data (no sessions) | plain readout, no notice | pass | `#claude-version` text `claude 2.1.318 ⚠`, no `<button>`; box 1104.72–1242 (w 137.28) |
| States: no data | focus | no data (session on installed version) | not behind → no notice | pass | wire `{running:"2.1.318",behind:false}`; readout plain, w 137.28 |
| States: no data / Edge 13 | focus | no data (installed unknown) | no notice; `claude unknown` | pass | stub `--version` fails; session posts 2.1.200 → wire `behind:false`; readout `claude unknown`, no button, no glyph, w 137.28 |
| REQ-7 | focus | data | readout is a button: oldest→installed patch | pass | button `aria-label="Claude Code update"`, text `claude 2.1.316→318` (sessions on 2.1.317 ×3 and 2.1.316) |
| REQ-7 / Edge 32 | tiles | data | cross-minor label | pass | session on 2.0.9 → `claude →2.1.318` |
| REQ-7 | focus, tiles | data | neutral dot visible | pass | `.update-dot` display block, opacity 1, bg `rgb(178,182,195)`, 6px, box 1243,12.5 6×6; clear of the health dot (1249 < 1250) |
| REQ-11 | focus, tiles | no data / data / queued / ignored / down | readout keeps one width | pass | host w 137.28 and right edge 1242 in all 8 states measured; Settings x 1018.53 and health dot x 1250 unchanged throughout |
| REQ-11 | focus, tiles | data / queued | glyph clear of neighbours | FAIL | in the notice shape the `⚠` box is 1093.31–1100.72 and Settings is 1018.53–1096.72, so they overlap by 3.41px; `elementFromPoint` at x 1094.3 returns the glyph, which sits on top of Settings' right edge (Minor 1) |
| REQ-11 / R7 | focus | data | readout uses neutral tokens only | pass | computed color/bg/border/outline audit against `--amber`/`--rose`/`--violet`: 0 hits |
| REQ-7 | focus | data | panel anchored under the readout, right-aligned | pass | panel 862–1242 × 33.5–212.84; right edge = readout right 1242; top below readout bottom 29.5; inside 1280×900 |
| REQ-7 | tiles | data | panel anchored, right-aligned | pass | panel 862–1242 × 33.5–212.84 (15 sessions) |
| REQ-7 | focus | data | panel content | pass | head textContent `Claude Code 2.1.318`; intro `4 live sessions run an older version and pick it up only when restarted.`; rows `Restart now`/`2`, `Restart when free`/`2` (separate spans); Ignore and Restart… display block, opacity 1, visibility visible |
| REQ-7 / R7 | focus | data | panel neutral except one `.btn.key` | pass | token audit: only hits are `#restart-open-button.btn.key` bg and border = amber |
| Panel close | focus | data | Escape closes and restores focus | pass | after Escape the panel is `display:none` and activeElement is the notice button |
| Panel close | focus | data | outside click / second click closes | pass | `display:none` after a click at 640,600, and again after a second click on the readout |
| Keeps focus | focus | data | keyboard focus survives render ticks | pass | Enter on the button → `#restart-open-button`, the same after 1.5 s; Shift+Tab → `#restart-ignore-button`, the same after 1.5 s |
| Hidden | focus | data / queued | `[hidden]` parts are `display:none` | pass | `#restart-panel-queued` none (data); `#restart-panel-behind` none (queued-only); `#restart-panel` none when closed |
| REQ-8 | focus | data | dialog named, two open sections, rows with reasons | pass | dialog `Restart sessions on Claude Code 2.1.318`; `<details open>` ×2, summaries `Restart now · 2`, `Restart when free · 2`; rows `rb-a-idle`/`idle`, `rb-c-working`/`working`, `rb-d-bgtask`/`idle · 1 background task` in separate spans |
| REQ-8 | focus | data | dialog placement | pass | dialog 380–900 (w 520) × 275.66–624.34, centred, inside the viewport; panel closed (`display:none`) while it is open |
| REQ-8 / R4 | focus | data | sections collapse independently (pointer) | pass | clicking summary 0: ul0 `checkVisibility()` false, ul1 true, list box 96→68 px, dialog 312.7→284.7; both collapsed 40 px; re-expand restores |
| REQ-8 / R4 | focus | data | sections toggle by keyboard | pass | Enter on summary 1 → `[open,closed]`; Space → `[open,open]` |
| Keeps focus | focus | data | dialog focus across a tick | pass | `#restart-cancel-button` at open and after 1.5 s |
| REQ-13 | focus | data | confirm label states the mix | pass | `Restart 2, queue 2`; tiles `Restart 11, queue 4` |
| R7 | focus | data | dialog neutral except one `.btn.key` | pass | token audit: only hits are `#restart-confirm-button.btn.key` bg and border = amber |
| REQ-8 | focus | data | confirm posts the listed ids; free ones come back resumed | pass | POST ids `[2,3,4,5]` → `{done:[2,3],queued:[4,5],skipped:[],failed:[]}`; tmux pane identity replaced for 2 and 3, wire alive, `claudeVersion:null`, `restartPending:false`; cards `s-idle` (settled after 1.5 s) |
| Edge 29 / R3 | tiles | data (15 sessions) | list box scrolls at 280px, both summaries reachable | pass | `.rscroll` h 280, `overflow-y:auto`, scrollHeight 328 > clientHeight 278; mouse wheel → scrollTop 50 (max); scrolled to the end, `Restart when free · 4` summary at 495–514 inside the box 317–597 |
| Edge 29 | tiles | data | long titles contained | pass | 45-char titles: span scrollWidth 333 = clientWidth 333; li 472 wide; dialog 520 |
| Edge 28 | tiles | data | a session ends while the dialog is open → its row stays, daemon decides | pass | `POST /end` on one listed session; after 1.2 s the dialog is unchanged; confirm → `skipped:[2]`, 10 done, 4 queued |
| Action-error line | tiles | data | skipped is reported there | pass | `#action-error` visible (display block) at 0,59.34 1280×32: `Not every session was handled — some were skipped or failed.`; hidden after a clean batch in focus |
| §7.1 one live client | focus | data | after a restart, one client per session | pass | tmux `list-clients` before and after: `{muster-1:1}`; 1 `.xterm` |
| Edge 25 / §7.1 | focus | data | the focused session restarts; its terminal reattaches once | pass | focused `rb-g-focused` restarted (`done:[1]`); tmux clients before `{muster-1:1}`, after `{muster-1:1}`; 1 `.xterm` |
| §7.1 one live client | tiles | data | after a 10-session restart, at most one client per session | pass | before `{muster-1..4:1}`; after `{muster-1:1,muster-3:1,muster-4:1}` (muster-2 was the ended one); 3 `.xterm` |
| REQ-9 | focus | queued | label `claude ↻N queued` | pass | `claude ↻2 queued`, w 137.28; tiles `claude ↻4 queued` |
| REQ-9 | focus | queued | panel lists pending sessions, no buttons, no cancel | pass | `#restart-panel-behind` display none; heading textContent `Restart when free · 2` (one text node); rows `rb-c-working`/`working`, `rb-d-bgtask`/`idle · 1 background task`; visible buttons in the panel: `[]`; focus goes to the panel itself and holds for 1.5 s |
| REQ-9 / E2 | focus | queued | queue fires on free, readout returns | pass | Stop with 0 tasks on c → restarted, `claude ↻1 queued`; then d → restarted, readout plain `claude 2.1.318 ⚠`, no button |
| REQ-6 | focus | daemon restarted | pending survives a daemon restart in the UI | pass | after SIGTERM and respawn: `claude ↻2 queued`, wire `restartPending:true` for both, enabled again |
| REQ-12 | focus | daemon-down | button disabled, open panel closes | pass | SIGTERM with the panel open: panel `display:none`, button `disabled:true`, color `--disabled-fg` rgb(90,96,112), w 137.28; banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` visible at y 46 |
| REQ-12 | focus | daemon-down | clicking while down opens nothing | pass | forced click → panel stays `display:none` |
| REQ-12 | tiles | daemon-down | — | N/A | the masthead is the same element in both views, and the down state was measured once (focus) |
| REQ-10 | focus | data | Ignore hides the behind part | pass | readout plain `claude 2.1.318 ⚠`, no button |
| REQ-10 / E3 | focus | data | reload keeps hidden; a new page shows it | pass | after reload: plain; new page in the same context: `claude 2.1.317→318` button |
| REQ-10 | focus | queued | pending shows regardless of Ignore | pass | ignored page, after another page queued the session: `claude ↻1 queued` |
| Edge 27 / storage unavailable | focus | data | throwing `sessionStorage` reads as not ignored | pass | getter throws `SecurityError`: notice `claude 2.1.316→318` shows; Ignore still hides the behind part in memory (`claude ↻1 queued` remains for the pending one); 0 page errors |
| Keeps focus | focus | data | focus after Ignore | FAIL | after Ignore by pointer, activeElement is `<body>`: Ignore restores focus to the notice button, which the next render removes, so the keyboard position is lost (Minor 2) |
| REQ-11 | focus | narrow (900×700) | readout and panel at a narrow width | note | see Note 2 |
| All | pop-out | all | — | N/A | `/doc.html` has no masthead or Claude readout |
| Dialog reasons `failed`, `planning`, `waiting on you`, `starting` | focus | data | reason words | not measured | see Note 3 |

## Issues

### Critical

### Major

### Minor
1. **[web-impl]** In the notice shape the warning glyph hangs outside the readout box and overlaps the Settings button. At 1280×900 with a behind session and installed above the verified range, the `⚠` box is x 1093.31–1100.72 and `#settings-button` is x 1018.53–1096.72, a 3.41px overlap. `elementFromPoint` at the overlapped strip returns the glyph, so it sits on top of Settings' border and takes its clicks there. In the plain shape the glyph sits inside the box (x 1234.6) and touches nothing. `web/src/style.css` `.claude-notice ~ .version-warn`. A fix must make the glyph's box clear of `#settings-button` (with the masthead gap kept), while the readout box keeps its 137.28px width and right edge in every state.
2. **[web-impl]** Ignore drops keyboard focus to `<body>`. When Ignore leaves no notice (no pending sessions), `closePanel(true)` focuses the notice button, and `app.render()` then replaces it with the plain span, so `document.activeElement` is `body`. `web/src/features/restart.ts` `ignore()`. A fix must leave focus on an element in the masthead (or another deliberate target) after Ignore, measured as `document.activeElement !== document.body` once the render has run.

### Notes
1. **[note]** The gate run's red `e2e/cache-warmth.spec.ts:204` gets one extra `sessionUpsert` (7 vs 6) on a status post. That is consistent with a version-bearing post now changing `claudeVersion`, but the spec and the gate are `review-work`'s to rule on. I did not reproduce it.
2. **[note]** At 900×700 the masthead's right cluster already runs past the viewport: the readout box is at x 993.7–1130.98 in a 900px window, `documentElement.scrollWidth` is 900, and the overflow is clipped. The panel is then clamped into the viewport (x 497.98–877.98) instead of under its anchor. This plan widened the box from `17ch + 4px` to `18ch + 4px`, but the masthead overflows below about 1150px with or without that change. I measured only 1280 and 900, and request no change.
3. **[note]** I did not drive the dialog reason words for `failed`, `planning`, `waiting on you` and `starting` in the live rig: it would need StopFailure, plan-mode and permission-prompt sessions per cell. The `claude-restart` render fixture (R2/R3) and the W3 unit criterion cover them.
4. **[note]** The `#restart-dialog-note` hidden state (a dialog with no busy rows) was not opened. Every dialog I drove had busy rows, and the note was visible (display block, 523–574) there. The `.modal.restart [hidden]` rule covers it, and no author `display` rule targets `p.restart-note`.
5. **[note]** The token audit ran in the default (dark) theme only.
6. **[note]** When behind and pending sessions coexist, the readout shows the behind label (`claude 2.1.316→318`), and the queued count appears only inside the panel. That matches the plan's Views, which keep `↻N queued` for "only pending sessions".

## Maintainability review

# Maintainability review: Restart Latest Claude

**Plan**: restart-latest-claude
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 23938 words (budget 30000)
**Scope**: 39 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | (generated trailer only) | n/a | none | pass |
| internal/claudecode/claudecodetest/statusline.go | statusline.go's own builders | no | funlen `statusLineFullPayload` 42 > 40 statements, new on this branch (40 on main), no reason | Minor 2 |
| internal/claudecode/status.go | version.go, status.go `interpretEffort`/`interpretPromptCache` | n/a (field) | none | pass |
| internal/claudecode/version.go | version.go `parseSemver`/`compareSemver`/`ClassifyAgainst` | no | none | Minor 3 (reuses `parseSemver`/`compareSemver`: good) |
| internal/server/CLAUDE.md | (generated trailer only) | n/a | none | pass, Note 6 |
| internal/server/claudeversion.go | reporefresh.go, usagepoll.go, server.go constructors | partly (`tellInstalled` yes, `followInstalled` no) | none | Minor 1 |
| internal/server/launcher.go | actions.go | yes (`ResumeLocked` extracted) | funlen `ResumeLocked` 62 > 60 (`Resume` was 92 lines on main); file 628 lines, reason given | pass, Note 5 |
| internal/server/renderfix_scenarios_restart.go | renderfix_scenarios_notes.go, renderfix_scenarios_misc.go:66, renderfix.go:205 | yes (`claude-restart-down` line) | none | pass |
| internal/server/restart.go | actions.go, reporefresh.go, bgloop.go, sessionwire.go, session/actions.go | yes | none | Major 1 |
| internal/server/server.go | (root) | yes | funlen `New` 55 > 40 statements, pre-existing (53 on main) | pass, Note 5 |
| internal/server/sessionwire.go | usagewire.go | yes (`ClaudeBehind` stored so the wire stays free of installed) | funlen `toWireSession` 66 > 60, pre-existing (62 code lines on main) | pass, Note 5 |
| internal/session/CLAUDE.md | (generated trailer only) | n/a | none | pass |
| internal/session/actions.go | railorder.go, writeorder.go | yes (`EndLocked` rename) | none | pass |
| internal/session/apply.go | status.go | yes (`statusWireChanged`) | none | pass |
| internal/session/liveness.go | actions.go | n/a (one clear call) | none | pass |
| internal/session/manager.go | effort.go, repo.go | yes (`installedClaude`, `onRestartDue` in `broadcast`) | file 645 lines, pre-existing, reason given | pass |
| internal/session/restart.go | effort.go, note.go, groups.go, railorder.go, writeorder.go | partly (`SetInstalledClaude`/settle yes; `RestartClass`/`ClassifyRestart` no) | none | Minor 3, Note 3 |
| internal/session/row.go | row.go mapping | n/a | none | pass |
| internal/session/session.go | session.go fields | yes | none | pass, Note 4 |
| internal/session/status.go | status.go `adopt*` | yes | none | pass |
| internal/session/writeorder.go | writeorder.go `restoredSessionFields` | n/a | none | pass |
| internal/store/migrations/0019_restart.sql | 0017_added_dirs.sql, 0018_note.sql | n/a | none | pass |
| internal/store/session.go | store/session.go | n/a | funlen `UpdateSession`, `scanSession` pre-existing (71/70 lines on main); file 558, reason given | pass, Note 5 |
| web/src/api/sessions.ts | api/sessions.ts `endSessions`/`removeSessions` | n/a | none | pass |
| web/src/app.ts | wsapp.ts, app.ts `AppEvents` | yes | none | pass, Note 2 |
| web/src/features/CLAUDE.md | — | n/a | none | pass |
| web/src/features/connection.ts | updaterestart.ts, connectionversion.ts, wsapp.ts | yes | none | pass, Note 2 |
| web/src/features/restart.ts | updaterestart.ts, notes.ts, actions.ts, usage.ts, render/menu.ts, render/confirm.ts | yes | none | pass, Note 7 |
| web/src/features/restartnotice.ts | connectionversion.ts, batchplan.ts, updaterestart.ts | yes | none | pass, Note 1 |
| web/src/features/restartplan.ts | batchplan.ts, actionscopy.ts, sessions/card.ts | yes | none | Major 3, Note 1 |
| web/src/main.ts | (root) | yes | none | pass |
| web/src/protocol/batch.ts | protocol/batch.ts | n/a (extends `BatchResult`: good reuse) | none | pass |
| web/src/protocol/session.ts | protocol/session.ts `parseEffortWarning` | n/a | none | pass |
| web/src/render/CLAUDE.md | — | n/a | none | pass |
| web/src/render/masthead.ts | masthead.ts, effortstrip.ts | yes | none | pass, Note 8 |
| web/src/render/restartdialog.ts | confirm.ts, groupdialogs.ts | yes | none | pass |
| web/src/render/restartpanel.ts | grouppopover.ts, notespanel.ts, effortstrip.ts, railsections.ts, dom.ts | yes | none | Major 2 |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/style.css | `.menu` (4488), `.npanel` (4962), group popover rules | n/a | none | pass |

Shared state (question 3): `restartFeature.mu` guarding `queued` (writers `enqueue`/`next`), `Manager.installedClaude`/`installedChecked` under `mu` (writer `SetInstalledClaude`) and the loop-only `toldInstalled` all name their guard and writers where they are declared. The gate's `make test-race` timed out in both `internal/session` and `internal/server`, so I ran the restart paths under the detector myself: `go test -race -count=1 -timeout 540s -run 'Restart|ClaudeVersion|InstalledClaude' ./internal/session ./internal/server` gave `ok internal/session 388.971s` and `ok internal/server 135.190s`. I traced one interleaving with no lock or ordering bug. The handler classifies `RestartQueue`, then the ingest worker makes the session free before `SetRestartPending`. `SetRestartPending`'s upsert then fires `onRestartDue`, and `fire` waits on the per-session lock, so the restart runs once the handler releases it.

## Issues

### Critical

### Major

1. **[daemon-impl]** The restart batch is a second batch runner beside `session.Manager.runBatch`: `internal/server/restart.go:122-196`. It does its own repeated-id refusal (`:127`, sort and compact), its own per-id `LockSession`, its own mapping of `ErrUnknownSession`/`ErrSessionNotAlive` to skipped and anything else to a warn log plus failed, and its own `restartBatchWire` (`:115`). This breaks conventions § Design "Reuse before add … What it finds is reused or generalised, never copied, whatever Decisions says" and "One owner per concept". `rg -n 'hasRepeat|ErrInvalidOrder' internal -g '!*_test.go'` shows that every other list endpoint already has one owner for these rules: `internal/session/actions.go:132` `if hasRepeat(ids) { return result, ErrInvalidOrder }` in `runBatch` (the loop behind `EndMany`/`RemoveMany`, `:130`, whose `switch` at `:141-148` is the bucketing that `restartNow` re-spells), `internal/session/railorder.go:255` `func hasRepeat(values []int64) bool`, and the 400 mapping in `internal/server/actions.go:143` `writeBatchError`. The wire half already exists as `internal/server/sessionwire.go:247` `type batchWire struct { Done, Skipped, Failed }` plus `toWireBatch`/`nonNil`. The sibling `decodeBatchRequest` also states at `actions.go:131-132` that "A repeated id is the manager's to refuse (writeBatchError)", and this handler contradicts that. The Decisions reason ("`session.hasRepeat` is private and its test file may not be touched, so no export") does not hold: a generalised or exported runner needs no edit to `railorder_test.go`, and the line never mentions `runBatch` at all. A fix must make this true: end, remove and restart share one owner for the repeated-id refusal, the per-id lock and the done/skipped/failed bucketing (generalised so it can carry `queued`), and restart's report reuses the `batchWire` shape instead of re-declaring its three lists. If restart truly cannot share it, Decisions must say why in a reason the code bears out.

2. **[web-impl]** `web/src/render/restartpanel.ts:40` declares a private `function setText(el: HTMLElement, text: string): void { if (el.textContent !== text) el.textContent = text; }`, which is byte-for-byte `web/src/dom.ts:42` `export function setText(el: HTMLElement, text: string): void`. This breaks conventions § Design "Reuse before add". `rg -n 'function setText|export function setText' web/src`:
   ```
   ./dom.ts:42:export function setText(el: HTMLElement, text: string): void {
   ./render/restartpanel.ts:40:function setText(el: HTMLElement, text: string): void {
   ```
   Its render siblings already import the shared one: `render/context.ts:5`, `render/notes.ts:1`, `render/repolines.ts:5` (`import { … setText } from "../dom"`). A fix must make true: `restartpanel.ts` declares no text-write helper of its own.

3. **[web-impl]** `web/src/features/restartplan.ts:35-37` `backgroundTaskReason` re-spells the singular and plural "background task(s)" wording that `web/src/sessions/card.ts:415-419` `backgroundLine` already owns (`n === 1 ? "1 background task" : \`${n} background tasks\``). `card.ts`'s neighbouring doc comments state the rule for these strings: "one source of truth for the word, never a second copy". This breaks conventions § Design "Reuse before add" and "One owner per concept". `rg -n 'background (task|tasks)|"task" : "tasks"' web/src --glob '!*.test.ts'` shows the two spellings: `sessions/card.ts:418` and `features/restartplan.ts:36`. A fix must make true: the restart reason's background-task count phrase comes from the one owner in `sessions/card.ts`, so a wording change there reaches the card line and the restart row together.

### Minor

1. **[daemon-impl]** `internal/server/claudeversion.go:92` `followInstalled(fn)` is a setter called after construction (`internal/server/server.go:230` `claudeVersion.followInstalled(s.manager.SetInstalledClaude)`). It is the only post-construction setter among the server features: `rg -n '^func \(\w+ \*\w+\) (set|follow|on)[A-Z]\w*\(fn' internal/server -g '!*_test.go'` returns only this line. Its siblings take their callbacks through the constructor, for example `server.go:221` `newGroupsFeature(s.manager, actions.teardownRemoved, cfg.Logger)` and `server.go:231` `newIssueFeature(…, claudeVersion.Current, …)`. `s.manager` already exists when `newClaudeVersionFeature` runs, so there is no ordering cycle to explain the setter, and no `design:` line covers it (the Fix Attempt line names `tellInstalled` only). Cites conventions § Design "Match the siblings … constructor, seam … or says in Decisions why it diverges". A fix must make true: the installed-version consumer reaches `claudeVersionFeature` the way its siblings' collaborators do, or Decisions states why it cannot.

2. **[daemon-impl]** `internal/claudecode/claudecodetest/statusline.go:90` `statusLineFullPayload` now trips funlen at 42 > 40 statements. It was at 40 on main, and the new `Version` branch (`:123-125`) pushed it over. Decisions gives no reason (its Size line covers only the three file lengths). Cites kb:adr/process-size-linters-warn-never-fail and conventions § Design "Size is read, not obeyed … fine with a reason in Decisions". A fix must make true: Decisions carries a reason that holds for this builder, or the builder is restructured for a real reason. A split made only to silence the warning does not count.

3. **[daemon-impl]** These new seams have no `design:` line. `internal/session/restart.go` adds the three-way `RestartClass` (`RestartSkip`/`RestartQueue`/`RestartNow`, `:13-19`) with `ClassifyRestart` (`:99`), which is the seam `restartFeature.restartOne` switches on. `internal/claudecode/version.go` adds two exported functions to the boundary package, `LeadingVersion` (`:139`) and `OlderVersion` (`:147`). Decisions explains `SetInstalledClaude`, the settle rule and the queue, but not why a classification enum sits between session and server, or that the version helpers are the boundary's new public surface. Cites conventions § Design "reported in its log's `## Decisions` as a `design:` line per new type, module or seam". A fix must make true: each of these has a `design:` line naming the shape, why, and what it reused (here `parseSemver`/`compareSemver`).

### Notes

1. **[note]** "Free" is spelled out in both tiers: the daemon's `Session.restartFree` (`internal/session/restart.go:21-23`) and the dashboard's `isFree` (`web/src/features/restartplan.ts:18-20`). The same is true of semver ordering: `claudecode.compareSemver` in Go and `compareVersions`/`parseTriple` in `web/src/features/restartnotice.ts:18-29`. No TS helper existed to reuse (`rg 'semver|compareVersion|Triple' web/src` finds only these). But the dialog's "Restart now" and "Restart when free" split is the dashboard's guess at a rule the daemon re-decides at POST time, and "Two places that must agree will not" (§ Design "One owner per concept"). Moving the rule to one side would change the wire, so it is a protocol question for the plan, not a fix here.
2. **[note]** Every other WS-message-to-`app` event mapping lives in `web/src/wsapp.ts` (`prefs`, `groups`, `snapshot`, `claudeTheme`, `update`, `usage`, `shellActivity`). The new `claudeCode` event is the first one emitted from a controller (`features/connection.ts:203,209`), and a reader looking for its source will look in `wsapp.ts` first. Decisions gives a reason for the divergence ("it already receives hello and the push"), so no change is requested.
3. **[note]** `ClassifyRestart` (`internal/session/restart.go:104`, skips unless alive, versioned, behind and bound) and `SetRestartPending` (`:120`, refuses unless alive and behind) state the eligibility rule twice, with different subsets. Today the two agree, because `settleClaudeBehindLocked` never sets `ClaudeBehind` without a version.
4. **[note]** `Session.ClaudeBehind` is derived state that is stored (`internal/session/session.go:219`). Correctness depends on every writer of `ClaudeVersion` or the installed version calling `settleClaudeBehindLocked`: the status post, `SetInstalledClaude`, `LoadAll`, and `clearClaudeVersion` on death, launch and resume. Decisions states the reason (the wire mapping stays free of the installed version), and it holds today.
5. **[note]** Pre-existing size warnings on touched files, not caused by this branch and not asked about: `server.go` `New` (53 statements on main), `sessionwire.go` `toWireSession` (62 code lines on main), `store/session.go` `UpdateSession`/`scanSession`, `launcher.go` `ResumeLocked` (the extraction shrank the 92-line `Resume`), and the three over-500 files, whose reason is given in Decisions. The `restart_test.go`/`restart_invariants_test.go`/`restart_writes_test.go` funlen hits are on test files, not `dupl`, so they are outside this part.
6. **[note]** This one is for review-work (doc truth and DIAG). `internal/server/CLAUDE.md`'s **Owns** line lists the `/api/sessions` route files by feature but not `restart.go`. The `kb:diagram/web-components` features/ count ("45 modules … 18 DOM-free helpers") and its `Rel(features, storage, …)` label (which does not name restart's per-tab Ignore) predate the three new modules.
7. **[note]** `features/restart.ts:83-131` is a third inline outside-pointerdown/Escape dismiss, after `render/menu.ts:170-190` and `features/notes.ts:193-241`. There was no shared helper to reuse, so it matches what its siblings do. It is a candidate for extraction if a fourth appears.
8. **[note]** `render/masthead.ts` `renderNotice` wires `notice.onActivate` only when it first builds the button (`buildNoticeButton`). A later call with a different handler is ignored. That is harmless today because `connection.ts` always passes the stable `deps.toggleRestartPanel`, but it is a surprise for anyone who passes a fresh closure.

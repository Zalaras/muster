# Review: restart-latest-claude

**Plan**: restart-latest-claude
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Restart Latest Claude

**Plan**: restart-latest-claude
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 85937 words (budget 30000)

Full cycle, not a delta: cycle 1 had Criticals, Majors and a user decision. This cycle reviews the
fix commits `047ee06a..a31fba26` against the amended plan (REQ-6 per Option B), and re-confirms the
cycle-1 table against the current tree.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `claudecode.InterpretStatus` reads `version` through `LeadingVersion`. `adoptClaudeVersion` sets it on an alive row only. No change this cycle. | Yes: `TestInterpretStatus_Version*`, `TestApplyStatus_ClaudeVersionAdoption` (D1) | pass |
| REQ-2 | Yes: `clearClaudeVersion` (which now also clears `restartHeld`) runs in launch, resume and `markEnded`. `/clear` keeps the version, and so does a daemon restart (`LoadAll` reloads the column). | Yes: `TestRestartDeath_*`, `TestRestartLaunchAndResume_*`, `TestLoadAll_AHeldMarkDiesWithItsSession`; E2E daemon-restart journey | pass |
| REQ-3 | Yes: `settleClaudeBehindLocked` runs on every status post, in `SetInstalledClaude` and in `LoadAll`. `installedKnown` is wired through the constructor. | Yes: `TestClaudeBehind_*` (D3), `TestSetInstalledClaude_*` (D4), `restart_installed_test.go` | pass |
| REQ-4 | Yes: `POST /api/sessions/restart` goes through `Manager.RunBatch` with `restartOne` (classify, then queue or restart). The response is always 200 with all four arrays (`restartBatchWire` embeds `batchWire` and adds `queued`). | Yes: `TestRestartSessions_*` (D5, D6, D12), `TestRunBatch_*`, `TestBatch_ARepeatedIDIsRefusedBeforeAnythingRuns`; E1, E2, mixed batch | pass |
| REQ-5 | Yes: `Manager.broadcast` offers `restartDue`. The queue's `fire` re-checks `IsRestartDue` under the session lock. | Yes: `TestRestartQueue_*`, `TestRestartDue_*` (D7, D8); E2E | pass |
| REQ-6 (amended) | Yes: `LoadAll` moves the stored mark into `restartHeld`, leaving `RestartPending` and `ClaudeBehind` false. `settleClaudeBehindLocked` returns early until `installedChecked`. The first result releases a held mark if the session is behind and drops it otherwise. `sessionToRow` writes `RestartPending \|\| restartHeld`, so a crash inside the window keeps the mark. The start sweep is now `installedKnown` (`SetInstalledClaude`, then enqueue `RestartDue`), not `Start`. | Yes: 7 held starting conditions × 20 inputs in `TestRestartInvariants_EveryInputFromEveryState`, the five `TestLoadAll_*` held tests, `TestRestartWrites_FailedPersistKeepsAHeldMarkHeld`, the three `TestRestartHeld_*` tests; E2E daemon-restart journey (held, then released, then fired) and the held-then-free journey (no fire inside the window) | pass |
| REQ-7 | Yes: no change this cycle | Yes: W1/W2, R1/R2, E1, keyboard journey | pass |
| REQ-8 | Yes | Yes: W3, R3/R4, E1, mixed batch, edge-28 journey | pass |
| REQ-9 | Yes | Yes: W2, R5, E2, mixed batch, Ignore-with-pending, daemon-restart journey | pass |
| REQ-10 | Yes: `ignore()` now closes without refocusing, renders, then focuses the notice button if it survived, else `#settings-button` | Yes: W4, E3, Ignore-with-pending, and two new render tests for focus after Ignore | pass |
| REQ-11 | Yes: the box keeps `min-width: calc(18ch + 4px)`. In the notice shape the glyph rule is `margin: 0; font-size: 0.9em`. The only amber is each surface's `.btn.key`. | Yes: R1 width, a new R1 glyph-clear-of-Settings test across four shapes, R7 | pass |
| REQ-12 | Yes | Yes: R6 | pass |
| REQ-13 | Yes | Yes: W3, R3, E1, E2, mixed batch | pass |
| DIAG | `kb:diagram/store-schema` is fixed (0019 is in the summary, the prose and the `session` entity). `kb:diagram/web-components` is still stale in one count (Major 1). `daemon-components`, `containers` and `one-launch-end-to-end` still hold. | — | fail (Major 1, `[orchestrator]`) |

## Build & Tests

E2E tests: pass (449 passed, 0 failed, scoped to 46 files) · Daemon tests (race): pass (every package ok; `internal/server` 178.0 s and `internal/session` 131.9 s, down from cycle 1's 10 m timeouts) · Web tests: pass (3140 in 108 files) · Daemon build: pass · Web build: pass · Lint: pass (0 issues). All read from `$GATES_LOG_DIR` (`/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-restart-latest-claude-c2`).

Gate lines:
- pass: `build`, `test` (`make test-race`), `lint`, `web-build`, `web-test`, `render-fixtures` (110 scenarios), `render-lint`, `render-test` (444 passed), `web-lint`, `contrast` (0 failures in 3 themes), `features-inventory`, `versions`, `e2e-honest`, `kb-check` (668 records, 0 problems), `e2e-lint`, `features`, `comments`, `comment-ledger` (17 kept), `e2e`.
- WARN, never failing: `size` (27 hits, review-maintainability's to read) and `e2e-level` (a census of older specs; it flags no `claude-restart` test).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to `make test-race`, which `gates.sh` registers as a superset) |
| D2 | `go build ./...` | pass (deduped to `build`) |
| D3 | `make lint` | pass (deduped to `lint`) |
| D4 | `make check-render-fixtures` | pass (deduped to `render-fixtures`) |
| D5 | `make check-kb` | pass (deduped to `kb-check`) |
| W1 | `make web-build` | pass (deduped to `web-build`) |
| W2 | `make web-test` | pass (deduped to `web-test`) |
| R1 | `make render-test` | pass (deduped to `render-test`) |
| E1 | `make e2e` | pass (deduped to the scoped e2e gate, 449 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. `restart-busy-sessions-queued-until-free` (proposed) still describes the old start-up sweep (Major 2). `doc-delta.md` does not stage the `docs/protocol.md` sentences that Option B made false (Major 3). The #88 tick in `TODO.md:63` is still open, which is correct: orchestrate SKILL.md § Doc-Upkeep Backstop forbids a tick before `approved`. The new ADR for the decision exists, is `proposed` and carries `refs: plan:restart-latest-claude`. No log carries a `deviation:` line. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | Status line `version` key and its parsing only in `internal/claudecode/` | pass | Nothing under `internal/claudecode` changed this cycle. Searching the branch's added non-test lines outside `internal/claudecode` for `json:"version"`, hook field names, `capture-pane` and `settings.json` finds nothing. |
| V2 | No `any` in new web code | pass | No `\bany\b` and no `innerHTML` in the lines `main..HEAD` adds under `web/src`, `web/e2e` or `web/render`. No change to `package.json`, the lockfile or `go.mod`. |
| V3 | Restart reuses Stop and Resume, no second copy | pass | `restartLocked` is still `manager.EndLocked`, then `terminals.closeSession`, then `launcher.ResumeLocked`. The batch loop is now the shared `Manager.RunBatch`, the same one `EndMany`/`RemoveMany` use through `runBatch`. |
| V4 | Queue-fired failure logged at warn with session id, no payload | pass | `restart.go` `fire` still logs `f.log.Warn().Err(err).Int64("session_id", id).Msg("queued restart failed")`. A batch-path failure now logs at error from `RunBatch`. The contract names a level only for queue-run failures, so that is not a deviation. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass: no new `capture-pane` use |
| 3 | Blocking hook handler | pass: no ingest change. `installedKnown` runs on the claude-version loop goroutine, and `onRestartDue` still only appends to a slice and does a non-blocking send. |
| 4 | Bare tmux | pass: no new tmux invocation. Restart goes through `EndLocked`/`ResumeLocked`. |
| 5 | Payload logging | pass: `RunBatch` and `fire` log only an `EndLocked`/launch error and the session id |
| 6 | Empty-gauge dishonesty | pass: a held mark reads `behind: false, restartPending: false`, never a fake queued count. With installed null the readout keeps `claude unknown`, which both E2E held tests assert. |
| 7 | Session identity on `session_id` | pass: the hold and the queue key on the Muster row id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass: E2E uses the stub (`stubClaudeVersion`, `stubClaudeVersionDelaySeconds`). The Go template-database `TestMain`s spawn nothing. |

## Cycle 1 issues, re-checked

| Cycle 1 issue | Fix | Verified how |
|---------------|-----|--------------|
| code Critical 1 `[daemon-tests]` race suite timed out | `bf5c1afd`: one migrated template database per test binary (`internal/session/main_test.go`, `internal/server/main_test.go` `openCopiedStore`) | `02-test.log`: `internal/server` 177.957 s and `internal/session` 131.923 s, both ok. The invariants table grew from 24 to 31 starting conditions and lost no row. |
| code Critical 2 `[e2e-specs]` cache-warmth 7 vs 6 upserts | `85f8d8a8`: `helpers/cache-warmth.ts` `postStatus` sets `version` on every post | Diff read: the spec body is unchanged (`cache-warmth.spec.ts` is not in the diff). Each session's posts carry one version: every call is `WARM_1H` or `null`, so all report `2.1.296`, and the helper's only importer is this spec. The gate's e2e line is green. Repairs row 1 is honest. |
| code Major 1 `[daemon-impl]` stale store-schema diagram | `236b1df5` | Diff read: the summary says "0001-0019", the prose says "0003-0019", and the entity gains `claude_version TEXT` and `restart_pending INTEGER NOT NULL DEFAULT 0` |
| code Major 2 `[orchestrator]` doc-delta lines | `dc0fe0ac`: `plans/restart-latest-claude/doc-delta.md` | All four lines are present (lifecycle Wire, held mark, the readout's width and glyph, ingest row). One gap opened by Option B is Major 3. |
| code Minors 1–3 `[orchestrator]` | `dc0fe0ac` | `ingest` is in **Features**. The ingest row and the reworded connection label are in `doc-delta.md`. `claude-restart-many` is in **Render fixtures**. |
| code Minor 4 `[daemon-tests]` skipped leading upsert | `bf5c1afd` | `restart_test.go:325` marks the session seen before attaching, because `MarkSeen` was the source of the stray upsert. `:363` asserts the session's upserts are exactly `[false, true]`, with no skip. |
| code Decision 1 (user: Option B) | `236b1df5`, plus tests in `bf5c1afd`/`85f8d8a8` | REQ-6 row above. The ADR `restart-pending-marks-held-until-installed-known` is proposed. |

## Issues

### Critical

None.

### Major
1. **[orchestrator]** `kb:diagram/web-components` is stale in one count. `docs/diagrams/web-components.md` still says `main.ts` "inits 21 controllers". On main `web/src/main.ts` has 21 distinct `init*(` calls, and this branch adds `initRestart`, making 22. The same recount commit (`9de0ead7`) did correctly move `features/` to 48 modules, 21 stateful controllers and 20 helpers, and `render/` to 47. Required: the `main` component's description matches `main.ts`'s init count. Impl agents may not write `docs/`, so this is the orchestrator's records edit.
2. **[orchestrator]** The proposed ADR `docs/adr/restart-busy-sessions-queued-until-free.md:18` says the pending mark is "swept once after reconcile on start". What shipped, per the user's Option B, is a sweep on the first installed-version result (`restartFeature.installedKnown`), with the mark held until then. The new ADR `restart-pending-marks-held-until-installed-known` refs it but does not correct it, and both flip to `accepted` at Completion. Required: the busy-queue ADR's Decision says the start sweep runs on the first installed-version result, or points to the held-mark ADR for it. It is still `proposed`, so it can be edited.
3. **[orchestrator]** Option B made two `docs/protocol.md` statements false, and `doc-delta.md` stages neither. doc-reconcile promotes only the delta, so these would survive.
   - `docs/protocol.md:623` (and the generated `docs/features/actions/contract.md:161`): a queued session is restarted "after a daemon restart, once reconcile completes if it is free already". It is restarted on the daemon's first installed-version result, and only if it is still behind.
   - `docs/protocol.md:1416-1417` `restartPending`: "Kept by /clear and a daemon restart". After a daemon restart the wire reads `false` until the first installed-version result re-derives it.

   daemon-impl's Fix Attempt 2 `doc-delta:` line says "`docs/protocol.md` … need no change". That is true of the `behind` invariant but not of these two sentences. The plan's own Protocol Contract (plan.md:119-121) carries the first sentence too. Required: the protocol `stops being true` / `becomes true` lines in `doc-delta.md` name both sentences and their replacements.

### Minor

None.

### Notes
1. **[note]** `restartBatchWire` embeds `batchWire`, so the restart response's JSON key order is `done, skipped, failed, queued`. The contract example lists `done, queued, skipped, failed`. daemon-impl logged this as a `design:` line. JSON keys are unordered, the dashboard decodes by key, and no assertion pins the order. doc-reconcile may want the protocol example to list the keys in the shipped order.
2. **[note]** `LoadAll` ignores `settleClaudeBehindLocked`'s `changed` result. A mid-run reload after the installed version is known can drop a held mark in memory while the row keeps `restart_pending = 1` until the session's next write. At start-up `installedChecked` is always false, so this is reachable only from the render rig's `markDead`, and any later first result re-derives the mark anyway.
3. **[note]** The plan's `## Diagrams` restart state diagram has no held state. It is plan-local (not a kb diagram) and is not promoted, so nothing asks for a change.
4. **[note]** Process: daemon-impl edited `docs/diagrams/store-schema.md` in Fix Attempt 2 because cycle 1's Major 1 was tagged `[daemon-impl]`. Its agent file says "you never write `docs/`", and review-scale makes diagram records `[orchestrator]` work. Cycle 1's tag was mine and wrong. The edit is correct.
5. **[note]** The two new E2E held-window tests take `startDaemon` (for `stubClaudeVersionDelaySeconds`) where the **Fixture plan** header says `daemon`. Both fixtures are fresh per test, so the header's reason still holds. Only the spelling of the fixture differs.

## Browser review

# Browser review: Restart Latest Claude

**Plan**: restart-latest-claude
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 16162 words (budget 30000)
**Rig**: `make web-build build` at a31fba26 (`v0.27.3-40-ga31fba26-dirty`, dirty = orchestrator's plan-dir files only); per-test scratch `bin/musterd` from `helpers/fixtures.ts` `startDaemon` on `$TMPDIR/muster e2e-55a1b6f1-*` (space-bearing data dir) with a private `-tmux-socket` inside it (fixture teardown runs `kill-server` and removes the dir), harness stub `claude` answering `--version` with `2.1.318` (with a 6 s delay for the held-mark cells, and failing for the installed-unknown cell); headless Chromium 1280×900. Throwaway spec deleted; no daemon left running; `git status` shows nothing of mine.

Gates log read (not re-run): all 21 lines green, `21-e2e.log` 449 passed, `04-web-build.log` built. The dashboard driven here is the one that ships.

Scope of this cycle: re-measure cycle 1's two Minors, measure the new held-mark daemon-restart state (REQ-6 as amended), and re-sweep the readout cells those changes could move. The cycle-1 matrix (`review.browser.cycle1.md`) covered the panel, dialog, queue, Ignore and §7.1 cells. The cycle-2 web change (62d72cb9) touches only the glyph CSS, the Ignore focus target and the wording helpers, so I did not re-drive the dialog cells. Installed `2.1.318` is above the verified range, so the `⚠` glyph was present in every cell.

## Matrix

Hosts: **focus** and **tiles** share one masthead element. The **pop-out** (`/doc.html`) has no masthead and no Claude readout, so every pop-out cell is N/A.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-11 (cycle-1 Minor 1) | focus | data | glyph clear of Settings | pass | `⚠` box 1098.05–1104.72, `#settings-button` 1018.53–1096.72: 1.33 px clear (it overlapped by 3.41 px in cycle 1); `elementFromPoint` at the glyph returns the glyph |
| REQ-11 | focus | data + panel open | glyph clear, box unchanged | pass | same glyph box; readout 1104.72–1242 (w 137.28); panel `display:block` |
| REQ-11 | tiles | data | glyph clear of Settings | pass | glyph 1098.05–1104.72 vs Settings right 1096.72 |
| REQ-11 | tiles, focus | queued (`↻1 queued`, behind + pending) | glyph clear, width fixed | pass | `claude ↻1 queued`, w 137.28, right 1242, glyph 1098.05–1104.72 |
| REQ-11 | focus | no data / plain after queue drains | glyph inside the box, width fixed | pass | `claude 2.1.318 ⚠`, glyph 1234.59–1242 inside the host 1104.72–1242, w 137.28 |
| Keeps focus (cycle-1 Minor 2) | focus | data, Ignore by pointer | focus not dropped to body | pass | after Ignore plus 1.5 s: readout plain, activeElement `#settings-button` (the readout is a span now, so this is the fallback target) |
| Keeps focus | focus | data, Ignore by keyboard | focus not dropped to body | pass | Enter on the notice, Shift+Tab to `#restart-ignore-button`, Enter; after 1.5 s activeElement is `#settings-button`, panel `display:none` |
| REQ-12 | focus | daemon-down (panel open) | button disabled, panel closed, banner | pass | after SIGTERM: `disabled:true`, color rgb(90,96,112), w 137.28, panel `display:none`, `#banner` `display:block` |
| REQ-12 | tiles | daemon-down | — | N/A: same masthead element as focus | |
| REQ-6 held | focus | daemon restarted, live page (no reload) | the readout goes from queued to down, then held, then released | pass | 100 ms samples: 2 ms `claude ↻2 queued` → 105 ms disabled + banner → 630 ms `claude unknown`, no button, banner hidden → 6181 ms `claude ↻2 queued` enabled; w 137.28 in every sample |
| REQ-6 held | focus | held (installed unknown) | mark off the wire, no restart | pass | `/api/state` 1.5 s after the respawn: both sessions `claudeVersion {running:2.1.317/2.1.316, behind:false}`, `restartPending:false`, alive, working; tmux pane identity unchanged |
| REQ-6 held / §6 honesty | focus | held | the readout claims no version it does not know | pass | `claude unknown`, no glyph, no notice button, panel `display:none` |
| REQ-6 released | focus | first installed result | mark re-derived, queued notice back | pass | wire `{running:2.1.317, behind:true}`, `restartPending:true`; readout `claude ↻2 queued` |
| REQ-9 released | focus | released, panel opened | panel lists pending, no buttons | pass | panel 862–1242 × 33.5–132.5; `#restart-panel-behind` `display:none`, `#restart-panel-queued` `display:block`; visible buttons `[]`; innerText `Claude Code 2.1.318 · Restart when free · 2 · c2-held working · c2-behind working`; focus on `#restart-panel` |
| REQ-6 unknown | focus | daemon restarted, first installed result fails | mark cleared, nothing restarted | pass | 6 s after the respawn: readout `claude unknown`, no button; wire `behind:false`, `restartPending:false`; then Stop with 0 tasks → idle, pane identity unchanged after 3 s, still no notice |
| REQ-6 held | tiles | held | — | N/A: the readout is the same element; the held state is daemon-side and was measured in focus | |
| All | pop-out | all | — | N/A: `/doc.html` has no masthead or Claude readout | |
| REQ-7, REQ-8, REQ-10, REQ-13, Edge 25/28/29, §7.1 | focus, tiles | data / queued | panel, dialog, queue, one live client | not re-measured this cycle | cycle-1 matrix passes. No web change since then touches those paths (see Note 1) |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** I did not re-drive the cycle-1 dialog, panel-content and §7.1 cells. Since 18a79b48 the web diff (62d72cb9) changes only `.claude-notice ~ .version-warn` (margin 0, font-size 0.9em), the Ignore focus target, a shared `setText` and the background-task wording helper. The daemon diff changes the batch runner, and the gate's `claude-restart.spec.ts` journeys, all green, cover that runner end to end.
2. **[note]** The glyph clearance is now 1.33 px at 1280 px. It is clear, but only just: any widening of the glyph or narrowing of the masthead gap closes it again. The `1d5964b5` test pins it, so a regression would go red.
3. **[note]** Ignore leaves focus on `#settings-button`. When pending sessions remain, the code focuses the notice button instead. I measured only the no-pending branch, because the notice button that this branch would otherwise focus is removed by the render. Settings is a deliberate masthead target, not `<body>`.
4. **[note]** In the held window (630 ms to 6181 ms here, up to 30 s per the decision) a queued restart is invisible: the readout reads `claude unknown` and nothing tells the user a restart is still queued. The developer chose this in the decision record (`decisions/pending-marks-held-until-installed-known`), and it is honest (no version or queue is claimed while unknown). No change requested.
5. **[note]** The narrow-width overflow (cycle-1 Note 2) was not re-measured. Nothing in this cycle changes the masthead's width.

## Maintainability review

# Maintainability review: Restart Latest Claude

**Plan**: restart-latest-claude
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 27338 words (budget 30000)
**Scope**: 41 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (full review: cycle 1 carried Majors). 17 of them changed since `review_commits[1]` (047ee06a), and I re-read those against their siblings. The other 24 are unchanged since cycle 1, so their cycle-1 rows still hold.

## Cycle-1 findings

| Cycle-1 issue | Fix commit | Verified how |
|---|---|---|
| Major 1: second batch runner in `internal/server/restart.go` | 236b1df5 | `internal/session/actions.go:155` `RunBatch` is now the one loop. It owns `hasRepeat` (`:157`), the per-id `LockSession` (`:163`) and the bucketing (`:168-175`, plus `BatchResult.file` `:115` for the new `Queued`). `EndMany`/`RemoveMany` reach it through the 1-line `runBatch` adapter (`:146`). The restart handler (`internal/server/restart.go:119-133`) decodes the body, calls `RunBatch` and encodes the result. It no longer sorts and compacts, locks or buckets for itself, and it maps the error through the shared `writeBatchError` (`actions.go:143`, now a function that takes the logger). `restartBatchWire` embeds `batchWire` and adds only `Queued` (`sessionwire.go:259-266`). The comment on `decodeBatchRequest` (`actions.go:131-132`, "a repeated id is the manager's to refuse") is true again. `rg -n 'hasRepeat\|BatchResult' internal -g '!*_test.go'` finds one refusal site and one bucket owner. The Fix Attempt 2 `design:` line gives the reason it stays in `session`: the lock and `hasRepeat` live there, and the op comes in as a closure. The code bears that out. |
| Major 2: private `setText` in `render/restartpanel.ts` | 62d72cb9 | `restartpanel.ts:1` `import { setText } from "../dom"`. `rg 'function setText' web/src` finds only `dom.ts:42`. |
| Major 3: background-task wording spelled out twice | 62d72cb9 | `sessions/card.ts:413` `backgroundTaskCount` is the one owner. `backgroundLine` (`:422`) and `features/restartplan.ts:37` both call it. `backgroundTaskReason` is gone. |
| Minor 1: `followInstalled` post-construction setter | 236b1df5 | `newClaudeVersionFeature(…, onInstalled, log)` (`claudeversion.go:79`) takes it the way `newGroupsFeature`/`newIssueFeature` take theirs. `server.go:228` passes `s.restart.installedKnown`, and `s.restart` is registered first at `:216`. The setter is deleted. |
| Minor 2: `statusLineFullPayload` funlen with no reason | 236b1df5 (Decisions) | The Fix Attempt 2 Size line gives the reason and it holds: `claudecodetest/statusline.go:89-150` is a flat default-then-assign run, one block per option. Splitting it would separate defaults from the one list of them. |
| Minor 3: no `design:` line for `RestartClass`/`ClassifyRestart`, `LeadingVersion`/`OlderVersion` | 236b1df5 (Decisions) | Two `design:` lines in Fix Attempt 2 name the shape, the reason (one call under `Manager.mu` rather than two questions at different instants; the format stays in `claudecode`) and the reuse (`parseSemver`/`compareSemver`, `restartFree`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | (generated trailer only) | n/a | none | pass (unchanged) |
| internal/claudecode/claudecodetest/statusline.go | statusline.go builders | Size reason (Fix Attempt 2) | funlen `statusLineFullPayload` 42 > 40, reason holds | pass, Note 5 |
| internal/claudecode/status.go | version.go, status.go `interpret*` | n/a | none | pass (unchanged) |
| internal/claudecode/version.go | version.go `parseSemver`/`compareSemver` | yes (Fix Attempt 2) | none | pass |
| internal/server/CLAUDE.md | (generated trailer; Owns now names `restart.go`) | n/a | none | pass |
| internal/server/actions.go | sessionwire.go `toWireBatch`, restart.go | yes (`writeBatchError` as a function) | none | pass |
| internal/server/claudeversion.go | groups.go/issue.go constructors via server.go:221,230 | yes (constructor arg) | none | pass |
| internal/server/launcher.go | actions.go | yes | funlen `ResumeLocked` 62 > 60 (extraction from a 92-line `Resume`) | pass, Note 5 |
| internal/server/renderfix_scenarios_restart.go | renderfix_scenarios_notes.go, renderfix_scenarios_misc.go | yes | none | pass (unchanged) |
| internal/server/restart.go | actions.go, reporefresh.go, bgloop.go, sessionwire.go, session/actions.go | yes (`RunBatch`, `installedKnown`) | none | pass, Notes 2, 3 |
| internal/server/server.go | (root) | yes | funlen `New` 54 > 40, pre-existing (53 on main) | pass, Note 5 |
| internal/server/sessionwire.go | sessionwire.go `batchWire`/`toWireBatch`/`nonNil` | yes (embeds `batchWire`) | funlen `toWireSession` 66 > 60, pre-existing | pass, Note 5 |
| internal/session/CLAUDE.md | (generated trailer only) | n/a | none | pass (unchanged) |
| internal/session/actions.go | railorder.go `hasRepeat`, groupops.go:204, groups.go:59 | yes (`RunBatch`, `BatchOutcome`) | none | pass, Note 3 |
| internal/session/apply.go | status.go | yes | none | pass (unchanged) |
| internal/session/liveness.go | actions.go | n/a | none | pass (unchanged) |
| internal/session/manager.go | effort.go, repo.go | yes (`restartHeld` set in `LoadAll`) | file 645 lines, pre-existing, reason given | pass |
| internal/session/restart.go | effort.go, note.go, railorder.go, writeorder.go | yes (held-mark release in settle) | none | pass, Note 4 |
| internal/session/row.go | row.go mapping | yes (`RestartPending \|\| restartHeld`) | none | pass |
| internal/session/session.go | session.go fields (`ClaudeDir`, `AddedDirs`, `repoEpoch`) | yes (`restartHeld`, writers named in Decisions) | none | pass |
| internal/session/status.go | status.go `adopt*` | yes | none | pass (unchanged) |
| internal/session/writeorder.go | writeorder.go restore list and coverage list | yes | none | pass |
| internal/store/migrations/0019_restart.sql | 0017, 0018 | n/a | none | pass (unchanged) |
| internal/store/session.go | store/session.go | n/a | funlen `UpdateSession`/`scanSession` pre-existing; file 558, reason given | pass, Note 5 |
| web/src/api/sessions.ts | api/sessions.ts batch calls | n/a | none | pass (unchanged) |
| web/src/app.ts | wsapp.ts | yes | none | pass (unchanged) |
| web/src/features/CLAUDE.md | — | n/a | none | pass (unchanged) |
| web/src/features/connection.ts | updaterestart.ts, connectionversion.ts, wsapp.ts | yes | none | pass (unchanged), Note 6 |
| web/src/features/restart.ts | settings.ts:16, update.ts:21 (`#settings-button` lookups), notes.ts, render/menu.ts | yes (Ignore focus target) | none | pass, Note 7 |
| web/src/features/restartnotice.ts | connectionversion.ts, batchplan.ts | yes | none | pass (unchanged), Note 1 |
| web/src/features/restartplan.ts | batchplan.ts, sessions/card.ts | yes | none | pass, Note 1 |
| web/src/main.ts | (root) | yes | none | pass (unchanged) |
| web/src/protocol/batch.ts | protocol/batch.ts | n/a | none | pass (unchanged) |
| web/src/protocol/session.ts | protocol/session.ts | n/a | none | pass (unchanged) |
| web/src/render/CLAUDE.md | — | n/a | none | pass (unchanged) |
| web/src/render/masthead.ts | masthead.ts, effortstrip.ts | yes | none | pass (unchanged), Note 8 |
| web/src/render/restartdialog.ts | confirm.ts, groupdialogs.ts | yes | none | pass (unchanged) |
| web/src/render/restartpanel.ts | dom.ts, render/context.ts, render/notes.ts | yes | none | pass |
| web/src/sessions/card.ts | card.ts string helpers (`unreadLabel`, `backgroundLine`) | yes (`backgroundTaskCount` owner) | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass (unchanged) |
| web/src/style.css | `.claude-notice ~ .version-warn` and the masthead rules | n/a | none | pass |

Shared state (question 3): this cycle adds the held mark `Session.restartHeld`. Its writers are `LoadAll` (set), `settleClaudeBehindLocked` (reached from the ingest worker's status post and from the claude version loop's `SetInstalledClaude`) and `clearClaudeVersion`, all under `Manager.mu`, as the Fix Attempt 2 `design:` line states. It is in `restoredSessionFields`, so a failed write rolls it back with its neighbours. `installedKnown` runs on the claude version loop goroutine. Its `enqueue` is under `restartFeature.mu`, and the duplicate enqueue it can race with (the upsert callback on the release, then the sweep) is collapsed by `slices.Contains` or turned into a no-op by `fire`'s `IsRestartDue` re-check under the session lock. This cycle's gate `test` line is `go test -race -count=1 ./...` with every package `ok` (`internal/session 131.9s`, `internal/server 178.0s`), unlike cycle 1's timeouts.

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** Carried from cycle 1, unchanged. "Free" and semver ordering are each spelled out in both tiers: daemon `restartFree`/`compareSemver`, dashboard `isFree`/`compareVersions`. Moving either to one side is a protocol question for a later plan, not a fix here.
2. **[note]** The same restart failure is logged at two levels. The batch path now logs through `RunBatch` at error ("restarting session in a batch failed", `session/actions.go:172`), and the queue path logs at warn in `fire` ("queued restart failed", `server/restart.go:100`). Fix Attempt 2 Decisions records the batch-side change from warn to error, so this is a known choice. A reader searching the log for one message will find only half of the failures.
3. **[note]** `RunBatch` has two ways to skip: an op returns `BatchSkipped` with a nil error, or it returns `ErrUnknownSession`/`ErrSessionNotAlive`. Restart uses both (`restartOne` default and `queueOne`'s `ErrNotBehind` versus `restartLocked`'s sentinels). `RunBatch`'s doc states both routes, so a future op author has the rule in one place.
4. **[note]** Carried from cycle 1 Notes 3 and 4. The eligibility rule is stated twice (`ClassifyRestart` and `SetRestartPending`), and `ClaudeBehind` is stored derived state. The restart mark now has three spellings: `RestartPending` in memory and on the wire, `restartHeld` in memory only, and the `restart_pending` column written as their OR (`row.go:260`). The design line explains why (no migration, no second store), and the one resolver is `settleClaudeBehindLocked`, which keeps it readable today.
5. **[note]** Size warnings on touched files: `statusLineFullPayload` now has a reason that holds. `ResumeLocked`, `New`, `toWireSession`, `UpdateSession`/`scanSession` and the three over-500 files are pre-existing or explained, as in cycle 1. The remaining funlen hits are on test files and are funlen, not `dupl`, so they are outside this part.
6. **[note]** Carried from cycle 1 Note 2. `claudeCode` is still the one WS-message-to-`app` event emitted from a controller (`features/connection.ts`) rather than `wsapp.ts`. The reason is given in Decisions.
7. **[note]** `features/restart.ts:67` is the third controller to `requireElement("#settings-button")`, after `features/settings.ts:16` and `features/update.ts:21`. It uses it only as Ignore's focus fallback, and the `design:` line names that. It matches its siblings. If a fourth reader appears, a shared masthead lookup would be worth considering. Cycle 1 Note 7 (the third inline outside-pointerdown/Escape dismiss) also still stands.
8. **[note]** Carried from cycle 1 Note 8. `render/masthead.ts` `renderNotice` wires `onActivate` only on first build. This is harmless while `connection.ts` passes the stable `toggleRestartPanel`.
9. **[note]** The original `## Decisions` block of `daemon-implementation.md` still carries three `design:` lines that Fix Attempt 2 superseded: "duplicate-id check … is a sort-and-compact … no export", "`LoadAll` seeds `ClaudeBehind = RestartPending`" and "`Start`'s sweep". A reader of that block meets two contradictory designs for the batch runner before reaching Fix Attempt 2. The code matches the Fix Attempt 2 lines.

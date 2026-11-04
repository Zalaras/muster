# Correctness review: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: approved
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

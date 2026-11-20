# Correctness review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 27311 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `reconcile` assigns `p.rev++` to each pending broadcast under `mu`, inside `tickMu`, then broadcasts in that order. The hub closure stamps `revFor(id)` (`shellactivity.go:41,177-207`) | Yes. `TestTerminalsRev_RisesByOnePerBroadcastAcrossSessions` (wire), `TestPollerRev_OneReconcileOverSeveralSessionsNumbersEachBroadcastInOrder` | pass |
| REQ-2 | Yes. `snapshot()` returns the lists and `rev` in one `RLock` hold. `Snapshot.TerminalsRev` has no `omitempty`, so it is always present (`state.go:20`) | Yes. `TestTerminalsRev_SnapshotCarriesTerminalsRev` (0 when fresh, then the broadcast rev, with that broadcast's lists); `TestBuildSnapshot_M0Shape`; e2e `shell.spec.ts:12` | pass |
| REQ-3 | Yes. All four routes read `revFor(id)` after `f.changed(ctx)` (`shells.go:155,169,210,240`). The per-session map survives an emptied list | Yes. `TestTerminalsRev_EachRouteReplyCarriesTheSessionsLatestBroadcastRev` covers no-change replies, another session's broadcast and the empty list; `TestPollerRev_SessionKeepsItsRevAfterItsListGoesEmpty` | pass |
| REQ-4 | Yes. `writeJSON(200, terminalClosedResponse{Rev})`; the 404s are unchanged | Yes. `TestTerminalsRev_DeleteAnswers200WithRev`; the body is exactly `{"rev":N}` (`terminals_test.go:328`); e2e `terminals.spec.ts:725,1234` | pass |
| REQ-5 | Yes. `isStaleList` returns before `applyTerminalList`, so the list, count, name, surface and activity are all untouched. Replies raise the seen rev before the newer-selection guard. `resetSeenRev(snapshot.terminalsRev ?? 0)` (`surfaces.ts:179-191,334-343`) | Yes. `surfacesrev.test.ts`: equal applies and below does not, a dropped reply still raises, snapshot reset (edge 6) | pass |
| REQ-6 | Yes | Yes. The `newTerminal` and `select('shell')` stale-list tests in `surfacesrev.test.ts` | pass |
| REQ-7 | Yes. `observeReply` on rename and close | Yes. The close and rename tests in `surfacesrev.test.ts` | pass |
| REQ-8 | Yes. `observeSpawnReply` checks `rev <= seen` and that the list lacks `n`. `select` uses `shell ?? (ended ? null : n)`, and `terminalsChanged` keeps `shell` non-null whenever the list is non-empty | Yes. The three "spawn reply at or below the seen rev" tests | pass |
| REQ-9 | Partly. A `terminals` message with `rev: 0` is accepted, but the contract says ≥ 1 (Major 1) | Partly. A test pins `rev: 0` as valid (Major 2) | fail |
| DIAG | `kb:diagram/web-components` (terminal/ is now 10 modules: verified, 10 non-test files), `kb:diagram/daemon-components` (no package or import change), `kb:diagram/containers` (no change) | — | pass |

## Build & Tests

E2E tests: pass (255, scoped to 20 files) · Daemon tests: pass (every package `ok`, `go test -count=1 ./...`, no `-race` in this line) · Web tests: pass (3404, proven at 10:05:50 and reused) · Daemon build: pass · Web build: pass · Lint: pass (0 issues). All read from $GATES_LOG_DIR (`gates-stale-terminals-list-1-c1c`: 31 lines, 0 failed, 2 warn-only). The c1b reds (`embedded.spec.ts:75` daemon never healthy, `render/reader-find.spec.ts:309`, `TestOnExit_Leave_LiveSessionSurvivesShutdown`) are in files this plan does not touch, and all three passed on the c1c re-run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestTerminalsRev' ./internal/server/` | pass (proven at 10:05:50) |
| D2 | `make test` | pass (run in c1c, 05-D2.log) |
| D3 | `make lint` | pass (deduped to the gates' lint line) |
| D4 | `make check-render-fixtures` | pass (deduped to the render-fixtures line) |
| W1 | `cd web && npx vitest run src/features/surfacesrev.test.ts` | pass (proven at 10:05:50) |
| W2 | `make web-test` | pass (deduped to the web-test line) |
| W3 | `make web-lint` | pass (deduped to the web-lint line) |
| R1 | `make render-test` | pass (deduped to the render-test line, 509 passed) |
| E1 | `make e2e SPECS='e2e/terminals.spec.ts'` | pass (proven at 10:05:50, 28 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. This is a sweep batch, so the `TODO.md:163` tick is left to the loop. There are no `deviation:` or `doc-delta:` lines. The one Doc Delta line (surfaces) holds for the code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | The snapshot's lists and rev are read under one lock hold; revisions are assigned under `tickMu` | pass | `snapshot()` holds one `RLock` for `terms` and `rev` (`shellactivity.go:110-118`). `reconcile` is reached only from `tick`, which holds `tickMu` (`:128-151`). The swap of `terms` and the assignment of the revs happen in one `mu.Lock` hold, and the broadcasts follow in assignment order (`:177-200`). `rg` finds no other writer of `terms`/`rev`/`revs` |
| V2 | `docs/protocol.md` and the ADR unchanged after `bca51d54` | pass | `bca51d54` is an ancestor of HEAD, and `git diff main...HEAD -- docs/protocol.md docs/adr` is empty |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass (no ingest change) |
| 4 | Bare tmux / resize-pane | pass (no new tmux call) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (n/a) |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Issues

### Critical

None.

### Major

1. **[web-impl]** A `terminals` message carrying `rev: 0` parses as valid. `docs/protocol.md` (`kb:anchor/ws.shell-activity`) says a message's `rev` is "an integer ≥ 1", and REQ-9 says a message "without a valid `rev` is malformed". `parseTerminalsMessage` (`web/src/protocol/terminals.ts:36-41`) uses the shared `parseRev`, which accepts anything ≥ 0. That floor is right for replies and `snapshot.terminalsRev` but not for messages. After the fix, a `terminals` message with `rev` < 1 is rejected like any other malformed message, while the replies and the snapshot keep accepting 0.
   id: web/src/protocol/terminals.ts:parseTerminalsMessage:accepts rev zero | confidence: 90
2. **[web-tests]** The web tests pin the out-of-contract value as valid and never test its rejection. `terminals.test.ts:26-34` ("decodes the empty list sent once the last terminal ends") expects `rev: 0` to decode, though the daemon's empty-list message always carries rev ≥ 1. `surfacesrev.test.ts` ("a snapshot without terminalsRev … resets every session's seen rev to 0") sends a message at `rev: 0` through the parser. After the fix, the decode row uses rev ≥ 1, a `rev 0` row joins the rejection table, and the snapshot-without-terminalsRev test shows the reset with a message at rev 1 (below the earlier 20, so the reset is still the only reason it applies).
   id: web/src/protocol/terminals.test.ts:parseTerminalsMessage:rev zero pinned valid | confidence: 90

### Minor

None.

### Notes

1. **[note]** Edge case 8 (untested by plan) goes further than the plan says. A rename or close reply that reaches the window before an earlier, still-pending spawn reply raises the seen rev past that spawn's rev. The spawn reply is then read as "ended" and not shown, even though the terminal runs. This follows the contract's wording in `sessions.shell` § Revisions, so it is not a defect of this branch. It does mean the "ended" inference holds only when the window has no other terminal call to the same session in flight.
2. **[note]** `shellActivityPoller.revs` never drops a removed session's id. Each entry is one int64 per session id for the daemon's lifetime, which is negligible. This is shape, not a defect: review-maintainability's to weigh.
3. **[note]** The D2 gate line runs `go test -count=1 ./...` without `-race`. The rev bookkeeping is guarded by the existing `mu`/`tickMu`, and I found no unguarded access by reading the code.
4. **[note]** The Repairs table is honest. Each repaired reply equality splits `rev` off and keeps the exact `toEqual` on the rest. The no-change `POST /shell` asserts `>=`, which is correct because a poll broadcast may run between the calls. Every change asserts strictly greater. `shell.spec.ts:12` gains `terminalsRev: 0` exactly. Nothing was deleted or loosened.

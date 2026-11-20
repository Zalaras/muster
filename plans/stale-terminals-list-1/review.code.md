# Correctness review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 27311 words (budget 30000)
**Delta**: `git diff ca359175..HEAD` — 4 commits (601efb65, 369a2ab3, 695f82f0, 6a571c36); source change is `web/src/protocol/terminals.ts` (1 line) and two web test files; the rest is plan logs and the cycle-1 archive.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-8 | Yes (unchanged since cycle 1, verified there; the delta touches none of their code) | Yes | pass |
| REQ-9 | Yes. `parseTerminalsMessage` now rejects a `terminals` message whose `rev` is below 1 (`web/src/protocol/terminals.ts:40`), matching `kb:anchor/ws.shell-activity` ("an integer ≥ 1"). `parseRev` keeps its 0 floor, so the replies in `api/sessions.ts` and `snapshot.terminalsRev` still accept 0, as the contract allows | Yes. `terminals.test.ts:43` adds a `rev zero` row to the rejection table; the empty-list decode row uses `rev: 1` | pass |
| DIAG | none touched by the delta (`terminals.ts` is a one-condition change, no module or import edge); cycle 1's check of `kb:diagram/web-components`, `daemon-components`, `containers` stands | — | pass |

## Build & Tests

E2E tests: pass (255, scoped to 20 files, `c2/22-e2e.log`) · Daemon tests: pass (`make test` line red on its first run in `c2/02-test.log` — one failure in `cmd/musterd` `TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered`; green on the retry in `$GATES_LOG_DIR` = `c2b/01-test.log`, `cmd/musterd` and `internal/server` both `ok`; D2's full `go test -count=1 ./...` in the same c2 run also `ok` for `cmd/musterd`) · Web tests: pass (3405) · Daemon build: pass · Web build: pass · Lint: pass (0 issues). Render tests 509 passed, render fixtures up to date (119), render-lint/e2e-lint clean, contrast 0 failures, kb check 0 problems, comment ledger verified. Warn-only: `size` (funlen `server.go:New`, now named with a reason in Decisions) and the e2e-level census. Read from `gates-stale-terminals-list-1-c2` and its retry `-c2b`; nothing re-run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestTerminalsRev' ./internal/server/` | pass (c2/23-D1.log) |
| D2 | `make test` | pass (c2/24-D2.log, every package `ok`, 0 FAIL) |
| D3 | `make lint` | pass (deduped to the gates' lint line, 0 issues) |
| D4 | `make check-render-fixtures` | pass (deduped to the render-fixtures line) |
| W1 | `cd web && npx vitest run src/features/surfacesrev.test.ts` | pass (c2/25-W1.log, 11 passed) |
| W2 | `make web-test` | pass (deduped to the web-test line, 3405 passed) |
| W3 | `make web-lint` | pass (deduped to the web-lint line) |
| R1 | `make render-test` | pass (deduped to the render-test line, 509 passed) |
| E1 | `make e2e SPECS='e2e/terminals.spec.ts'` | pass (c2/26-E1.log, 28 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Sweep batch: the `TODO.md` tick is the loop's. No `deviation:` or `doc-delta:` lines (the web Fix Attempt 1 says "Decisions: none new"). `plan.md` and its Doc Delta are untouched by the delta; the surfaces line still holds |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | Snapshot lists and rev under one lock hold; revs assigned under `tickMu` | pass | No daemon file in the delta (`git diff ca359175..HEAD --stat` touches no `internal/` or `cmd/` path); cycle 1's reading of `shellactivity.go` stands |
| V2 | `docs/protocol.md` and the ADR unchanged after `bca51d54` | pass | `bca51d54` is an ancestor of HEAD; `git diff main...HEAD -- docs/protocol.md docs/adr` is empty |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass (no ingest change) |
| 4 | Bare tmux / resize-pane | pass (no tmux call in the delta) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (n/a) |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Delta (delta re-review only)

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Major 1 `[web-impl]` `web/src/protocol/terminals.ts:parseTerminalsMessage:accepts rev zero` | resolved | `369a2ab3` | Diff read: the guard gains `rev < 1`, nothing else changes. `parseRev` keeps its 0 floor, so the reply decoders and `snapshot.terminalsRev` still accept 0 (contract: replies and snapshot may be 0). `rg 'rev: ?0'` over `web/src web/render web/e2e` finds only the new rejection row, so no fixture or spec sends a message at 0 |
| Major 2 `[web-tests]` `web/src/protocol/terminals.test.ts:parseTerminalsMessage:rev zero pinned valid` | resolved | `695f82f0` | Diff read: the empty-list decode row now uses `rev: 1`; `["rev zero", …]` joins the rejection table; the snapshot-reset test in `surfacesrev.test.ts:222` sends its message at `rev: 1`, still below the earlier 20, so the reset remains the only reason it applies. Web tests 3405 passed, W1 11 passed |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Outside the delta: `cmd/musterd` `TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered` (`port_proc_test.go:177`, "REQ-2: the startup line follows the answer") failed once in this cycle's first gate run — its captured output ended at the `Save port … [y/N]` prompt without `musterd starting` — and passed on the retry and in D2's full run. This branch touches nothing under `cmd/`, and the flake is not in `TODO.md`. A candidate for the proposed backlog as a flaky test.
2. **[note]** Maintainability Minor 1 (the funlen size line in `daemon-implementation.md` § Decisions) was fixed by the orchestrator in `601efb65`; the line now names `server.go:New` and matches `02-size.log`. Recorded for completeness; prior Minors are the orchestrator's to check.

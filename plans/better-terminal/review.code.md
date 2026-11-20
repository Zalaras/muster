# Correctness review: better-terminal

**Plan**: better-terminal
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 77708 words (budget 30000)

Delta scope: `git diff c726556f..HEAD`, three fix commits (`273dcb29`, `4f956943`, `ef2afab0`) plus the cycle-2 archive commit. Code under review: `internal/server/renderfix_tmux.go` (build constraint), and test titles in `web/render/popover.spec.ts` and `web/render/terminals.spec.ts`. §1 and §2 run in full. §3–§6 cover those three files.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1..REQ-19, INV-1..INV-5 | unchanged since cycle 2 (pass) | unchanged. Only test titles changed, and no assertion was touched | pass |
| R1–R6 title mapping | — | Each R* title now cites the REQ that criterion falsifies (`plan.md:48-58`, `:344-349`): R1 → REQ-8 and REQ-9 (switch order, and the count reading `2`), R2 → REQ-16 (3×2 footer fit), R3 → REQ-18 (nine rows plus New terminal), R4 → REQ-14 (daemon down), R5 → REQ-11 (panel rows), R6 → REQ-9 (no count with one terminal). Every mapping is correct | pass |
| Protocol contract (both sides) | untouched by the delta | — | pass |
| DIAG | none affected. The delta adds a build constraint and renames test titles, and no diagram describes either | — | pass |

## Build & Tests

E2E tests: pass (468 passed, scoped to 39 files) · Daemon tests (race): pass (scoped 5 packages, 02-test.log; every package via D1, 22-D1.log) · Web tests: pass (3369 in 114 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) · Render tests: pass (509) · Render fixtures: up to date (119) · render-lint, e2e-lint, contrast (54 pairs ×3, 0 failures), versions, features-scope, comment checks and ledger (48 blocks): clean · kb-check: 709 records, 0 problems. All read from `$GATES_LOG_DIR` (gates-better-terminal-c3, 0 failed lines). The size WARN lines belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (22-D1.log, every package ok) |
| D2 | `go build ./...` | pass (deduped to 01-build, empty log, exit 0) |
| D3 | `make lint` | pass (deduped to 03-lint, 0 issues) |
| D4 | `make check-render-fixtures` | pass (deduped to 06, 119 scenarios up to date) |
| W1 | `make web-build` | pass (deduped to 04) |
| W2 | `make web-test` | pass (deduped to 05, 3369 passed) |
| R1 | `make render-test` | pass (deduped to 08, 509 passed) |
| E1 | `make e2e` | pass (scoped gate line 21, 468 passed over 39 specs; the full sweep runs at Completion) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The delta adds no `deviation:` or `doc-delta:` line (daemon log Fix Attempt 3: "Decisions: none"). The Doc Delta claims verified in cycle 2 are untouched by this diff |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | the delta's web lines are test titles only |
| V2 | switch and panel match the reference renders | not mine | belongs to review-browser, which was skipped this cycle |
| V3 | menu tokens, shell spinner | pass (greppable half) | no CSS or token change in the delta |
| V4 | no terminal content read for state | pass | no change in the delta |
| V5 | retired message/field neither sent nor parsed | pass | no change in the delta |
| V6 | panel through the shared popover part | pass | no change in the delta |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (not touched) |
| 2 | Terminal-output state parsing | pass (not touched) |
| 3 | Blocking hook handler | pass (not touched) |
| 4 | Bare tmux / resize-pane | pass. `renderTmux` is the render rig's fake and is now compiled only under `renderfix` |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (not touched) |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass |

## Delta

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| none. My cycle-2 part had no Critical or Major | — | — | — |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Prior Minors are the orchestrator's to verify. For the record, my cycle-2 Minor 1 (`web/render/popover.spec.ts:test-titles:criterion-ids-wrong`) is fixed in `4f956943`. The titles now cite "(menus unchanged)" and "(REQ-15)", and `ef2afab0` extended the same correction to the six `terminals.spec.ts` titles. I checked every mapping against the plan (Requirements table). No assertion changed.
2. **[note]** Maintainability's cycle-2 Major 1 (`renderfix_tmux.go` missing its build tag) is theirs to rule on. For reference, I measured it on this tree. `renderfix_tmux.go:1` is `//go:build renderfix`, and `go list -f '{{join .GoFiles " "}}' ./internal/server | tr ' ' '\n' | grep renderfix` prints nothing (exit 1). Gates 01-build, 03-lint and 06-render-fixtures are green with it.

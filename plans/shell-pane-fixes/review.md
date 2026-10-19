# Review: shell-pane-fixes

**Plan**: shell-pane-fixes
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: shell-pane-fixes

**Plan**: shell-pane-fixes
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14750 words (budget 30000)

Scope: this is a full cycle, not a delta re-review. Cycle 1 left a Major open, not Minors only. The
diff since `review_commits[1]` (`0c7fc7f4..HEAD`) changes one file under `web/src`, `internal` or
`cmd`, and that file is `web/src/terminal/shellkeys.test.ts` (+10 lines, one new test). The rest
is plan bookkeeping: `web-tests.md`, the state file and the cycle-1 archive renames. I re-read the
whole branch's source diff (`main...HEAD`: `shellkeys.ts`, `pane.ts`, `style.css`). It is
byte-identical to what cycle 1 reviewed, so cycle 1's §3–§6 findings on that source still stand.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes, unchanged since cycle 1. `accumulateWheelDelta(accumDeltaY, eventDeltaY)` is exported from `web/src/terminal/shellkeys.ts`: the sum is passed through `wheelDeltaToScrollLines`; when `lines` is 0 the whole sum carries, otherwise `sum + lines * PIXELS_PER_LINE` carries. `pane.ts` `flushWheelScroll` calls it and stores the result. The `accumulateFrame` mirror is gone. | Yes. The two accumulation tests call the export. The new test "a sum past the 200-line clamp carries the unconsumed pixels to the next frame" (`shellkeys.test.ts:151-159`) covers edge case 2. The E2 slow-trackpad E2E is green. | pass |
| REQ-2 | Yes, unchanged since cycle 1. `@media (prefers-reduced-motion: reduce) { .shellact[data-act="busy"] { animation: none; } }` is at `web/src/style.css:1123`. | Yes. E1 asserts `animation-name: none` on the mainhead and in the tile footer, then the tick. The test also asserts `shellact-spin` when no preference is emulated (edge case 1). | pass |
| EC-1 | Reduced motion off, so the spin is unchanged. | E2 / E1's positive `shellact-spin` assertion. | pass |
| EC-2 | The sum past the 200-line clamp carries its remainder. | W1 (new test). | pass |
| DIAG | `kb:diagram/web-components`, checked in cycle 1. No source change since then, so it still holds: no new module, and `terminal/` stays at 8 modules. | — | pass |

## Build & Tests

E2E tests: pass (963, full: the run in `17-e2e.log` is `make web-build build e2e-run` with no `NOTE e2e scope` line) · Daemon tests (race): pass (26 packages `ok`, 0 FAIL) · Web tests: pass (2762 in 96 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome reports 338 files and no fixes applied) · contrast: 0 failures in each of the 3 themes · kb-check (610 records, 0 problems), e2e-lint, e2e-honest, features, features-inventory, comments, comment-ledger, versions: pass · size: 0 hits. All of this is read from `$GATES_LOG_DIR` (`gates-shell-pane-fixes-c2`, 0 failed lines). I re-ran nothing.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `cd web && npx vitest run src/terminal/shellkeys.test.ts` | pass (24/24, `18-W1.log`) |
| E1 | `cd web && npx playwright test shell-activity.spec.ts -g "reduced motion"` | pass (1/1, `19-E1.log`) |
| E2 | `cd web && npx playwright test shell-activity.spec.ts shell-scroll.spec.ts` | pass (19/19, `20-E2.log`) |
| W2 | `make web-lint` | pass (deduped to baseline web-lint) |
| W3 | `make web-test` | pass (deduped to baseline web-test, 2762) |
| W4 | `make web-build` | pass (deduped to baseline web-build) |
| E3 | `make e2e` | pass (deduped to baseline e2e, 963 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The "Shell terminal follow-ups" block is ticked and has moved from `TODO.md` to `docs/history/todo-done.md`. Neither log has a `deviation:` line, so no ADR is owed. `**Touches**` is empty. The Doc Delta sentence "the shell segment's busy spinner stands still when the system asks for reduced motion" is true: see `style.css:1123` and E1. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `pane.ts`'s `flushWheelScroll` holds no accumulator arithmetic of its own beyond storing what the pure function returns | pass | Source unchanged since cycle 1. `flushWheelScroll` calls `accumulateWheelDelta(this.wheelAccumDeltaY, this.wheelPendingDeltaY)`, zeroes the pending sum, stores `step.accumDeltaY` and returns on `step.lines === 0`. It holds no `+`, no `*` and no `PIXELS_PER_LINE`. The import of `PIXELS_PER_LINE` and `wheelDeltaToScrollLines` is gone from `pane.ts`. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only diff) |
| 2 | Terminal-output state parsing | pass (busy still comes from `data-act`; no pane text is read) |
| 3 | Blocking hook handler | pass (n/a, no daemon change) |
| 4 | Bare tmux | pass (n/a) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass (n/a, no gauge touched) |
| 7 | Session identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass (n/a) |
| 9 | Real `claude` outside canary/probes | pass (the cycle-2 diff is a pure unit test; the cycle-1 E2E runs `sleep` in a plain shell) |

## Delta (delta re-review only)

Not a delta cycle. Cycle 1's only agent-tagged issue is verified here:

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Major 1 `[web-tests]` "Plan edge case 2 has no test" | `cad0957d` | I read the diff. `accumulateWheelDelta(0, -5000)` asserts `lines === 200` and `accumDeltaY === -1000`, then `(-1000, 0)` asserts that the carry drains to `lines === 50` and `accumDeltaY === 0`. Against the source: the sum is -5000, `round(250)` clamps to 200, and -5000 + 200 × 20 = -1000, so the expectations match the code. If the clamp remainder were zeroed, `first.accumDeltaY` would read 0, not -1000, and the test would go red. `web-tests.md` records exactly that mutant: `expected +0 to be -1000`, 1 failed of 24, then the file was restored. The commit touches only `shellkeys.test.ts` and `web-tests.md`. W1 is green at 24/24. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Browser cycle-1 Note 1 still applies, and this plan keeps it on purpose ("as
   today"). The clamp remainder carries without limit, so a hard downward flick banks lines that
   the user's next wheel-ups first have to spend. The new W1 test now pins that behaviour. If the
   orchestrator files a backlog item to cap the carry, that item would have to change this test
   as well.

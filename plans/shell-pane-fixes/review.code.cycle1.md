# Correctness review: shell-pane-fixes

**Plan**: shell-pane-fixes
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14750 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `accumulateWheelDelta(accumDeltaY, eventDeltaY) => { accumDeltaY, lines }` exported from `web/src/terminal/shellkeys.ts:83`. `pane.ts` `flushWheelScroll` (`:186-195`) calls it and stores the result. The `accumulateFrame` mirror is gone from the tests. Behaviour is unchanged: the old flush ran `lines(accum)` and then `accum += lines*20` on the same running sum. The new flush computes that same sum as `accum + pending`, and the frame goes out under the same `OPEN` guard. | Partly. The two W1 accumulation tests call the export, and the E2 `shell-scroll.spec.ts` slow-trackpad test is green. Edge case 2 (carry past the 200-line clamp) has no test. See Major 1. | fail (coverage) |
| REQ-2 | Yes. `@media (prefers-reduced-motion: reduce) { .shellact[data-act="busy"] { animation: none; } }` is at `web/src/style.css:1123`. It has the same specificity as the base rule at `:1059`, comes after it, and the tile-footer override at `:1112` sets only the size, so the one rule covers both the mainhead and the tile footer. The busy shape (circle and border) is untouched. | Yes. E1 checks for `animation-name: none` on the mainhead and on the tile footer, read in the same evaluate as `data-act=busy`, and then checks for the tick. The edge-case-1 test checks that `shellact-spin` is present in both places with no emulation. | pass |
| DIAG | `kb:diagram/web-components` (from `kb for` on all four changed source files). It still holds: no new module, and the `terminal/` node stays at "8 modules". | — | pass |

## Build & Tests

All results below are read from `$GATES_LOG_DIR`. E2E tests: pass (963, full suite, `make e2e`) · Daemon tests (race): pass (`make test-race`, 26 packages ok, 0 FAIL) · Web tests: pass (2761 in 96 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) · contrast: 0 failures in each of the 3 themes · kb-check, e2e-lint, e2e-honest, features, comments, comment-ledger, versions, features-inventory: pass · size: WARN-only, 0 hits

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `cd web && npx vitest run src/terminal/shellkeys.test.ts` | pass (23/23) |
| E1 | `cd web && npx playwright test shell-activity.spec.ts -g "reduced motion"` | pass (1/1) |
| E2 | `cd web && npx playwright test shell-activity.spec.ts shell-scroll.spec.ts` | pass (19/19) |
| W2 | `make web-lint` | pass (deduped to baseline web-lint) |
| W3 | `make web-test` | pass (deduped to baseline web-test) |
| W4 | `make web-build` | pass (deduped to baseline web-build) |
| E3 | `make e2e` | pass (deduped to baseline e2e, 963 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The TODO "Shell terminal follow-ups" block moved to `docs/history/todo-done.md` with both sub-items ticked. The web log has no `deviation:` lines and no extra `doc-delta:` (`doc-delta: none beyond the plan's`), so no ADR is owed. `**Touches**` is empty. Doc Delta "the shell segment's busy spinner stands still when the system asks for reduced motion" is true per `style.css:1123` and E1. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `pane.ts`'s `flushWheelScroll` holds no accumulator arithmetic of its own beyond storing what the pure function returns | pass | `pane.ts:186-195` does three things. It calls `accumulateWheelDelta(this.wheelAccumDeltaY, this.wheelPendingDeltaY)`, zeroes `wheelPendingDeltaY`, and assigns `wheelAccumDeltaY = step.accumDeltaY`. It then returns on `step.lines === 0`. It does no `+`, `*` or `PIXELS_PER_LINE`; `PIXELS_PER_LINE` is now module-private in `shellkeys.ts`. The only `+=` left in `pane.ts` is the wheel handler collecting raw `event.deltaY` into the pending sum (`:177`), which is coalescing and not the line arithmetic. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only diff, no Claude Code format knowledge touched) |
| 2 | Terminal-output state parsing | pass (no pane content read; busy still comes from `data-act`) |
| 3 | Blocking hook handler | pass (n/a, no daemon change) |
| 4 | Bare tmux | pass (n/a, no tmux invocation added) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass (n/a, no gauge touched) |
| 7 | Session identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass (n/a) |
| 9 | Real `claude` outside canary/probes | pass (new specs run `sleep 15` in the plain shell; there is no `claude` binary) |

## Issues

### Critical

None.

### Major

1. **[web-tests]** Plan edge case 2 has no test. The plan says "Accumulated sum beyond the 200-line clamp → remainder carries to the next frame, as today → W1". Neither W1 accumulation test in `web/src/terminal/shellkeys.test.ts:125-149` reaches the clamp: the deltas are -2, -4 and -24. The clamp itself is only tested on `wheelDeltaToScrollLines` (`:111-117`), and that path ignores the accumulator. If `accumulateWheelDelta` dropped or reset the pixels the clamp left over, W1 would stay green. That is the boundary-far-from-threshold gap that kb:lesson/threshold-tested-only-far-from-its-boundary warns about. A fix must make this true: a W1 test calls `accumulateWheelDelta` with a sum past 200 lines (for example `(0, -5000)`), asserts `lines === 200` and the carried `accumDeltaY` (`-1000`), and asserts that the next call drains that carry. The test must go red if the clamp remainder is zeroed.

### Minor

None.

### Notes

1. **[note]** REQ-1 makes the unit tests exercise the real arithmetic. `pane.ts` storing `step.accumDeltaY` is still checked only end to end, by `shell-scroll.spec.ts`'s slow-trackpad test, which E2 ran green. That matches the plan's scope.
2. **[note]** The reduced-motion test asserts the done tick only in the tile footer, not on the mainhead. The plan's Proof asks for "then the tick once done" and does not name a place, so this is consistent with the plan. The existing E7/E8 specs cover the tick shape on both surfaces.

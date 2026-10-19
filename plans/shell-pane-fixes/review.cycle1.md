# Review: shell-pane-fixes

**Plan**: shell-pane-fixes
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: shell-pane-fixes

**Plan**: shell-pane-fixes
**Part verdict**: needs-changes
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

## Browser review

# Browser review: shell-pane-fixes

**Plan**: shell-pane-fixes
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6674 words (budget 30000)
**Rig**: `make web-build build` at 0960ef00 (`bin/musterd` v0.22.2-19-g0960ef00); one scratch daemon per test through the committed `web/e2e/helpers/daemon.ts` (fresh temp data dir with a space in its path, private `-S` tmux socket inside it, shared E2E stub `claude`), headless Chromium 1280×900 driving a throwaway spec (4 tests, 4 passed, 8.8 min including the gate-lock wait), spec deleted, `git status --porcelain` shows nothing of mine. Gates log c1: 0 failed lines; `web-build`, `e2e` (963 passed), E1, E2 green.

## Matrix

Hosts: Focus mainhead (`.mainhead .surfseg` shell button), Tiles footer (`.tfoot .surfseg` shell button), pop-out `/doc.html`. States: no data (idle shell), data (busy, then done), daemon-down (scratch daemon `SIGTERM`ed via `daemon.kill()`). The independent oracle for "busy" is tmux's `#{pane_current_command}`; for the wheel it is tmux's `#{scroll_position}` plus the `scroll` frames read off the WebSocket.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | focus | no data | no indicator on an idle shell | pass | `span.shellact` count 0 in mainhead shell button after the shell opened, before any command |
| REQ-2 | tiles | no data | no indicator on an idle shell | pass | count 0 in the tile's shell button |
| REQ-2 | focus | data (busy), reduce | no animation | pass | `animation-name: none`, `animation-duration: 0s`, `el.getAnimations().length` 0, `transform` `none` at t0 and at t0+1.2 s; tmux oracle `pane_current_command` = `sleep` |
| REQ-2 | focus | data (busy), reduce | busy shape still shown, visible | pass | 9×9 px, `border-radius: 50%`, top border `rgba(0,0,0,0)` with right border `rgb(166,171,188)` (the open circle); `opacity 1`, `display block`, `visibility visible`; `data-act` still `busy` after 1.2 s |
| REQ-2 | focus | data (busy), reduce | placed inside its host | pass | indicator box 1015.8,65.7–1024.8,74.7 inside shell button 1004.8,60.2–1074.4,80.2 |
| REQ-2 | focus | data (busy), reduce | keeps keyboard focus across a render tick | pass | `document.activeElement` (`xterm-helper-textarea`) is the same node after 1.2 s |
| REQ-2 | tiles | data (busy), reduce | no animation | pass | `animation-name: none`, 0 animations, `transform` `none` at t0 and t0+1.2 s; oracle `pane_current_command` = `sleep` |
| REQ-2 | tiles | data (busy), reduce | busy shape still shown, visible, placed | pass | 7×7 px circle with transparent top border; opacity 1 / block / visible; box 499.1,383.5–506.1,390.5 inside button 493.1,381–544.2,393 inside `.tfoot` y 372.5–400.5 |
| REQ-2 | focus | data (done), reduce | tick once done, still | pass | `data-act=done`, 9×5 px, `transform` matrix(0.707,-0.707,…) (rotate −45°) unchanged across 1.2 s, `animation-name: none`; box inside button |
| REQ-2 | tiles | data (done), reduce | tick once done, still | pass | 7×4 px, same rotate −45° matrix, unchanged across 1.2 s; box 498.8,382.6–506.5,390.4 inside button |
| REQ-2 / EC-1 | focus | data (busy), no preference | spin unchanged | pass | `animation-name: shellact-spin`, `0.7s`, 1 running animation; four `transform` samples 170 ms apart all differ (rotation advancing) |
| REQ-2 / EC-1 | tiles | data (busy), no preference | spin unchanged | pass | `shellact-spin` 0.7 s, four distinct rotation matrices 170 ms apart |
| REQ-2 | tiles | data (busy), preference flipped live | rule applies without reload | pass | after `emulateMedia({reducedMotion:"reduce"})` on a spinning tile, `animation-name` reads `none` 300 ms later |
| REQ-2 | tiles | daemon-down, reduce | indicator still, daemon-down surfaced | pass | `role=alert` banner "musterd unreachable — …" full-width 0,46–1280,78, visible; indicator still `busy`, `animation-name: none`, transform `none` over 1.2 s (see Note 2) |
| REQ-2 | focus | daemon-down, reduce | indicator still, daemon-down surfaced | pass | banner visible; after switching to Focus while down the mainhead shows no indicator (count 0), so nothing animates (see Note 2) |
| REQ-2 | pop-out | any | — | N/A — `/doc.html` is the reader page; it has no surface segment (`surfseg`/`shellact` absent from `web/doc.html` and `web/src/doc.ts`) | |
| REQ-1 | focus | data | slow wheel (60 × `deltaY −4`, one per frame) scrolls the same lines as today | pass | 12 `scroll` frames of `lines: 1`; tmux `scroll_position` = 12 (240 px / 20 px per line) |
| REQ-1 / EC-2 | focus | data | sum beyond the 200-line clamp carries the remainder | pass | one `deltaY −5000` event sends `lines: 200` (`scroll_position` 212); the next `deltaY −1` sends `lines: 50` (`scroll_position` 262) |
| REQ-1 | focus | data | keeps keyboard focus after wheeling | pass | `document.activeElement` (`xterm-helper-textarea`) identical after 1.2 s |
| REQ-1 | tiles | data | wheel over the tile's shell surface scrolls via the same step | pass | shell region 2,117–638.5,372.5 inside tile 1,85–639.5,401.5; frames and `scroll_position` agree (10 lines, see Note 1 for why 10, not 12) |
| REQ-1 | tiles | daemon-down | wheel with the socket closed | pass | 30 wheel events after `SIGTERM`: 0 frames sent, 0 `pageerror`s |
| REQ-1 | focus | daemon-down | wheel with the socket closed | N/A — the same `TerminalSurface` and the same `socket.readyState` guard as the tiles cell above; measured there | |
| REQ-1 | focus/tiles | no data | wheel on an empty shell | N/A — REQ-1 changes only where the arithmetic lives; the clamp/no-history case is the existing `shell-scroll.spec.ts` E9, green in gate line E2 | |
| REQ-1 | pop-out | any | — | N/A — no shell surface on `/doc.html` | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Behaviour preserved, and worth a backlog look: the remainder past the 200-line clamp
   carries without limit (plan edge case 2, "as today"). Measured: three `deltaY +20000` wheel
   events to return to the bottom sent 3 × `lines: −200` and banked about 2,400 more lines of
   scroll-down. The next 60 wheel-up events (`−4` each) over the tile's shell first sent 11 ×
   `−200` and one `−198` (scrolling down at the live bottom, which does nothing), and only then
   10 × `+1`. So a hard downward flick quietly swallows the user's next wheel-ups. The old
   `pane.ts` arithmetic does the same thing, so it is not a regression from this plan. Proposing
   it as a backlog item is the orchestrator's call.
2. **[note]** Daemon-down, outside this plan's change: with the daemon `SIGTERM`ed, the tile footer
   keeps showing `busy` (frozen state, no age shown), while the Focus mainhead, after a view
   switch, shows no indicator. The full-width `role=alert` "musterd unreachable" banner covers
   the whole dashboard's staleness, and this plan only changes whether the spinner animates. I
   am recording it for the orchestrator, not filing it as a §6 violation of this plan.
3. **[note]** The first run hit the 4-minute gate-lock wait (the lock was held by the
   `muster-launch-dialog-fixes` worktree). I reran it with `MUSTER_GATELOCK_WAIT=15m`, so nothing
   was measured against a contended rig.

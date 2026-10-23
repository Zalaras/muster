# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 64681 words (budget 30000)

This is not a Minors-only delta re-review, because cycle 2 had two Majors. Its scope is every cycle-2 issue, plus the full delta `04502c70..HEAD`, read line by line. The delta's only non-test source change is `web/src/terminal/pane.ts` (+2 lines in `refit()`). The test changes are in `web/e2e/shell-scroll.spec.ts` and `web/e2e/update.spec.ts`. No file under `internal/` or `cmd/` changed. So REQ-1..7, REQ-9 and REQ-10 keep their cycle-2 results, and I re-read REQ-8 and the sizing path in full.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes (unchanged since cycle 2) | Yes, D1 | pass |
| REQ-2 | Yes (unchanged) | Yes, D1/D2 | pass |
| REQ-3 | Yes (unchanged) | Yes, E1 (12 passed) and W1 | pass |
| REQ-4 | Yes (unchanged) | Yes, E1 | pass |
| REQ-5 | Yes (unchanged) | Yes, R1 (22 passed) | pass |
| REQ-6 | Yes (unchanged) | Yes, R2 (44 passed) and W2 | pass |
| REQ-7 | Yes (unchanged) | Yes, W3 | pass |
| REQ-8 | Yes. `shellkeys.ts` drops the carry on a reversal. `new Terminal({ rows: 2 })` stays. `refit()` (`pane.ts:297-302`) now asks `fitAddon.proposeDimensions()` first and returns without fitting or sending when it proposes nothing or a non-finite size. A detached root gives `parseInt("")` → NaN, or `parentElement` null, so a never-mounted background shell sends no unfitted geometry. The guard only acts where `fit()` was already a no-op, so a mounted surface behaves exactly as before | Yes. W4. E2E `shell-scroll.spec.ts:251` (first-notch) is green. The new `shell-scroll.spec.ts:320` (background shell size across Docs and a session switch) is green in `21-e2e.log:435` and measured red at `80x5` against `9c014e8e^` | pass (cycle-2 Major 1 closed) |
| REQ-9 | Yes (unchanged) | Yes, E3 (30 passed) | pass |
| REQ-10 | Yes (unchanged) | Yes, E5 (28 passed) | pass |
| DIAG | Checked `kb:diagram/web-components` for `pane.ts` (`go tool kb for web/src/terminal/pane.ts`). The delta adds no module and no import edge | — | pass |

## Build & Tests

E2E tests: pass (384, scoped to 33 files per the `NOTE e2e scope` line; `21-e2e.log`) · Daemon tests (race): pass (every package `ok`, `02-test.log`) · Web tests: pass (3032 in 106 files) · Render tests: pass (418) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web-lint clean). All of these are read from `$GATES_LOG_DIR` (`gates-bugs-one-batch-1-c3b`, `36 lines, 0 failed, 2 warn-only`). `WARN size` (11 hits) and the e2e-level census belong to review-maintainability.

I ran one extra soak, the flake repair's (§1): `make e2e-soak SPEC=e2e/update.spec.ts N=20 GREP='Check now disables the button the instant it starts'`, giving `20 passed (30.6s)`. This is in addition to e2e-specs' whole-file soak of `280 passed`.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass |
| test | `make test-race` | pass |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (3032) |
| render-fixtures | `make check-render-fixtures` | pass |
| render-lint | `make render-lint` | pass |
| render-test | `make render-test` | pass (418) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (54 pairs × 3 themes, 0 failures) |
| features-inventory | `features_inventory` | pass |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| kb-check | `make check-kb` | pass (639 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass |
| features | `go tool kb scope --plan bugs-one-batch-1 --touch` | pass |
| comments | `comment-checks.py --gates` | pass |
| comment-ledger | `go run ./tools/commentpass verify bugs-one-batch-1` | pass |
| size | `size-warn.sh --changed` | WARN (review-maintainability's) |
| e2e-level | `e2e-lint.sh --census` | WARN (census only) |
| e2e | `make e2e SPECS='…33 specs…'` | pass (384) |
| D1 | `go test -count=1 -run 'TestApply_NonClearSessionEnd\|TestApply_ClearSessionEnd\|TestCheckOneLiveness_StoppedGuard' ./internal/session/` | pass |
| D2 | `go test -count=1 ./internal/session/ ./internal/server/` | pass |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts` | pass |
| W2 | `cd web && npx vitest run src/reader/memory.test.ts` | pass |
| W3 | `cd web && npx vitest run src/render/focusview.test.ts` | pass |
| W4 | `cd web && npx vitest run src/terminal/shellkeys.test.ts` | pass |
| W5 | `make web-test` | pass (deduped to web-test) |
| R1 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/notes.spec.ts` | pass (22) |
| R2 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/reader.spec.ts` | pass (44) |
| R3 | `make render-test` | pass (deduped to render-test) |
| E1 | `make e2e SPECS='e2e/rail-menu.spec.ts'` | pass (12) |
| E3 | `make e2e SPECS='e2e/effort-header.spec.ts'` | pass (30) |
| E5 | `make e2e SPECS='e2e/update.spec.ts'` | pass (28) |
| L1 | `make lint` | pass (deduped) |
| L2 | `make web-lint` | pass (deduped) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**, see Major 1 (`[orchestrator]`, non-blocking). This is a sweep batch, so the `TODO.md` tick stays with the loop. The fix waves add no `deviation:` line. The superseding ADR is unchanged and still `proposed`. Cycle-2 Minor 2 is fixed: `doc-delta.md` § rail now reads `Actions for N sessions`, `Actions for 1 session` at one. But `doc-delta.md` § surfaces says "No doc change", and the `refit()` fix makes a surfaces/protocol sentence untrue |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The e1 re-check never writes `alive` from the payload, and the goroutine ends at the cap or when the pane is gone | pass | `internal/` is untouched by the delta, so the cycle-2 evidence stands |
| RV2 | `railmenu.ts` reads `groups.selecting()`/`selectedIds()` inside `open()` | pass | Unchanged |
| RV3 | Stored scroll applied only on the build/remembered-open path, never on `storage` adoption, clamped | pass | Unchanged |
| RV4 | The E4 comment no longer claims a pre-sizenote first fit | pass | Unchanged |
| RV5 | `#action-error` cleared on reconnect only for `network_error` | pass | Unchanged |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: there is no Go change, and `pane.ts` carries no Claude Code vocabulary |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: ingest is untouched |
| 4 | tmux via `-L muster`, no `resize-pane` | pass: sizing still goes through the resize frame → `pty.Setsize` then `resize-window`. The new spec reads tmux through `daemon.tmuxDisplay` on the daemon's private socket. `window-size manual` (`internal/tmux/tmux.go:146`) is why the un-resized 80×24 attach PTY leaves the window alone, as the new journey measures |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: no gauge path is touched |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass: the stub harness only |

## Delta (verification of every cycle-2 issue)

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 code Major 1 `[web-impl]` "`rows: 2` shrinks a background shell's tmux window to 80×5" | `9c014e8e` | I read the diff and the `@xterm/addon-fit` source. `proposeDimensions()` returns `undefined` when there is no `parentElement` or cell width is 0, and NaN rows/cols when the parent has no computed height, which is the detached case. `fit()` makes the same check and silently returns, so the new early return only drops the send that followed a no-op fit. A later mount is still fitted and sent: `focus.ts:255`, `tiles.ts:201` and the render tick call `refit()`, and `attach()` reset `lastSent*` to 0. The web log's before/after shows `afterSwitchBack` going from `80x5` to `130x24`, and the first-notch repro still gives `552/552`, `pane_in_mode=1`, `scroll_position=5`. `rows: 2` is kept. The browser cycle-2 matrix (mounted Focus/Tiles fits) is unaffected, because mounted surfaces propose finite dimensions |
| cycle 2 code Major 2 `[e2e-specs]` "no test pins Major 1" | `5e911a01` | `shell-scroll.spec.ts:320` follows the shape I asked for: shell on A, Docs on A, click B then A. It asserts the full `WxH` (width and height) is unchanged, both on Docs and after a 1.5 s `settleFor`, which is a stays-unchanged check of the kind the e2e policy allows. The fitted read polls for width ≠ 80 first, so it cannot capture an unfitted size. `test-specs.md` records it red against `9c014e8e^` (`Expected "130x24" / Received "80x5"`, `8 passed, 1 failed`). Green in the gate (`21-e2e.log:435`). It is at the right level: two launches across a live daemon plus a tmux oracle |
| cycle 2 code Minor 1 `[e2e-specs]` "vacuous `undefined === undefined` scrollbar re-read" | `5e911a01` | `expect(bars).not.toBeNull()` and `expect(bars?.track).toBeGreaterThan(0)` now precede `slider === track`, so a `null` return fails |
| cycle 2 code Minor 2 `[orchestrator]` "doc-delta § rail plural at one" | `7f5e2e2f` | `doc-delta.md` § rail: "names the count (`Actions for N sessions`, `Actions for 1 session` at one)" |
| — `ac7103d0` flake repair, `update.spec.ts:986` (outside the plan's requirements; judged for weakening only) | `ac7103d0` | I read the diff and the Repairs row. The pause target is now the page's own `Date.now()` + 2 s instead of Node's `new Date()`, so `pauseAt` can no longer aim behind the fake clock. The clock is still paused before `fakeServer.hold()` and the click, and nothing fires after the pause. Every assertion, timeout and the title are unchanged, and no retry was added. Jumping forward can fire the 1 s render tick before the click. That cannot satisfy the post-click `isDisabled`/`aria-busy` reads, because the button is asserted enabled before the pause and only `check()` disables it. The repair does not weaken the test. My extra soak (N=20, narrowed to the test) gave `20 passed` |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** The `refit()` fix makes two doc sentences untrue, and the Doc Delta does not carry the change.

   **Where.** `docs/features/surfaces/spec.md:34` says "The client sends a resize frame on open and then debounced". `docs/protocol.md` `kb:anchor/terminal.ws` (line 1646) says "client sends one immediately after open (the attach PTY starts at 80×24 until it arrives)".

   **What changed.** Since `9c014e8e`, a surface that is not laid out (a background shell behind Docs) sends **no** resize on open. Its first frame goes out when it is first mounted and fitted. The web log says "no doc-delta", and `doc-delta.md` § surfaces says "No doc change", so doc-reconcile will leave both sentences as they are.

   **What a fix must make true:** `doc-delta.md` carries a surfaces / `kb:anchor/terminal.ws` line. It should say that the first resize is sent on open once the surface is laid out, and that a surface with no layout sends none until it is mounted, so its tmux window keeps its size. No message, field or anchor changes.

   This is doc upkeep, so it does not block approval.

### Minor

None.

### Notes

1. **[note]** Pre-plan, the same send carried the constructor's 80×24, so a background shell behind Docs was resized to 80 columns on every rebuild. That behaviour is also gone now: `afterSwitchBack` keeps 130 columns. The doc line in Major 1 should describe the present behaviour, not either old one.
2. **[note]** `git status` shows an untracked `web/e2e/zz-browser-review-c3.spec.ts`. It is review-browser's scratch spec for this cycle, not mine, and I left it alone. My soak created no file.
3. **[note]** e2e-specs' Fix Attempt 2 notes one unreproduced `89/90` soak failure in the REQ-7 slow-trackpad test, a test and code path this wave did not touch. It was followed by three clean whole-file soaks (270 runs), and the gate's scoped run is green. Nothing is requested. If it reds at Final Validation, its failing line is the lead.

# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 64681 words (budget 30000)

This is not a Minors-only delta re-review, because cycle 3 had a browser Major. Its scope is that Major, my own cycle-3 `[orchestrator]` Major 1, and the full delta `fff8a527..HEAD`, read line by line:
- `fc3856c9` changes `web/src/terminal/pane.ts`, the only non-test source change.
- `3b782beb` changes `web/e2e/shell-scroll.spec.ts` and `web/e2e/helpers/shellinput.ts`.
- `0680c32a` is the comment pass. Its one drop is not reviewed.

`git diff --stat fff8a527..HEAD -- internal cmd docs` is empty. So REQ-1..7, REQ-9 and REQ-10 keep their cycle-3 results, and I re-read REQ-8 and the terminal open/fit/send path in full.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes (unchanged since cycle 2) | Yes, D1 | pass |
| REQ-2 | Yes (unchanged) | Yes, D1/D2 | pass |
| REQ-3 | Yes (unchanged) | Yes, E1 (12 passed) and W1 | pass |
| REQ-4 | Yes (unchanged) | Yes, E1 | pass |
| REQ-5 | Yes, unchanged in `notes.ts`. `TerminalSurface.focus()` now no-ops until xterm is opened. Every host calls `refit()` straight after `mountSlotRoot` (`focus.ts`, `tiles.ts`), so a mounted surface is opened before any `focusSelected`. Before this change, the not-yet-opened case called `focus()` on a textarea in a detached body, which also did nothing. So behaviour is the same | Yes, R1 (22 passed) | pass |
| REQ-6 | Yes (unchanged) | Yes, R2 (44 passed) and W2 | pass |
| REQ-7 | Yes (unchanged) | Yes, W3 | pass |
| REQ-8 | Yes. `shellkeys.ts` still drops the carry on a reversal. The constructor no longer calls `term.open()`. `refit()` first calls `openIfLaidOut()` (`pane.ts:322-328`), which opens into `bodyEl` only once `clientWidth`/`clientHeight` are > 0. Output that arrives before that is written into the unopened core (`term?.write`), so the open, the fit and xterm's scroll area all happen against the laid-out body. The cycle-3 `proposeDimensions()` guard stays. `geometry` is `null` until opened, so a mounted-but-unlaid-out body shows no constructor `80×2`. `canPasteNow()` and `focus()` are gated on `opened`. `hasTerminal()`, `applyTheme()` and `reattachIfDisconnected()` still key on `term`, which is right: none of them needs a rendered terminal | Yes. W4. The new `shell-scroll.spec.ts:377` is green (`21-e2e.log:451`) and was measured red against `fc3856c9^` at the slider assertion. The fresh-shell first-notch test and the cycle-3 background-size test are still green | pass (browser cycle-3 Major 1 closed) |
| REQ-9 | Yes (unchanged) | Yes, E3 (30 passed) | pass |
| REQ-10 | Yes (unchanged) | Yes, E5 (28 passed) | pass |
| DIAG | `go tool kb for web/src/terminal/pane.ts` names `kb:diagram/web-components`. The delta adds no module, no import edge and no second WebSocket. `pane.ts` is still the one socket constructed outside `ws.ts`, as the diagram says | — | pass |

## Build & Tests

All of these are read from `$GATES_LOG_DIR` (`gates-bugs-one-batch-1-c4`, `36 lines, 0 failed, 2 warn-only`):
- E2E tests: pass (385, scoped to 33 files per the `NOTE e2e scope` line; `21-e2e.log`)
- Daemon tests (race): pass (27 packages `ok`, no `FAIL`; `02-test.log`)
- Web tests: pass (3032 in 106 files)
- Render tests: pass (418)
- Daemon build: pass
- Web build: pass
- Lint: pass (`0 issues.`; web-lint clean)

`WARN size` (11 hits) and the e2e-level census belong to review-maintainability.

The delta repairs no flaky spec. `test-specs.md` Fix Attempt 4 records `Repairs: None`, and e2e-specs already soaked the touched file (`make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10`: 100 passed). So I ran no soak of my own.

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
| e2e | `make e2e SPECS='…33 specs…'` | pass (385) |
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
| DOC | doc upkeep + Doc Delta vs what shipped | pass. My cycle-3 Major 1 is closed by `a5b501b3`: `doc-delta.md` § surfaces now stages the first-resize line against both `docs/features/surfaces/spec.md:34` and `docs/protocol.md:1646`. It is still true after `fc3856c9` (Note 1). Fix Attempt 3 has `design:` lines only, with no `deviation:` or `doc-delta:` line, so no ADR is owed. This is a sweep batch, so the `TODO.md` tick stays with the loop |

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
| 2 | No terminal-output state parsing | pass: the new spec reads `hist-line-200` only as a display oracle |
| 3 | Non-blocking hook handler | pass: ingest is untouched |
| 4 | tmux via `-L muster`, no `resize-pane` | pass: sizing still goes through the resize frame, then `pty.Setsize`, then `resize-window`. The new spec reads tmux only through `daemon.tmuxDisplay` on the daemon's private socket |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: `geometry` now answers `null` (no geometry) instead of a made-up `80×2` before the first open, which is the honest direction |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass: the stub harness only |

## Delta (verification of every cycle-3 issue)

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 3 browser Major 1 `[web-impl]` "a shell rebuilt while unmounted keeps a 2-row xterm scroll range (slider 20 / track 48); the first flick and first reversed notch never reach tmux" | `fc3856c9` (code), `3b782beb` (test) | **Code.** I read the diff. `term.open(this.bodyEl)` left the constructor, and `rg "term\.open\|new Terminal" web/src` gives `pane.ts` only. Opening is now lazy and owned by `openIfLaidOut()`, which `refit()` calls first, so no detached open can happen. The web log's after-run gives `552/552` and `576/576` with frames `[scroll -200]` then `[scroll 5]`, `pane_in_mode 1` and `scroll_position 5`. It covers the switch, no-docs switch, fresh, docs-same and A→B→A paths at 690 and 720. **Test.** `shell-scroll.spec.ts:377` follows the browser's exact path (shell on A with 200 history lines, Docs, B, A, Shell, no new output). It asserts four things: the slider fills the track (a `null` read fails), a +10000 flick sends exactly `[-200]` with `pane_in_mode 0`, the first −100 makes the frames `[-200, 5]` with `pane_in_mode 1` and `scroll_position 5`, and the slider still fills the track afterwards. `WsScrollRecorder` is built before `goto`, so it sees every `/ws/shell/` socket. `fillShellHistory` only types, so the first `[-200]` cannot be polluted by an earlier wheel. `test-specs.md` records the test red against `fc3856c9^` at the slider poll (`Expected: true / Received: false`). It is green in the gate. It is at the right level: two launches across a live daemon, plus a tmux oracle |
| cycle 3 code Major 1 `[orchestrator]` "Doc Delta misses the first-resize change" | `a5b501b3` | `doc-delta.md` § surfaces carries the line and names both unconditional sentences it retires. It is re-checked against `fc3856c9` in Note 1 |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The staged surfaces line is still accurate after `fc3856c9`. It reads: "first resize frame on open once the surface has a layout; a surface without one … sends none until it is mounted". I traced both orders:
   - **Mounted before the socket opens** (the usual Focus/Tiles construction). The mount-time `refit()` opens xterm and fits. Its debounced `send` finds the socket still `CONNECTING` and sends nothing, and `lastSent*` stays 0. The open handler's `refit(true)` then sends the first frame immediately. So the first frame still goes out on open.
   - **Not laid out at open** (a shell kept behind Docs). `openIfLaidOut` returns false, so nothing is sent. The first frame comes from the mount-time `refit()`, debounced ~100 ms, after `attach()` reset `lastSent*`.

   That is the same send behaviour `9c014e8e` had: only the reason the unmounted refit bails changed, from NaN dimensions to unopened. So the orchestrator's "the first resize frame now goes out from the mount-time refit that opens xterm" is true only in the late-mount case, which the line already describes. The line should not be widened. `docs/protocol.md`'s "(the attach PTY starts at 80×24 until it arrives)" is daemon-side and unchanged.
2. **[note]** For review-maintainability: the comment pass dropped `openIfLaidOut`'s docstring. Nothing at the call site now says why the open is lazy (the detached-open scroll range). That reason is in web-implementation.md's Fix Attempt 3 Root cause. This is the same concern as maintainability cycle-3 Note 1, and the shape is theirs.
3. **[note]** `git status --porcelain` shows only the orchestrator's `orchestration-state.json`. No scratch spec is left in `web/e2e/` this cycle, and I created no file but this one.

# Review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser needs-changes, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: approved
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

## Browser review

# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at ac7103d0 (dirty only in plans/). Each test got a fresh `bin/musterd` from `helpers/fixtures.ts`, with a space-bearing data dir `$TMPDIR/muster e2e-38add35a-*`, a private `-tmux-socket` inside it and the harness stub `claude`. I drove it with headless Chromium through a throwaway `web/e2e/zz-browser-review-c3.spec.ts`, run in the foreground under `bin/gatelock run --exclusive`. For one comparison run I built the pre-fix tree (04502c70) in a temporary detached worktree under `/tmp`. The spec and that worktree are both deleted.

Gates log (`gates-bugs-one-batch-1-c3b`): 36 lines, 0 failed, 2 warn-only. `e2e` (33 scoped specs) and `web-build` are green, so the app I drove is the one that ships.

Scope. The only product change since cycle 2 is 9c014e8e. In it, `TerminalSurface.refit()` (`web/src/terminal/pane.ts`) returns without fitting or sending a resize when `proposeDimensions()` proposes nothing. `refit()` is shared by every terminal, so I re-drove the following:
- the correctness reviewer's cycle-2 scenario;
- first attach and the resize round-trip for Claude and the shell, in Focus and in Tiles;
- daemon-down and restart;
- the cycle-1 wheel-reversal repro, once on a fresh Focus shell and once on the shell from the cycle-2 scenario.

No other cell from cycles 1–2 can be reached by `pane.ts`, so those cells stand (`review.browser.cycle2.md`, `review.browser.cycle1.md`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 (code cycle-2 Major 1) | focus shell, A → Docs → B → A | data, 1280×690 | the background shell keeps its fitted tmux size | pass | tmux `130x23` when fitted, after Docs, while on B, and back on A with Docs still selected (after a 1.5 s hold). No `/ws/shell/` resize frame was sent between the fit and the reselect (`frames since fit []`) |
| REQ-8 (code cycle-2 Major 1) | focus shell, same path | data, 1280×720 | the same | pass | `130x24` throughout, no resize frame sent while unmounted |
| REQ-8 | focus shell, reselected after the path above | data, 690 / 720 | still fitted: tmux = size note = xterm rows | pass | `130×23 · one live client · geometry owned by this pane`, tmux `130x23`, 23 rows (and the same at 24 for 720); typing `echo c3-back-ok` round-trips |
| REQ-8 / §7 | focus shell, reselected after Docs → B → A | data, 690, no new output | xterm holds no scroll range; the first reversed notch after a flick reaches tmux | **FAIL** | scrollbar track **48 px**, slider **20 px** (it should be 552/552). On hover it reads `visible scrollbar vertical`, opacity 1. A +10000 flick sent **no** frame. The first −100 sent **no** frame (`pane_in_mode 0`). Only the second −100 sent `scroll 5` (`1 5`). Same result on the pre-fix 04502c70 build (Major 1) |
| REQ-8 / §7 | focus shell, Docs → Shell on the same session (no switch) | data, 690 | the same | pass | slider 552 = track 552; the first −100 → `scroll 5`, `1 5`; flick then −100 → `-200`, `5` |
| REQ-8 / §7 | focus shell, A → B → A with the shell selected | data, 690 | the same | pass | the socket closes and reopens; slider 552 = 552; flick `-200`, then each notch `5`: `1 5`, `1 10`, `1 15`, `1 20` |
| REQ-8 (cycle-1 Major 1) | focus shell, fresh | data, 690 (23 rows) | the first −100 after a +10000 flick reaches tmux | pass | slider 552 = track 552 before and after; frames `scroll -200`, `scroll 5`, `scroll 5`; tmux `0` after the flick, `1 5` after the first notch, `1 10` after the second |
| `refit` / REQ-7 | focus Claude | data, first attach at 899 | tmux = size note = xterm rows | pass | `130×32`, tmux `130x32`, 32 rows |
| `refit` / REQ-7 | focus Claude | data, resized 899 → 690 → 601 → 777 | the same after each resize | pass | 23/19/27 rows; tmux and size note agree each time; slider = track (552/456/648) |
| `refit` | focus Claude, A while B is focused | data | the background Claude terminal keeps its size | pass | A `130x27` before and while B was focused; B first attach `130×27` = tmux; A back `130x27` |
| `refit` | focus Claude, A → Docs → B → A → Claude | data, 690 | refits; no scroll range | pass | `130×23` = tmux = 23 rows; slider 552 = 552; a −300 wheel leaves the first row `MUSTER-STUB-READY`, slider `top:0px` |
| REQ-5 / `refit` | focus Claude | data | keeps keyboard focus across a tick | pass | after a click, `activeElement` is `textarea.xterm-helper-textarea[aria-label="Terminal input"]`, and it is still that element 1.2 s later |
| `refit` / REQ-7 | focus shell | data, first attach at 777, resized → 899 → 690 → 601 | tmux = size note = xterm rows | pass | 27/32/23/19 rows, tmux agrees each time, slider = track (768/552/456); Claude reselected at 601 → `130×19` = tmux |
| `refit` / §6 | focus Claude | daemon-down → restart | daemon-down is surfaced; the terminal refits after the restart | pass | `#banner` `display:block`, `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; after the restart the banner is `display:none` and Claude is `130×19` = tmux = 19 rows |
| `refit` / REQ-7 | tiles Claude ×2 | data, first attach at 899 | footer `.geo` = tmux = xterm rows; placed inside the tile | pass | both `84×14` = tmux `84x14`, 14 rows; terminal box y 117–462 inside tile y 85–491; slider 336 = track 336 |
| `refit` | tiles shell (A's tile switched to shell) | data, first attach | the same | pass | `84×14` = tmux, 14 rows, slider 336 = 336 |
| `refit` | tiles shell A + Claude B | data, resized → 690 → 1000 | the same after each resize | pass | `84×10` at 690 and `84×16` at 1000, both tiles agree with tmux each time; terminal boxes stay inside their tiles |
| `refit` | tiles, A switched back to Claude; then moved to Focus | data, 1000 | refits in the new host | pass | tile `84×16` = tmux; A's unmounted shell stays `84x16`; in Focus A is `130×36` = tmux = 36 rows |
| `refit` | pop-out | any | — | N/A — `/doc.html` hosts no terminal | |
| any | tiles | daemon-down | — | [note] not re-driven this cycle; the cycle-2 tiles daemon-down cell stands (see Note 2) | |

## Issues

### Critical

None.

### Major

1. **[web-impl]** The cycle-1 wheel-reversal defect comes back on a shell rebuilt while unmounted. The path is the cycle-2 scenario: open the shell on A, select Docs, click B's card, click A's card, select Shell. Until new output arrives, xterm's own vertical scrollbar stays sized for 2 rows (track 48 px, slider 20 px, visible on hover), and xterm consumes the wheel:
   - a +10000 flick sends no `scroll` frame;
   - the first reversed −100 sends none either (`pane_in_mode 0`);
   - only the second notch reaches tmux.

   It clears once the shell prints output or the viewport is resized (720 → slider 576 = track 576). The fresh-shell path, the Docs → Shell path without a switch and the A → B → A path with the shell selected are all clean. On the switch path, the rebuilt socket's first `resize` frame is sent only on remount, after the terminal's DA replies. 9c014e8e did not cause this: the pre-fix 04502c70 build measured the same 48/20 bar and the same eaten flick and notch. Cycle 2 never drove this path. The shell is in `web/src/terminal/pane.ts` (the surface built or opened into an unmounted host). A fix must make this true: when a terminal first becomes laid out, xterm's scrollbar slider equals its track (no scroll range of its own) before any new output, so the first wheel event after the reselect reaches tmux.

### Minor

None.

### Notes

1. **[e2e-specs]** The new `shell-scroll.spec.ts` test ("a background shell keeps its fitted tmux window size … across a switch to another session and back") stops at the tmux size while Docs is still selected. It never reselects Shell, reads the scrollbar or wheels, so it could not have failed for Major 1. The existing REQ-8 reversal journey runs only on a freshly opened shell. A journey that covers Major 1 reselects Shell after the switch and then runs that test's slider = track and first-reversed-notch assertions.
2. **[note]** I did not re-drive Tiles daemon-down this cycle. The Focus daemon-down/restart cell covers `refit()` after a reconnect. The cycle-2 Tiles daemon-down cell (banner, overlays, refit after restart) stands.
3. **[note]** Tiles has no Docs surface, so Major 1's path (unmount via Docs plus a session switch) has no Tiles equivalent. In Tiles, an unmounted shell (A switched back to Claude) kept its `84x16`.
4. **[note]** Housekeeping:
   - The three scratch dirs I noted in cycle 2 (`muster e2e-38add35a-0sYars`, `…-jjqW6X`, `…-PL8IYo`) and the harness's `muster e2e-stub-*` dir are still in `$TMPDIR`. They are not mine and I left them.
   - I deleted `web/test-results/`, which is Playwright's gitignored output dir.
   - No `musterd` process is left running. The temporary `/tmp` worktree is removed (`git worktree list` no longer shows it).
   - `git status --porcelain` shows nothing of mine apart from this file.

## Maintainability review

# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: The delta `git diff 04502c70..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` is one file, `web/src/terminal/pane.ts` (+2, commit 9c014e8e). The whole branch is still 19 files (349+, 92-). The other 18 are byte-identical to what cycle 2 reviewed (approved), so their cycle-2 rows stand. Cycle 2 left no open agent-tagged issue, so there is no `## Delta` table of prior Minors.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/terminal/pane.ts | `attach()`'s socket-`open` handler (`pane.ts:214-217`, `refit(true)`); the `refit` callers `features/focus.ts:240-257` (`mountTerminalSurface`: `mountSlotRoot`, then `surface.refit()`, then reads `surface.geometry`) and `features/tiles.ts:197-204` (`renderSurfaceTileBody`, same order); `@xterm/addon-fit` 0.11.0 `FitAddon.ts:36-66` (`fit()` and `proposeDimensions()`). `rg -n 'refit\(\|proposeDimensions\|fitAddon\.fit' web/src --glob '!*.test.ts'` gives `pane.ts:216,297,300,302`, `tiles.ts:201`, `focus.ts:255` and comments only in `render/focusview.ts:29,32`. | yes (web-implementation.md Fix Attempt 2: the guard sits in `refit()`, the one place a fit becomes a `resize` frame; reuses `FitAddon.proposeDimensions()`; two alternatives named and dropped) | none (373 lines; `19-size.log` names no `web/src/terminal` file) | pass; notes 1, 2 |
| (other 18 files) | unchanged since cycle 2 | as cycle 2 | as cycle 2: `manager.go` 632, `groups.ts` 507, `reader.ts` 707, reasons hold; `funlen` on the untouched `readerDocs` / `readerMermaidDocs` and on `manager_test.go`, which was already over on `main` | pass (cycle 2 rows stand) |

Per-question read of the delta:

1. **Does this already exist?** No. No earlier `proposeDimensions` call exists in `web/src`, and `refit` is still the only code that turns a fit into a `resize` frame. The guard calls xterm's own check rather than writing a second one.
2. **Does it match its siblings?** Yes. The guard has the same early-`return` shape as the `!this.term || !this.fitAddon` and `cols <= 0 || rows <= 0` guards on either side of it. It is also the same test `fit()` makes before it runs (`FitAddon.ts:37`: `!dims || … isNaN(dims.cols) || isNaN(dims.rows)`). The callers did not change. `focus.ts` and `tiles.ts` still call `mountSlotRoot` before `refit()`, so a mounted surface fits and sends as it did before. On the open handler's `refit(true)`, a detached surface now sends nothing. Its first send then comes from the next caller, debounced, after `attach()` has set `lastSentCols/Rows` to 0.
3. **Shared state.** There is no new state. `refit` runs on the main thread, and its `resizeTimer` / `lastSent*` handling is unchanged.
4. **Is a layer crossed?** No. The change stays inside `terminal/`, which already owns the FitAddon.
5. **Pattern by label.** None.
6. **Size.** No warning on this file.
7. **Seam explained.** No new type or seam. The behaviour change has a `design:` line.
8. **Diagram.** No new module or dependency edge.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Taste, no convention cited. `fit()` makes the same check internally and silently returns when it fails (`FitAddon.ts:36-39`). So a newcomer reading `pane.ts:300-301` will likely think the new guard is redundant and delete it, and that would bring back the unfitted send. What makes the guard load-bearing is that `fit()` returns quietly and the code then reads `term.cols/rows`, which for a never-laid-out surface still hold the constructor's 80x2. That reason lives only in web-implementation.md's Root cause. The existing `catch` comment ("container not yet laid out (zero size) — nothing to fit") reads as covering the `throw` path only. One clause near the guard, or in `refit`'s docstring, would keep it from being removed. That is the comment pass's call, not a requested change.
2. **[note]** `proposeDimensions()` now runs twice per `refit` on a mounted surface: once in the guard and once inside `fit()`. That is two `getComputedStyle` pairs. `refit` is documented as "safe to call on every render pass", but it only runs for the surfaces `focus.ts` / `tiles.ts` mount, at most a handful per pass. The cost is negligible, and reproducing `fit()` by hand to save one call would mean copying its private-API `_renderService.clear()` line. No change requested.

# Review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 4
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: approved
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

## Browser review

# Browser review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 14927 words (budget 30000)
**Rig**: `make web-build build` at 0680c32a (dirty only in `plans/`). Each test got a fresh `bin/musterd` from `helpers/fixtures.ts`, with a space-bearing data dir `$TMPDIR/muster e2e-*`, a private `-tmux-socket` inside it and the harness stub `claude`. I drove it with headless Chromium through a throwaway `web/e2e/zz-browser-review-c4.spec.ts`, run in the foreground under `bin/gatelock run --exclusive`. The spec is deleted.

Gates log (`gates-bugs-one-batch-1-c4`): 36 lines, 0 failed, 2 warn-only. `e2e` (33 scoped specs) and `web-build` are green, so the app I drove is the one that ships.

Scope. Since cycle 3 the only product change is fc3856c9. In `web/src/terminal/pane.ts`, `term.open()` is now deferred to `openIfLaidOut()`, which `refit()` calls. `geometry`, `focus()` and `canPasteNow()` now gate on `opened`. Every terminal goes through that path, so I re-drove these:
- cycle-3 Major 1 at both heights;
- the three clean shell paths;
- the background-size check;
- first attach, keyboard focus and typing for Claude and the shell, in Focus and in Tiles;
- a rail click on a session that has never been shown (`focus()` now no-ops until the terminal is open);
- daemon-down and restart in both views;
- a shell built inside a Tiles tile that is already laid out.

No other cell from cycles 1–3 can be reached by this change, so those cells stand (`review.browser.cycle{1,2,3}.md`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 (cycle-3 Major 1) | focus shell, A → Docs → B → A → Shell | data, 1280×690, no new output | xterm holds no scroll range on the reselect | pass | Straight after the reselect, the slider is 552 and the track is 552, at 23 rows. Size note `130×23` = tmux `130x23` = 23 rows. Cycle 3 measured 48/20 on this path |
| REQ-8 (cycle-3 Major 1) | same | data, 690 | the flick and the first reversed notch reach tmux | pass | frames `[-200]` after the +10000 flick, `pane_in_mode 0`; `[-200, 5]` after the first −100, tmux `1` / `scroll_position 5`; the second notch gives `1 10` |
| REQ-8 (cycle-3 Major 1) | same | data, 1280×720 | the same | pass | slider 576 = track 576 at 24 rows, `130×24` = tmux; flick `[-200]`, mode 0; first notch `[-200, 5]`, `1` / `5`; second notch `1 10` |
| REQ-8 (cycle-2 Major 1) | focus shell, A → Docs → B → A | data, 690 / 720 | the background shell keeps its fitted tmux size | pass | tmux `130x23` (or `130x24` at 720) when fitted, during Docs, on B, and back on A with Docs shown after a 1.5 s hold. `/ws/shell/` resize frames while unmounted: `[]`. After the reselect there is exactly one: `130x23` or `130x24` |
| REQ-8 | focus shell, fresh | data, 690 | no scroll range; the first reversed notch reaches tmux | pass | slider 552 = 552; flick `[-200]`, mode 0; notch `[-200, 5]`, `1` / `5` |
| REQ-8 | focus shell, Docs → Shell on the same session | data, 690 | the same | pass | `130×23` = tmux = 23 rows; slider 552 = 552; flick `[-200]`, mode 0; notch `[-200, 5]`, `1` / `5` |
| REQ-8 | focus shell, A → B → A with Shell selected | data, 690 | the same | pass | `130×23` = tmux = 23 rows; slider 552 = 552; flick `[-200]`, mode 0; notch `[-200, 5]`, `1` / `5` |
| `refit`/open | focus Claude, first attach | data, 1280×899 | size note = tmux = xterm rows; placed in the slot | pass | `130×32` = tmux `130x32` = 32 rows; slider 768 = track 768. The terminal box `300,95–1280,873` equals the `#main-terminal-slot` box |
| `focus()`/open | focus Claude | data | a click focuses it, focus survives a tick, typing echoes | pass | `activeElement` is `TEXTAREA.xterm-helper-textarea` inside `Terminal: c4f-a`, still there 1.2 s later; real keys `hello-c4` + Enter → `stub-echo:hello-c4` |
| `refit`/open | focus shell, first attach | data, 899 | size note = tmux = xterm rows; focus; typing | pass | `130×32` = tmux = 32 rows, slider 768 = 768; after a click and 1.2 s, focus is inside `Shell: c4f-a`; `echo c4-shell-$((40+2))` → `c4-shell-42` |
| `focus()`/open (kb:adr/focus-rail-click-focuses-terminal) | focus, rail click on a session never shown before | data | the newly built terminal receives keyboard focus | pass | 1.2 s after clicking B's card, `activeElement` is `xterm-helper-textarea` inside `Terminal: c4f-b`; `130×32` = tmux = 32 rows |
| `focus()`/open (kb:adr/launch-opens-launched-session) | focus + tiles, launch | data | the launched terminal gets focus with no click | pass (committed spec) | `launch-opens-session.spec.ts`, 5/5 green on this build (outside the gate scope). It asserts `activeElement` and typed-key routing on a newly built terminal in Focus, in a Tiles free slot and in a full Tiles grid |
| `canPasteNow`/open | focus + tiles | data | file drop / text drop still paste | pass (committed spec) | `drop.spec.ts`, 8/8 green on this build (outside the gate scope): escaped path pasted and echoed after Enter, a text drop, a drop on a closed socket gives the not-connected notice, a Tiles drop lands only in its own tile |
| §6 / `refit` | focus Claude | daemon-down → restart | daemon-down shown prominently; overlay; refit after the restart | pass | `#banner` `display:block`, `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; overlay `display:flex`, opacity 1, `disconnected — daemon down`. After the restart, the banner and overlay are both `display:none`. Resized to 690 and settled 1.5 s: `130×23` = tmux = 23 rows; typing echoes `stub-echo:after-restart` |
| `refit`/open | tiles Claude ×2, first attach | data, 899 | footer `.geo` = tmux = xterm rows; inside the tile | pass | both `84×14` = tmux `84x14` = 14 rows; slider 336 = 336; terminal y 117–462 inside tile y 85–491 |
| `focus()`/open | tiles Claude B | data | a click focuses it across a tick; typing echoes | pass | focus is inside `Terminal: c4t-b` after 1.2 s; `stub-echo:tile-b-hi` |
| `refit`/open | tiles shell built in a tile that is already laid out (A's footer → shell) | data, 899 | open on first render; geo = tmux = rows; no scroll range; focus; wheel | pass | Straight after the switch: opened, 14 rows, slider 336 = 336. `84×14` = tmux = 14 rows, inside the tile. Focus stays inside `Shell: c4t-a` across 1.2 s. The first −100 on 60 lines of output → tmux `1 5` |
| `refit` | tiles shell A + Claude B | data, resized → 690 (settled 1.5 s) | both refit; inside the tile | pass | both `84×10` = tmux `84x10` = 10 rows, slider 240 = 240; terminal y 117–358 inside tile y 85–387 |
| §6 / `refit` | tiles | daemon-down → restart | banner; overlay on each tile; refit after the restart | pass | `#banner` `display:block`; `disconnected` overlay on Claude B's tile and on shell A's tile. After the restart the banner is `display:none`. Resized to 1000: B `84×16` = tmux = 16 rows, slider 384 = 384, inside the tile. A's tile still hosts `Shell: c4t-a` |
| any | pop-out | any | — | N/A — `/doc.html` hosts no terminal | |
| REQ-8 path | tiles | data | Docs + switch path | N/A — Tiles has no Docs surface (cycle-3 Note 3) | |

## Issues

### Critical

None.

### Major

None. Cycle-3 Major 1 is fixed: on its exact path the slider fills its track at both heights, and the flick and the first reversed notch both reach tmux.

### Minor

None.

### Notes

1. **[note]** Method. My first pass read the Tiles 690 cell and the Focus resize-after-restart cell straight after `setViewportSize`. Both polls passed early, on the stale pre-resize geometry, where footer, tmux and rows all still agreed (`84×14` in a 241 px region). Re-measured after a 1.5 s settle, both refit correctly (`84×10`, `130×23`). The values in the matrix are the settled ones (kb:adr/process-transient-displays-not-oracles). This is not a product defect.
2. **[note]** `drop.spec.ts` and `launch-opens-session.spec.ts` are outside this cycle's gate scope. I ran them on my build as extra evidence for the `canPasteNow()` and `focus()` gating that fc3856c9 changed. Their rows are marked "committed spec", not measured by me. Final Validation's full sweep will cover them again.
3. **[note]** Housekeeping:
   - The throwaway spec and `web/test-results/` are deleted.
   - No `musterd` process is running (`pgrep` shows none). The fixtures tore down each scratch tmux server.
   - `git worktree list` shows only the primary checkout and this worktree.
   - `git status --porcelain` shows nothing of mine apart from this file. The other two reviewers' part files and the orchestrator's state file are theirs.

## Maintainability review

# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: The delta `git diff fff8a527..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` is one file, `web/src/terminal/pane.ts` (+14, -6, commit fc3856c9; comment pass 0680c32a dropped its one added comment, so there is no source change from it). The whole branch is still 19 files (363+, 98-). The other 18 are byte-identical to what cycles 2 and 3 reviewed (approved), so their rows stand. Cycle 3 left no open agent-tagged issue, so there is no `## Delta` table of prior Minors.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/terminal/pane.ts | The `refit` callers: `features/focus.ts:241-257` (`mountTerminalSurface`: `mountSlotRoot`, then `surface.refit()`, then `renderSizenote(sizenoteEl, surface.geometry)`) and `features/tiles.ts:197-204` (`renderSurfaceTileBody`: same order, then `renderTileGeometry(..., surface?.geometry ?? null)`). The socket-`open` handler at `pane.ts:214-217` (`refit(true)`). Every `geometry` reader: those two, plus `render/tiles.ts:197-205` and `renderSizenote`, which both already render `null` as empty or hidden (`focusview.test.ts:47`). Every `focus()` caller: `features/surfaces.ts:243,320` and `terminal/dropwire.ts:65,93`. Every `canPasteNow()` caller: `dropwire.ts:47,87` and `pane.ts:274`. Also the `DropSurface` interface at `dropwire.ts:20-31`. `rg -n 'clientWidth\|clientHeight\|isConnected\|getBoundingClientRect' web/src --glob '!*.test.ts'` shows no existing "is this element laid out" helper. The only `clientWidth` check under `terminal/` is the new `pane.ts:324`. The rest are local measurements in `render/` and `features/` (`diagramdialog.ts:56`, `readerfind.ts:126`, `mainhead.ts:106`, …) that answer different questions. | yes (web-implementation.md Fix Attempt 3: one private `openIfLaidOut`, called from the one place that fits, `opened` written there only; reuse `rg` pasted; `reset()`/`clear()` and an external scroll-area refresh considered and dropped) | none (381 lines; `19-size.log` names no `web/src/terminal` file) | pass; notes 1-4 |
| (other 18 files) | unchanged since cycle 2 | as cycle 2 | as cycles 2-3: `manager.go` 632, `groups.ts` 507, `reader.ts` 707, reasons hold. `funlen` on the untouched `readerDocs` / `readerMermaidDocs` and on `manager_test.go`, which was already over on `main` | pass (cycle 2 rows stand) |

How the delta answers each question:

1. **Does this already exist?** No. `rg -n "term\.open\|new Terminal" web/src` → `pane.ts` only (the Decisions line pastes the same). The layout `rg` above finds no helper to reuse. `proposeDimensions()` cannot stand in for the new check, because it measures `term.element.parentElement`, and that element only exists after `open()`. So the code now tests layout in two places at two stages: `bodyEl.clientWidth/Height` before the first open, and `proposeDimensions()` on every fit after it (for example after an unmount). They are not duplicates. Both measure the same element, since FitAddon's parent is `bodyEl`.
2. **Does it match its siblings?** Yes. `openIfLaidOut(term: Terminal)` takes the narrowed `term` as a parameter, as `installShellInputHandlers(term: Terminal)` at `pane.ts:170` does. Its early-`return false` guards have the same shape as `refit`'s own guards. The callers did not change and do not need to know about the change. `focus.ts` and `tiles.ts` still call `mountSlotRoot` before `refit()`, so a mounted surface opens, fits and reads `geometry` within one pass. `geometry`'s `null` is a value both readers already handle (the dead-session path and `renderReaderTileBody` pass it today). The socket-`open` handler's `refit(true)` on a surface that has not opened yet returns before fitting, exactly as cycle 3's unfitted-send guard already did for a detached surface.
3. **Shared state.** `opened` is new state, written only at `pane.ts:326`, on the main thread. It goes from `false` to `true` once and is never reset. No interleaving exists: `refit`, the socket handlers and `focus()` all run on the one event loop. `dispose()` before an open calls `term.dispose()` on an unopened xterm, which is the same path a dead-on-arrival surface never reaches and a live one takes today. A `refit` after `dispose()` finds `root` removed, so `clientWidth` is 0 and it returns before touching xterm.
4. **Is a layer crossed?** No. The change stays inside `terminal/pane.ts`, which owns the xterm instance. No composition root is touched.
5. **Pattern by label.** None.
6. **Size.** No warning on this file.
7. **Seam explained.** `openIfLaidOut` is private, not a new seam, and it has a `design:` line anyway.
8. **Diagram.** No new module or dependency edge.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** About the dropped comment: does the name carry the reason (cycle-3 Note 1's question)? Only half of it. `openIfLaidOut` tells the reader *when* xterm opens. It does not say *why* opening on a detached body is wrong: xterm sizes its scroll area against the detached element and keeps that range after the later fit. A newcomer who wonders why this differs from every xterm example's constructor-time `open()` will find the answer only in web-implementation.md's Root cause. Unlike cycle 3's guard, though, this one is now pinned by a test. Shell-scroll's "reselect Shell after a background switch, slider = track, flick and reversed-notch frames" journey (3b782beb) fails if the open moves back into the constructor. The comment pass owns comments (docs/conventions.md § Comments; kb:adr/process-comment-pass-owns-code-comments) and its judge dropped this one, so I request no change.
2. **[note]** Three existing doc comments now describe the old preconditions. That is doc truth, so it belongs to `review-work` or the comment pass, not to me. `focus()`'s comment (`pane.ts:351-353`) still names "a dead session's surface (`term` is null …) and … a disposed surface" as its only no-op cases, but it now also does nothing before the first open. `DropSurface.hasTerminal`'s comment (`dropwire.ts:24-25`) and `hasTerminal()`'s comment (`pane.ts:258-259`) describe `canPasteNow` as "also requires the socket to be open", but it now also requires the terminal to have opened. `refit`'s comment (`pane.ts:290-296`) does not say that the first call on a laid-out body performs the open. Each is incomplete rather than false.
3. **[note]** Taste, no convention cited. Two fields now hold one lifecycle: `term !== null` (built) and `opened` (built and opened), with the unstated invariant `opened ⇒ term !== null`. The type does not express it, which is why `focus()` reads `this.opened` and then `this.term?.focus()`, and why `geometry` keeps a `!this.term` check. A single field for the state would let the type carry the invariant. That is more restructuring than one lazily called `open()` warrants, and the pair matches the existing `term` / `fitAddon` nullable pair next to it.
4. **[note]** Taste. The open happens inside `refit`'s guard expression (`pane.ts:298`, `!this.openIfLaidOut(this.term)` beside two pure null checks), so a reader skimming the guards may miss that the line has a side effect. No other guard in the file mutates anything. The `design:` line says this is the deliberate single call site, and the method name signals the effect, so no change.

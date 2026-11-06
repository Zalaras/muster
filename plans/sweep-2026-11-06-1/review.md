# Review: sweep-2026-11-06-1

**Plan**: sweep-2026-11-06-1
**Verdict**: approved
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: sweep-2026-11-06-1

**Plan**: sweep-2026-11-06-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 22949 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `web/src/style.css:510-520`: bare `#connection-status` keeps `position: relative`, loses `z-index`; `pending` takes the `ok` path (`connectionhealth.ts` CONNECTING/UPDATING are `pending`) | Yes — R1 render test `render/notes-places.spec.ts:540` (asserts `data-health="ok"`, readout box inside the panel, `elementFromPoint` at the readout centre inside `.npanel`); test commit `2382651b` precedes fix `63f54809`; `pending` untested per plan Edge Case 1 | pass |
| REQ-2 | Yes — `#connection-status[data-health="down"] { z-index: 46; }` (`style.css:518-520`); `.banner` keeps `z-index: 46` (`style.css:665`) over `.npanel` 45 (`style.css:4971`) | Yes — existing R5 tests `notes-places.spec.ts:469` (banner) and `:489` (readout hit at centre after a daemon-down reload, banner reads "musterd unreachable"), green in `22-R1.log` | pass |
| DIAG | `kb:diagram/web-components` (the only diagram `kb for web/src/style.css` names) — depicts module layout, no z-order; still true | — | pass |

## Build & Tests

E2E tests: pass (59, scoped to 6 files: auth, claude-version, embedded, masthead-update-dot, notes, resilience) · Daemon tests: pass (`go test -count=1 ./...`, 27 packages ok, 0 FAIL) · Web tests: pass (3190 in 110 files) · Render tests: pass (463) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) — all read from $GATES_LOG_DIR (0 failed lines); also green there: render-fixtures (110 scenarios up to date), render-lint, contrast (0 failures on 3 themes), versions, kb check (677 records, 0 problems), e2e-lint, features-scope, comments, comment-ledger, size (0 hits). e2e-level census WARNs are in specs this plan did not touch.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| R1 | `make web-build && cd web && npx playwright test -c playwright.render.config.ts render/notes-places.spec.ts` | pass (`22-R1.log`, 15 passed, the new #116 test included) |
| D1 | `make lint` | pass (deduped to the gates' lint line `03-lint.log`; `make lint` is `golangci-lint run`, 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — #116 left open in `TODO.md:156` for the sweep loop to tick on `main`; proposed ADR `notes-readout-above-popped-panel-only-while-down` present with `refs: plan:sweep-2026-11-06-1`, `supersedes: [notes-banner-above-popped-panel]`, and describes what shipped; no `deviation:`/`doc-delta:` lines in the impl log; Doc Delta claims (panel below banner always, below readout only while down, above it while connected or connecting) match `style.css`, and the two sentences it names (`docs/features/notes/spec.md:62-64`, `docs/design/design-system.md:347-349`) are the only current statements of the old order (`docs/features/connection/spec.md` has none) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The only z-index raise on `#connection-status` is under `[data-health="down"]`. | pass | `rg z-index web/src/style.css`: line 519 is the only one within the `#connection-status*` rules (510-540), inside `#connection-status[data-health="down"]`; no `zIndex`/`z-index` in any `web/src/**/*.ts` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (CSS + render spec only) |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass (untouched) |
| 4 | tmux via `-L muster` / sizing | pass (untouched) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass (no gauge path changed) |
| 7 | Identity on tmux target | pass (untouched) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary | pass |

Design tokens: the change adds no colour, font or spacing literal; no `hidden`-toggled element added.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The new ADR `docs/adr/notes-readout-above-popped-panel-only-while-down.md` carries
   `tests: []`; the #116 render test (`render/notes-places.spec.ts:540`) and the R5 readout test
   (`:489`) are the tests that guard it and could be named there when the orchestrator flips it at
   Completion.
2. **[note]** Outside the plan's scope: `a1f1788b chore(gatelock)` extracts `envWait` from
   `parseOpts` in `tools/gatelock/main.go`. Read against the old body it is behaviour-preserving
   (unset → `defaultWait`; malformed or negative → the same error text, `o` returned with the
   default wait); `tools/gatelock` tests pass in `02-test.log` and `make lint` is clean in
   `03-lint.log`.

## Browser review

# Browser review: sweep-2026-11-06-1

**Plan**: sweep-2026-11-06-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8269 words (budget 30000)
**Rig**: `make web-build build` at a1f1788b (`bin/musterd` v0.27.3-27-ga1f1788b-dirty; the only dirty file was `orchestration-state.json`). One scratch daemon per probe test from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-*` (path has a space), tmux socket `<data-dir>/tmux.sock` (killed in teardown), E2E stub `claude` (`$TMPDIR/muster e2e-stub-*/claude`). Headless Chromium at 1440×900, driven by a throwaway `web/e2e/zz-review-browser-probe.spec.ts` (since deleted). Gates log c1b: 0 failed lines, and `e2e` and `web-build` are green, so the app I drove is the one that ships.

Method: a popped panel was dragged by its header (real pointer) so `#connection-status` (box 1410,15.5 14×14) lies inside it. The panel settles at 1080,0 360×300. "Hit" means `document.elementFromPoint` at the readout's centre (1417,22.5). The oracle for health is the readout's own `data-health`, together with the daemon process state (killed, or restarted by the harness). Every cell was re-measured after a settle of 1.2 s or more.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data, ok | panel draws above readout | pass | hit `BUTTON.ctl` inside `.npanel`; readout z `auto`, pos `relative`; panel z `45`, `fixed`, display `flex`, opacity 1, visible |
| REQ-1 | focus | data, ok (settled) | same after a render tick | pass | after 1.2 s: same hit `BUTTON.ctl` in `.npanel`, same boxes |
| REQ-1 | focus | data, ok | panel control over the readout is operable | pass | Close moved onto the readout (close 1407,12.5 20×20 covers readout 1410,15.5 14×14). A real `mouse.click` at the readout's centre closed the panel (`.npanel` count 0) |
| REQ-1 | focus | data, ok after down→restart | panel back above readout | pass | after `daemon.restart()`, `data-health=ok`, readout z `auto`, hit `BUTTON.ctl` in `.npanel`; banner `[hidden]` with display `none` |
| REQ-1 / EC1 | focus | data, pending (update restart) | panel draws above readout | pass | `update` broadcast with `apply.phase: restarting`, then daemon killed: `data-health=pending`, text `reconnecting…`, title `Restarting musterd for an update…`, readout z `auto`; hit `BUTTON.ctl` in `.npanel`; same after 1.2 s |
| REQ-2 / EC1 | focus | data, pending (update restart) | banner above panel | pass | banner 0,46 1440×32 shows `Updating musterd to v0.2.0 …`; hit at (1085,51), inside both banner and panel, is `DIV#banner` |
| EC1 | focus | data, pending (before first hello) | panel above readout | N/A — no panel can show before the first hello (no session state). Measured: after a reload with `/ws` held, `.npanel` count 0 and readout `pending` is the hit. Once `/ws` is released and `ok`, the panel returns at 1080,0 and is the hit | |
| REQ-2 | focus | data, down | readout above panel, hit target at its centre | pass | `data-health=down`, title `musterd unreachable — reconnecting…`, readout z `46`; hit `SPAN#connection-status`; same after 1.2 s |
| REQ-2 | focus | data, down | banner above panel | pass | banner 0,46 1440×32, display `block`, opacity 1, text `musterd unreachable — …`; hit at (1085,51), inside both banner and panel, is `DIV#banner` |
| REQ-1 | tiles | data, ok | panel above readout | N/A — the notes spec hides the panel in Tiles. Measured: `.npanel` count 0, readout is the hit, banner `[hidden]` with display `none` | |
| REQ-2 | tiles | data, down | readout/banner above panel | N/A — no panel in Tiles. Measured: readout z `46` and is the hit, banner display `block` | |
| REQ-1 | tiles→focus | data, ok | panel returns above readout | pass | back in Focus after a down/restart in Tiles: panel at 1080,0 360×300, hit `BUTTON.ctl` in `.npanel` |
| REQ-1/2 | focus | no data, ok / down | readout unaffected when no panel | pass | no sessions, `.npanel` count 0. ok: readout z `auto` and is the hit. down: readout z `46` and is the hit, banner shows |
| REQ-1/2 | pop-out (`/doc.html`, `/note.html`) | any | panel vs readout | N/A — neither page has a `#connection-status` masthead readout (grep of both HTML files), and the note window reports its own status in its header | |
| Hidden | focus/tiles | ok | `[hidden]` banner not displayed | pass | `#banner` has `hidden`, and its computed display is `none` in every ok and pending-before-hello cell |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** While musterd is down, a panel placed under the readout has its control at that spot covered by the red dot (measured: the hit is `SPAN#connection-status` where the panel's `BUTTON.ctl` sits while `ok`). The proposed ADR `notes-readout-above-popped-panel-only-while-down` accepts this as a consequence, so no change is requested.
2. **[note]** After Close, the glyph reopens the note as the anchored panel (Pop in count 0, box 314,80.7 400×360), not the popped panel. This behaviour predates this plan and is outside its scope. It is recorded only because it showed up during the operability cell.

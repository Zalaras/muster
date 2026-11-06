# Correctness review: sweep-2026-11-06-1

**Plan**: sweep-2026-11-06-1
**Verdict**: approved
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

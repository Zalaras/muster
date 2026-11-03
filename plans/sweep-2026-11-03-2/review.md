# Review: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 26193 words (budget 30000)

Scope. Cycle 1's one open item was correctness Major 1, so this is not a Minor-only delta cycle. The
tree changed by one commit since `review_commits[1]` (`4abedcb8`). `git diff 4abedcb8..HEAD` touches
only `web/render/groups.spec.ts` (+15 lines, one new test), the archived review files and
`orchestration-state.json`. No file under `web/src/`, `internal/` or `cmd/` changed. The branch's
file set against its merge base (`git diff main...HEAD`) is the same 21 files cycle 1 reviewed. Cycle 1's
requirement, contract, hard-rule and design-token readings therefore still hold for this exact code.
This cycle re-reads the gate run, checks the new test against the Major it answers, and re-states
every table.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes (unchanged since cycle 1): `focus.ts` `renderView` reads `stripHadFocus` before `renderFrame`, and after it moves focus to the selected terminal, or to `⋯` when there is none | E1 (`effort-header.spec.ts`, 32 passed) | pass |
| REQ-2 | Yes: `.ghead .disc` is 20×20 with `--fg-muted`, `--fg` on `.ghead:hover` and `--disabled-fg` when disabled (also under hover). Its `::before` is a `currentColor` triangle cut by `clip-path`, rotated −90deg when collapsed (`style.css:4033-4069`) | R1: size, ink and orientation (`groups.spec.ts:1252`). The colour clause is now covered by `groups.spec.ts:1283`, which asserts `color` = `tokenColor(--fg-muted)` with the pointer at 0,0 and `tokenColor(--fg)` after `head.hover()`. Both pass in `24-R1.log` (56 passed, previously 55) | pass |
| REQ-3 | Yes (unchanged): `cardEntries` = marks \| actions \| Pin \| Move to, one builder for the rail card, the strip card and the header `⋯` | R2, E2, W1 | pass |
| REQ-4 | Yes (unchanged): `readToggle(unread)` yields one item | W1, E2 | pass |
| REQ-5 | Yes (unchanged): `openSelection` = toggle \| Stop…/Remove… \| Move to, one request per id | W1, E2 | pass |
| DIAG | `kb:diagram/web-components`: no module, entry or import edge changed (unchanged since cycle 1; the new commit is test-only) | — | pass |

## Build & Tests

E2E tests: pass (193, scoped to 17 files: actions, effort-header, focus-header, focus-marker, groups-focus, groups-launch, groups-select, groups, rail-activity, rail-cards, rail-drag-groups, rail-layout, rail-menu, rail-order, rail-unread, sessions, theme) · Daemon tests (race): pass (27 packages ok) · Web tests: pass (3051, 106 files) · Render tests: pass (427) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; biome 410 files clean). All read from `gates-sweep-2026-11-03-2-c2`, which has 0 failed lines. The other lines are green too: render fixtures (106 scenarios up to date), render-lint, contrast (54 pairs ×3 themes, 0 failures), versions, kb check (657 records, 0 problems), e2e-lint, features-scope, comments, comment ledger (no added blocks), size (0 hits) and e2e-level (census WARN only, none in this plan's specs).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `make e2e SPECS='e2e/effort-header.spec.ts'` | pass (32 passed, `22-E1.log`) |
| E2 | `make e2e SPECS='e2e/rail-menu.spec.ts'` | pass (17 passed, `23-E2.log`) |
| R1 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/groups.spec.ts` | pass (56 passed, `24-R1.log`, including the new colour test) |
| R2 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/rail.spec.ts render/focus.spec.ts` | pass (83 passed, `25-R2.log`) |
| R3 | `make render-test` | pass (deduped to baseline render-test, 427 passed, `08-render-test.log`) |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts` | pass (41 passed, `26-W1.log`) |
| W2 | `make web-test` | pass (deduped to baseline web-test, 3051 passed, `05-web-test.log`) |
| L1 | `make web-lint` | pass (deduped to baseline web-lint, `09-web-lint.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. This is a sweep batch, so the `TODO.md` tick is left to the loop. There are no `deviation:` lines. The design-system caret `doc-delta:` line is in the plan's Doc Delta. ADR `rail-card-menu-read-toggle-first-move-to-last` is `proposed`, carries `refs: plan:sweep-2026-11-03-2` and matches the code. The Doc Delta assertions (focus Dismiss fallback, rail card and selection order, design-system caret) are still supported, since no source changed this cycle |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The focus restore runs only when the strip held focus before the render and is hidden after it, on every return path of `renderView` | pass | `focus.ts` is unchanged since cycle 1 (`git diff 4abedcb8..HEAD` is test-only). Cycle 1's reading stands: `stripHadFocus` is read before `renderFrame(frame)`, and every early return sits inside `renderFrame` |
| RV2 | The caret is drawn without a font glyph, and the row's fold behaviour and markup are unchanged | pass | `style.css:4052-4058`: `content: ""`, `clip-path` triangle on `currentColor`. `render/railsections.ts` is not in the branch diff, and the fold specs are green in the scoped run |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only diff |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: no daemon change |
| 4 | tmux via `-L muster`; no `resize-pane` sizing | pass: no tmux change |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: no gauge path touched |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass / `CLAUDE_CONFIG_DIR` | pass |
| 9 | No real `claude` outside canary/probes | pass: E2E uses the stub |

## Delta (delta re-review only)

Not a Minor-only delta cycle. This table records the cycle 1 issue that was answered.

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Major 1 `[render-tests]` "REQ-2's colour clause has no test" | `4b5fb467` | Read the diff. The new test at `groups.spec.ts:1283` opens the `groups-titled-collapsed` fixture through `dashboard.open` (a scenario the plan's Render fixtures header names). It locates the caret through the shared `groupHead`/`groupCaret` helpers (`#sessions .ghead[data-group-id]`, role button "Collapse/Expand …") and moves the pointer to 0,0, which is outside the rail. It asserts `color` equals `tokenColor(page, "--fg-muted")`, then hovers the `.ghead` and asserts `tokenColor(page, "--fg")`. The test can fail: `--fg-muted` and `--fg` differ in all three theme blocks (`style.css:41-42, 91-92, 141-142`), so a revert to `--fg-dim` fails the first assertion and dropping `.ghead:hover .disc` fails the second. It runs green in R1 (`24-R1.log`). Only the test file changed |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Cycle 1's notes still apply: no render fixture holds an unread card, the ended-session `⋯` fallback shares the Docs branch, and `actions.spec.ts` and `rail-cards.spec.ts` were updated outside the plan's breakage list with their assertions kept. No change is requested.
2. **[note]** The new colour test checks the rest and hover states only. The disabled `--disabled-fg` state, including under hover, has no render assertion. Cycle 1's browser review measured it (`rgb(90,96,112)` while hovered), and REQ-2 does not name it as a criterion, so no change is requested.

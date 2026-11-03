# Review: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 26193 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `focus.ts` `renderView` wraps the old body as `renderFrame`, reads `stripHadFocus` before it, and after it (whichever path the body returned by) calls `getSurfaces().focusSelected(focusedId)` if the strip is now hidden, then falls back to `moreBtn` when focus is null, `body` or still inside the strip | E1: two new `effort-header.spec.ts` tests (terminal case; Docs case → Session actions `⋯`). Failed Dismiss is covered by the existing REQ-9/E13 tests | pass |
| REQ-2 | Yes: `.ghead .disc` 20×20 inline-flex, `--fg-muted`, `.ghead:hover .disc` `--fg`, disabled `--disabled-fg` (hover-disabled specificity covered); `::before` `content: ""` 9×6 `currentColor` box clipped to a triangle, rotated −90deg when collapsed, transition kept | R1: box ≥ 20×20, ink ≥ 8 / ≥ 5, orientation, on `groups-titled-collapsed`. Colour clause untested (Major 1) | fail (coverage) |
| REQ-3 | Yes: `cardEntries` = marks \| actions \| Pin \| Move to. One builder serves rail card, strip card and header `⋯` | R2 (live, ended, pinned, unbound card orders; header ⋯ equals card menu at `render/focus.spec.ts:773`), E2 (keyboard walk, Select-mode single-card order, Remove-live), plus `actions.spec.ts` and `rail-cards.spec.ts` | pass |
| REQ-4 | Yes: `readToggle(unread)` yields one item, "Mark as read" when unread, else "Mark as unread" | W1 (six card cases plus disabled), E2 (label flips with state, opposite absent, PUT bodies) | pass |
| REQ-5 | Yes: `openSelection` = toggle \| Stop…/Remove… \| Move to. Toggle by `some(unread)`, `many` dispatches one request per id. Enablement unchanged | W1 (all/mixed/single), E2 (new mixed-selection test asserts one `PUT …/unread {unread:false}` per id; Select-mode order) | pass |
| DIAG | `kb:diagram/web-components` (named for all four changed files): no module, entry or import edge changed (`focus.ts` reaches surfaces through the existing `getSurfaces` dep) | — | pass |

## Build & Tests

E2E tests: pass (193, scoped to 17 files: actions, effort-header, focus-header, focus-marker, groups-focus, groups-launch, groups-select, groups, rail-activity, rail-cards, rail-drag-groups, rail-layout, rail-menu, rail-order, rail-unread, sessions, theme) · Daemon tests (race): pass (27 packages ok) · Web tests: pass (3051) · Render tests: pass (426) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; biome clean). All read from $GATES_LOG_DIR. Other lines are green: render fixtures (106 scenarios up to date), render-lint, contrast (54 pairs ×3 themes, 0 failures), versions, kb check (0 problems), e2e-lint, features-scope, comments, comment ledger, size (0 hits) and e2e-level (census WARN only, none in this plan's specs).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `make e2e SPECS='e2e/effort-header.spec.ts'` | pass (32 passed, `22-E1.log`) |
| E2 | `make e2e SPECS='e2e/rail-menu.spec.ts'` | pass (17 passed, `23-E2.log`) |
| R1 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/groups.spec.ts` | pass (55 passed, `24-R1.log`) |
| R2 | `cd web && npm run -s render:lint && npx playwright test -c playwright.render.config.ts render/rail.spec.ts render/focus.spec.ts` | pass (83 passed, `25-R2.log`) |
| R3 | `make render-test` | pass (deduped to baseline render-test, 426 passed, `08-render-test.log`) |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts` | pass (41 passed, `26-W1.log`) |
| W2 | `make web-test` | pass (deduped to baseline web-test, 3051 passed, `05-web-test.log`) |
| L1 | `make web-lint` | pass (deduped to baseline web-lint, `09-web-lint.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. A sweep batch leaves its `TODO.md` tick to the loop. No `deviation:` lines. The one `doc-delta:` line (design-system caret size) is in the plan's Doc Delta. The superseding ADR `rail-card-menu-read-toggle-first-move-to-last` is `proposed`, carries `refs: plan:sweep-2026-11-03-2` and matches the code. Every Doc Delta assertion (focus Dismiss fallback, rail card/selection order and toggle rule, design-system caret size) is supported by the shipped code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The focus restore runs only when the strip held focus before the render and is hidden after it, on every return path of `renderView` | pass | `focus.ts:325-331`. `stripHadFocus` is read before `renderFrame(frame)`, and the early return requires both `stripHadFocus` and `effortStrip.hidden`. All four early `return`s of the old body now live inside `renderFrame`, so the wrapper's tail runs after each one. A strip hidden while focus is elsewhere leaves `stripHadFocus` false, so nothing moves (Edge 3) |
| RV2 | The caret is drawn without a font glyph, and the row's fold behaviour and markup are unchanged | pass | `style.css:4052-4058`: `content: ""` with a `clip-path` triangle on `currentColor`, and no `▾` remains for `.ghead`. `render/railsections.ts` (header markup and caret/row click handlers) is not in the diff. The fold e2e specs (`groups.spec.ts`, `groups-focus.spec.ts`) are green in the scoped run |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only diff, no Claude Code format fields |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: no daemon change |
| 4 | tmux via `-L muster`; no `resize-pane` sizing | pass: no tmux change |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: no gauge path touched |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass / `CLAUDE_CONFIG_DIR` | pass |
| 9 | No real `claude` outside canary/probes | pass: new E2E uses the stub (`MUSTER-STUB-READY`) |

Design tokens: no colour literal, font stack or `innerHTML` added. The caret uses `--fg-muted`, `--fg` and `--disabled-fg`, which exist in every theme block. No element newly toggled via `hidden`; `.ghead .disc` gained `display: inline-flex` but is never hidden by attribute (`railsections.ts:161`). `make contrast` is green.

## Issues

### Critical

None.

### Major

1. **[render-tests]** REQ-2's colour clause has no test. The caret's ink moved from `--fg-dim` to `--fg-muted`, and it gained a `--fg` hover state on `.ghead:hover`. No assertion in `web/render/groups.spec.ts` (or anywhere else) pins either colour, and the new R1 test only measures size and orientation. Reverting to `--fg-dim`, or dropping the hover rule, would stay green. A fix must assert, on the `groups-titled-collapsed` fixture, that the caret's `color` equals `tokenColor(page, "--fg-muted")` at rest and `tokenColor(page, "--fg")` while the pointer is over its section header (the harness already has `tokenColor`, used at `groups.spec.ts:810`).

### Minor

None.

### Notes

1. **[note]** No render fixture holds an unread card, so the render tests only see the "Mark as unread" label. The unread → "Mark as read" side is covered at the cheaper W1 level and journeyed in E2 (`rail-menu.spec.ts:576`, `:640`, `:730`). The plan said "if a fixture holds one".
2. **[note]** REQ-1's ended-session fallback to `⋯` is not exercised separately. The Docs case reaches the same `focusIsLost() → moreBtn.focus()` branch, as the plan's Proof allowed ("Docs selected (or the session stopped)").
3. **[note]** e2e-specs also updated `actions.spec.ts:549` and `rail-cards.spec.ts:320`, which the plan's breakage list omitted. Both updates keep their assertions (nothing removed), and `test-specs.md` has no `## Repairs` table to audit.

## Browser review

# Browser review: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 10033 words (budget 30000)
**Rig**: `make web-build build` at 739318bd (`bin/musterd`, embedded dashboard); a fresh `startScratchDaemon` per test (data dir `$TMPDIR/muster e2e-<owner>-*`, space-bearing; private `-S` tmux socket inside it, killed at teardown); the harness's shared stub `claude` (`muster e2e-stub-*`); headless Chromium 1280×720 through a throwaway `web/e2e/zz-browser-review.spec.ts` (10 tests, 15.0 s, deleted afterwards; `git status --porcelain` shows only the orchestrator's two files)

Gates log (`gates-sweep-2026-11-03-2-c1`): 0 failed lines; `04-web-build`, `22-E1` (32 passed), `23-E2` (17 passed) are green, so the app driven here is the one that ships.

## Matrix

Hosts: the effort strip (`#effort-strip`) lives only in the Focus view's `#mainhead`, and group section headers (`.ghead`) only in the Focus rail `#sessions`. Tiles hosts the card menu through its strip card only. Select mode is a rail-only mode. No surface here has a pop-out (`/doc.html` is the reader's).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus (terminal) | data | keyboard Dismiss: focus goes into the terminal | pass | before: `BUTTON.dismiss`; Enter → strip `hidden`, computed `display:none`; active `TEXTAREA.xterm-helper-textarea` inside `Terminal: br-term`, same after 1.3 s; typed `brtyped`+Enter, pane shows `stub-echo:brtyped`; `/api/state` `effortWarning: null` |
| REQ-1 | focus (Docs) | data | keyboard Dismiss falls back to `⋯` | pass | Space on Dismiss → active `BUTTON.more[aria-label=Session actions]` at 0 s and 1.3 s; Enter then opens the menu (1 `role=menu`) |
| REQ-1 | focus (ended) | data | ended session: Dismiss falls back to `⋯` | pass | strip still shown after `/end` (count 1); Enter → active `Session actions ⋯` after 1.3 s |
| REQ-1 | focus | data | strip hides without holding focus: focus not moved | pass | focus on `⋯`, warning removed via `DELETE …/effort-warning` (204) → active is still `⋯` after 1.3 s |
| REQ-1 | focus | data | failed Dismiss: strip stays, focus stays on Dismiss | pass | DELETE routed to 500 → strip `hidden:false`, `display:flex`; active `BUTTON.dismiss` after 1.3 s |
| REQ-1 | focus | daemon-down | Dismiss with the daemon gone | pass | SIGTERM → `.banner` "musterd unreachable…" `display:block`; Enter on Dismiss → strip still `display:flex`, focus still on Dismiss after 1.3 s (never `body`) |
| REQ-1 | focus | no data | — | N/A: a strip exists only for a warned session | |
| REQ-1 | tiles / pop-out | all | — | N/A: the strip is Focus-header only | |
| REQ-2 | focus rail | data | caret button ≥ 20×20, inside its header | pass | Alpha caret 6,121 20×20 inside head 0,114 299×35; Bravo caret 6,156 20×20 inside head 0,149 299×35; Ungrouped caret 20×20 inside head 0,322.5 299×36; all inside rail 0,114 299×606 |
| REQ-2 | focus rail | data | drawn without a font glyph, solid triangle | pass | `::before` `content:""`, 9px×6px, `clip-path: polygon(0 0, 100% 0, 50% 100%)`, bg = currentColor; button `textContent` "" |
| REQ-2 | focus rail | data | ink ≥ 8 long side, ≥ 5 short; down when expanded, right when collapsed | pass | inkBox (pixel diff): Bravo expanded 9×6, Ungrouped expanded 8×5, Alpha collapsed 5×8 (`transform: matrix(0,-1,1,0,0,0)` = −90°); screenshot shows ▸ ALPHA, ▾ BRAVO, ▾ UNGROUPED |
| REQ-2 | focus rail | data | colour `--fg-muted`, `--fg` on header hover | pass | idle `rgb(178,182,195)` = `--fg-muted #b2b6c3`; hovering Bravo's summary → `rgb(232,230,225)` = `--fg #e8e6e1` |
| REQ-2 | focus rail | data | visible | pass | caret computed `opacity:1`, `display:flex`, `visibility:visible` |
| REQ-2 | focus rail | data | fold by caret (pointer and keys) unchanged | pass | pointer click on Alpha's caret → `/api/state` Alpha `collapsed:true`; keyboard Enter on Bravo's caret → label "Expand Bravo", oracle `collapsed:true`, focus stays on the caret after 1.3 s |
| REQ-2 | focus rail | data | header free space folds; group name does not | pass | click `.gsum` → "Collapse Bravo" (unfolded); click `.gname` → still "Collapse Bravo" |
| REQ-2 | focus rail | daemon-down | disabled stays `--disabled-fg`, even under hover | pass | both carets `disabled`, `rgb(90,96,112)` = `--disabled-fg #5a6070` while the header is hovered; ink still 5×8 / 8×6 |
| REQ-2 | focus rail | no data | — | N/A: no group, no header | |
| REQ-2 | tiles / pop-out | all | — | N/A: section headers are rail-only | |
| REQ-3/4 | focus rail card | data (live, read) | order toggle \| Stop…, Remove… \| Pin \| Move to | pass | `Mark as unread \| Stop… Remove… \| Pin \| [Move to] Gone Here New group… \| No group`; menu 149,281 190×281 inside the 1280×720 viewport |
| REQ-3/4 | focus rail card | data (live, unread) | toggle reads Mark as read | pass | oracle `unread:true` → `Mark as read \| Stop… Remove… \| Pin \| …`; no Mark as unread |
| REQ-3/4 | focus rail card | data (pinned) | Unpin in the Pin block | pass | `Mark as read \| Stop… Remove… \| Unpin \| [Move to] …` |
| REQ-3/4 | focus rail card | data (ended resumable) | Resume in place of Stop… | pass | `Mark as unread \| Resume Remove… \| Pin \| [Move to] …` |
| REQ-3/4 | focus rail card | data (ended, no Claude id) | toggle \| Remove… \| Pin \| Move to | pass | `Mark as unread \| Remove… \| Pin \| [Move to] …` |
| REQ-4 | focus rail card | data | toggle operable by keys and pointer, sends the matching request | pass | Shift+F10 focuses the toggle first (stays after 1.2 s); ArrowDown walks Stop…, Remove…, Pin, Gone, Here, New group…, No group, then back to the toggle; Enter → `PUT /api/sessions/2/unread {unread:false}`, oracle false; the menu then reads Mark as unread; click → `{unread:true}`, oracle true |
| REQ-3 | focus header ⋯ | data (live / ended) | same builder, same order | pass | live: `Mark as unread \| Stop… Remove… \| Pin \| [Move to] …`; ended: `Mark as unread \| Resume Remove… \| Pin \| …` |
| REQ-3 | tiles strip card | data | same order, toggle works | pass | stripped `br-tile-0`: `Mark as unread \| Stop… Remove… \| Pin \| [Move to] New group… \| No group`; menu 640,485 190×227 inside the viewport; click → oracle `unread:true`; reopened → `Mark as read …` |
| REQ-3/4 | rail, header ⋯, tiles strip | daemon-down | menus inert, order kept | pass | every item `disabled` in the same order on all three hosts |
| REQ-3 | any | no data | — | N/A: no card, no header ⋯ | |
| REQ-3 | pop-out | — | — | N/A: no pop-out | |
| REQ-5 | focus rail (Select) | data (mixed read/unread) | toggle \| Stop…, Remove… \| Move to; Mark as read when any is unread | pass | oracle a:false, b:true → `Mark as read \| Stop… Remove… \| [Move to] New group… \| No group` (no Pin, no Resume) |
| REQ-5 | focus rail (Select) | data | one request per selected id; then all read → Mark as unread | pass | `PUT /1/unread {false}`, `PUT /2/unread {false}`; reopened → `Mark as unread …`; click → `PUT /1 {true}`, `PUT /2 {true}`; "2 selected" kept; the unselected card keeps its single-card menu with Pin |
| REQ-5 | focus rail (Select) | daemon-down | disabled, unchanged | pass | `Mark as read(disabled) \| Stop…(disabled) Remove…(disabled) \| [Move to] …(disabled)` |
| REQ-5 | tiles / pop-out | — | — | N/A: Select mode is rail-only | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Each keyboard Dismiss cell put focus on Dismiss with `locator.focus()` as setup, then activated it with a real key (Enter or Space). Tab order to Dismiss was not walked; reaching Dismiss by keyboard is the existing REQ-9 test's claim and is not changed here.
2. **[note]** The collapsed caret's measured ink is 5×8, against the plan's "about 6×9". The difference comes from anti-aliasing at the 60-diff ink threshold on the rotated clip. It meets REQ-2's floor (long ≥ 8, short ≥ 5), so no change is requested.
3. **[note]** "The strip hides while focus is in the terminal" (Edge Case 3, terminal variant) was not measured separately. The no-focus cell covered the rule with focus on `⋯`: focus did not move.

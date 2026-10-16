# Correctness review: cache-hover

**Plan**: cache-hover
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 25741 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `render/cardtip.ts` opens a `role="tooltip"` `.cardtip` panel `POPOVER_DELAY_MS` (imported from `grouppopover.ts`) after the timer's `mouseenter`, appended to `document.body` and placed by `placeAnchored`. Its text is the timer's `aria-description`, which `applyCardText` sets from `vm.warmth.hover` (the `cacheWarmth` strings). The strip gets it through `StripOptions.cardTip` → `CardListOptions` → `buildSessionCardElement` (`render/sessions.ts:279`). | Rail: yes (the new hover test, visible within 1 s with `cache warm · cold in 60m`). Strip: **no** (correctness Major 1). | pass (code); strip coverage gap |
| REQ-2 | Yes. `refresh()` runs after every host render (`features/rail.ts:204`, `features/tiles.ts:333`). It re-places the panel on the timer's current box and re-reads the text. It closes on card `mouseleave`, card `pointerdown`, `status` (daemon-down, beside the group popover's close), and in `refresh` when the timer has no client rects (card removed, section collapsed, host hidden). The timer's `mouseleave` only cancels a pending open. | Card move, live countdown and leave-closes: yes. Pointerdown close: **no** (correctness Major 1). Removal: untested, as the plan states. | pass (code); pointerdown untested |
| REQ-3 | Yes. `timer.setAttribute("aria-description", …)` replaces `timer.title` (`render/sessions.ts:112`). `aria-label="time in state"` comes from the template (`index.html:419`) and is unchanged. | Yes. Nine rewritten tests assert `aria-description`, and E14 also asserts `not.toHaveAttribute("title")` and `aria-label`. | pass |
| REQ-4 | Yes. The group header still writes `el.title = timer.hover` (`render/railsections.ts:146`). `grouppopover.ts` is unchanged apart from its exported constant being imported. `.cardtip` shares `.pop`'s base block, including `pointer-events: none`. | Group-header and popover tests in `cache-warmth.spec.ts` are unchanged and green (18-E1.log, 14 passed). | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` on every changed file). The `render/` count went from 39 to 40 modules, and I counted 40 non-test `.ts` files in `web/src/render/`. Nothing else in the fence changed in substance. | — | pass |

## Build & Tests

E2E tests: **fail** (901 passed, 8 failed, 17-e2e.log; see Critical 1) · Daemon tests (race): pass (`go test -race ./...`, 25 packages ok) · Web tests: pass (2714 in 95 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, biome clean, e2e-lint clean). Also green: contrast (0 failures in 3 themes), versions, kb-check, features-scope, comments, comment-ledger, e2e-honest, features-inventory. size-warn reported 0 hits. All of this is read from `$GATES_LOG_DIR`.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test cache-warmth.spec.ts` | pass (14 passed, 18-E1.log) |
| W1 | `make web-lint` | pass (deduped to web-lint, 06) |
| W2 | `make web-test` | pass (deduped to web-test, 05; 2714 passed) |
| W3 | `make web-build` | pass (deduped to web-build, 04) |
| E2 | `make e2e` | **FAIL** (17-e2e.log: 8 failed, 901 passed). The orchestrator re-ran only the 8 tests under `--exclusive` and they passed, but that is not this exact line (Critical 1). |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. #99 is moved from `TODO.md` to `docs/history/todo-done.md`. There are no `deviation:` lines. The log's one `doc-delta:` line (render/CLAUDE.md should name `cardtip.ts`) is handled in cd5a425c. `cardtip*.ts` is added to rail's `web:` globs. `kb ls --status proposed` is empty for rail, tiles, usage and groups, as expected. The Doc Delta holds against the code: the panel opens 350 ms after entry, stays while the pointer is on the card (card-level `mouseleave`), and its text is the timer's `aria-description`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The panel reads as one with the group popover (font, ground, edge gap) and never covers the card's own title. | **partial** | Font, ground and edge gap: pass. `.pop, .cardtip` share one block: `--mono`, `--fs-2xs`, `--bg-raised`, a 1px `--edge` border, the `--scrim` shadow, and `placeAnchored`'s 4 px `ANCHOR_GAP` (style.css:4227-4243). Never covers the title: **fails in the flip case**. `placeAnchored` puts the panel above the timer when `timer.bottom + 4 + panelHeight > innerHeight − 8`, which is about 35 px from the viewport bottom. The title sits above the state row, so a flipped panel covers it. The implementer says so in web-implementation.md Decisions. This only happens on a card whose lower part has scrolled out of view below the rail. See correctness Decision 1. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only change, no Claude Code format names) |
| 2 | Terminal-output state parsing | pass (n/a) |
| 3 | Blocking hook handler | pass (n/a, no daemon change) |
| 4 | Bare tmux / resize-pane | pass (n/a) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass (the panel's text is always one of the three `cacheWarmth` strings; unknown reads `cache unknown`, never blank: `applyCardText` sets `aria-description` on every pass) |
| 7 | Identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass (n/a) |
| 9 | Real `claude` outside canary | pass (synthesized POSTs via existing capture-faithful helpers) |

Design tokens: `.cardtip` adds no literal colour or font stack. It uses `--fg`, and its 4px/10px padding follows the stylesheet's px-spacing norm (there are no spacing tokens). Its numbers change over time, and it sets `font-variant-numeric: tabular-nums`. Nothing toggles `hidden`. No `innerHTML` (`textContent` only). No new dependency.

## Issues

### Critical
1. **[orchestrator]** The E2 gate line `make e2e` is red: 8 failed, 901 passed in 21.4 min, at a load average of about 7.6. I find no defect for any agent to fix:
   - No failing test is in a spec this plan authored or touches a path it changed. The failures are shell-scroll:303, shortcuts:165, subagent-status:523/600, terminal:310 and theme:450/561/598.
   - Every failure is an infrastructure or timing symptom: `ERR_SOCKET_NOT_CONNECTED` on `page.goto`, `Target page, context or browser has been closed`, `scratch musterd never became healthy`, tmux copy-mode and pane-snapshot waits, and a 10 s transcript-interrupt wait.
   - The plan changes no daemon code and no code path any of those specs exercise.
   - Re-run alone and exclusive on the same tree, all 8 passed (kb:lesson/concurrent-build-invalidates-running-e2e, kb:lesson/concurrent-e2e-across-worktrees-goes-red).

   A re-run of the 8 tests is still not this exact line. The next cycle's gate run must show `make e2e` green as a whole sweep, on a quiet machine. Tagging this `[web-impl]` would send the agent after a regression that is not there.

### Major
1. **[e2e-specs]** Three code paths the plan names have no test. Mutating any of them leaves the suite green:
   - **Edge case 1** ("pointer leaves the timer before the delay elapses → no panel → E1"): no test in `cache-warmth.spec.ts` hovers the timer and leaves inside 350 ms. The plan claims E1 covers it, and it does not. This is the `mouseleave → cancelPending` path in `web/src/render/cardtip.ts:62`.
   - **REQ-2's pointerdown close** (`cardtip.ts:64`): no test presses on the card with the panel open.
   - **REQ-1's Tiles strip clause**: no test hovers a strip card. Dropping `cardTip` from `renderStrip`'s options in `web/src/features/tiles.ts:331`, or the `cardTip.refresh()` after it, would stay green. Only `aria-description` on the strip is asserted.

   The fix: in the same spec file, with the per-test `daemon` fixture:
   - hover a timer, move off before 350 ms, wait past the delay, and assert `toHaveCount(0)`;
   - open the panel, `page.mouse.down()` on the card, and assert it is hidden;
   - hover a strip card's timer in Tiles and assert the tooltip text.

### Minor
None.

### Decisions
1. **[orchestrator:decision]** RV1 says "never covers the card's own title", but the flipped placement does cover it (Reviewer-Verified RV1). The two options:
   - **(A) Accept the flip and amend the criterion.** The panel goes above the timer, over the title, only when the timer is within about 35 px of the viewport bottom. That means the card's repo block, gauge and activity line are already below the fold. No code change: `placeAnchored` is shared with the menu and the group popover, and all three flip the same way.
   - **(B) Keep the title uncovered in the flip case too.** `web-impl` anchors the flipped panel to the card's top edge (above the title) instead of the timer's. This costs a second anchor, or a placement option in the shared `anchored.ts` routine, plus a test for that branch. The panel then sits two or three lines further from the timer it describes.

### Notes
1. **[note]** If the card is removed after `mouseenter` and before the 350 ms delay elapses, `show()` still runs on the detached timer. `placeAnchored` gets a zero rect and puts the panel at (8, 8) until the next render's `refresh()` closes it (at most about 1 s on the tick) — `web/src/render/cardtip.ts:39`. The window needs a removal from another window or batch inside 350 ms of a hover, which is narrow. An `if (!timer.isConnected) return;` in `show` closes it. No change requested.
2. **[note]** The header comment in `web/src/render/anchored.ts:3-4` says the routine is "Shared by the menu (`menu.ts`) and the group popover (`grouppopover.ts`)". `cardtip.ts` is now a third caller, so the comment is stale. This is the comment pass's to fix.
3. **[note]** Tiles' `refresh()` runs only from `renderView`, which `views.ts:103` calls only in the Tiles view. If a chord switches Tiles → Focus while a strip-card panel is open under a still pointer, that panel waits for the card's `mouseleave` (Chrome's next boundary update), not for a render. For review-browser to observe if it can; I request no change.
4. **[note]** `cardTip(page)` in `web/e2e/helpers/cache-warmth.ts:146` is `page.getByRole("tooltip")`, which also matches the group popover. This is harmless in the one test that uses it, which hovers no header. A future test that opens both should scope it to `.cardtip`.

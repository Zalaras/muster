# Review: cache-hover

**Plan**: cache-hover
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: cache-hover

**Plan**: cache-hover
**Part verdict**: needs-changes
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

## Browser review

# Browser review: cache-hover

**Plan**: cache-hover
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 8851 words (budget 30000)
**Rig**: `make web-build build` at 38a2a2f0; per-test scratch `bin/musterd` from `helpers/fixtures.ts` (space-bearing data dir `$TMPDIR/muster e2e-*`, private `-tmux-socket` inside it, stub `claude` at `$TMPDIR/muster e2e-stub-*/claude`); headless Chromium 1280×720 (600 and 540 high for the scroll and flip cells), throwaway spec `web/e2e/zz-review-browser.spec.ts`, deleted.

Gates: `17-e2e` is red, 8 failed of 909: shortcuts, shell-scroll, terminal, subagent-status ×2 and theme ×3, several at 13.5 m, so they hung. None is in `cache-warmth.spec.ts`, and `18-E1` is 14/14 green. The app I drove is the tree as it stands.

## Matrix

Hosts: **rail** (focus view), **strip** (the Tiles strip card). The rail is not laid out in the Tiles view (`#sessions` has 0 client rects, width 0), so rail × tiles is N/A. **pop-out**: N/A for every row, because `/doc.html` hosts no session card. States: **data** (warm/cooling/cold), **no data** (`cache unknown`, no `prompt_cache` posted yet), **down** (scratch daemon got SIGTERM via `daemon.kill()`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | rail | data | opens POPOVER_DELAY_MS after mouseenter | pass | real clock, mouseenter→panel append: 354, 351, 352 ms |
| REQ-1 | strip | data | opens after the delay | pass | 301 ms under the fixed page clock, where in-page `performance.now` is faked. The rail under the same clock read 321/271/273, so this is the same order as the rail's real-clock 351 ms |
| REQ-1 | rail | data | role=tooltip, text `cache warm · cold in 60m` | pass | `.cardtip[role=tooltip]` under BODY, text matches |
| REQ-1 | rail | data (cold) | text `cache cold` | pass | after clock +3700 s |
| REQ-1 | rail | no data | text `cache unknown` | pass | idle session with no prompt_cache; a working card's `aria-description` also reads `cache unknown` |
| REQ-1 | strip | data | text | pass | `cache warm · cold in 40m` |
| REQ-1 | rail | data | visible (computed) | pass | opacity 1, display block, visibility visible, z-index 55 |
| REQ-1 | strip | data | visible (computed) | pass | same values |
| REQ-1 | rail | data | placed: below the timer, inside the viewport | pass | timer 224,264–261,278; tip 224,282–393,303 (gap 4); viewport 1280×720 |
| REQ-1 | strip | data | placed: inside the viewport | pass | timer 1205,638–1242,652; tip 1103,656–1272,677 (right-clamped, gap 4); strip 0,605–1280,720 |
| REQ-1 | rail | down | opens while down | FAIL | opened at t=4009 ms, then the reconnect attempts at 4107/5114/7123 ms each emit `status` and close it. 12 samples over 6 s with the pointer still on the timer: 0 tips (Major 1) |
| REQ-1 | strip | down | opens while down | FAIL (inferred) | same `app.on("status") → cardTip.close()` wiring in `features/tiles.ts`. The strip × down cell was not driven separately |
| Edge 1 | rail | data | leave before the delay → no panel | pass | leave to (1,1) after 150 ms: 0; leave to the card's `.name` (still on the card) after 150 ms: 0 at +700 ms |
| REQ-2 | rail | data | stays open as the card moves under a still pointer (same card) | pass | the card above grew, the timer moved +31.5 px, `elementFromPoint` was still inside the target card; tip count 1 at +100 ms and +1.5 s |
| REQ-2 | rail | data | repositions to the timer's current box | pass | after the move: timer bottom 310, tip top 314 (gap 4), settled after a 1.5 s render pass |
| REQ-2 | rail | data | counts down live | pass (E1) | committed spec E1 green (60m→10m). Not re-driven in the rail by this probe |
| REQ-2 | strip | data | counts down live | pass | open tip went from `40m` to `10m` after clock +30 min, with no re-hover |
| REQ-2 | rail | data | closes when the pointer leaves the card | pass | mouse to (1,1): 0 |
| REQ-2 | rail | data | closes on pointerdown | pass | mouse.down on the timer: 0 at +100 ms, still 0 after a 1.2 s render pass |
| REQ-2 | rail | data | a card move puts the pointer on another card → that tip closes | pass | removed the card above: the target timer went 260→145 and its tip closed. The pointer now sat on `rm-y`'s timer, whose own tip opened `cache warm · cold in 20m` at 278 (rm-y timer bottom 274 + 4) |
| Edge 2 | rail | data | hovered card removed → panel goes | pass | DELETE `/api/sessions/{id}` with the tip open: 0 at +100 ms and +1.3 s |
| Edge 3 | rail | data | rail scroll under a still pointer | pass | wheel 120 px (`#sessions` scrollTop 120): sc-2's tip closed on the boundary event and the pointer, now on sc-3's timer, opened sc-3's tip (`57m`) at timer bottom + 4 |
| REQ-2 | rail | data | one panel at a time | pass | hover a second card's timer directly: count 1, the new card's text |
| REQ-3 | rail | data | no `title`, `aria-description` = warmth, `aria-label="time in state"` | pass | `{title:null, desc:"cache warm · cold in 60m", label:"time in state"}` |
| REQ-3 | strip | data | no `title`, `aria-description` | pass | `{title:null, desc:"cache warm · cold in 40m"}` |
| REQ-4 | rail | data | group header timer keeps its native `title` | pass | `.gsum [data-cache]` title `2 of 2 warm · next cold in 40m`, no aria-description |
| REQ-4 | rail/strip | data | panel takes no click | pass | computed `pointer-events: none` in both hosts |
| Rev-verified | rail/strip | data | reads as one with the group popover | pass | computed font `ui-monospace…` 10.2px, bg rgb(23,26,36), border 1px solid rgb(106,114,134), z 55. These come from the `.pop, .cardtip` shared block; I did not open a `.pop` side by side (Note 2) |
| Rev-verified | rail | data | never covers the card's own title | pass (below) / FAIL (flip) | below the timer: tip 224,282–393,303 vs `.name` 14,241–59,259, no overlap. Flip with the timer near the viewport bottom (540 high) and a wrapping title: tip 224,485–393,506 overlaps `.name` 14,468–278,504, and `elementsFromPoint` under the tip is `.r1` (Major 2) |
| Rev-verified | strip | data | never covers the title | pass | tip 1103,656–1272,677 vs `.name` 14,615–44,633 |
| any | pop-out | any | — | N/A: `/doc.html` hosts no session card or timer | |
| any | rail | tiles view | — | N/A: the rail is not laid out in the Tiles view (0 client rects) | |
| §6 honesty | rail/strip | no data | unknown shown as the word, not an empty track | pass | `cache unknown` text; no cost, no "Done" |
| §6 honesty | rail | down | daemon-down surfaced | pass | `musterd unreachable` alert visible (pre-existing banner) |

## Issues

### Critical

None.

### Major

1. **[web-impl]** In the daemon-down state the card tip cannot be kept open. `connection.ts` emits `status` on every failed reconnect attempt (backoff 500 ms → 8 s), and `features/rail.ts` / `features/tiles.ts` call `cardTip.close()` on each one. That closes an open tip, and also cancels a pending open, so it opens only if a 350 ms window happens to fit between two attempts. Measured: opened at 4009 ms, closed by the 4107 ms attempt; 0 tips over 6 s with the pointer on the timer. The timer's warmth keeps counting while the daemon is down (REQ-28 of the cache-warmth plan), and the warmth text is computed in the client, so the hover is meant to work in this state. A fix must make this true: a tip opened while the daemon is down stays open, counting down, across reconnect attempts while the pointer stays on the card. Either close only on the transition out of `connected`, or drop the `status` close for this client-computed panel. The group popover has the same wiring, which is pre-existing and outside this plan.
2. **[web-impl]** The plan's Reviewer-Verified criterion "never covers the card's own title" fails when `placeAnchored` flips the panel above the timer, near the viewport bottom. Measured at 540 px high with a title that wraps to two lines: tip 224,485–393,506 against `.name` 14,468–278,504. The overlap is 54×19 px of the title row, and `elementsFromPoint` under the tip is `.r1`. `web-implementation.md` names the flip case as a known gap. A fix must make this true: in every placement, the panel's box does not intersect the card's `.name` box.

### Minor

None.

### Notes

1. **[note]** The gate run's `17-e2e` is red with 8 failures, all outside `cache-warmth.spec.ts`, several hung at 13.5 m. An orphaned scratch daemon from that run is still alive: pid 10053, parent launchd, data dir `$TMPDIR/muster e2e-iyFYMT` created 16:33, before this review's build at 16:50. I left it running because it is not this review's. The review-work part owns the gate reading.
2. **[note]** "Reads as one with the group popover" was measured from the `.cardtip` computed style only. That style comes from the shared `.pop, .cardtip` rule. I did not open a `.pop` beside it for a pixel comparison, and I did not check the light theme (the contrast gate shows 50 pairs and 0 failures in every theme).
3. **[note]** The card timer has no `tabindex`, so keyboard users get the warmth only as `aria-description` and no panel. The plan asks for nothing more. The panel stays open on Escape (strip, measured: count 1 after Escape), and the plan does not list Escape as a close signal.
4. **[note]** The probe did not drive the strip × down cell (Major 1 is inferred there from identical wiring). It also did not measure the rail × data countdown in its own run; committed E1 covers it and is green.
5. **[note]** The committed hover test's `toBeVisible({ timeout: 1000 })` polls at Playwright's 0/100/250/500 ms steps. It bounds the open delay at "under 1 s", not at 350 ms, which matches the plan's Proof wording. Neither browser Major is in that spec's reach: it does not test daemon-down or the flip placement. No change requested.

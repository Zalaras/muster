# Review: cache-hover

**Plan**: cache-hover
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: cache-hover

**Plan**: cache-hover
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 25741 words (budget 30000)

Scope: a full review, not a delta re-review. Cycle 1 left Majors open (correctness Major 1, browser Major 1, browser Major 2), so §0 does not apply. Since the cycle 1 review commit 5c6d1dea, the source diff is two `status` handlers (`web/src/features/rail.ts`, `web/src/features/tiles.ts`) and four new tests in `web/e2e/cache-warmth.spec.ts`. I re-read the whole plan diff against `main`.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. The timer's `mouseenter` in `web/src/render/cardtip.ts:59-63` opens a `role="tooltip"` `.cardtip` panel `POPOVER_DELAY_MS` later. The panel goes on `document.body` and `placeAnchored` places it. Its text is the timer's `aria-description`, set from `vm.warmth.hover` (`render/sessions.ts:112`). The strip gets the panel through `StripOptions.cardTip` (`render/tiles.ts:210,249`). | Rail: the hover test (`cache-warmth.spec.ts:599`). Strip: new test at `:954`, which checks the text, the live countdown and the close on leave. Edge case 1: new test at `:878`. The fix log records mutation evidence for each new test. | pass |
| REQ-2 | Yes. Both hosts call `refresh()` after every render (`features/rail.ts:203`, `features/tiles.ts:330`). It re-places the panel, re-reads the text, and closes the panel once the timer has no client rects. The panel also closes on the card's `mouseleave` and `pointerdown`. A `status` event no longer closes it (rail.ts:158-160, tiles.ts:136), so a tip opened while the daemon is down stays open. | The card-move test (`:599`). Pointerdown close: new test at `:918`. Daemon-down across reconnect attempts: new test at `:998`. It counts at least 2 new `/ws` attempts and samples every 100 ms that the tip never disappears. The fix log says it is red on 6d6b5380's handlers. Removal is untested, as the plan states. | pass |
| REQ-3 | Yes. `timer.setAttribute("aria-description", …)` replaces `title`, and the template's `aria-label="time in state"` is unchanged. | Nine rewritten tests. E14 also asserts `not.toHaveAttribute("title")`. | pass |
| REQ-4 | Yes. The group header still sets `el.title` (`render/railsections.ts:146`). `grouppopover.ts` changes only by exporting its constant. `.cardtip` gets `pointer-events: none` from the shared `.pop, .cardtip` block. The `status` handler still closes the group popover. | Group-header and popover tests are unchanged and green (18-E1.log). | pass |
| DIAG | `kb:diagram/web-components` (the only diagram `kb for` names for the changed files). `render/` shows 40 modules, which matches the tree. Cycle 2 adds no module. | — | pass |

## Build & Tests

E2E tests: pass (913 passed, 8.5m, 17-e2e.log; a `--fresh` run on a quiet machine) · Daemon tests (race): pass (25 packages ok, 02-test.log) · Web tests: pass (2714 in 95 files, 05-web-test.log) · Daemon build: pass (01-build.log, empty, exit 0) · Web build: pass (04-web-build.log) · Lint: pass (golangci-lint 0 issues, biome 332 files clean, e2e-lint clean). Also green: contrast (50 pairs, 0 failures in each of the 3 themes), features-inventory, versions, e2e-honest, kb-check (604 records, 0 problems), features-scope, comments, comment-ledger, size-warn (0 hits). All of this is read from `$GATES_LOG_DIR` (gates-cache-hover-c2b, 0 failed lines).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test cache-warmth.spec.ts` | pass (18 passed, 18-E1.log) |
| W1 | `make web-lint` | pass (deduped to web-lint, 06) |
| W2 | `make web-test` | pass (deduped to web-test, 05; 2714 passed) |
| W3 | `make web-build` | pass (deduped to web-build, 04) |
| E2 | `make e2e` | pass (913 passed, 0 failed, 17-e2e.log). Cycle 1's Critical 1 is cleared: the whole sweep is green as this exact line. |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. #99 is moved to `docs/history/todo-done.md`. Neither log has a `deviation:` line, and fix attempt 1 adds none. The one `doc-delta:` line (render/CLAUDE.md should name `cardtip.ts`) is handled in cd5a425c. `cardtip*.ts` is in rail's `web:` globs. `kb ls --status proposed` is empty for rail, tiles, usage and groups. The Doc Delta matches the code. The panel opens 350 ms after entry. It stays open while the pointer is on the card, including across daemon-down reconnect attempts now. Its text is the timer's accessible description. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The panel reads as one with the group popover (font, ground, edge gap). It opens below the timer, clear of the title. Near the viewport bottom it flips above the timer, and may then cover the title (accepted, cycle 1 Decision 1 option A). | pass | `.pop, .cardtip` share one block in `style.css` (`--mono`, `--bg-raised`, 1px `--edge`, `--scrim` shadow). `placeAnchored` leaves a 4 px gap below the timer and flips above only when the panel does not fit. Cycle 1's browser measurement of the below placement found no overlap with `.name` (tip 224,282–393,303 against `.name` 14,241–59,259). Since 5c6d1dea, nothing in `cardtip.ts`, `anchored.ts` or `style.css` has changed. The flip case is now within the criterion as reworded in 6d6b5380. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only change; no Claude Code format names) |
| 2 | Terminal-output state parsing | pass (n/a) |
| 3 | Blocking hook handler | pass (n/a, no daemon change) |
| 4 | Bare tmux / resize-pane | pass (n/a) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass. The panel's text is always one of the three `cacheWarmth` strings. Unknown warmth reads `cache unknown`, never blank. |
| 7 | Identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass (n/a) |
| 9 | Real `claude` outside canary | pass (the new tests use the existing `driveToState`/`postStatus` helpers and `daemon.kill()`) |

Design tokens: unchanged since cycle 1, and clean. `.cardtip` uses no colour literal and no font stack. It sets `tabular-nums`. It has no `hidden` toggle and no `innerHTML`, and it adds no dependency.

Test quality: the four new tests use the per-test `daemon` fixture, as the Fixture plan header says. Their assertions are specific: `toHaveCount(0)` after a wait past the delay, exact warmth strings, and an attempt count against a vanish flag. The early-leave test checks with `elementFromPoint` that the pointer is off the timer but still on the card, so the card's `mouseleave` cannot be what passes it. The `## Repairs` table is "None", and no prior assertion was weakened (the cycle 2 diff only adds lines).

## Delta (delta re-review only)

n/a: this is a full review, because cycle 1 had Majors. I verified each cycle 1 issue:

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Critical 1 `[orchestrator]` "`make e2e` is red, 8 failed" | gate run c2b | 17-e2e.log shows 913 passed |
| cycle 1 correctness Major 1 `[e2e-specs]` "no test for edge case 1, the pointerdown close, or the strip hover" | `6ea1cf05` | three new tests at spec lines 878, 918 and 954, plus the logged mutation evidence; I read the test bodies |
| cycle 1 browser Major 1 `[web-impl]` "a tip cannot be kept open while the daemon is down" | `34494f4a` | read the diff: the `cardTip.close()` call is gone from both `status` handlers, and the popover close and `cancelTileRenames` stay. Pinned by the new test at spec line 998 |
| cycle 1 browser Major 2 `[web-impl]` "the flip covers the title" | `04638481`, `6d6b5380` | resolved by Decision 1 option A. The criterion is reworded in plan.md, and placement is unchanged, as that option says |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** The header comment at `web/src/render/anchored.ts:3-4` is still stale. It says the routine is "Shared by the menu (`menu.ts`) and the group popover (`grouppopover.ts`)", but `cardtip.ts` is a third caller. This repeats cycle 1 Note 2, and the comment pass has not picked it up.
2. **[note]** Now that the `status` handlers no longer call it, nothing outside `cardtip.ts` calls `CardTip.close()`. It is still exported on the interface (`web/src/render/cardtip.ts:7`). This is shape, so it belongs to review-maintainability, which was skipped this run. I request no change.
3. **[note]** Cycle 1 Note 1 still holds: if a card is removed inside the 350 ms delay, `show()` runs on a detached timer and places the panel at (8, 8) until the next `refresh()` (`web/src/render/cardtip.ts:39`). The window is narrow, and I request no change.

## Browser review

# Browser review: cache-hover

**Plan**: cache-hover
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 8851 words (budget 30000)
**Rig**: `make web-build build` at 6ea1cf05; per-test scratch `bin/musterd` from `helpers/fixtures.ts` (space-bearing data dir `$TMPDIR/muster e2e-*`, private `-tmux-socket` inside it, stub `claude` at `$TMPDIR/muster e2e-stub-*/claude`); headless Chromium 1280×720; throwaway spec `web/e2e/zz-review-browser.spec.ts`, run alone with `--workers=1` under the gate lock, then deleted.

Gates (`gates-cache-hover-c2b`): 0 failed lines. `17-e2e` 913 passed, `18-E1` 18 passed, including the new daemon-down test. The app I drove is the one that will ship.

Scope of this cycle: the only source change since cycle 1 is `34494f4a`, which removes `cardTip.close()` from the `status` handlers in `features/rail.ts` and `features/tiles.ts`. I re-measured the whole matrix on the new binary, because removing a close path can leave a panel stranded. I added cells for the close paths the removed handler might have been covering: a keyboard view toggle, a daemon restart and reconnect, and a pointerdown on a strip card. Cycle 1's Major 2 (the flipped panel covering the title) was settled as option A and is not re-measured as a requirement.

## Matrix

Hosts: **rail** (focus view) and **strip** (the Tiles strip card). **pop-out**: N/A for every row, because `/doc.html` hosts no session card. **rail × tiles view**: N/A, because the rail is not laid out in Tiles (`#sessions` has 0 client rects). States: **data** (warm/cooling/cold), **no data** (`cache unknown`, no `prompt_cache` posted yet), **down** (the scratch daemon is stopped with SIGTERM through `daemon.kill()`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | rail | data | opens POPOVER_DELAY_MS after the pointer enters | pass | pointer move to panel present (10 ms poll): 347, 338, 279 ms |
| REQ-1 | strip | data | opens after the delay | pass | 358, 349 ms |
| REQ-1 | rail | data | role=tooltip, under BODY, text `cache warm · cold in 60m` | pass | `{role:"tooltip", parent:"BODY", text:"cache warm · cold in 60m"}` |
| REQ-1 | rail | data (cold) | text `cache cold` | pass | page clock +3700 s, open panel reads `cache cold` |
| REQ-1 | rail | no data | text `cache unknown` | pass | panel `cache unknown`; timer `aria-description` `cache unknown` |
| REQ-1 | strip | data | text | pass | `cache warm · cold in 40m` |
| REQ-1 | rail | data | visible (computed) | pass | opacity 1, display block, visibility visible |
| REQ-1 | strip | data | visible (computed) | pass | same values |
| REQ-1 | rail | data | placed below the timer, inside the host and the viewport | pass | timer 224,145–261,159; panel 224,163–393,184 (4 px gap); `#sessions` 0,112–299,720; it does not reach `.name` 14,121–44,139 |
| REQ-1 | strip | data | placed inside the viewport | pass | timer 1205,638–1242,652; panel 1103,656–1272,677 (right-clamped, 4 px gap); strip 0,605–1280,720; it does not reach `.name` 14,615–53,633 |
| REQ-1 | rail | down | opens while down | pass | opened 283 ms after the pointer entered, with the `musterd unreachable` alert showing |
| REQ-1 | strip | down | opens while down | pass | opened at 307 ms (this cell was inferred in cycle 1; it is now driven) |
| REQ-2 | rail | down | an open panel survives the transition into down | pass | opened, then `daemon.kill()`: 58 samples over 6 s, min 1, max 1 |
| REQ-2 | rail | down | a panel opened while down stays open across reconnect attempts | pass | 86 samples over 9 s, min 1, max 1 (cycle 1: 0 of 12) |
| REQ-2 | strip | down | survives the transition, and stays open across reconnect attempts | pass | 48 samples over 5 s and 86 over 9 s, all count 1 |
| REQ-2 | rail | down | counts down live | pass | clock +50 min while down: `cache warm · cold in 10m` |
| REQ-2 | strip | down | counts down live | pass | clock +30 min while down: `cache warm · cold in 10m` |
| REQ-2 | rail | down | closes when the pointer leaves the card | pass | mouse to (1,1): 0 after 1.2 s |
| REQ-2 | rail | down→data | settled after the daemon restarts and the dashboard reconnects | pass | alert gone; 1.5 s later the panel is still open on the same timer: timer 224,145–261,159, panel top 163, text `10m`, so it is neither stranded nor stale |
| REQ-2 | rail | data | counts down live | pass | clock +50 min with no re-hover: `60m` → `10m` |
| REQ-2 | rail | data | stays open as the card slides under a still pointer, and moves with it | pass | a long prompt on the card above moved the timer from 296 to 332 (bottom 346). Panel still 1, top 350 (gap 4), checked after a 1.5 s render pass |
| REQ-2 | rail | data | closes on pointerdown | pass | 0 after a 1.2 s render pass |
| REQ-2 | strip | down | closes on pointerdown | pass | 0 while the button is down and 0 at +50 ms. The click then promotes the card into the grid, and the tile it displaces (`rbs-4`) drops into the strip under the still pointer. That card's own panel opens at +400 ms because the pointer is on its timer, which is a fresh `mouseenter` and not the closed panel coming back (Note 1) |
| REQ-2 | rail | data | closes when the pointer leaves the card | pass | 0 |
| REQ-2 | strip | data | closes when the pointer leaves the card | pass | 0 |
| REQ-2 | rail | data | closes when the hovered card is removed (Edge 2) | pass | DELETE `/api/sessions/{id}` with the panel open: 0 at +1.3 s |
| REQ-2 | rail | data | one panel at a time | pass | hovering a second card's timer: count 1, that card's text `20m`, at its timer |
| REQ-2 | rail | data | closes when a keyboard view toggle hides the host (⌘\ to Tiles) | pass | panel 1 before; `#sessions` 0 rects and panel 0 at +1.5 s |
| REQ-2 | strip | data | closes when a keyboard view toggle hides the host (⌘\ to focus) | pass | strip 1→0 rects; panel 0 at +100 ms and at +1.6 s |
| Edge 1 | rail | data | the pointer leaves the timer before the delay → no panel | pass (E1) | committed test green in `18-E1`; cycle 1 measured it by hand, and no code on this path changed |
| Edge 3 | rail | data | rail scroll under a still pointer | pass (cycle 1) | measured in cycle 1; the scroll path (boundary events plus `refresh`) is untouched by `34494f4a`. Not re-driven (Note 2) |
| REQ-3 | rail | data | no `title`; `aria-description` holds the warmth text; `aria-label="time in state"` | pass | `{title:null, desc:"cache warm · cold in 60m", label:"time in state"}` |
| REQ-3 | strip | data | no `title`; `aria-description` holds the warmth text | pass | `{title:null, desc:"cache warm · cold in 40m"}` |
| REQ-4 | rail | data | the group header timer keeps its native `title` | pass | `.gsum [data-cache]` `{title:"2 of 2 warm · next cold in 20m", desc:null}` |
| REQ-4 | rail/strip | data/down | the panel takes no click | pass | computed `pointer-events: none` in every opened panel |
| Rev-verified | rail/strip | data | opens below the timer, clear of the title | pass | see the placement rows. The flip case was accepted in cycle 1 (option A) and is not re-raised |
| §6 honesty | rail/strip | no data | unknown is shown as the word, not as an empty track | pass | `cache unknown`; no cost or spend figure, no "Done" |
| §6 honesty | rail | down | daemon-down is surfaced prominently | pass | `role=alert` "musterd unreachable — …": display block, opacity 1, box 0,46–1280,78 (full width) |
| any | pop-out | any | — | N/A: `/doc.html` hosts no session card or timer | |
| any | rail | tiles view | — | N/A: the rail is not laid out in Tiles (0 client rects) | |

## Issues

### Critical

None.

### Major

None. Cycle 1 Major 1 is fixed: measured in the rail and in the strip, both for a panel opened before the drop and for one opened during it.

### Minor

None.

### Notes

1. **[note]** In the strip, a click promotes the card, and the tile it displaces slides into the strip under the pointer. When the pointer rests on the incoming card's timer, that card's panel opens 350 ms later. This is the same rule as cycle 1's "a card move puts the pointer on another card". It is the plan's behaviour, and no change is requested.
2. **[note]** I did not re-drive Edge 3 (rail scroll) or Edge 1 by hand this cycle. Neither path is touched by the only source change (`34494f4a`). Edge 1 is covered by a committed test that is green in `18-E1`, and cycle 1 measured both cells.
3. **[note]** In the first strip run, ⌘\ did not toggle the view after a click had promoted a card into a tile. The keypress most likely went to the tile's terminal. That is outside this plan, and a toggle with focus on the toolbar measured correctly (the two ⌘\ rows above).
4. **[note]** A scratch `musterd` from 16:33 is still alive (pid 10053, parent launchd, data dir `$TMPDIR/muster e2e-iyFYMT`). It predates this cycle and cycle 1 already reported it. My own run left none: every daemon was torn down by its fixture.

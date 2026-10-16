# Correctness review: cache-hover

**Plan**: cache-hover
**Verdict**: approved
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

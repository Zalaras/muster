# E2E Test Specs: cache-hover

**Plan**: cache-hover
**Mode**: fix (attempt 1, review cycle 2; authoring section below is the original)
**Pack**: kb: pack 20052 words (budget 30000)
**Verdict**: pass
**Tests created**: 5 new (1 at authoring, 4 in fix attempt 1), 9 existing rewritten
**Live run**: 18/18 in cache-warmth.spec.ts passing against 34494f4a (fix attempt 1); at authoring 4/14, the 10 red being the plan's Proof

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/cache-warmth.spec.ts | a card timer's cache hover opens within the popover delay and stays open, counting down, while a card above it changes height | REQ-1, REQ-2, REQ-3 | Hover the lower card's timer: `role="tooltip"` with `cache warm · cold in 60m` within 1 s; prompts of different lengths to the upper session move the timer under the still pointer; panel still visible, text intact, top within 0..5 px under the timer's current box (both boxes re-read per retry); clock +50 min reads `cache warm · cold in 10m`; pointer off the card hides it | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | an idle session's timer is tinted ... (E14) | REQ-3 | title assertions become `aria-description`, plus one `not.toHaveAttribute("title")` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | the tint is a straight line ... | REQ-3 | card-timer `title` -> `aria-description` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | the underline starts at exactly 15% ... (boundary) | REQ-3 | card-timer `title` -> `aria-description` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | a session with no prompt_cache shows an unknown plain timer ... (E16) | REQ-3 | card-timer `title` -> `aria-description` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | every state shows an unknown plain timer ... (E17) | REQ-3 | card-timer `title` -> `aria-description` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | a Tiles strip card's timer carries the same warmth as its rail card | REQ-3 | strip card timer `title` -> `aria-description` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | the cache is kept by Stop and Resume ... | REQ-3 | card-timer `title` -> `aria-description` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | a live session's warmth is the same after a daemon restart ... (E15) | REQ-3 | card-timer `title` -> `aria-description` | ran-red-at-authoring |
| web/e2e/cache-warmth.spec.ts | the timer keeps fading from the last-known expiry while the daemon is down | REQ-3 | card-timer `title` -> `aria-description` | ran-red-at-authoring |

Group-header timer and popover-row timer assertions are unchanged (REQ-4) and ran green: `4 passed`.

## Deleted Tests

None.

## Fixture Changes

`cardTip(page)` added to `web/e2e/helpers/cache-warmth.ts` (the `role="tooltip"` panel). No payload changes: the new test uses `driveToState`, `postStatus` and `rawUserPromptSubmit`, all existing and capture-faithful.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | the new hover test (rail card; the Tiles strip card is not hovered, see Notes) |
| REQ-2 | the new hover test (open across a card move, live re-read, closes on leaving the card) |
| REQ-3 | the nine rewritten tests, E14 also asserts no `title` |
| REQ-4 | group-header and popover-row tests, unchanged |

## Handoff

None.

## Test Run Output

New test, failing on the assertion the plan names (the order and hover preconditions passed):

```
10) [chromium] › e2e/cache-warmth.spec.ts:599:1 › a card timer's cache hover opens within the popover delay and stays open, counting down, while a card above it changes height (REQ-1, REQ-2, REQ-3)
    Error: expect(locator).toBeVisible() failed
    Locator: getByRole('tooltip')
    Expected: visible
    Timeout: 1000ms
    Error: element(s) not found
  > 622 |     await expect(tip).toBeVisible({ timeout: 1000 });
```

A rewritten assertion (all nine fail the same way, the live element still carries `title`):

```
Expected: "cache warm · cold in 40m"
Received: ""
34 × locator resolved to <span class="timer" data-cache="warm" aria-label="time in state" title="cache warm · cold in 40m">00:00</span>
   - unexpected value "null"
```

Summary: `10 failed`, `4 passed (54.6s)`. `npx playwright test --list`: Total 909 tests in 58 files, no error. `biome check` clean on both files.

## Notes

- The plan names E14, the fade test and the boundary test; every other card-timer (and strip-card) `title` assertion in the file would break equally once REQ-3 lands, so all were moved to `aria-description`.
- The Tiles strip hover is not exercised: the plan's Proof lists one hover test on the rail. REQ-1's strip clause rests on the strip `aria-description` assertion and the shared builder.
- Edge cases 2 and 3 stay untested as the plan states.

## Fix Attempt 1 (review cycle 2)

Issue 1 (Major, [e2e-specs]): three untested paths. Issue 2 (Major, web-impl's, pinned here by a test).

### Tests added (web/e2e/cache-warmth.spec.ts, per-test `daemon` fixture, no helper changes)

| Test | Requirement | What It Verifies | Live run |
|------|-------------|------------------|----------|
| a pointer that leaves a card timer inside the popover delay opens no panel, even though it stays on the card | REQ-1, edge case 1 | Mouse onto the timer then to the card's corner (checked by `elementFromPoint` to be off the timer); after `settleFor(900)` `toHaveCount(0)` | green; red with `timer.addEventListener("mouseleave", cancelPending)` removed |
| pressing on the card closes the open cache panel and it stays closed with the pointer still on the timer | REQ-2 | Panel open, `page.mouse.down()`, `toHaveCount(0)`, still 0 after `settleFor(900)` | green; red with `card.addEventListener("pointerdown", close)` removed |
| a Tiles strip card's timer opens the same cache panel on hover and closes it when the pointer leaves the card | REQ-1 (strip clause), REQ-2 | Strip card timer hover: tooltip text `cache warm · cold in 40m`, counts down to 20m on a clock move, closes on leaving | green; red with `cardTip,` dropped from tiles.ts's strip options |
| a cache panel opened while the daemon is down stays open, counting down, across reconnect attempts while the pointer stays on the card | REQ-2 (review-browser Major, daemon-down) | Daemon killed, tip opened on hover; at least 2 more `/ws` socket attempts are counted (`page.on("websocket")`) while polling that the tip never disappears; text still counts down afterwards | see below |

### Evidence

- Issue 2 test against 6d6b5380's `web/src/features/rail.ts` and `tiles.ts` (the tree before web-impl's commit, swapped in temporarily and restored with `git checkout HEAD --`): red, `Error: the panel closed during a reconnect attempt, Expected: false, Received: true`.
- The same test against 34494f4a (`fix(cache-hover): keep the card tip open across daemon-down reconnect attempts (review cycle 2)`): green.
- Issue 1 mutations (each applied alone, `make web-build build`, test run, then restored; `git diff HEAD --stat` afterwards shows only the spec file): the three rows above went red on `toHaveCount(0)`, `toHaveCount(0)` and `toBeVisible()` respectively.
- Full file against 34494f4a: `18 passed (17.2s)`. `npx playwright test --list`: Total 913 tests in 58 files. `biome check` clean. Soak skipped as instructed.

## Repairs (fix attempt 1)

None. No assertion was deleted, skipped, or weakened.

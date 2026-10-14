# Web Tests: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Verdict**: pass
**Pack**: kb: pack 23647 words (budget 30000)

## Summary

Tests created: 106 new cases (cache.test.ts, railmenuitems.test.ts, additions to railorder, sections, card, protocol/session) | Passing: 2617 of 2617 (whole suite) | Failing: 0

`npx tsc --noEmit` clean, `npm test` 93 files / 2617 passed, `npm run lint` clean, `npm run build` exit 0.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/cache.test.ts` | cacheWarmth table | W1/W2: 3600 s and 300 s TTLs at exactly 15%, 0, 59/60/61 s; null is unknown; fraction capped; fades with the clock alone (REQ-28) | pass |
| `sessions/cache.test.ts` | remainingText, waitingMembers, latestEntered, groupWarmthHover | W4: waiting set (idle/needs_input/failed, alive only), latest stateSince, REQ-30's three texts | pass |
| `features/railmenuitems.test.ts` | cardMenuItems | W5: live, ended-resumable, ended-unresumable, Pin/Unpin, all disabled when disconnected or in flight | pass |
| `sessions/railorder.test.ts` | moveCard carried set; planDrop | W6: group-only move in attention order, multi-id manual order contiguous, own-section attention drop is null, header drops, carried/unknown target is null | pass |
| `sessions/card.test.ts` | warmth (W3) | INV-2: warmth unknown iff cache is null, all 6 states x alive true/false | pass |
| `sessions/sections.test.ts` | headerTimer; popoverModel rows | REQ-29/30/31: pick rule, ignored states, three hover texts, row `{title, timer, warmth}` | pass |
| `protocol/session.test.ts` | parseSession cache | populated, null, missing key rejected, malformed ttlSeconds/expiresAt rejected | pass |

## Handoff Received

- `sessions/testfixtures.ts` and the inline Session literals in `api/launch`, `api/sessions`, `ws`, `features/actionscopy`, `render/dead`, `render/mainhead`, `render/tiles`, `render/sessions`, `sessions/card`, `sessions/live`, `sessions/sort`, `sessions/store` tests: added `cache: null`.
- Raw wire fixtures in `protocol/session.test.ts` and `protocol/messages.test.ts`: added `cache` (populated on the full one, null on the "no data yet" one).
- `sessions/card.test.ts` `actions` block replaced by the W3 warmth block.
- `render/sessions.test.ts`: `onMenu` in `baseOptions`; the fake element's `style` gained `setProperty`/`removeProperty` (`applyWarmth` calls them); the fake template drops `.acts-row`; the focus-restore tests used the removed Resume button (two silently passed on a null query), now use the card's pin button. `render/tiles.test.ts`: `onMenu` in the strip options.
- `sessions/sections.test.ts`: `popoverModel(section, now)` and `sessions: {title, timer, warmth}[]`.

## Implementation Bugs (if verdict = implementation-bug)

None.

## Notes

- Mid-run I ran `prettier --write src` by mistake (the repo formats with biome); it rewrote the whole of `web/src`. The tree had been clean there, so I restored it with `git checkout HEAD -- src`, re-applied only my edits, and formatted my files with `biome check --write`. The final diff is 17 test files only (`git status` shows no non-test change).
- Uncovered by unit tests, by design: DOM rendering of `data-cache`/`--warmth`, menu open/close, drag events (Playwright specs `cache-warmth`, `rail-menu`, `rail-drag-groups`). `features/railmenu.ts` is DOM-bound; its derivation is the tested `railmenuitems.ts`.
- No `dupl` repetition kept on purpose; cases are tables.

## Test Run Output

```
 Test Files  93 passed (93)
      Tests  2617 passed (2617)
```

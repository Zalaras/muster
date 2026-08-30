# Web Tests: order-sidebar

**Plan**: order-sidebar
**Verdict**: pass

## Summary

Tests created: 79 new (34 `orderRail` in `sort.test.ts` including 15 pre-existing
`sortSessions` tests untouched + 19 new; 15 `moveCard` in new `railorder.test.ts`; 30 new
DOM-wiring tests in `sessions.test.ts`) | 10 fixture-only files repaired (compile/runtime) |
Passing: 549/549 | Failing: 0

`npx tsc --noEmit`, `npm test` (`vitest run`), and `npm run build` all exit 0 from `web/`;
`make web-build` and `make web-test` from the repo root are both green.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `sessions/sort.test.ts` | orders the pinned block by railPos asc, then unpinned by railPos asc | W3 | pass |
| `sessions/sort.test.ts` | keeps every pinned session before every unpinned regardless of railPos magnitude | REQ-6 invariant | pass |
| `sessions/sort.test.ts` | breaks a railPos tie within pinned/unpinned block by ascending id | W3 tiebreak | pass |
| `sessions/sort.test.ts` | handles no-pinned / all-pinned / empty lists | W3 edge cases | pass |
| `sessions/sort.test.ts` | manual-mode order ignores state/alive/attention/stateSince across every state × alive permutation | INV-3/W4 | pass |
| `sessions/sort.test.ts` | attention mode: pinned idle stays above unpinned needs_input | INV-4/W5 | pass |
| `sessions/sort.test.ts` | attention mode unpinned group matches `sortSessions`'s own order exactly | W6 | pass |
| `sessions/sort.test.ts` | attention mode: pinned block ordered by railPos/id, not state | INV-4 detail | pass |
| `sessions/sort.test.ts` | attention mode pinned-precedes-unpinned holds across every state × state pair | INV-4 exhaustive | pass |
| `sessions/sort.test.ts` | `orderRail` never mutates input (manual + attention), returns a new array | W9 | pass |
| `sessions/railorder.test.ts` | `moveCard` forward/backward drag worked examples (mirrors `moveTile([1,2,3,4],1,3)→[2,3,1,4]`) | W7 | pass |
| `sessions/railorder.test.ts` | dragged entry inherits target's `pinned`, `pinnedCount` recomputed correctly (pin-at-drop, unpin-at-drop, within-block, single-member block) | W7 | pass |
| `sessions/railorder.test.ts` | returns `null` for self-drop, absent dragged id, absent target id, both absent | W8 | pass |
| `sessions/railorder.test.ts` | never mutates `ordered` or its item objects | W9 | pass |
| `protocol.test.ts` | `parsePrefs` defaults missing `railSort` to `"manual"`; accepts `"attention"`; rejects any other value / non-string | REQ-5 | pass |
| `protocol.test.ts` | `parseSession` accepts `pinned`/`railPos`; rejects a session missing either, non-boolean `pinned`, non-numeric `railPos`, null for either | §5.3 required-field contract | pass |
| `render/sessions.test.ts` | pin button `aria-label`/`aria-pressed`/`title` set correctly on first build (pinned and unpinned) | W13 | pass |
| `render/sessions.test.ts` | pin button attributes update in place (same node) on a pinned⇄unpinned transition | W13 | pass |
| `render/sessions.test.ts` | pin button carries `data-action="pin"`/`data-id` for the focus-capture contract | REQ-16 support | pass |
| `render/sessions.test.ts` | every pinned card gets class `pinned`, no unpinned card does | REQ-9 | pass |
| `render/sessions.test.ts` | only the last pinned card in display order gets `pinned-last`; none when nothing pinned; moves to the new last pinned card across a re-render | W14 | pass |
| `render/sessions.test.ts` | `draggable` attribute is explicit `"true"`/`"false"` (never merely absent), defaults `"false"`, flips in place across renders | W15/W16 | pass |

Plus the 10 pre-existing files' fixtures repaired for the plan's new required
`Session.pinned`/`railPos` and `Prefs.railSort` fields (no new assertions there beyond
what already existed): `api.test.ts`, `protocol.test.ts` (fixture repair, separate from the
new describe blocks above), `render/dead.test.ts`, `render/sessions.test.ts` (fixture
repair, separate from the new blocks above), `render/tiles.test.ts`, `sessions/card.test.ts`,
`sessions/live.test.ts`, `sessions/store.test.ts`, `ws.test.ts`.

## Scope notes / things deliberately not unit-tested

- **`render/dragreorder.ts` (and its `tiledrag.ts` wrapper) — no new Vitest coverage.**
  This module is genuine DOM event wiring (`addEventListener("dragstart"/"dragover"/
  "drop"/...)`, `classList`, `Element.closest`, `DataTransfer`) with no pure logic to
  extract — `moveCard`/`moveTile` (the actual reorder math it calls into) already have
  full unit coverage. `docs/conventions.md`'s Vitest/Playwright split puts this squarely
  in Playwright's territory; the plan's own Reviewer-Verified list agrees (W11/W12 are a
  grep check + "`tiledrag.test.ts` passes unchanged", not new assertions), and
  `web/e2e/rail-order.spec.ts` (authored by e2e-specs) is where drag interaction is
  actually exercised. Verified W12 by running the full suite unchanged:
  `tiledrag.test.ts` is one of the 549 passing tests, untouched by me.
- **W17 (pin click doesn't invoke the card's focus/promote handler) — not unit-tested.**
  The existing `FakeDomNode` test double's `addEventListener` is a documented no-op
  (see its comment: "reconcileCards's own tests never simulate a click/keydown, only the
  reconciliation contract — Playwright drives real events"). Simulating a real click with
  `stopPropagation` semantics would need a materially heavier DOM shim than this file's
  existing convention, for a single interaction assertion Playwright already owns
  (`web/e2e/rail-order.spec.ts` / `actions.spec.ts`'s precedent). This matches the plan's
  own Acceptance Criteria: W17 is listed under Reviewer-Verified ("reading
  `render/sessions.ts`"), not under a Vitest-presence check. I did read the code
  (`render/sessions.ts` lines ~214-218): the pin button's click listener calls
  `event.stopPropagation()` before `onAction`, wired once at build time, same pattern as
  `buildActionButton`'s existing (already-trusted) stopPropagation — no defect observed.
- **W18 (neutral tokens only, no state colour) — reviewer-verified by reading
  `style.css`, not something Vitest can assert (Vitest never loads CSS).** I read the new
  rules web-impl added (`.card .pin`, `.card.pinned-last`, `.card[draggable]`,
  `.card.dragging`, `.card.drop-target`) and confirmed they reference only `--dim`/
  `--paper`/`--line2` (neutral, per the plan's Decisions section) — no `--state-*` token
  anywhere in them.
- **`render/tiles.ts`'s `renderStrip` (W16, strip never draggable)** — not independently
  tested beyond the fixture repair, because `renderStrip` hardcodes `reconcileCards(...,
  false)` for the `draggable` argument with no parameter of its own to vary (confirmed by
  reading `web/src/render/tiles.ts`); the real behaviour under test is `reconcileCards`'s
  `draggable` plumbing, which `render/sessions.test.ts`'s new draggable-attribute tests
  already cover directly against the same shared function the strip calls.

## Implementation Bugs

None found. Every Handoff item compiled and ran correctly on the first attempt except two
self-caught test-authoring arithmetic errors in `railorder.test.ts` (worked out `moveCard`'s
forward/backward insertion point by hand incorrectly on the first pass for two of the
pin-inheritance cases — corrected by re-deriving against the algorithm's own `withoutDragged`/
`splice` steps before the fix, not against a run-until-it-passes guess; final values verified
by hand-tracing the algorithm, not just accepting Vitest's actual output).

## Test Run Output

```
$ npx tsc --noEmit
(no output — exit 0)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  19 passed (19)
      Tests  549 passed (549)
   Duration  1.16s

$ npm run build
> tsc --noEmit && vite build
✓ 32 modules transformed.
dist/index.html                   9.85 kB │ gzip:  2.27 kB
dist/assets/index-CS90IBRE.css   20.94 kB │ gzip:  4.60 kB
dist/assets/index-DGkI73N4.js   378.02 kB │ gzip: 97.80 kB
✓ built in 293ms

$ make web-build   # from repo root
✓ built in 203ms

$ make web-test    # from repo root
 Test Files  19 passed (19)
      Tests  549 passed (549)
```

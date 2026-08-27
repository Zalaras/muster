# Web Tests: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Verdict**: pass

## Summary

Tests created: 66 (65 new `it`/`it.each`-expanded cases across 8 existing files + 1 new
test file) | Passing: 387 of 387 (full suite) | Failing: 0

No implementation code was touched. No existing test was edited beyond adding new
`describe`/`it` blocks and extending fixture imports/handler stubs — every pre-existing
assertion is untouched and still passes.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/sort.test.ts` | puts every alive:false session after every alive:true session, regardless of state priority | REQ-9: `needs_input` ended still sorts after `idle` live | pass |
| `sessions/sort.test.ts` | orders the ended group by endedAt descending (most-recently-ended first) | REQ-9 | pass |
| `sessions/sort.test.ts` | interleaves live and ended sessions correctly | REQ-9, W4 | pass |
| `sessions/sort.test.ts` | breaks a tie in endedAt by ascending id | REQ-9 tiebreak | pass |
| `sessions/sort.test.ts` | sorts a null endedAt last within the ended group (defensive) | REQ-9 defensive branch | pass |
| `sessions/sort.test.ts` | never mutates the input array when ended sessions are present | purity | pass |
| `sessions/card.test.ts` | offers only End for a live session / Resume+Remove for ended | REQ-11, W5 | pass |
| `sessions/card.test.ts` | ended timer reads 'ended <age>' from endedAt, ignoring stateSince | REQ-9, W5 | pass |
| `sessions/card.test.ts` | ended timer uses formatEndedAge's minute bucket | REQ-9 | pass |
| `sessions/card.test.ts` | live timer never carries the 'ended' prefix | REQ-9 boundary | pass |
| `sessions/format.test.ts` | formatEndedAge — now/1m/59m/1h/23h/1d buckets | REQ-9/10/13 | pass |
| `sessions/format.test.ts` | formatEndedAge never negative on a future endedAt (clock race) | boundary | pass |
| `sessions/format.test.ts` | formatEndedAge returns 'now' for an unparsable endedAt | malformed input | pass |
| `sessions/live.test.ts` | aliveOnly passes through alive ids unchanged/in order | REQ-13/INV-5/W8 | pass |
| `sessions/live.test.ts` | aliveOnly drops a dead id without reshuffling the rest | REQ-13/INV-5/W8 | pass |
| `sessions/live.test.ts` | aliveOnly drops an id that isn't a known session | REQ-13/INV-5/W8 | pass |
| `sessions/live.test.ts` | aliveOnly returns empty when every desired id is dead/unknown | boundary | pass |
| `sessions/live.test.ts` | aliveOnly on empty input / partial overlap | boundary | pass |
| `sessions/store.test.ts` | remove deletes an existing session by id | REQ-15, W7 | pass |
| `sessions/store.test.ts` | remove is a no-op on an unknown id (edge case 12) | REQ-15, W7 | pass |
| `sessions/store.test.ts` | remove is a no-op on an empty store | boundary | pass |
| `sessions/store.test.ts` | remove only touches the targeted id (INV-2 at store layer) | REQ-15 | pass |
| `sessions/store.test.ts` | remove then re-upsert the same id works normally | race tolerance | pass |
| `protocol.test.ts` | parses a well-formed sessionRemoved | W6, REQ-15 | pass |
| `protocol.test.ts` | ignores unknown top-level fields (additive evolution) | W6 | pass |
| `protocol.test.ts` | rejects sessionRemoved missing id | W6 | pass |
| `protocol.test.ts` | rejects sessionRemoved with a non-number id (string/null/undefined/object/array/bool) | W6 | pass |
| `protocol.test.ts` | accepts id 0 (not a falsy 'missing' sentinel) | W6 boundary | pass |
| `ws.test.ts` | dispatch routes sessionRemoved to onSessionRemoved with the bare id, not onSnapshot | REQ-15 | pass |
| `ws.test.ts` | full socket lifecycle: dispatches a sessionRemoved frame to onSessionRemoved | REQ-15 | pass |
| `api.test.ts` | endSession posts and decodes 200 Session (alive:false, endedAt set) | REQ-5 | pass |
| `api.test.ts` | endSession decodes 404 unknown_session / 409 not_alive | REQ-5 | pass |
| `api.test.ts` | endSession falls back to generic error on a malformed success body | robustness | pass |
| `api.test.ts` | resumeSession posts and decodes 200 Session (state unchanged until SessionStart) | REQ-7 | pass |
| `api.test.ts` | resumeSession decodes 409 not_resumable / 409 directory_missing / 500 launch_failed | REQ-7 | pass |
| `api.test.ts` | removeSession decodes a bare 204 as success without parsing a body | REQ-6 | pass |
| `api.test.ts` | removeSession decodes 404 unknown_session / 500 end_failed | REQ-6 | pass |
| `api.test.ts` | removeSession never throws on invalid JSON in a non-204 body | robustness | pass |
| `api.test.ts` | fetchPane decodes a 200 pane snapshot (text + capturedAt) | REQ-4 | pass |
| `api.test.ts` | fetchPane decodes 404 unknown_session vs 404 no_snapshot distinctly | REQ-4, edge case 13 | pass |
| `api.test.ts` | fetchPane preserves an empty-string pane text verbatim (not 'missing') | REQ-4 boundary | pass |
| `api.test.ts` | fetchPane rejects a success body missing capturedAt | malformed | pass |
| `render/dead.test.ts` (new) | loadPane maps a successful fetch to `{status:"ok", text, capturedAt}` | REQ-13 | pass |
| `render/dead.test.ts` (new) | loadPane maps a 404 no_snapshot error to `{status:"missing"}` | REQ-13, edge case 13 | pass |
| `render/dead.test.ts` (new) | loadPane maps any other error to 'missing' too (never distinguishes causes) | REQ-13 | pass |
| `render/dead.test.ts` (new) | loadPane preserves an empty-string snapshot as 'ok', not 'missing' | boundary | pass |
| `render/dead.test.ts` (new) | loadPane calls fetchPane with the given id | wiring | pass |

## Implementation Bugs

None found. Verdict: **pass**.

## Scope Notes (what was and wasn't unit-tested, and why)

- **`web/src/render/mainhead.ts`, `render/dead.ts`'s `renderDeadSurface`/
  `collectDeadSurfaceRefs`/`buildDeadSurfaceFromTemplate`, `render/confirm.ts`,
  `render/sessions.ts`'s `buildActionButton`/action-row wiring, and `render/tiles.ts`'s
  `renderTileFooterActions`/`mountTileDeadSurface`** were read but not given new Vitest
  coverage. These construct or query real DOM (`document.createElement`,
  `querySelector`, `<template>` cloning, `addEventListener`) and this project's
  `vitest.config.ts` has no jsdom environment configured — confirmed by grepping every
  existing `render/*.test.ts` file, which either use a plain `{ textContent, hidden }`
  object stub (`render/sessions.test.ts`, `render/context.test.ts`) or, where a function
  unconditionally calls `document.createElement`, a hand-rolled `FakeDomNode` shim
  (`render/masthead.test.ts`) with an explicit comment citing `docs/conventions.md`:
  "rendering is Playwright's job." Extending that shim to cover this plan's five new DOM
  render functions would be exactly the "DOM-simulation test suite" my brief tells me not
  to build; `web/e2e/actions.spec.ts` (authored by e2e-specs, 12 tests: E5–E14) already
  exercises all of this DOM/interaction behavior end-to-end against a real daemon and
  browser. `loadPane` (`render/dead.ts`) was the one exception — it touches no DOM at all
  (a bare `fetchPane` result mapper), so it got a real Vitest file (`render/dead.test.ts`).
- **`internal/claudecode` REQ-16 (D5 regression guard)** and the daemon-side REQ-1
  through REQ-8/17 logic (`Reconcile`, `End`/`Remove`/`Resume`, `KindResumeBind`,
  shutdown policy) are Go and out of this agent's scope (daemon-tests' D8–D21).
- **`aliveOnly`'s network-level guarantee (W8: "the dashboard never opens
  `/ws/terminal/{id}` for a session with `alive:false`")** — the pure filtering logic is
  unit-tested here (`sessions/live.test.ts`); the network-level assertion itself is
  `actions.spec.ts`'s INV-5 Playwright test, per the plan's own W8 wording ("a
  network-level Playwright assertion is E2E's").

## Test Run Output

```
$ npx tsc --noEmit
(clean — exit 0)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  16 passed (16)
      Tests  387 passed (387)
   Start at  21:40:52
   Duration  909ms

$ npm run build
> tsc --noEmit && vite build
vite v8.2.1 building client environment for production...
✓ 28 modules transformed.
dist/index.html                   9.12 kB │ gzip:  2.08 kB
dist/assets/index-BODablU0.css   19.10 kB │ gzip:  4.17 kB
dist/assets/index-PXpgKfvQ.js   368.31 kB │ gzip: 94.98 kB │ map: 858.37 kB
✓ built in 225ms
```

## Fix Attempt 1

**Cycle**: 3 (`plans/m4-reconcile/review.md`, verdict `needs-changes`), fix wave 2.
**Issues addressed**: Minor 4 (`reconcileCards` has no unit test) and Minor 5 (REQ-19's
`· captured <age>` clause has no test).

No implementation code was touched. Line numbers in the review had drifted (Fix Attempt 3
changed `reconcileCards` to preserve focus across re-sorts, adding the
capture/reorder/restore block); both new test files were written against the current code
by symbol, re-read fresh from `web/src/render/sessions.ts` and
`web/src/render/dead.ts` before writing anything.

### Minor 4 — `reconcileCards` unit tests (`web/src/render/sessions.test.ts`)

`reconcileCards` is not "a leaf renderer" like everything else this project's Vitest
suite covers (docs/conventions.md defers DOM *construction* to Playwright) — it's the
one module whose own logic (id-matching, in-place update vs. rebuild, reorder-without-
rebuild, and — as of cycle-3 Fix Attempt 3 — focus capture/restore around the reorder)
*is* the thing under test, and that logic is inseparable from real `insertBefore`/
`querySelector`/`cloneNode`/`document.activeElement` calls; there's no pure sub-function
to extract (I did not attempt to extract one — that would be an implementation change).

This project already has exactly one precedent for this situation:
`render/masthead.test.ts`'s `FakeDomNode` class, introduced there because
`renderBucket` started calling `document.createElement` unconditionally and a bare
`{ textContent: "" }` stub could no longer exercise it. Vitest has no jsdom configured
(`web/vitest.config.ts` — confirmed by reading it directly), so this follows that same
convention rather than reaching for jsdom: a self-contained `FakeDomNode`/`FakeTextNode`
shim (real tree with `appendChild`/`insertBefore`/`querySelector`/`cloneNode`/`contains`/
`focus`/`setAttribute`), a hand-built fragment mirroring `index.html`'s
`#session-card-template` markup exactly (`article.card` → `.stripe`/`.card-in` →
`.r1`[`.name`/`.badge`/`.timer`]/`.r2`/`.r3`/`.activity`/`.note`/`.acts-row`), and
`vi.stubGlobal` for `document`/`HTMLElement`/`HTMLButtonElement`. This runs
`reconcileCards` for real, not a simulation of it — the same `buildSessionCardElement`/
`updateSessionCardElement`/`reconcileActsRow`/`buildActionButton` code paths a real
browser exercises, against a real (if minimal) DOM tree.

Nine new tests, covering exactly the two things the review asked to pin:

- **Ordering/matching decisions**: builds one card per session in given order (insert);
  reuses the same node identity for a surviving session across a re-render, only
  updating its content (no rebuild); reorders existing cards in place — proved via
  `toContain`/reference identity, not just resulting DOM order — when priority changes;
  removes only the departed session's card, leaving survivors' node identity untouched;
  drops a stray non-element child (the honest-empty-state's leftover text node) before
  reconciling.
- **Focus capture/restore across a reorder (cycle-3 Fix Attempt 3's new logic, and what
  the review flagged would "also cover Minor 1 once fixed")**: focus on a card's action
  button survives a reorder that moves its card (re-resolved by `data-action`+id, not by
  stale reference); focus on the card itself (not a button) survives a reorder; a reorder
  that doesn't actually move the focused element's position never touches
  `document.activeElement` at all; and focus elsewhere in the document (outside the
  container) is left alone by a reconcile — `reconcileCards` never claims focus it didn't
  have.

What is deliberately **left to Playwright**, per the brief's explicit permission not to
build a DOM-simulation suite for what E2E already covers: real click/keydown dispatch and
event bubbling (`buildActionButton`'s `stopPropagation`, the card's own keydown guard),
actual browser focus-blur timing on `insertBefore` (the very Chrome behavior Fix Attempt 3
cites — `web/e2e/actions.spec.ts`'s keyboard cases and the plan's own reorder spec already
measure this against a real browser), and anything about layout/paint. This test suite
pins the *contract* `reconcileCards` promises (which nodes survive, which get rebuilt,
which get removed, and which logical control gets refocused) — it does not re-prove that
a real `<button>` blurs on detach in Chrome, which is what the E2E coverage is for.

One incidental fix during self-correction: the shim's `FakeDomNode` needed
`setAttribute`/`getAttribute` (real `updateSessionCardContent` calls
`card.setAttribute("aria-label", ...)`) and `getAttributeNames` (Vitest's own
`toContain` failure-diff serializer probes for it on anything that looks element-shaped)
— both are shim bugs I found and fixed myself via the failing test output, not
implementation bugs; the implementation code was never touched.

### Minor 5 — REQ-19 `· captured <age>` clause tests (`web/src/render/dead.test.ts`)

Unlike `reconcileCards`, `renderDeadSurface` needed no DOM shim at all: it only ever
assigns `.textContent`/`.dataset`/`.disabled` on refs the caller already built — no
`querySelector`, no `cloneNode`. Extended the existing `dead.test.ts` (which so far only
covered `loadPane`) with a `renderDeadSurface` describe block using the same plain-stub
convention already used elsewhere in this codebase (`sessions.test.ts`'s `fakeElement`),
plus a local `makeSession` fixture matching `tiles.test.ts`'s existing pattern.

Eight new tests:

- The clause is appended (`· captured <age>`) after the base endbar text when the pane
  fetch succeeded — asserted against the exact composed string, not a substring, so both
  clauses (the ended age spliced in by `formatEndedAgo`, and the captured-age clause) are
  pinned together.
- The "never `now ago`" honesty rule (review Major 6) applies to the *captured* clause
  the same way it applies to the ended-age clause — a sub-60s capture reads "captured
  now", never "captured now ago".
- The now/`1m ago` boundary at exactly 60 elapsed seconds (59s stays "now", 60s crosses
  to "1m ago"), and an hour bucket once elapsed exceeds an hour — the same boundary
  discipline `sessions/format.test.ts` already applies to `formatEndedAge` itself, applied
  here to where the clause actually gets spliced into the endbar string.
- The clause is *absent* on both non-`"ok"` pane states (`missing`, `loading`) — asserted
  against the exact full endbar string rather than `not.toContain("captured")`, because
  the base copy's own fixed wording ("last captured screen, not a live client") contains
  the substring "captured" regardless of pane state; a naive substring check would have
  passed for the wrong reason. Caught this via the first failing run (see below) before
  it became a false-positive test.
- The clause still appends correctly when `session.endedAt` is null (the defensive
  branch documented in `dead.ts`'s own comment) — the leading age clause disappears but
  the captured clause is unaffected.
- The captured age can differ from (and, in the test, is numerically later than) the
  ended age — proving the two clauses are independently derived from `pane.capturedAt`
  vs. `session.endedAt`, not from a shared "now minus one delta" shortcut, per
  design-system §6.8's note that the two aren't on the same clock.

One test-authoring bug I caught myself on the first run: `renderDeadSurface`'s endbar age
clause is built from `formatEndedAgo` (which appends " ago"), not the bare
`formatEndedAge` I'd misread from a comment — my first draft's expected strings were
missing " ago" on the base clause. Fixed by re-reading `dead.ts:68` directly and
correcting the expected strings; confirmed via the failing-test diff before and the
passing run after (both pasted below).

### Self-correction evidence

First run (before fixes) — `web/src/render/dead.test.ts` failures, showing the " ago"
test-bug and the substring-assertion test-bug both self-diagnosed from the actual diff:

```
AssertionError: expected 'ended 5m ago · last state idle · last…' to be 'ended 5m · last state idle · last cap…'
Expected: "ended 5m · last state idle · last captured screen, not a live client · captured 6m ago"
Received: "ended 5m ago · last state idle · last captured screen, not a live client · captured 6m ago"

AssertionError: expected 'ended 10m ago · last state idle · las…' not to contain 'captured'
Expected: "captured"
Received: "ended 10m ago · last state idle · last captured screen, not a live client"
```

Both are test bugs (wrong expected string; substring assertion collided with the base
copy's own wording) — confirmed by reading `dead.ts:68` (`formatEndedAgo`, not
`formatEndedAge`) and `dead.ts:71-72` (the base endbar copy literally contains the word
"captured"). Fixed in the test file only; `dead.ts` was never touched.

`web/src/render/sessions.test.ts` failures (before the shim fixes), also self-diagnosed
as shim gaps rather than implementation defects — `card.setAttribute` and
`element.getAttributeNames` are real `HTMLElement` methods the implementation
legitimately calls/Vitest's matcher legitimately probes for; the shim was incomplete,
not the implementation:

```
TypeError: card.setAttribute is not a function
 ❯ updateSessionCardContent src/render/sessions.ts:114:8
    114|   card.setAttribute("aria-label", vm.title);

TypeError: node.remove is not a function
 ❯ reconcileCards src/render/sessions.ts:251:46
    251|     if (!(node instanceof HTMLElement)) node.remove();

TypeError: element.getAttributeNames is not a function
 ❯ src/render/sessions.test.ts:403:25 (inside `toContain`'s failure-diff serializer)
```

### Verification (Fix Attempt 1)

```
$ npx tsc --noEmit
(clean — exit 0)

$ make web-test   (cd web && npm test)
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  16 passed (16)
      Tests  404 passed (404)
   Duration  876ms

$ make web-build   (cd web && npm run build)
> tsc --noEmit && vite build
vite v8.2.1 building client environment for production...
✓ 28 modules transformed.
dist/index.html                   9.22 kB │ gzip:  2.11 kB
dist/assets/index-KMqHG7j-.css   19.36 kB │ gzip:  4.25 kB
dist/assets/index-BpQXRCXO.js   370.18 kB │ gzip: 95.58 kB │ map: 874.71 kB
✓ built in 203ms
```

17 new tests (9 in `sessions.test.ts`, 8 in `dead.test.ts`), 404/404 passing overall (was
387/387 before this cycle). No implementation file was modified — only
`web/src/render/sessions.test.ts` and `web/src/render/dead.test.ts`.

**Updated Verdict: pass**

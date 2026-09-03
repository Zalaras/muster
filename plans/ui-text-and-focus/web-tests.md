# Web Tests: ui-text-and-focus

**Plan**: ui-text-and-focus
**Verdict**: pass

## Summary

Tests created: 16 new | Fixture repairs: 12 files | Passing: 743 | Failing: 0

`make web-build` (`tsc --noEmit` + `vite build`) and `make web-test` (`vitest run`) both
exit 0.

## Sanctioned Breakage Repaired (per web-implementation.md's Handoff)

Nine files' hand-built `Session` fixtures were missing the new required `titleOverride`
field (`tsc` errors) — added `titleOverride: null,` (or a same-shape value) beside each
fixture's existing `title` field, no other change:

| File | Fix |
|------|-----|
| `src/api.test.ts` | `titleOverride: null` added to `validSession` |
| `src/render/dead.test.ts` | added to `makeSession`'s literal |
| `src/render/sessions.test.ts` | added to `makeSession`'s literal |
| `src/render/tiles.test.ts` | added to `makeSession`'s literal |
| `src/sessions/card.test.ts` | added to `makeSession`'s literal |
| `src/sessions/live.test.ts` | added to `makeSession`'s literal |
| `src/sessions/sort.test.ts` | added to `makeSession`'s literal |
| `src/sessions/store.test.ts` | added to `makeSession`'s literal |
| `src/ws.test.ts` | added to the module-level `session` fixture |

Three runtime-only breakages (not caught by `tsc`, since they use raw JSON or hand-built
DOM fakes rather than a typed `Session` literal):

- **`src/protocol.test.ts`** (21 fixture-driven failures → 0): `validSession` and
  `freshLaunchSession` both gained `titleOverride: null` (`parseSession` rejects a
  missing key, same strictness as `pinned`/`railPos`). Also added a new describe block
  (see W7 below) — the plan's own Affected Files note only asked for the fixture repair,
  the new coverage is this agent's W7 obligation, added to the same file since it's the
  file that already owns every other required-field acceptance/rejection pair
  (`pinned`/`railPos`) this one is modelled on.
- **`src/render/tiles.test.ts`**: `fakeElement()`/`fakeTileRoot()` had no `dataset` and no
  nested `querySelector`, but `updateTileChrome` now reads `nameEl.dataset["editing"]`
  and calls `nameEl.querySelector("button.rename")` (REQ-13's `.nm` now wraps a button,
  not bare text). Added `dataset: {}` to `fakeElement()`, and a new `fakeNameEl()` used
  for `.nm` in `fakeTileRoot()` — its `querySelector("button.rename")` resolves to a fake
  button, and its own `textContent` getter proxies to that button's `textContent`
  (mirroring real `HTMLElement.textContent`'s descendant-aggregation behaviour), so every
  pre-existing `root.querySelector(".nm")?.textContent` assertion kept working unchanged.
- **`src/render/sessions.test.ts`**: `FakeDomNode` had `setAttribute`/`getAttribute` but
  no `removeAttribute`/`hasAttribute`, needed for `updateSessionCardContent`'s
  `aria-current` removal (REQ-1 removes the attribute rather than setting `"false"`).
  Added both methods (delete from / check the same `attrs` record `setAttribute` already
  uses).

All nine fixture fixes and the three shim/runtime fixes were verified together: `npx
tsc --noEmit` exits 0 with zero errors, and `npx vitest run` went from 52 failing / 671
passing (pre-fix) to 0 failing / 727 passing (post-fix, before this agent's own new
tests) to 0 failing / 743 passing (after).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/sessions/rename.test.ts` | noop: the trimmed input equals the current display title | REQ-14 branch 1 | pass |
| `src/sessions/rename.test.ts` | noop: trims whitespace before comparing, still equal | REQ-14 trim + branch 1 | pass |
| `src/sessions/rename.test.ts` | clear: empty input while an override is currently set | REQ-14 branch 2 | pass |
| `src/sessions/rename.test.ts` | clear: whitespace-only input (trims to empty) while an override is set | REQ-14 + edge case 9 | pass |
| `src/sessions/rename.test.ts` | noop: empty input when no override exists | REQ-14 branch 3 | pass |
| `src/sessions/rename.test.ts` | noop: whitespace-only input, no override, null display title | REQ-14 branch 3 + trim | pass |
| `src/sessions/rename.test.ts` | set: any other input sends the trimmed string | REQ-14 branch 4 | pass |
| `src/sessions/rename.test.ts` | set: a first title on a session with no display title yet | REQ-14 branch 4 (null title) | pass |
| `src/sessions/rename.test.ts` | set: overwriting one override with a different string | REQ-14 branch 4 (override present) | pass |
| `src/render/sessions.test.ts` | with three sessions, only the currentId card has aria-current="true"; the others carry no such attribute | REQ-1/INV-3, W6 | pass |
| `src/render/sessions.test.ts` | with currentId: null, no card carries aria-current | REQ-1/INV-3, W6 | pass |
| `src/render/sessions.test.ts` | moves the marker to the new currentId on a later reconcile, removing it from the previous card | REQ-3/INV-3, W6 | pass |
| `src/render/sessions.test.ts` | keeps exactly one current card after a reorder moves the current session's card into a slot a bystander previously occupied | INV-3 with bystanders (edge case 13), W6 | pass |
| `src/protocol.test.ts` | parses titleOverride: null (no override set) | REQ-11/W7 | pass |
| `src/protocol.test.ts` | parses a titleOverride string (the user's rename) | REQ-11/W7 | pass |
| `src/protocol.test.ts` | rejects a session missing titleOverride entirely | REQ-11/W7 | pass |
| `src/protocol.test.ts` | rejects a non-string, non-null titleOverride (e.g. numeric) | REQ-11/W7 | pass |
| `src/render/tiles.test.ts` | leaves the rename button's text untouched while an edit is open, even though a new sessionUpsert carries a different title | REQ-15/INV-4, W12 | pass |
| `src/render/tiles.test.ts` | writes the title once the edit closes (dataset.editing cleared) | REQ-15/INV-4, W12 | pass |
| `src/render/tiles.test.ts` | writes the title normally when dataset.editing is absent | REQ-15/INV-4, W12 (regression guard) | pass |

## Declined Coverage

None. W5, W6, W7, W12 (this agent's assigned criteria) are each covered by dedicated new
tests above, not declined to another suite.

## Not This Agent's Job (per docs/conventions.md's Vitest/Playwright split)

- **REQ-2** (`.card.current` visual: `--bg-hover` ground, `--edge` ring, `.acts-row`
  reveal) and **W9** (1280px masthead layout) are rendering/CSS — `web/e2e/focus-marker.spec.ts`
  (e2e-specs) and Reviewer-Verified, not Vitest.
- **REQ-13's DOM shape** (button↔input swap, focus/select, the `.thead` `draggable` flip)
  is interaction — `web/e2e/rename.spec.ts` (E4, E11–E13) per test-specs.md.
- **W3/W4/W8/W10/W11** (contrast, font-size grep, xterm literal, mockup↔CSS token
  equality, design-system prose) are automated-check/Reviewer-Verified items outside
  Vitest's scope per the plan's own Automated Checks table.

## Test Run Output

```
$ npx tsc --noEmit
(no output, exit 0)

$ npx vitest run
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  25 passed (25)
      Tests  743 passed (743)
   Start at  15:50:59
   Duration  1.43s (transform 2.03s, setup 0ms, import 3.06s, tests 863ms, environment 4ms)

$ (from project root) make web-build
cd web && npm run build
> tsc --noEmit && vite build
✓ built in 193ms

$ make web-test
cd web && npm test
> vitest run
 Test Files  25 passed (25)
      Tests  743 passed (743)
```

## Re-run 1 (e2e-validate fix cycle, pre-review)

**Verdict**: pass

**Context**: `renderMainhead`'s no-session branch ran `elements.nameEl.textContent = ""`,
which on the real DOM detaches the `button.rename` child `#mainhead h2.name` must always
carry (Testable UI Elements, REQ-13(a)) — since the dashboard always runs one
zero-session `render()` pass before the first `sessionUpsert`, this fired on every page
load. e2e-validate caught it (`rename.spec.ts` E4–E9, E11/E12, the mid-edit status-line
test, and the dead-session rename test failing); web-impl fixed it in commit `eea314f`
(removed the `nameEl.textContent = ""` line; only `metaEl.textContent = ""` is cleared in
that branch now — see `web-implementation.md`'s `## Fix Attempt 1`).

**New coverage**: `src/render/mainhead.test.ts` (new file — no mainhead unit test
existed before this cycle). No jsdom in this Vitest environment, so I followed
`render/tiles.test.ts`'s `fakeNameEl` convention (a plain object whose `.textContent`
getter proxies to a child it holds) and extended it one step: this file's `fakeNameEl`
treats *any* write to `.textContent` as detaching its `renameBtn` child, mirroring real
`Node.textContent` write semantics — the exact behaviour the fix must no longer trigger.
This is state-derivation-from-DOM-writes (which node survives a render pass), the same
category as `sessions.test.ts`'s `aria-current` attribute-presence checks, not rendering
layout or interaction, so it belongs in Vitest per `docs/conventions.md`'s split rather
than being left to `rename.spec.ts` alone.

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/render/mainhead.test.ts` | leaves button.rename attached to nameEl after a render with no focused session | Fix Attempt 1 regression pin | pass |
| `src/render/mainhead.test.ts` | survives repeated zero-session render passes (the dashboard's actual startup shape) | Fix Attempt 1 regression pin | pass |
| `src/render/mainhead.test.ts` | writes the session title into that same button once a session arrives after a no-session pass | Fix Attempt 1 regression pin + REQ-13(a) | pass |

**Declined coverage**: none new — this cycle only adds the one file above; the rest of
the suite (`## Tests` above) is unchanged and still covers everything it did in the
initial run.

**Gate**:

```
$ npx tsc --noEmit
(no output, exit 0)

$ npx vitest run
 Test Files  26 passed (26)
      Tests  746 passed (746)

$ make web-build
cd web && npm run build
> tsc --noEmit && vite build
✓ built in 227ms

$ make web-test
cd web && npm test
> vitest run
 Test Files  26 passed (26)
      Tests  746 passed (746)
```

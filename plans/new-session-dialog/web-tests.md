# Web Tests: New Session Dialog

**Plan**: new-session-dialog
**Verdict**: pass

## Summary

Tests created: 22 (9 in `crumbs.test.ts` + 13 added to `api.test.ts` in the Fix Attempt 3
re-verification below) | Passing: 22 | Failing: 0

## Scope

The only new/changed pure logic module in this plan is `web/src/render/crumbs.ts`'s
`splitCrumbs` — the plan's own Implementation Notes and web-implementation.md call this
out explicitly as "the pure half... what web-tests unit-tests" (W2's acceptance criterion
names the exact cases: root, single component, nested, trailing slash tolerated,
space-bearing component). Everything else touched by this plan (`launch.ts`, `main.ts`,
`index.html`, `style.css`, and `renderCrumbs` itself) is DOM construction/wiring —
rendering and interaction, which is Playwright's job per `docs/conventions.md` and this
repo's established pattern (`context.test.ts`, `dead.test.ts`, `masthead.test.ts` all
carry a note that no jsdom is configured and DOM construction is out of scope for
Vitest). No protocol-decoding or state-derivation module was added or modified by this
plan (`api.ts` is untouched), so there was nothing else in scope for this suite.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `crumbs.test.ts` | splits the filesystem root into a single crumb | `"/"` → `[{name:"/",path:"/"}]` | pass |
| `crumbs.test.ts` | splits a single path component | `"/a"` → root + one crumb | pass |
| `crumbs.test.ts` | splits a nested path into its full ancestor chain, root first | `"/a/b/c"` → 4-crumb chain | pass |
| `crumbs.test.ts` | tolerates a trailing slash (edge case 6 / W2) | `"/a/b/"` === `"/a/b"` | pass |
| `crumbs.test.ts` | tolerates a trailing slash on a single-component path | `"/a/"` === `"/a"` | pass |
| `crumbs.test.ts` | does not collapse the root's own trailing slash into an empty chain | `"/"` still yields one crumb, not zero | pass |
| `crumbs.test.ts` | passes a path component with spaces through as a text node untouched | multi-word directory names preserved verbatim | pass |
| `crumbs.test.ts` | passes a unicode path component through untouched | `café`, `日本語` preserved verbatim | pass |
| `crumbs.test.ts` | splits only on '/', never re-parsing or escaping a component | a literal backslash in a name is not re-escaped | pass |

## Implementation Bugs

None found.

## Re-verification after Fix Attempt 1

Fix Attempt 1 (web-implementation.md) added `reposErrorPersistent` plus a
`showError`/`showReposError` split inside `initLaunchModal`'s closure in
`web/src/render/launch.ts`, so a repos-fetch error (REQ-13) survives the open sequence's
own browse-root fallback navigation. Re-read the fixed file
(`grep -n "reposErrorPersistent\|showError\|showReposError\|clearError" src/render/launch.ts`)
before touching tests: the new flag and both `showError`/`showReposError`/`clearError`
functions are private to `initLaunchModal`'s closure, never exported, and act only by
writing to `elements.launchError` (a live DOM node) — there is no new pure/exported
function to unit-test. This is DOM wiring, which is Playwright's job per
`docs/conventions.md`; the plan's own implementation log confirms the E2E suite already
covers it directly (REQ-13 test + the E12 edge-case-2 regression test, both in
`e2e/launch.spec.ts`, 20/20 passing). `crumbs.ts`/`splitCrumbs` (this suite's only prior
target) is untouched by the fix. Conclusion: no new unit-testable logic was introduced;
existing 9 tests re-verified against the fixed tree, no changes needed.

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  20 passed (20)
      Tests  558 passed (558)
   Start at  23:17:16
   Duration  1.10s

$ npm run build
> tsc --noEmit && vite build
vite v8.2.1 building client environment for production...
✓ 33 modules transformed.
dist/index.html                  10.05 kB │ gzip:  2.31 kB
dist/assets/index-BLZ7bhAp.css   22.56 kB │ gzip:  4.80 kB
dist/assets/index-DAAmu9vM.js   380.70 kB │ gzip: 98.45 kB │ map: 950.94 kB
✓ built in 183ms
```

(558 = the 549 pre-existing tests, unchanged, plus 9 in `crumbs.test.ts`, all still
passing unchanged against the Fix Attempt 1 tree.)

## Re-verification after Fix Attempt 2

Fix Attempt 2 (web-implementation.md) touched three files:

- `web/src/style.css` — added `min-height: 0` to `.browse` and `.recents`. CSS only, no
  logic.
- `web/src/render/launch.ts` — `navigateUp()` now returns `Promise<boolean>` instead of
  `void`; added `focusFirstEntry()`; the listing's `ArrowRight`/`ArrowLeft` keydown
  handlers now chain `.then(() => focusFirstEntry())` onto the navigation they trigger.
  Re-read the fixed file (`grep -n "navigateUp\|focusFirstEntry\|ArrowRight\|ArrowLeft"
  src/render/launch.ts`, then read lines 250-305): `navigateUp()` reads
  `elements.crumbsNav.querySelectorAll(...)` (a live DOM query) and delegates to
  `navigate()`, itself a closure over `current`/`elements`/`browseRequestId`;
  `focusFirstEntry()` is `elements.browseDirs.querySelector(...)?.focus()` — pure DOM
  focus manipulation, no return value, nothing to assert against without a real DOM.
  Neither function is exported; both are private to `initLaunchModal`'s closure. Same
  category as Fix Attempt 1's `showError`/`showReposError`: DOM wiring, Playwright's job
  per `docs/conventions.md`, already covered by the plan's own REQ-15 traversal E2E
  coverage (web-implementation.md's Fix Attempt 2 verification section: a real-daemon ad
  hoc script observed `document.activeElement` landing on the correct button after
  ArrowRight and ArrowLeft, across more than one round-trip).
- `web/src/render/crumbs.ts` — `renderCrumbs()` gained a trailing
  `nav.scrollLeft = nav.scrollWidth;`. This sits in `renderCrumbs`, the DOM half of the
  module (it takes and mutates a live `HTMLElement`); `splitCrumbs`, the pure half this
  suite tests, is byte-for-byte unchanged (confirmed by reading the current file in
  full — reproduced above under `## Tests`' target module).

No new pure/exported logic was introduced by Fix Attempt 2. `splitCrumbs` remains the
only unit-testable surface this plan touches; the existing 9 tests need no changes.
Re-ran all three gates against the fixed tree:

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  20 passed (20)
      Tests  558 passed (558)
   Start at  00:00:16
   Duration  1.04s

$ npm run build
> tsc --noEmit && vite build
vite v8.2.1 building client environment for production...
✓ 33 modules transformed.
dist/index.html                  10.05 kB │ gzip:  2.31 kB
dist/assets/index-CZRVLi2C.css   22.59 kB │ gzip:  4.80 kB
dist/assets/index-Dfke-a0f.js   380.86 kB │ gzip: 98.51 kB │ map: 952.29 kB
✓ built in 187ms
```

Verdict unchanged: **pass**.

## Re-verification after Fix Attempt 3

Fix Attempt 3 (web-implementation.md) touched two files:

- `web/src/api.ts` — added `safeFetch(input, init)`, a `try`/`catch` choke point wrapping
  `fetch` (returns `Response | null`, `null` on a rejected promise) plus a module-level
  `networkError: ApiErrorBody` (`code: "network_error"`). Every one of the module's 11
  exported functions (`launchSession`, `fetchRepos`, `browse`, `putPrefs`, `refreshUsage`,
  `endSession`, `resumeSession`, `removeSession`, `fetchPane`, `pinSession`,
  `putSessionOrder`) now calls `safeFetch` instead of `fetch` directly and short-circuits
  to `{ ok: false, error: networkError }` immediately after, before any status/body
  handling.
- `web/src/render/launch.ts` — `navigateUp()` now returns `Promise<boolean | null>`
  (`null` when `elements.crumbsNav` has no `button[data-path]` — nothing to ascend to);
  the `ArrowLeft` keydown handler only calls `focusFirstEntry()` when the result isn't
  `null`.

**Scope decision — `safeFetch`/network-error IS unit-testable, unlike the rest of this
plan's fixes.** Re-read both files fresh (line numbers in earlier reports are stale per
this task's instructions) rather than trusting old line refs:

- `safeFetch` and the exported functions in `api.ts` are pure with respect to Vitest's
  no-jsdom environment — they call the *global* `fetch` (already the module's existing
  seam, stubbed via `vi.stubGlobal("fetch", fetchMock)` throughout the pre-existing
  `api.test.ts`) and return a plain `ApiResult<T>` object. No DOM node is read or
  constructed anywhere in this module. This is exactly the "protocol decoding" category
  this agent's brief calls out (parses/guards the daemon's HTTP responses before a caller
  sees them) — and the measured absence here is a *rejected fetch promise*, which none of
  the existing `fakeResponse`/`fakeStatusResponse` helpers can simulate (both wrap an
  already-*resolved* Response). So this needed new tests, not just re-verification of old
  ones.
- `navigateUp`'s `null` case in `launch.ts`, by contrast, is not: `navigateUp` is a
  private closure inside `initLaunchModal`, queries `elements.crumbsNav` (a live DOM
  node) directly, and delegates to `navigate()`, itself a closure that calls
  `renderListingLoading()`/`renderAll()` (DOM mutation). Confirmed by reading
  `web/src/render/launch.ts` lines 274–293 (current tree) — nothing pure or exported was
  added here; same category as the two prior fix attempts' `showError`/`focusFirstEntry`
  changes, DOM wiring that's Playwright's job per `docs/conventions.md`. The plan's own
  fix-attempt log confirms `e2e/launch.spec.ts` already exercises the REQ-15 traversal
  path end to end (26/26 passing per web-implementation.md), including the no-op-ascend
  case this specific change addresses. No new test added for this half of the fix.

**Tests added** — a new `describe` block in `web/src/api.test.ts`, table-driven over all
11 exported functions plus one documentation test, using a `fetchMock.mockRejectedValue(new
TypeError("Failed to fetch"))` stub (the existing file's established `vi.stubGlobal`
pattern, just rejecting instead of resolving):

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `api.test.ts` | `launchSession: a rejected fetch resolves to { ok: false, error: network_error } instead of throwing` | REQ-13 network mode | pass |
| `api.test.ts` | `fetchRepos: ...` | REQ-13 network mode | pass |
| `api.test.ts` | `browse (no path): ...` | REQ-13 network mode | pass |
| `api.test.ts` | `browse (with path): ...` | REQ-13 network mode | pass |
| `api.test.ts` | `putPrefs: ...` | REQ-13 network mode | pass |
| `api.test.ts` | `refreshUsage: ...` | REQ-13 network mode | pass |
| `api.test.ts` | `endSession: ...` | REQ-13 network mode | pass |
| `api.test.ts` | `resumeSession: ...` | REQ-13 network mode | pass |
| `api.test.ts` | `removeSession: ...` | REQ-13 network mode | pass |
| `api.test.ts` | `fetchPane: ...` | REQ-13 network mode | pass |
| `api.test.ts` | `pinSession: ...` | REQ-13 network mode (not this plan's own surface, but swept since it shares the module) | pass |
| `api.test.ts` | `putSessionOrder: ...` | REQ-13 network mode (ditto) | pass |
| `api.test.ts` | `does not call Response.json at all when fetch itself rejects (nothing to decode)` | confirms the short-circuit happens before any decode attempt | pass |

Each case asserts the resolved `ApiResult` equals `{ ok: false, error: { code:
"network_error", message: "Could not reach musterd." } }` and that `fetchMock` was
called exactly once (i.e. `safeFetch` actually attempted the call and caught the
rejection, rather than e.g. never calling `fetch` at all). `pinSession`/`putSessionOrder`
belong to the order-sidebar plan's own surface, not this plan's, but Fix Attempt 3's
implementation log explicitly swept the whole module ("Category swept, not just the
cited functions") rather than only the three functions the review finding named, so
covering all 11 exported functions here matches the actual fix's blast radius instead of
under-covering it.

No implementation bugs found: every one of the 11 functions returns the expected
`network_error` shape on a rejected fetch, matching `web-implementation.md`'s own grep
audit (`grep -c "await fetch(" web/src/api.ts` excluding the one inside `safeFetch`
itself returns 0).

Re-ran all three gates against the fixed tree:

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  20 passed (20)
      Tests  571 passed (571)
   Start at  00:24:00
   Duration  1.13s (transform 1.79s, setup 0ms, import 2.66s, tests 477ms, environment 3ms)

$ npm run build
> tsc --noEmit && vite build
vite v8.2.1 building client environment for production...
✓ 33 modules transformed.
dist/index.html                  10.05 kB │ gzip:  2.31 kB
dist/assets/index-CZRVLi2C.css   22.59 kB │ gzip:  4.80 kB
dist/assets/index-BdfCTTZN.js   381.27 kB │ gzip: 98.57 kB │ map: 954.99 kB
✓ built in 192ms
```

(571 = the pre-existing 558 (549 baseline + 9 `crumbs.test.ts`), unchanged, plus 13 new
network-error tests in `api.test.ts`.)

Verdict: **pass**.

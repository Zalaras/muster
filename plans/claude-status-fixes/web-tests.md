# Web Tests: claude-status-fixes

**Plan**: claude-status-fixes
**Verdict**: pass

## Summary

Tests created: 0 | Passing: 746 (pre-existing suite, unchanged) | Failing: 0

## Coverage decision

The plan's own Affected Files section states: "Web unit tests: none. REQ-6/REQ-7 are two
guarded event listeners with no pure logic to extract; they are E2E-only, carried by E5 and
E6." I verified this against the actual diff rather than taking it on faith.

`web/src/main.ts` (commit `d0722ee`) changed exactly four listeners at what is now
`web/src/main.ts:894-909`:

```ts
viewFocusBtn.addEventListener("mousedown", (e) => {
  if (e.button === 0 && view !== "focus") cancelOpenRenames();
});
viewTilesBtn.addEventListener("mousedown", (e) => {
  if (e.button === 0 && view !== "tiles") cancelOpenRenames();
});
viewFocusBtn.addEventListener("click", () => {
  if (view !== "focus") requestView("focus");
});
viewTilesBtn.addEventListener("click", () => {
  if (view !== "tiles") requestView("tiles");
});
```

The guard (`e.button === 0 && view !== "focus"`) is a one-line boolean check inlined directly
in the DOM event handler, closing over the module-level `view` variable and calling
`cancelOpenRenames()` / `requestView()`, both of which mutate DOM state (close the rename
input, `PUT /api/prefs`). There is no separate pure predicate function to import and unit-test
— extracting one just to satisfy a coverage metric would be exactly the DOM-simulation
anti-pattern `docs/conventions.md` rules out for this suite ("interaction and rendering are
Playwright's job"). This is not implementation logic tangled into DOM code that should have
been factored out (contrast e.g. `titleCommand` in `web/src/sessions/rename.ts`, which *is*
extracted and unit-tested in `web/src/sessions/rename.test.ts`) — it is an inherently
DOM-shaped guard with nothing left over once you remove the DOM.

REQ-6/REQ-7 are covered end-to-end: `plans/claude-status-fixes/web-implementation.md` reports
`rename.spec.ts` at 15/15 passing, including the two new tests for this plan — E5 ("clicking
the pressed view segment... commits instead of cancelling") and E6 ("a right-click on the
inactive Tiles segment... does not cancel it"). No existing `*.test.ts` file claims this case
either (`web/src/sessions/rename.test.ts` covers only `titleCommand`'s commit semantics, not
the view-segment click guard), so there is nothing to double-cover and nothing left uncovered.

Conclusion: no test module was written. This is the plan's own scoping, confirmed correct
against the diff, not an oversight.

## Verification

Ran the full existing suite against the current tree (`web-impl`'s commit `d0722ee` present,
`daemon-impl` untouched by this check) to confirm no regression and that the automated check
**W2** still passes:

```
$ make web-test
cd web && npm test

> muster-web@0.0.0 test
> vitest run

 Test Files  26 passed (26)
      Tests  746 passed (746)
   Start at  23:22:29
   Duration  1.46s
```

Also ran `npx tsc --noEmit` (exit 0) and `npm run build` (exit 0, `vite build` succeeded)
from `web/` as my own gate — both clean.

## Tests

None added — see Coverage decision above.

## Implementation Bugs

None found. No verdict-changing defect.

## Test Run Output

```
 Test Files  26 passed (26)
      Tests  746 passed (746)
   Start at  23:22:29
   Duration  1.46s (transform 2.15s, setup 0ms, import 3.28s, tests 603ms, environment 6ms)
```

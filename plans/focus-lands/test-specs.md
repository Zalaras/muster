# E2E Test Specs: focus-lands

**Plan**: focus-lands
**Mode**: authoring (red-first); validate (attempt 1, pins for behaviours with no test)
**Pack**: kb: pack 24618 words (budget 30000)
**Verdict**: pass
**Tests created**: 7 (rail-cards 1, plain-shell 3, update 1, gauges 2); the 4 Proof tests were red at authoring and are green now, the 3 added in validate are pins
**Live run**: 847/847 passing (`make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/rail-cards.spec.ts | a status line that changes a card's context percent updates its context row in place, so the row's track is the same element (REQ-1, E1) | REQ-1 | 40% then 41% enveloped status lines; fill width follows to 41%; a JS-property tag on `.r3 .ctx` survives the render | ran-red-at-authoring: `expect(kept).toBe(true)`, Expected true, Received false (rail-cards.spec.ts:820) |
| web/e2e/plain-shell.spec.ts | switching the Focus header to shell, docs and back to claude moves keyboard focus into each surface (REQ-2, E2) | REQ-2 | After a click then an Enter on each of shell, docs, claude, `document.activeElement` is inside the shell terminal, is `article.md`, is inside the Claude terminal | ran-red-at-authoring: first poll `focusInShell` times out, Expected true, Received false (plain-shell.spec.ts:834) |
| web/e2e/plain-shell.spec.ts | switching a tile's footer to shell moves keyboard focus into that tile's shell terminal (REQ-2, E3) | REQ-2 | Tiles footer `shell` click puts focus inside that tile's `Shell:` terminal | ran-red-at-authoring: poll times out, Expected true, Received false (plain-shell.spec.ts:888) |
| web/e2e/update.spec.ts | pressing Check now by keyboard keeps focus on it through the check and after it settles (REQ-3, E4) | REQ-3 | Focus the button, Enter, held check: button is `aria-busy` and still focused, still focused after a >1 s tick, still focused after the status line settles | ran-red-at-authoring: `expect(await focusOnCheck()).toBe(true)`, Expected true, Received false (update.spec.ts:1079) |

## Deleted Tests

None.

## Fixture Changes

No changes needed. Existing builders only: `envelopedSessionStart`, `envelopedStatusLineFull` (the full post-first-response shape, as gauges.spec.ts uses it), `FakeReleaseServer.hold()/release()`. No tag is published in the update test, so the held check settles as a failure with a status line. Two imports added (`helpers/gauges`'s `cardContextRow`, `helpers/reader`'s `readerRegion`/`renderedBody`).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (rail card half) | rail-cards "…updates its context row in place…" |
| REQ-1 (tile header `.ctxinfo` half) | not covered by a Proof item; left to web-tests' `context.test.ts` and review |
| REQ-2 | plain-shell E2 (Focus header, pointer and keyboard, shell/docs/claude), plain-shell E3 (tile footer shell) |
| REQ-3 (focus part) | update "…keeps focus on it…" |
| REQ-3 (`aria-disabled`/`aria-busy`, `canCheck` false stays `disabled`) | existing update.spec.ts e-note-4 and E12 |

## E2E Implementation Bugs

None. Red-first, so the red runs are the diagnosis holding.

## Handoff

- The update test goes red earlier than the plan's Proof text says. The Proof says the element is `BODY` after settling; the test fails during the check, at the first focus assertion after Enter with the button `aria-busy`. Same mechanism (Chrome drops focus from a `disabled` button), measured sooner. After the fix all three focus assertions (in flight, after a tick, after settle) must hold.
- The plain-shell E2 test checks the Docs tab by pointer and keyboard too (the Proof names shell for the keyboard path); the shell is already running when the keyboard pass re-selects it.
- Decision: the `.focus()` calls that start a keyboard sequence are setup; the switch itself is always a real click or Enter.

## Test Run Output

```
make web-build build   (ok)
cd web && npx playwright test rail-cards.spec.ts plain-shell.spec.ts update.spec.ts -g 'in place|moves keyboard focus into|keeps focus on it'
  4 failed
    plain-shell.spec.ts:802 switching the Focus header to shell, docs and back to claude moves keyboard focus into each surface (REQ-2, E2)
    plain-shell.spec.ts:867 switching a tile's footer to shell moves keyboard focus into that tile's shell terminal (REQ-2, E3)
    rail-cards.spec.ts:774 a status line that changes a card's context percent updates its context row in place ... (REQ-1, E1)
    update.spec.ts:1050 pressing Check now by keyboard keeps focus on it through the check and after it settles (REQ-3, E4)
rail-cards: expect(kept).toBe(true)  Expected: true  Received: false   (rail-cards.spec.ts:820)
update:     expect(await focusOnCheck()).toBe(true)  Expected: true  Received: false   (update.spec.ts:1079)
plain-shell E2: expect.poll(focusInShell).toBe(true)  Timeout 15000ms  Received: false   (plain-shell.spec.ts:834)
plain-shell E3: expect.poll(tile shell contains activeElement).toBe(true)  Timeout 15000ms  Received: false   (plain-shell.spec.ts:888)
npx playwright test --list: Total: 844 tests in 56 files; biome check, tsc --noEmit, sh scripts/e2e-lint.sh clean.
```

## Notes

Formatting is biome (`web/biome.json`, line width 100), not prettier. No existing test was modified.


## Validate Attempt 1: pins for behaviours with no test

Four Proof tests ran green against the implementation (rail-cards, plain-shell x2, update; part of the 847-test `make e2e`). Added three pins, expected green on the current tree.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/gauges.spec.ts | a status line that changes a tile's context percent updates the header context info in place, so its track is the same element (REQ-1, tile half) | REQ-1 (tile `.ctxinfo`) | 40% then 41% status lines; `.ctx` and `.tok` carry a JS-property tag that survives; fill width, percent and tokens follow | ran-green: soak `140 passed (58.8s)` (N=10) |
| web/e2e/gauges.spec.ts | a compaction counter appearing on a later render keeps the row correct on the rail card and the tile header, and a /clear then a fresh status line shows none (REQ-1, edge 2) | REQ-1, edge case 2 | Measured `rawPreCompact` adds `⟳1` to both rows with percent, tokens, width intact and the track node kept through a later status line; `/clear` goes unknown (no track, no counter), a fresh status line rebuilds a known row with no counter | ran-green: same soak, 140 passed |
| web/e2e/plain-shell.spec.ts | a shell spawn that resolves after focus moved into the rename field leaves focus in that field (R1, edge 5) | R1, edge case 5 | `page.route` holds the shell POST; click `shell`, a real click on the title puts focus in the rename field, release; shell surface mounts, field is still the focused tagged node after a 1.5 s tick, focus is not in the shell | ran-green: soak `210 passed (1.8m)` (N=10) |

**Proven red by deliberate breakage** (restored afterwards, `git status` shows only spec files plus the orchestration state): `focusIsOnSwitchOrPage` forced true and `renderContextRow` forced to rebuild every pass, rebuilt, ran the three: `3 failed` (context tests `Expected: true  Received: false` on the kept-node check; R1 `expect(locator).toBeFocused() failed`). With both mutations the tree was rebuilt (`make web-build build`) before the run; the first attempt failed to compile on unused-symbol errors and its green result was discarded.

Edge case 2 note: the compaction counter can only disappear through `/clear`, which passes through an unknown render, so "removed on a later known render" is exercised as unknown then fresh known. No payload shape was invented: `rawPreCompact`, `envelopedStatusLineFull` and the `/clear` sequence are the existing helpers gauges E10 uses.

No assertion was deleted, skipped, or weakened. No existing test was modified; one import line was added to plain-shell.spec.ts (`mainheadRenameButton`, `mainheadRenameField` from `./helpers/session`).

Gates: `npx playwright test --list` Total 847, `tsc --noEmit`, `biome check`, `e2e-lint` clean; `make e2e`: `847 passed (7.7m)`.

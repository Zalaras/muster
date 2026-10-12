# E2E Test Specs: reader-expanded-persists

**Plan**: reader-expanded-persists
**Mode**: fix (attempt 3, review cycle 3; earlier: fix attempt 2, first written as authoring red-first)
**Pack**: kb: pack 8445 words (budget 30000)
**Verdict**: pass
**Tests created**: 6 (1 original + 3 in fix attempt 2 + 2 in fix attempt 3)
**Live run**: 6/6 passing (`-g reader-expanded-persists`); full `reader.spec.ts` 60 passed (25.0s)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/reader.spec.ts | expanded folders and folds survive selecting Claude and then Docs again (reader-expanded-persists REQ-1, REQ-2) | REQ-1, REQ-2 | Expand `docs/`, fold Outline, select Claude, select Docs: `adr/` is visible and the Outline header toggle has `aria-expanded="false"` | ran-red-at-authoring (below) |

## Deleted Tests

None

## Fixture Changes

No changes needed (`buildMarkdownFixtureTree`, `daemon` fixture, existing reader helpers).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (tab-switch half) | expanded folders and folds survive selecting Claude and then Docs again |
| REQ-2 (Outline fold, tab-switch half) | same |
| REQ-3, REQ-4 | not E2E (existing E7 test; memory.test.ts parse cases per plan) |

The session-switch half of REQ-1 is not covered by the Proof; the plan names only the Claude-then-Docs path.

## Handoff

None

## Test Run Output

```
$ make web-build build && cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'
  ✘  1 [chromium] › e2e/reader.spec.ts:2449:1 › expanded folders and folds survive selecting Claude and then Docs again (…) (17.4s)
    Error: expect(locator).toBeVisible() failed
    Locator: …getByRole('navigation', { name: 'Documents' }).locator('.tree').getByRole('button', { name: 'adr/', exact: true })
    Expected: visible
    Error: element(s) not found
    > 2480 |     await expect(folderEntry(back, "adr")).toBeVisible();
  1 failed
```

Collection: `npx playwright test --list` Total: 716 tests in 49 files, no error. The red is on the `adr/` visibility assertion, matching the plan's Findings.

## Fix Attempt 2 (review cycle 2)

Pins browser Major 1 and Minor 1 (both already implemented in e2df1213). Spec-only change, `web/e2e/reader.spec.ts` plus a small local helper `storedReaderMemory`.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/reader.spec.ts | a pop-out's Outline fold leaves the dashboard's expanded folders intact on its next Claude to Docs switch (... shared memory) | REQ-1, REQ-2 (Major 1) | dashboard expands docs/ then adr/ while a pop-out is open; pop-out folds Outline; dashboard Claude then Docs: docs/ and adr/ `aria-expanded=true`, x.md visible, Outline folded | ran-green; red against pre-fix reader.ts (toHaveAttribute docs/ expected true, received false) |
| web/e2e/reader.spec.ts | a dashboard's collapse of docs/ survives the pop-out's later Outline toggle and the dashboard's next switch (... shared memory reverse) | REQ-1, REQ-2 (Major 1 reverse) | dashboard collapses docs/; pop-out folds Outline; dashboard switch: docs/ `aria-expanded=false`, adr/ count 0, Outline folded | ran-green; red against pre-fix reader.ts |
| web/e2e/reader.spec.ts | a folder click while a filter is typed saves nothing that shows after switching away with the filter still typed (reader-expanded-persists REQ-3) | REQ-3 (Minor 1) | filter `x` typed, docs/ clicked (no visible change), switch Claude then Docs with the filter still typed: docs/ collapsed, adr/ count 0 | ran-green; red against pre-fix reader.ts (docs/ expected false, received true) |

Run output (fixed build, from `web/`): `npx playwright test e2e/reader.spec.ts -g "reader-expanded-persists" --repeat-each=5` -> `20 passed (16.2s)`; single run -> `4 passed`. Collection: `Total: 719 tests in 49 files`. Red proof: `web/src/features/reader.ts` temporarily restored to `e2e...^` (pre-fix), rebuilt: shared-memory pair and the filter test red, original Proof green; fix restored and rebuilt, `git status web/src` clean.

Soak skipped per the orchestrator's instruction; the gates run is the sweep.

### Repairs / design notes

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | both shared-memory tests | pop-out link not found | the docbar (and its pop-out link) only exists once a file is open | open `TODO.md` in the dashboard first (as the existing pop-out tests do) | n/a, setup |
| 2 | both shared-memory tests | intermittent red (pop-out write reverted the dashboard's) | Chromium propagates a localStorage write to another page's renderer asynchronously, and the pop-out's mount-time file restore also writes; the test acted within milliseconds of the other host, which no person can | wait for the pop-out's rendered body (settled), and `expect.poll` the acting host's own `localStorage` view until it shows the other host's write (retried read of the real oracle, no fixed sleep) | REQ-1/REQ-2: same final assertions on docs/adr aria-expanded and Outline fold; 30/30 and 20/20 repeat runs green |
| 3 | filter test | green against pre-fix code (not a regression pin) | I first followed "clear the filter, then switch": the pre-fix clear wiped the saved click, so the test could not see Minor 1 | switch away with the filter still typed, the reviewer's scenario; red against pre-fix reader.ts | REQ-3 Minor 1 |

No assertion was deleted, skipped, or weakened.

## Handoff (fix attempt 2)

Possible product note for web-impl, not a test defect: the localStorage propagation latency above means a pop-out acting within milliseconds of the dashboard can still apply its transition to a stale read. Not reachable by hand; `storage` event adoption would close it if wanted.

## Fix Attempt 3 (review cycle 3)

Adds the two E2E cases web-implementation.md's Handoff (fix attempt 3) maps to the cycle-2 browser Minor. Spec-only change: `web/e2e/reader.spec.ts` (new helper `openBothHostsWithAdrExpanded` beside `storedReaderMemory`). Both are expected to pass.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/reader.spec.ts | a dashboard's collapse of adr/ shows in the pop-out with no click there and the pop-out's next adr/ click expands it in both (... shared memory live adoption) | REQ-1 (cycle-2 Minor 1) | both hosts show docs/adr expanded; dashboard collapses adr/; pop-out adr/ becomes `aria-expanded=false`, x.md count 0, docs/ still expanded, no click in the pop-out; pop-out click then gives `aria-expanded=true`, x.md visible, stored `["docs","docs/adr"]`, and the dashboard's adr/ true and x.md visible | ran-green; red against cycle-2 reader.ts/memory.ts (pop-out adr/ expected false, received true) |
| web/e2e/reader.spec.ts | a click on a pop-out's displayed-expanded adr/ collapses it and stores the collapse when its storage events never land (... stale display) | REQ-1 (cycle-2 Minor 1) | with `StorageEvent.prototype.key` forced to null in the pop-out, the dashboard's collapse reaches storage (`["docs"]`) but the pop-out still shows adr/ expanded with x.md (settleFor 1.5 s); clicking it gives `aria-expanded=false`, x.md count 0, stored `["docs"]`, still collapsed after a settle | ran-green; red against cycle-2 reader.ts/memory.ts (after the click adr/ expected false, received true: it re-expanded) |

Run output: after `make web-build build`, `npx playwright test e2e/reader.spec.ts -g "shared memory|live adoption|stale display" --repeat-each=10` -> `40 passed (38.1s)` (the two existing shared-memory tests and both new ones, 10 each). Full `npx playwright test e2e/reader.spec.ts` -> `60 passed (25.0s)`. `npx playwright test --list` -> `Total: 721 tests in 49 files`. biome clean on the spec.

Red proof: `web/src/features/reader.ts` and `web/src/reader/memory.ts` restored to `252ddced^` (the pre-fix files saved and put back afterwards), built with `npx vite build` + `make build` (`make web-build` stops at `tsc` because `memory.test.ts` imports the new exports), both new tests failed on the assertions above; fix files restored, rebuilt, `git status` shows only `web/e2e/reader.spec.ts` modified.

### Repairs

None. The `StorageEvent.prototype.key` override is the Handoff's own technique: the reader ignores an event whose key is null, so the pop-out stays stale exactly as when an event has not yet landed (a timing a hand cannot hit). It is setup only, and the click, collapse and stored value are real-user paths. Soak skipped per the orchestrator's instruction; the gates run is the sweep.

No assertion was deleted, skipped, or weakened.

## Handoff (fix attempt 3)

None.

# Plan: reader-expanded-persists

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: reader.spec.ts daemon (the file's existing tests all take `daemon`; reader memory is keyed per session id, which a shared daemon would hand out across tests)
**Features**: reader
**Description**: The docs reader keeps its expanded folders and its Files/Outline folds across a switch away from and back to the docs surface.

## Symptom

**File explorer for docs resets expanded on tab swap** ([#82](https://github.com/Zalaras/muster/issues/82)) — the
docs reader's file explorer collapses its expanded folders when the developer switches to
another session, or from Docs to the Claude or Shell tab and back. It should keep what was
expanded.

## Findings

Reproduced with a throwaway E2E spec (deleted) against a scratch daemon and the reader fixture
tree: open Docs, expand `docs/` (`adr/` visible), select Claude, select Docs — `adr/` is gone:

```
Error: expect(locator).toBeVisible() failed
Locator: …getByRole('navigation', { name: 'Documents' }).locator('.tree').getByRole('button', { name: 'adr/', exact: true })
Error: element(s) not found
```

Cause: `reconcileInstances` (`web/src/features/reader.ts`) disposes every `ReaderInstance`
whose session is no longer a visible docs surface — a surface switch to Claude/Shell and a
focus switch to another session both take that path — and a fresh instance is built on return.
The expanded folders (`manualExpanded`, `features/reader.ts:125`) and the Files/Outline folds
(`filesFolded`, `outlineFolded`) live only on the instance. The last open file and cleared dots
survive because they are in the per-session browser memory (`web/src/reader/memory.ts`,
`muster.reader.<id>`, kb:adr/reader-memory-split-browser-and-daemon); these three never were.

The claim held as written, for both the tab switch and the session switch.

Scope agreed with the developer: the expanded folders and the two folds persist; the filter
text and the whole-nav toggle (`navCollapsed`) keep resetting.

## Requirements

### Must Have

- **REQ-1**: A folder expanded in the docs reader is still expanded after the developer selects
  Claude (or Shell) and then Docs again for that session, and after focusing another session and
  coming back.
- **REQ-2**: A Files or Outline section folded in the docs reader is still folded after the same
  switches.
- **REQ-3**: Clearing the filter still collapses the tree to its unexpanded state, and that
  cleared state is what a later return shows.
- **REQ-4**: Browser reader memory with none of the new fields (written by an older build) loads
  as nothing expanded and nothing folded — the behaviour before this fix.

## Affected Files

### Web (web-impl)

- `web/src/reader/memory.ts` — REQ-1, REQ-2, REQ-4: `ReaderMemory` gains the expanded folder
  paths and the two fold flags; `parseMemory` defaults each independently when absent or the
  wrong type, as it does for `openPath`/`clearedAt`.
- `web/src/features/reader.ts` — REQ-1..REQ-3: the instance seeds `manualExpanded`,
  `filesFolded` and `outlineFolded` from loaded memory, and saves memory whenever
  `toggleFolder`, `toggleFiles`, `toggleOutline` or a filter clear changes them.

### E2E (e2e-specs)

- `web/e2e/reader.spec.ts` — REQ-1, REQ-2: the Proof test below.

### Existing tests this breaks

- `web/src/reader/memory.test.ts`: its `toEqual` assertions spell out the whole
  `{ openPath, clearedAt }` shape, so the added fields break them. web-tests updates them after
  green and adds the REQ-4 parse cases (missing fields, wrong types).

## Proof

`web/e2e/reader.spec.ts`, a new test written by **e2e-specs**: with the markdown fixture tree,
open Docs, expand `docs/`, fold Outline, select Claude, select Docs; assert `adr/` is visible and
the Outline header toggle has `aria-expanded="false"`. Red today on the `adr/` visibility
assertion (element not found, as in Findings).

## Edge Cases

1. A remembered expanded folder that no longer exists in the listing → untested: `flattenTree`
   only consults the set for paths it walks, so a stale path is inert.
2. Filter typed while folders are expanded, then cleared → W1 (REQ-3 is the existing E7 test's
   behaviour; the save on clear is checked by review).
3. Older memory shape → W1 (shared with edge case 2; memory.test.ts parse cases).

## Acceptance Criteria

### Automated Checks

```checks
E1 cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'
W1 make web-test
W2 make web-lint
W3 make web-build
E2 make e2e
```

### Reviewer-Verified

- Every change to the expanded set or the folds goes through one save path, and the filter
  clear saves too.

## Doc Delta

**reader** — becomes true:
- Last open file, cleared dots, expanded folders and the Files/Outline folds are remembered per session in the browser.

**reader** — stops being true:
- Last open file and cleared dots are remembered per session in the browser.

## Out of scope

- The whole-nav toggle resetting on a switch (its 3×2-tile default makes persisting it a
  separate decision).

# Web Implementation: reader-expanded-persists

**Plan**: reader-expanded-persists
**Mode**: initial
**Pack**: kb: pack 16156 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/reader/memory.ts` | modified | `ReaderMemory` gains `expanded`, `filesFolded`, `outlineFolded`; `parseMemory` defaults each independently (absent or wrong type gives `[]` / `false`); four pure `with*` transitions (folder toggle, expanded clear, files fold, outline fold) beside `withOpened` (REQ-1, REQ-2, REQ-4) |
| `web/src/features/reader.ts` | modified | The three instance fields are removed; `this.memory` is now their only owner. `toggleFolder`, `toggleFiles`, `toggleOutline` and a filter clear each go through `commitMemory` (assign and save); `withOpened` uses it too (REQ-1..REQ-3) |

## Decisions

- design: one save path. `commitMemory(next)` replaces the old `saveMemory()` method; every memory change (open, folder toggle, either fold, filter clear) is `commitMemory(with…(this.memory))`. Precedent: the existing `withOpened` + save pairing in the same class and `memory.ts`'s pure-transition style (`rg "withOpened"` shows it is the only prior transition); extended, nothing new invented.
- design: no second copy of the expanded set on the instance. `flattenTree` still gets a `Set`, built from `memory.expanded` at the call (`new Set(filtering ? [] : this.memory.expanded)`) each render; the lists are folder-count sized, so the rebuild is negligible against the existing `buildTree`/`flattenTree` per pass.
- design: the filter clear commits only when `expanded` is non-empty, so an empty-filter input event does not write storage; REQ-3's "cleared state is what a later return shows" holds because the clear is saved.
- The Testable UI Elements contract: the plan has none; no markup or CSS changed, so no `hidden` companion rules apply.
- Filter text and `navCollapsed` still reset on return, per the plan's scope.
- Size: `web/src/features/reader.ts` is over the 500-line file warning (648 lines); it was already over (646 lines at HEAD before this change, 648 after). Not split here.
- doc-delta: `web/src/reader/CLAUDE.md` describes `memory.ts` as "last open file / which writes are acknowledged" and its Gotchas say "clearing restores the collapsed tree" is the instance "dropping its own manual-expand set"; that set is now `ReaderMemory.expanded` (persisted), so both sentences are stale. Same for the header comment atop `memory.ts` (which lists only open file and acknowledged writes).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on a sanctioned test file only: `web/src/reader/memory.test.ts` (12 TS2739 errors, every `ReaderMemory` literal and `toEqual` lacks `expanded`/`filesFolded`/`outlineFolded`). `npm run -s lint` exits 0. `npx vite build` (the build without the tsc step) succeeds, and `make build` produced the binary for the smoke.
**E2E smoke**: `npx playwright test reader.spec.ts -g 'expanded folders and folds survive'` → `1 passed (4.2s)`; the full `reader.spec.ts` file → `55 passed (20.3s)` (includes the existing filter-clear E7 test).
Test files needing changes (web-tests): `web/src/reader/memory.test.ts` — add the three fields to every `ReaderMemory` literal and `toEqual` expectation; add REQ-4 parse cases (fields missing, wrong types: `expanded: "x"`, `expanded: [1]`, `filesFolded: "yes"`) and cases for the four new `with*` transitions.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: browser Major 1 (pop-out and dashboard overwrite each other's expanded folders and folds); browser Minor 1 (folder click while filtering saved but invisible).
**Changes made**:
- `web/src/features/reader.ts` `commitMemory` now takes a transition `(memory) => memory`, applies it to a fresh `loadMemory(localStorage, id, this.memory)` read and saves the result, so a write from one host keeps the other host's stored fields. Every path that writes goes through it and none read the instance copy for the write: `openFile` (`withOpened`), `toggleFolder`, `setFilter` clear, `toggleFiles`, `toggleOutline` (five call sites, `rg -n commitMemory` shows no other). `setFilter` no longer guards on the instance's own `expanded.length` (stale under a second host); clearing an empty filter writes the same cleared set.
- `web/src/reader/memory.ts` `loadMemory` gained an optional `fallback` (default `EMPTY_MEMORY`), so a throwing storage keeps the instance's own state rather than resetting to empty. No new pure transition; existing `with*` functions unchanged.
- `toggleFolder` returns early while the filter is non-empty: the filtered tree shows matches expanded regardless, so the click had no visible effect and is now not saved either.
**Evidence**:
- Reviewer's repro re-run in a throwaway Playwright spec (deleted) with a pop-out open: dashboard expands `docs`, pop-out toggles Outline, dashboard Claude -> Docs. Before (transition applied to `this.memory`, temporarily restored): `adr/` not visible, 1 failed. After: passed, `adr/` visible and Outline `aria-expanded=false`. Reverse direction (dashboard collapses `docs`, pop-out toggles Outline back, dashboard switch): `adr/` count 0, Outline `aria-expanded=true`, passed.
- Filter repro: filter `x`, click `docs/`: tree text unchanged and `localStorage` holds no `muster.reader.*` key; clear then Claude -> Docs: `docs/` `aria-expanded=false`.
- Blast radius: `loadMemory`'s other consumer is the constructor (default fallback unchanged); `rg -n "commitMemory|loadMemory" web/src`.
**Decisions**:
- design: no `storage` event adoption — apply-on-fresh-read keeps one write path (`commitMemory`) and needs no listener lifecycle (`rg 'addEventListener\("storage"' web/src` found no precedent). A host still displays its own copy until it next writes or remounts; reviewer's requirement was that a toggle leaves the other host's stored changes intact.
- size: `web/src/features/reader.ts` still over 500 lines (650), grown by 2; no split taken in a fix wave.

## Handoff (fix attempt 2)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; biome clean; vitest 2428 passed.
**E2E smoke**: `npx playwright test reader.spec.ts` — 55 passed (includes 'expanded folders and folds survive').
No pure transition in `web/src/reader/memory.ts` was added or changed; only `loadMemory` gained an optional third `fallback` argument (web-tests may add a case: throwing storage returns the supplied fallback). Test files needing changes: None. Not covered by an E2E: pop-out + dashboard cross-write and folder click while filtering (both measured by the throwaway spec above).

## Fix Attempt 3 (review cycle 3)

**Failures addressed**: browser Minor 1 (cycle 2) — a folder click in a host whose display is out of date does nothing visible and stores the opposite.
**Changes made** (developer chose the `storage`-listener route):
- `web/src/features/reader.ts` `initReader` registers one `window` `storage` listener (beside the existing `focus` listener; none in `main.ts`) that calls `ReaderInstance.handleStorage` on every mounted instance. The instance adopts `loadMemory(localStorage, id, this.memory)` and requests a render when the event is another window's write of its own `muster.reader.<id>`.
- `toggleFolder`, `toggleFiles`, `toggleOutline` compute the target from the state the host shows (`this.memory`) and commit that target to the fresh read via `withFolderExpanded` / `withFilesFolded` / `withOutlineFolded`, so a click does what it looks like it does even before a storage event lands.
- `web/src/reader/memory.ts`: new pure `withFolderExpanded(memory, path, expanded)`, `withFilesFolded(memory, folded)`, `withOutlineFolded(memory, folded)`, `isMemoryWrite(key, newValue, sessionId)`. `withFolderToggled`, `withFilesFoldToggled`, `withOutlineFoldToggled` stay, now one-line wrappers over them (no production caller; existing `memory.test.ts` still passes unchanged).
**Every path closed**: `rg -n commitMemory web/src` shows five writers. Folder click, Files fold, Outline fold now toggle from the displayed state. Filter clear (`withExpandedCleared`) and `openFile` (`withOpened`) are not toggles: they set a value and do not depend on the displayed state. Display currency for all five comes from the listener adopting every other window's write.
**Evidence** (throwaway Playwright spec, deleted; cycle-2 repro: dashboard and pop-out both show `docs/adr` expanded, dashboard collapses `adr/`):
- Listener on: pop-out `x.md` count goes 1 → 0 and `adr/` `aria-expanded=false` without any click in the pop-out; clicking `adr/` there gives `aria-expanded=true`, `x.md` count 1, stored `["docs","docs/adr"]`, and the dashboard shows `x.md` count 1 (adopted). After the pop-out's Outline toggle `x.md` count stays 1 (no jump).
- Listener defeated in the pop-out (`StorageEvent.prototype.key` forced to `null`, so it stays stale): clicking `adr/` collapses it (`aria-expanded=false`, `x.md` count 0, stored `["docs"]`, not re-expanded); after the Outline toggle `x.md` count stays 0.
- `npx tsc --noEmit` 0, `npm run build` 0, biome clean, vitest 2433 passed, `npx playwright test reader.spec.ts` 58 passed.
**Decisions**:
- design: the listener sits in `initReader` with the other window-level `focus` listener, dispatching to instances like `handleWindowFocus`; no precedent for `storage` (`rg '"storage"' web/src` found none). A remove event (`newValue === null`) is ignored — `forget` on `sessionRemoved` already disposes the instance. Adoption replaces `this.memory` wholesale, including `clearedAt`, so a change dot acknowledged in one window clears in the other.
- size: `web/src/features/reader.ts` 664 lines (was 650), still over 500; not split in a fix wave.
- doc-delta: `web/src/reader/CLAUDE.md` "the pop-out shares that memory" is now live, not only on next write: each host adopts the other's write on a `storage` event. The plan's Doc Delta line about shared memory should say so; the cycle-2 note 4 caveat (two hosts writing within milliseconds) is also closed.

## Handoff (fix attempt 3)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; biome clean; vitest 2433 passed.
**E2E smoke**: `npx playwright test reader.spec.ts` — `58 passed (21.7s)`.
New pure functions for web-tests: `isMemoryWrite` (key match, `newValue` null → false, other session's key → false, `null` key → false), `withFolderExpanded` (set true on absent/present adds once, set false removes, idempotent), `withFilesFolded`, `withOutlineFolded` (sets the value regardless of the current one, leaves other fields). The `*Toggled` wrappers could be retired by web-tests if they prefer; no production code calls them.
E2E mapping for the reviewer's measurement (cycle-2 Minor 1, a `zz-review-browser` repro): it is the dashboard + pop-out scenario in the `reader.spec.ts` "shared memory" tests' scaffolding: both hosts show `docs/adr` expanded, the dashboard collapses `adr/`, assert the pop-out's `adr/` `aria-expanded=false` and `x.md` count 0 without a click (listener), then click `adr/` in the pop-out and assert `aria-expanded=true`, `x.md` count 1 and the dashboard's `x.md` count 1. A second case with a stale pop-out (`StorageEvent.prototype.key` overridden to `null` in the pop-out via `page.evaluate`) asserts that clicking its displayed-expanded `adr/` collapses it and stores `["docs"]`. No committed E2E covers these yet; web-tests/e2e owns them.
Test files needing changes: None.

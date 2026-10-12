# Web Tests: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: pass
**Pack**: kb: pack 5371 words (budget 30000)

## Summary

Tests created: 29 new in `memory.test.ts` (67 in the file after review cycle 3; 22 pre-existing updated; 5 added in review cycle 2; 16 net added in cycle 3) | Passing: 67 (suite 2449 across 89 files) | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `web/src/reader/memory.test.ts` | loadMemory — expanded and fold fields (REQ-4) > older shape / empty object | memory with none of the new fields loads as nothing expanded, nothing folded | pass |
| `web/src/reader/memory.test.ts` | defaults the field when … (9 table rows) | `expanded: "x"`, `[1]`, `["docs", 2]`, `null`, `{}`; `filesFolded: "yes"` / `1`; `outlineFolded: "yes"` / `null` each default alone | pass |
| `web/src/reader/memory.test.ts` | keeps valid new fields when a sibling is wrong / keeps old fields when all new are wrong | per-field independence of the parse | pass |
| `web/src/reader/memory.test.ts` | round-trips a saved memory; round-trips each fold flag independently | save then load keeps expanded and both folds (REQ-1, REQ-2) | pass |
| `web/src/reader/memory.test.ts` | withFolderExpanded (6) | review cycle 3 (replaces the withFolderToggled describe): add on true, add-when-present keeps one entry, remove on false keeping order, collapse of an absent folder is a no-op, idempotent either way, purity and other fields untouched (REQ-1) | pass |
| `web/src/reader/memory.test.ts` | withExpandedCleared (2) | clear empties `expanded` only; no-op on empty (REQ-3) | pass |
| `web/src/reader/memory.test.ts` | withFilesFolded / withOutlineFolded (5 each, one table) | review cycle 3 (replaces the *FoldToggled table): sets the value for all four before/after combinations; the other fold and all other fields untouched; input not mutated (REQ-2) | pass |
| `web/src/reader/memory.test.ts` | isMemoryWrite (8 table rows) | review cycle 3: true only for this session's key with a non-null value (including the empty string); false for a removal, another session's key, a prefix-sharing key (`muster.reader.77`), an unrelated key, a null key with or without a value | pass |
| `web/src/reader/memory.test.ts` | loadMemory — fallback argument (5) | review cycle 2: throwing storage, absent key, unparsable JSON / non-object return the supplied fallback; a parsing entry ignores it; omitted fallback keeps the empty default | pass |
| `web/src/reader/memory.test.ts` | pre-existing loadMemory / saveMemory / isDirty / withOpened / forget (22) | unchanged behaviour, expectations now spell the new shape | pass |

## Handoff Received

`web/src/reader/memory.test.ts` (12 TS2739). Added an `EMPTY` constant and a `mem(over)` builder, replaced every `ReaderMemory` literal and `toEqual({ openPath, clearedAt })` with them (so a future field is a one-line change), added the REQ-4 parse table and the four transition suites. Stored-JSON fixtures in the `forget` tests stay in the old two-field shape on purpose: they double as older-build input.

## Review cycle 2

`loadMemory` gained an optional third `fallback`; covered by the `loadMemory — fallback argument` describe. The cross-host write behaviour (`commitMemory` re-reading before write) and the folder click while filtering live in `features/reader.ts`, a DOM module; the impl log records them as measured by a throwaway Playwright spec and not covered by an E2E (reported to the orchestrator, not a unit gap).

## Review cycle 3

`withFolderExpanded`, `withFilesFolded`, `withOutlineFolded` and `isMemoryWrite` are covered in `memory.test.ts`. The `withFolderToggled`, `withFilesFoldToggled` and `withOutlineFoldToggled` describes are gone, their behaviour (order kept on removal, purity, other fields untouched, both fold directions) re-expressed through the new functions. Remaining references in `web/src`, all definitions in `memory.ts` for web-impl to delete (`rg -n "withFolderToggled|withFilesFoldToggled|withOutlineFoldToggled" web/src`):

```
web/src/reader/memory.ts:102:export function withFolderToggled(memory: ReaderMemory, path: string): ReaderMemory {
web/src/reader/memory.ts:114:export function withFilesFoldToggled(memory: ReaderMemory): ReaderMemory {
web/src/reader/memory.ts:122:export function withOutlineFoldToggled(memory: ReaderMemory): ReaderMemory {
```

The listener adoption and display-based toggling (`handleStorage`, `toggleFolder`) are in `features/reader.ts`, a DOM module; the impl log's throwaway Playwright evidence covers them and no committed E2E does yet (the impl Handoff says web-tests/e2e owns that; this step writes unit tests only).

## Implementation Bugs

None.

## Notes

- REQ-3's "filter clear is saved" and the instance wiring (`commitMemory`, `new Set(filtering ? [] : memory.expanded)`) live in `features/reader.ts`, a DOM/socket module; the unit layer covers the pure `withExpandedCleared`. The wiring is Playwright's: `web/e2e/reader.spec.ts` "expanded folders and folds survive" (REQ-1, REQ-2) and the existing filter-clear E7 test; the plan names the save-on-clear as reviewer-verified.
- `make size-warn` prints no line naming `memory.test.ts`; the repeated bodies are table rows (`it.each`, `describe.each`).
- Not mine, left uncommitted: `web/e2e/reader.spec.ts` shows as modified in the tree (the concurrent e2e agent).

## Test Run Output

```
make web-test:  Test Files  89 passed (89) | Tests  2449 passed (2449)
make web-lint:  Checked 302 files in 314ms. No fixes applied.
npx tsc --noEmit: exit 0; npm run build: exit 0
```

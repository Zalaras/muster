# Web Tests: Maintainability Cleanup (Unit W5)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: `kb: pack 65885 words (budget 8000)` — sections rules 841 · features 26183 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons 1417 · runbooks 644 (`--plan maintainability-cleanup --role web-tests`; over budget, WARN only)

## Summary

Repaired the 7 tsc errors / 24 failing tests left by W5's sanctioned renames/moves/removals
(`plans/maintainability-cleanup/web-implementation-W5.md`). No implementation files touched.

Test counts: **1843 total (1819 passing, 24 failing) → 1829 total, all passing.**

- 18 tests deleted (pinned only a now-removed export/behaviour; none of it was reachable coverage of anything else — see table below).
- 4 tests added (`sessions/live.test.ts`'s new `visibleIds` describe block — the one genuine coverage gap among the four candidates named in the brief; see "New coverage" below).
- The remaining repairs were renames/re-points with no count change.

`npx tsc --noEmit` → 0 errors. `make web-lint web-test web-build` all green (tails below).

## Tests

| File | Change | What It Tests | Status |
|------|--------|----------------|--------|
| `sessions/format.test.ts` | renamed `formatEndedAge`→`formatAge`, `formatEndedAgo`→`ageAgo`; collapsed the duplicate bucket-table `it.each` (identical to `formatAge`'s own, now that the two functions are one) into the `formatAge` describe, keeping the two edge-case tests (future clock-race, unparsable timestamp) that weren't duplicated elsewhere | `formatAge`'s coarse buckets + edge cases; `ageAgo`'s "now" vs "N ago" | pass |
| `theme.test.ts` | deleted the `readThemeHint` describe (8 tests) and `writeThemeHint`'s "round-trips through readThemeHint" test (1) — both pinned only the removed export; deleted the now-unused `throwingStorage` helper (`noUnusedLocals`); repointed `ClaudeFamily` import to `./protocol/theme` | `writeThemeHint` writes JSON under the fixed key and swallows a throwing storage | pass |
| `ws.test.ts` | removed `onConnected` from `makeHandlers()` (field no longer exists on `WsClientHandlers`); kept the hello-dispatch-via-socket assertion from the deleted test's body (renamed, `onConnected` assertion dropped — that half was genuine full-lifecycle coverage no other test in the file provides); deleted the `stop()` test (dead method + guard) | full-socket-lifecycle hello dispatch; everything else unchanged | pass |
| `shortcuts.test.ts` | deleted the `SHORTCUT_HELP` describe (1 test) — pinned only the removed export | n/a (removed) | — |
| `reader/notice.test.ts` | repointed `ConnectionStatus` type import `../render/masthead` → `../app` | unchanged (type-only import) | pass |
| `reader/paths.test.ts` | updated the trailing-slash `basename` case: `basename("/Users/bob/plans/")` now `"plans"` (was the path unchanged) — sanctioned behaviour change per `sessions/card.ts` now being the canonical `basename` | trailing-slash stripping, matching the new canonical implementation | pass |
| `sessions/live.test.ts` | **new** `visibleIds` describe (4 tests) | `visibleIds("tiles", …)` returns `tilesLive` verbatim (with or without a stray `focusedId`); `visibleIds("focus", id, …)` returns `[id]` ignoring `tilesLive`; `visibleIds("focus", null, …)` returns `[]` | pass |

## Deleted tests (itemised)

| Test | File | Reason |
|------|------|--------|
| `readThemeHint` describe, 8 tests (fresh profile, valid hint, malformed JSON, non-object, unknown theme name, bad family, `"follow"` stored, throwing storage) | `theme.test.ts` | Pinned the now-deleted `readThemeHint` export directly; no other caller or test exercises it (nothing reads the hint back except the inline `<head>` script, which duplicates the shape deliberately per its own comment, not this module). |
| `writeThemeHint` → `"round-trips through readThemeHint"` | `theme.test.ts` | Same — round-trip needs the deleted read side. |
| `formatEndedAge` bucket-table `it.each` (7 cases) | `format.test.ts` | Exact duplicate of `formatAge`'s own `it.each` once `formatEndedAge` became `formatAge` — collapsed rather than deleted outright (see Tests table); flagging here because the *duplicate* copy is what's gone, not the coverage. |
| `"calls onConnected when the socket opens..."` (the `onConnected` half) | `ws.test.ts` | `onConnected` handler removed from `WsClient`/`WsClientHandlers`; nothing else asserts it existed. |
| `"stop() prevents any further reconnect attempt"` | `ws.test.ts` | `WsClient.stop()` and its `stopped` guard were deleted (dead code, zero production callers per the implementation log's `rg` check); no other test exercises the method. |
| `"SHORTCUT_HELP (REQ-12)"` | `shortcuts.test.ts` | `SHORTCUT_HELP` export deleted (dead, hand-duplicated `BINDINGS`); no other test references it. |

Total: 18 tests removed (8 + 1 + 7 + 1 + 1 + 1... — counted at the assertion level above; wc-verified against `git diff` hunks).

## New coverage

Checked all four candidates named in the brief before writing anything (`grep -rn` first, per
policy):

- **`sessions/reorder.ts`'s `insertAtDragTarget`** — declined. Fully exercised through both its
  callers already: `sessions/railorder.test.ts`'s `"moveCard — self-drop / absent id returns
  null (REQ-11/W8/edge case 2)"` block (`railorder.test.ts:115-142`, covering self-drop, dragged
  id absent, target id absent, and an empty array) and its forward/backward describe blocks
  (`railorder.test.ts:8-51`, e.g. `expect(moveCard(ordered, 1, 3)).toEqual({ ids: [2, 3, 1],
  pinnedCount: 0 })` — a direct assertion of `insertAtDragTarget`'s spliced output), plus
  `sessions/live.test.ts`'s `"moveTile"` block (`live.test.ts:189-231`, same self-drop/absent-id/
  forward/backward/no-mutation matrix through the identity `id` accessor). No case in
  `insertAtDragTarget`'s contract is untested.
- **`sessions/live.ts`'s `visibleIds`** — **covered here** (new). Grepped
  `visibleIds|visibleSessionIds|visibleDocsIds` across `src/**/*.test.ts` first: no direct test
  existed. `features/surfaces.test.ts` exercises `initSurfaces` (a DOM controller) and never
  calls `visibleSessionIds` directly in an assertion; there is no `features/reader.test.ts` at
  all. All three branches (non-Focus passthrough, Focus with an id, Focus with none) were an
  actual gap — added.
- **`sessions/card.ts`'s `canResume`** — declined. It's a one-line predicate
  (`claudeSessionId !== null`) already exercised end-to-end, both branches, by two independent
  DOM-render suites: `render/mainhead.test.ts`'s `"renderMainhead — Resume disabled reason
  (REQ-17/W3)"` (`mainhead.test.ts:164-182`, asserting `resumeBtn.disabled` true for a null id
  and false for a bound one) and `render/dead.test.ts`'s equivalent
  (`dead.test.ts:312-392`). A dedicated unit test would duplicate exactly those two assertions
  for a function with no branch they don't already hit.
- **`storage.ts`'s `readJson`/`writeJson`** — declined. Grepped `readJson|writeJson` across
  `src/**/*.test.ts` first: no direct test, but every branch is hit through callers.
  `reader/memory.test.ts`'s `"loadMemory"` describe (`memory.test.ts:56-105`) covers `readJson`'s
  full branch set — throwing `getItem` (line 78), nothing stored (line 57), unparsable JSON
  (line 82), a non-object value (line 87), and shape-rejecting `parse` calls (lines 92, 99) —
  plus a successful round-trip (line 62); `"saveMemory"`'s throwing-storage test (line 108) and
  `theme.test.ts`'s `"writes the hint as JSON under the fixed key"` / `"swallows a throwing
  storage..."` (two independent callers) cover `writeJson`'s two branches. Nothing in
  `readJson`/`writeJson` is reachable that these six tests don't already exercise.

## Comments added

Re-read every comment added to test files per the review pass:
- `format.test.ts`: renamed describe title now says "one function for both a session's live age
  and its endedAt age" — describes the merge, no dangling reference.
- `theme.test.ts`: trimmed the seam comment to name only `writeThemeHint`/`Pick<Storage,
  "setItem">`, matching what the file now tests.
- `reader/paths.test.ts`: new comment names `sessions/card.ts` (exists, is where `basename` now
  lives).
- `sessions/live.test.ts`: new describe title names `features/surfaces.ts` and
  `features/reader.ts` (both exist, both are `visibleIds`'s real callers per `live.ts`'s own
  doc comment).
No comment cites a path or target that doesn't exist.

## Test Run Output

```
$ npx tsc --noEmit
(0 errors)

$ make web-lint
cd web && npm run -s lint
Checked 220 files in 185ms. No fixes applied.

$ make web-test
cd web && npm test
 Test Files  60 passed (60)
      Tests  1829 passed (1829)

$ make web-build
✓ built in 3.11s
(pre-existing >500kB chunk warnings — mermaid/katex/cytoscape/elk vendor chunks — unrelated)
```

# Web Tests: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: pass
**Pack**: `<!-- kb:pack plan=markdown-viewing role=web-tests -->` (features: reader, surfaces, lifecycle, ingest)

## Summary

Tests created: 78 new | Repaired: 27 (fixture-only) | Passing: 1554/1554 | Failing: 0

## Fix Attempt (review cycle 1, Major 3)

Review Major 2 landed in `bc715e3`: `changedText` now goes through the new shared
`agoSuffix` helper (`web/src/sessions/format.ts`) instead of composing `${age} ago`
directly, so the sub-minute bucket reads `changed now`, not `changed now ago`.

Updated `src/reader/freshness.test.ts` per Major 3 verbatim: the first test now asserts
`toBe("changed now")` (plus an explicit `not.toContain("now ago")`), and the regex-matrix
test was widened to `/^changed (now|.+ ago)$/` while keeping a per-case check that the
sub-minute bucket is exactly `"changed now"` and every other bucket still matches `/ ago$/`
— so the sub-minute-is-not-`now ago` guarantee stays asserted, per the fix-wave instruction,
not just dropped along with the old string.

`agoSuffix` itself was net-new and untested (only exercised indirectly through
`formatEndedAgo`, which itself was untested directly — `format.test.ts` covered
`formatEndedAge` and `formatAge` but not the `Ago` composer). Added two describe blocks to
`src/sessions/format.test.ts`: `agoSuffix` (bare `"now"` vs. `"<age> ago"` for every other
bucket) and `formatEndedAgo` (sub-minute `"now"`, never `"now ago"`; `"2m ago"` once a
minute has elapsed) — the same guarantee `render/dead.test.ts:131` already proves for
`formatEndedAgo` through `render/dead.ts`'s rendered text, now also asserted directly at
the formatter.

No implementation files touched. Verified `npx tsc --noEmit`, `make web-test`
(1562/1562, up from 1554 — +8 new cases) and `make web-build` all green before committing.

## Repair (sanctioned breakage per web-implementation.md's Handoff)

`Session.plan` and `SurfaceSegmentRefs.docsBtn` became required wire/DOM fields; the
10 tsc-failing files plus `protocol.test.ts`/`api.test.ts`/`ws.test.ts`'s raw JSON
fixtures needed the new key. Fixed by adding `plan: null,` beside each base fixture's
`titleOverride: null,` (the one line every `makeSession`-style helper already had
exactly once) in: `src/api.test.ts`, `src/render/dead.test.ts`, `src/render/mainhead.test.ts`,
`src/render/sessions.test.ts`, `src/render/tiles.test.ts`, `src/sessions/card.test.ts`,
`src/sessions/live.test.ts`, `src/sessions/sort.test.ts`, `src/sessions/store.test.ts`,
`src/ws.test.ts`, and the two `validSession`/`freshLaunchSession` base fixtures in
`src/protocol.test.ts` (which alone fixed all 23 previously-failing runtime assertions
web-impl flagged, since every other fixture in that file spreads one of the two).
Added a `docsBtn` fake to `src/terminal/surfaceswitch.test.ts`'s `fakeSurfaceSegmentRefs()`,
fixing the 8 tests that threw on `refs.docsBtn.setAttribute`.

Verified via `npx tsc --noEmit` (0 errors, all files) and `npm test` (0 failures) before
adding any new coverage, per the gate's honesty requirement.

## Tests

| File | What It Tests | Status |
|------|---------------|--------|
| `src/terminal/surfaceswitch.test.ts` (+10 cases) | W4: `selectSurface`/`shellEnded` handle `docs`; `isSurfaceAttachable` false for `docs` across all 4 alive×shellRunning combos; `surfaceKey`/`parseSurfaceKey` round-trip `docs`; `updateSurfaceSegment` writes `docsBtn` aria-pressed/disabled | pass |
| `src/reader/tree.test.ts` (new, 26 cases) | W5: `buildTree` nesting, folder-before-file/alphabetical sort, all-collapsed start, recursive `countFiles`. W6: `filterTree` case-insensitive substring match, ancestor expansion, empty-query identity. Plus `flattenTree`'s depth-tagging, dirty/current decoration, manual-vs-forced expansion (REQ-12/REQ-13, used by the tree but not named in a lettered criterion) | pass |
| `src/reader/memory.test.ts` (new, 20 cases) | W7: `loadMemory`/`saveMemory` round-trip through a fake `Storage`, throwing storage and foreign-JSON-shape degrade to the empty default, per-session-id keying; `isDirty`/`withOpened`'s writtenAt-keyed acknowledgement (REQ-13) | pass |
| `src/reader/slug.test.ts` (new, 11 cases) | W8: `headingSlug` lowercase/hyphenate/strip-punctuation; `dedupeIds` appends `-2`/`-3` to repeats in document order (edge case 26) | pass |
| `src/reader/freshness.test.ts` (5 cases; updated review cycle 1) | W9: `changedText` renders `changed now` for the sub-minute bucket (never `changed now ago`) and `changed <age> ago` for the other three `formatAge` buckets; matches `/^changed (now|.+ ago)$/` at every bucket | pass |
| `src/sessions/format.test.ts` (+4 cases; added review cycle 1) | New `agoSuffix` describe (bare `"now"` vs. `"<age> ago"`); new `formatEndedAgo` describe (`"now"` sub-minute, `"2m ago"` once elapsed) | pass |
| `src/protocol.test.ts` (+16 cases) | W10: `parseSession` accepts `plan` as a populated object, `exists:false`, or `null`; rejects a missing `plan` key and a malformed plan object. `parseDocChanged` accepts the full shape and rejects a missing `id`/`path`/`at`; `parseMessage` dispatch parity | pass |
| `src/ws.test.ts` (+2 cases) | `docChanged` routes to `onDocChanged` (not `onSnapshot`), both via `dispatch()` and the full fake-socket lifecycle | pass |
| `src/api.test.ts` (+21 cases) | `fetchReaderListing`/`fetchReaderFile` decoding: populated/`null`/`exists:false` plan, `writtenAt: null` "no write yet" files, `truncated`, rejecting malformed bodies, all four documented error envelopes (`directory_missing`/`unknown_session`/`invalid_request`/`not_found`/`too_large`), the raw-text (non-JSON) success path, and both added to the existing network-error-short-circuit table | pass |

## Declined coverage

**`src/reader/markdown.ts`** — not unit-tested; that module's own `web/src/reader/CLAUDE.md`
claims every module in the package is "Vitest-testable with no DOM," but `renderMarkdown`
calls `DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true })`, and this project's Vitest
runs in the default Node environment with no jsdom/happy-dom dependency (confirmed:
`grep -i jsdom web/package.json` — no hit). Probed directly: a throwaway test file calling
`renderMarkdown("# Hello")` fails with `TypeError: default.sanitize is not a function` —
in Node without a `window`, DOMPurify's default export is the un-bound `createDOMPurify`
factory, not a ready sanitizer, so this is a hard runtime dependency on a real DOM, not a
tangle I could extract. This is the same category `surfaceswitch.test.ts`'s own header
comment documents for `buildSurfaceSegment` (real DOM construction, no jsdom available,
deliberately left to Playwright) — and the plan's own Acceptance Criteria agree: W4-W10
enumerate every other reader module by name but never `markdown.ts`, while W15 (sanitizer
discipline) is Reviewer-Verified and E15/E16 (`web/e2e/reader.spec.ts`, GFM rendering and
XSS-element stripping) are the specified Playwright coverage for its actual behavior. Adding
jsdom as a new dependency to force this one module under Vitest would go beyond "genuinely
needed" test-config changes for coverage the plan already assigns elsewhere. Net: `markdown.ts`
is correctly out of scope for this role; flagging the `CLAUDE.md` overclaim as a minor,
non-blocking doc inaccuracy rather than an implementation bug, since nothing it describes is
actually broken.

**`src/features/reader.ts` / `src/render/reader.ts`** — not unit-tested; both are DOM/socket-
owning controller and render modules (real `<template>` cloning, `fetch`, `window.localStorage`,
`window.addEventListener("focus", ...)`), the same category as every other `features/*.ts`
controller in this codebase (none of which get Vitest coverage — see `features/surfaces.ts`,
which this module's own header comment says it mirrors). Covered by `web/e2e/reader.spec.ts`
(E1-E29) per the plan's own test-specs.md.

## Test Run Output

```
$ make web-build web-test
cd web && npm run build
> tsc --noEmit && vite build
✓ 69 modules transformed.
✓ built in 194ms
cd web && npm test
> vitest run
 Test Files  35 passed (35)
      Tests  1554 passed (1554)
```

### Review cycle 1 (Major 3 fix)

```
$ npx tsc --noEmit
(no output, 0 errors)
$ make web-test
cd web && npm test
> vitest run
 Test Files  35 passed (35)
      Tests  1562 passed (1562)
$ make web-build
cd web && npm run build
> tsc --noEmit && vite build
✓ 69 modules transformed.
✓ built in 203ms
```

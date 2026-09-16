# Web Tests: Mermaid Support

**Plan**: mermaid-support
**Verdict**: pass
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role web-tests` — conventions §Testing/§Comments, reader feature spec + protocol contract slice, reader ADRs.

## Summary

Tests created: 2 files, 57 cases | Passing: 57 | Failing: 0

Targets per the implementation log: `web/src/reader/mermaid.ts` (W7, W8, W9) and
`web/src/reader/zoom.ts` (W21). `web/src/render/mermaid.ts`, `diagrams.ts` and
`diagramdialog.ts` are DOM modules (need `window`, same shape as `reader/markdown.ts`) —
not Vitest-importable, left to Playwright/Reviewer-Verified per the implementer's note and
`web/src/reader/CLAUDE.md`.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `mermaid.test.ts` | `isMermaidLanguageClass` table (9 cases) | case-insensitive whole-token match; `language-mermaidjs`/`lang-mermaid`/bare/empty all false (W8) | pass |
| `mermaid.test.ts` | `mermaidThemeFor` table (6 cases) | `light`→`default`; `instrument`, `dark`, `""`, `null`, unrecognised →`dark` (W7) | pass |
| `mermaid.test.ts` | `diagramErrorText` prefixes an Error's message | happy path | pass |
| `mermaid.test.ts` | `diagramErrorText` takes first non-empty line of a multi-line message | leading blank lines skipped | pass |
| `mermaid.test.ts` | `diagramErrorText` trims the chosen line | whitespace trimmed | pass |
| `mermaid.test.ts` | `diagramErrorText` caps at 200 chars | boundary | pass |
| `mermaid.test.ts` | `diagramErrorText` falls back on empty message | `syntax error` fallback | pass |
| `mermaid.test.ts` | `diagramErrorText` falls back on whitespace-only message | `syntax error` fallback | pass |
| `mermaid.test.ts` | `diagramErrorText` falls back on non-Error throws | string/number/undefined/null | pass |
| `mermaid.test.ts` | `diagramId` names by instance and position | `muster-diagram-<instance>-<n>` | pass |
| `mermaid.test.ts` | `diagramId` distinct within a pass (edge case 16) | two fences, same instance | pass |
| `mermaid.test.ts` | `diagramId` injective in the instance counter | same fence position, different instance | pass |
| `zoom.test.ts` | `clampZoom` pins `0.1`→`0.25`, `20`→`8` | INV-5 bounds | pass |
| `zoom.test.ts` | `clampZoom` leaves in-range and exact-bound values untouched | | pass |
| `zoom.test.ts` | `wheelFactor` sign behaviour (`<0`→`>1`, `>0`→`<1`, `0`→`1`) plus inverse-magnitude check | | pass |
| `zoom.test.ts` | `zoomAround` point invariance, 2 states × 2 factors × 3 points (12 cases) | stage point maps to the same canvas point before/after, decoded via the inverse transform | pass |
| `zoom.test.ts` | `zoomAround` invariance holds when the requested factor overshoots the clamp | applied ratio recomputed from the clamped zoom | pass |
| `zoom.test.ts` | `zoomAround` clamps the resulting zoom | factor 100 and 0.001 | pass |
| `zoom.test.ts` | `panBy` adds delta, leaves zoom unchanged, accepts negative delta | | pass |
| `zoom.test.ts` | `fitScale` fits a wide SVG by width, a tall one by height | both axes named in W21 | pass |
| `zoom.test.ts` | `fitScale` falls back to `1` for non-positive SVG or stage dimensions | pre-layout stage measurement | pass |
| `zoom.test.ts` | `resetZoom` is `{ zoom: 1, x: 0, y: 0 }` | | pass |
| `zoom.test.ts` | `transformOf` formats translate/scale (2 cases) | not named in W21's list but pure and cheap; kept minimal since E14 already exercises the live transform string via the DOM | pass |

## Test Run Output

```
$ npx vitest run src/reader/mermaid.test.ts src/reader/zoom.test.ts
 RUN  v5.0.0 /Users/bob/Documents/code/Projects/muster-from-main/web
 Test Files  2 passed (2)
      Tests  57 passed (57)

$ npm test
 Test Files  39 passed (39)
      Tests  1639 passed (1639)

$ npx tsc --noEmit   # exit 0
$ npm run build      # exit 0, index entry chunk unaffected by these test-only files
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 568 references checked, 0 missing
$ npm run -s lint
Checked 160 files in 159ms. No fixes applied.
```

## Fix Attempt 1 (review cycle 1)

Minor [web-tests]: `mermaid.test.ts`'s "distinct across passes" case titled its assertion
as the shipped re-render behaviour (a claim Wave 1's `ce34fa0` made true, but not one this
test checks — it calls `diagramId` directly, not through a render pass). Reworded to state
what the case actually asserts: `diagramId` is injective in the `instance` argument for a
fixed fence position. No assertion changed.

```
$ npx tsc --noEmit   # exit 0
$ npx vitest run src/reader/mermaid.test.ts   # 25 passed
$ npm test                                    # 39 files, 1639 passed
$ npm run build                               # exit 0
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 568 references checked, 0 missing
$ npm run -s lint
Checked 160 files in 156ms. No fixes applied.
```

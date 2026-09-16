# Web Tests: Markdown Render Fixes

**Plan**: markdown-render-fixes
**Verdict**: pass
**Pack**: kb: pack 3948 words (features: reader; rules, decisions, lesson conditional-test-routing-resolves-to-nobody)

## Summary

Tests created: 8 | Passing: 8 | Failing: 0

Full suite (`npm test`): 1570 passed (36 files), including the 8 new.

## Scope

`web-implementation.md`'s Changes table lists one new pure-logic module,
`web/src/reader/paths.ts` (`basename`, `loadingText`) — REQ-13/W7's explicit unit-test
requirement, and the plan's own Affected Files section names `web/src/reader/paths.test.ts`
as the only new web-unit-test artifact. Every other changed file
(`web/src/render/reader.ts`, `web/src/features/reader.ts`, the two HTML templates,
`web/src/style.css`) is DOM/controller code the plan itself routes to Playwright (E1–E16),
per `web/src/reader/CLAUDE.md`'s own invariant that everything else here is Vitest-testable
except the DOM-bound module. I checked `features/reader.ts`'s `deriveNotice` (the status-line
precedence helper, W9) for a coverage gap: it is pure (no DOM) but module-private, not
exported, and `ReaderInstance` around it depends on `window.localStorage`/`document`/fetch,
so it can't be reached from a jsdom-less Vitest run without exporting it — which I may not
do (implementation is off-limits). W9 is explicitly a **Reviewer-Verified** criterion in
plan.md, not a web-tests one, so this is not a routing gap under
kb:lesson/conditional-test-routing-resolves-to-nobody — it's an item the plan assigns
elsewhere. No other new pure logic exists in the diff.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `paths.test.ts` | basename > returns the last path segment | absolute multi-segment path | pass |
| `paths.test.ts` | basename > returns the last segment of a relative path | relative path | pass |
| `paths.test.ts` | basename > falls back to the path itself when there is no slash | no-slash input | pass |
| `paths.test.ts` | basename > returns the path itself for a trailing-slash path with nothing after it | boundary: empty last segment | pass |
| `paths.test.ts` | basename > returns an empty string for an empty path | boundary: empty input | pass |
| `paths.test.ts` | loadingText > returns the bare 'loading…' for a null path (REQ-9/REQ-10) | absent-path case, the "no data yet" cue | pass |
| `paths.test.ts` | loadingText > returns 'loading <basename>…' for a path (REQ-8) | status-line text | pass |
| `paths.test.ts` | loadingText > uses the same basename derivation as the standalone function | REQ-13's "one pure function so the three call sites can't drift apart" | pass |

## Implementation Bugs

None found.

## Test Run Output

```
> muster-web@0.0.0 test
> vitest run

 RUN  v5.0.0 /Users/bob/Documents/code/Projects/muster/web

 Test Files  36 passed (36)
      Tests  1570 passed (1570)
   Start at  15:19:48
   Duration  1.80s (transform 59%, tests 21%, import 16%, worker 4%)
```

`npx tsc --noEmit`: clean, no output.
`npm run build`: `tsc --noEmit && vite build` — 70 modules transformed, built in 250ms, no errors.

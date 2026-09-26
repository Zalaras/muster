# Web Tests: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: pass
**Pack**: `kb: pack 21238 words (budget 20000)` — WARN over budget; sections rules 885 · features 7394 · decisions 6992 · facts 5237 · lessons 722 · runbooks 2 (features launch, ingest, connection)
**Pack (fix wave 2)**: `kb: pack 23317 words (budget 20000)` — WARN over budget; sections rules 1117 · features 7394 · decisions 6992 · facts 5237 · lessons 2569 · runbooks 2 (features launch, ingest, connection)

## Summary

Tests created: 3 files (2 new, 1 extended), 73 tests total in those files | Passing: 73 | Failing: 0

Covers the plan's whole web-side surface (`web-implementation.md`'s Changes table): the new
`parseModelVerdicts` decoder, the new pure `launchmodels.ts` module (`deriveModelRowState`'s
INV-1/INV-2 table plus `VerdictStore`'s generation-guarded merge), and the new `checkModels`
API wrapper. `render/launch.ts`'s `renderModelRowState` and `features/launch.ts`'s DOM wiring
are deliberately not unit-tested — both allocate/mutate real DOM nodes with no jsdom
configured (`web/vitest.config.ts`, `render/launch.test.ts`'s own header comment: Playwright's
job); `web/e2e/launch-model-check.spec.ts` (E1–E6, already authored) is their test.

## Tests

All eleven of the original `protocol/models.test.ts` (W2) assertions now live in
`api/launch.test.ts`'s `checkModels` describe block (see Fix Attempt 1 below for why and
how); the table below reflects their new location.

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `api/launch.test.ts` | decodes a 200 with one entry per verdict kind, message present only on unrecognized | full 200 shape (W2, pre-existing — same assertion as W2's original test 1) | pass |
| `api/launch.test.ts` | decodes an empty models array as a valid, distinct empty result | `[]` is a valid result (W2 test 2) | pass |
| `api/launch.test.ts` | rejects an unrecognized verdict with no message | W2 malformed case (test 3) | pass |
| `api/launch.test.ts` | rejects an unrecognized verdict whose message is not a string | W2 malformed case (test 4) | pass |
| `api/launch.test.ts` | ignores a message field on a recognized verdict rather than rejecting it | extra field tolerance (W2 test 5) | pass |
| `api/launch.test.ts` | falls back to a generic error when the success body doesn't match the verdict shape (REQ-10 fail path, pre-existing) | rejects an unknown verdict string (W2 test 6 — same `verdict: "maybe"` case, already covered before this wave) | pass |
| `api/launch.test.ts` | rejects a non-string model field | W2 malformed case (test 7) | pass |
| `api/launch.test.ts` | rejects a non-array models field | W2 malformed case (test 8) | pass |
| `api/launch.test.ts` | rejects a body with no models key | W2 malformed case (test 9) | pass |
| `api/launch.test.ts` | rejects a non-record top-level value (null, array, or bare string) | W2 malformed case (test 10) | pass |
| `api/launch.test.ts` | rejects the whole list when one element among several is malformed (all-or-nothing) | all-or-nothing list rule (W2 test 11) | pass |
| `features/launchmodels.test.ts` | `isPresetModel` — recognizes each of the four presets, rejects a custom/near-miss/empty string | preset guard | pass |
| `features/launchmodels.test.ts` | preset selected, no verdict / recognized / unchecked / unrecognized (×4 presets each) | INV-1/INV-2, INV-4 (unchecked never marks/disables) | pass |
| `features/launchmodels.test.ts` | unrecognized unselected preset(s) disabled, one and two at a time | REQ-7 | pass |
| `features/launchmodels.test.ts` | custom selected, non-empty text × {none, recognized, unchecked, unrecognized} | REQ-8/9, INV-4 | pass |
| `features/launchmodels.test.ts` | custom selected with empty text never invalid regardless of a stored verdict | selection.selected falsy short-circuit | pass |
| `features/launchmodels.test.ts` | a verdict for a custom value since edited away from is never read | REQ-13 edge case 3 | pass |
| `features/launchmodels.test.ts` | an unrecognized preset stays disabled while a custom model is selected | REQ-7/REQ-8 independence | pass |
| `features/launchmodels.test.ts` | `resetVerdictStore` bumps generation and clears verdicts | dialog-open reset | pass |
| `features/launchmodels.test.ts` | `applyVerdicts` merges a batch under the matching generation | normal path | pass |
| `features/launchmodels.test.ts` | two requests (four presets, then a restored custom model) accumulate onto one generation | REQ-6/REQ-13 "same open" rule | pass |
| `features/launchmodels.test.ts` | a later verdict for the same model overwrites the earlier one | re-check semantics | pass |
| `features/launchmodels.test.ts` | a stale-generation batch (dialog closed, reopened) is dropped whole | REQ-13 edge case 2 | pass |
| `features/launchmodels.test.ts` | a stale batch never overwrites a newer generation's already-applied verdict | REQ-13 ordering | pass |
| `api/launch.test.ts` | `checkModels` sends one repeated `model=` per requested model, in order | REQ-1/REQ-6 request shape | pass |
| `api/launch.test.ts` | `checkModels` URL-encodes a custom model value | encoding | pass |
| `api/launch.test.ts` | decodes a 200 with one entry per verdict kind | Protocol Contract | pass |
| `api/launch.test.ts` | decodes a 400 invalid_request | D6 shape | pass |
| `api/launch.test.ts` | decodes a 401 unauthorized | auth | pass |
| `api/launch.test.ts` | falls back to `unknown_error` on a malformed success body | decode-failure fallback | pass |
| `api/launch.test.ts` | never throws when the daemon is unreachable | REQ-10 fail-open request path | pass |

## Implementation Bugs

None. `deriveModelRowState`, `applyVerdicts`/`resetVerdictStore`, `parseModelVerdicts` and
`checkModels` all match the plan's REQ-6 through REQ-13, INV-1 through INV-4 and the
`GET /api/models` protocol contract exactly as implemented — no gap found.

## Fix Attempt 1 (review cycle 1)

**Trigger**: wave-1 web-impl's Handoff (`web-implementation.md`'s Fix Attempt 1 / second
Handoff) moved `ModelVerdict`/`parseModelVerdicts` from the deleted `protocol/models.ts` into
`api/launch.ts` (unexported, matching its sibling parsers `parseRepo`/`parseBrowseResult`),
which orphaned `protocol/models.test.ts`'s import and broke `npx tsc --noEmit`/`npm run
build` (confirmed: `src/protocol/models.test.ts(2,36): error TS2307: Cannot find module
'./models'`). This is the sanctioned test-file breakage named in web-impl's handoff, not an
implementation bug — no review issue tags `[web-tests]`.

**Task 1 — merge `models.test.ts` into `api/launch.test.ts`**: read the full parser
(`api/launch.ts`'s `parseModelVerdict`/`parseModelVerdicts`, unexported) and the sibling test
pattern already in `api/launch.test.ts` (every parser there is exercised only through its
public wrapper with a mocked `fetch`/JSON body — `rg -n "parseRepo\b|parseBrowseResult\b"
web/src/api/*.test.ts web/src/protocol/*.test.ts` finds nothing, confirming no sibling has a
direct-parser test file). Added nine new tests to the `checkModels` describe block driving
every W2 case through `checkModels` + `fakeResponse`, and confirmed the other two W2 cases
were already covered before this wave without duplicating them:
- W2 test 1 (one entry per verdict kind) = the pre-existing "decodes a 200 with one entry per
  verdict kind, message present only on unrecognized" test — same models array, same
  assertion shape.
- W2 test 6 (rejects an unknown verdict string, `verdict: "maybe"`) = the pre-existing "falls
  back to a generic error when the success body doesn't match the verdict shape (REQ-10 fail
  path)" test — same input (`{ model: "sonnet", verdict: "maybe" }`), same
  `result.error.code === "unknown_error"` assertion.

No assertion was dropped or weakened: every one of the eleven original cases is either a new
test or is named above with the exact pre-existing test that already asserts it, read and
quoted. Deleted `web/src/protocol/models.test.ts` once its content was fully accounted for
elsewhere.

**Task 2 — review web-impl's edit to `launchmodels.test.ts`**: diffed the one commit that
touched it (`git diff dea21cf^ dea21cf -- web/src/features/launchmodels.test.ts`) — it is
exactly a two-line import-path fix (`ModelVerdict` now from `../api/launch`, `ModelSelection`
now from `../render/launch`, split off `./launchmodels`'s re-export), with no assertion, mock,
or test body touched. Correct: matches where those two types now live per
`web-implementation.md`'s Fix Attempt 1 table, and `npx tsc --noEmit -p web` is clean. Kept
as-is.

**Task 3 — confirm W3 still covers the generation-capture fix**: `features/launch.ts`'s
`submit()` now captures `const generation = modelVerdicts.generation` before `await
launchSession(body)`, then on a `model_unrecognized` refusal calls
`applyVerdicts(modelVerdicts, generation, [...])` — the same pure `(store, generation,
models)` signature `launchmodels.test.ts`'s W3 suite already drives directly. `applyVerdicts`
has no caller-identity in its logic, only the three arguments, so the two existing W3 tests
already exercise exactly this interleaving: "a verdict batch for a stale generation (the
dialog was closed and reopened) is dropped whole" and "a stale batch never overwrites a newer
generation's already-applied verdict" cover the concrete case the fix closed (submit → cancel
while in flight → reopen → stale refusal lands). No new test needed; the DOM wiring
(`submit()` itself calling `applyVerdicts` at the right two points) is Playwright's, per
`web/e2e/launch-model-check.spec.ts`.

**Gates run from this wave** (`web/`, then project root as noted):

```
$ npx tsc --noEmit -p web
(clean, no output, exit 0)

$ make web-test
 Test Files  75 passed (75)
      Tests  1855 passed (1855)

$ make web-lint
Checked 253 files in 201ms. No fixes applied.

$ make web-build
✓ built in 1.65s   (pre-existing chunk-size warnings only, unrelated to this plan/wave)
```

Also ran (not in the fix-mode instruction's list, but same as wave 1's own gates):
`comment-checks.py web-tests` → `comment-checks: clean`; `dead-refs.py
web/src/api/launch.test.ts` → `0 references checked (nothing to scan in 1 file(s))` (no
`kb:`-style citations added in the new tests).

Files touched this wave: `web/src/api/launch.test.ts` (edited — nine new tests, one Biome
reformat), `web/src/protocol/models.test.ts` (deleted), `plans/maintainability-regressions/web-tests.md` (this log).

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npx vitest run src/protocol/models.test.ts src/features/launchmodels.test.ts src/api/launch.test.ts
 Test Files  3 passed (3)
      Tests  73 passed (73)

$ npm test  (whole web/ suite)
 Test Files  76 passed (76)
      Tests  1857 passed (1857)

$ npm run build
✓ built in 1.64s   (pre-existing chunk-size warnings only, unrelated to this plan)

$ npm run -s lint
Checked 255 files in 202ms. No fixes applied.

$ make refs   (from project root)
dead-refs: 3198 references checked, 0 missing

$ make size-warn   (from project root)
size-warn: 70 hits — none in web/src/protocol/models.test.ts, web/src/features/launchmodels.test.ts
or web/src/api/launch.test.ts
```

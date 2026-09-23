# Web Tests: Maintainability Cleanup — Unit W2 repair

**Plan**: maintainability-cleanup
**Unit**: W2 (`api.ts` → `web/src/api/`) — test re-point only
**Verdict**: pass
**Pack**: kb: pack 65885 words (budget 8000; over budget, WARN only) — rules 841 · features 26183 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons 1417 · runbooks 644 (`--plan maintainability-cleanup --role web-tests`)

## Summary

`web-implementation-W2.md`'s Handoff listed 6 test files broken by the `api.ts` → `api/*.ts` +
`sessions/permission.ts` split (3 runtime `Cannot find module './api'` failures, 3 type-only `tsc`
failures). Fixed all 6, then split `api.test.ts` (1890 lines, 134 test-declaring calls) into one
spec file per new production module, mirroring `web/src/api/`. Ran the full suite afterwards and
found 7 more failures the handoff hadn't listed — pre-existing GET-request assertions that pinned
the exact `fetch` call-options object, which `http.ts`'s new single `requestInit` now makes explicit
about a `method` field GET requests never spelled out before. Fixed those as test bugs (see
Decisions). No implementation code touched.

Test cases: 134 before (133 `it(` + 1 `it.each(` in `api.test.ts`) → 134 after (counted across
the 9 new/changed spec files below). None dropped, none added.

## Files fixed (import re-point only, no case-count change)

| File | Fix |
|------|-----|
| `web/src/terminal/drop.test.ts` | `ApiErrorBody` import `../api` → `../api/http` |
| `web/src/render/launchrestore.test.ts` | `Repo` import `../api` → `../api/launch` |
| `web/src/render/update.test.ts` | `RestartImpactShell` import `../api` → `../api/update` |
| `web/src/features/surfaces.test.ts` | `vi.mock("../api", …)` → `vi.mock("../api/sessions", …)`; `ApiResult` import → `../api/http`; `createShell`/`CreateShellResult` import → `../api/sessions`; header comment's file mention updated |
| `web/src/render/dead.test.ts` | `vi.mock("../api", …)` → `vi.mock("../api/sessions", …)`; `ApiResult` → `../api/http`, `PaneSnapshot`/`fetchPane` → `../api/sessions`; header comment updated |

Grepped `web/src/**/*.test.ts` for `console` before starting — only one hit
(`render/actionerror.test.ts:4`, a comment, not an assertion) — so no test asserted a controller's
own `console.error` text that needed re-pointing to `logApiFailure`; matches
`web-implementation-W2.md`'s own finding ("No unit test spies on console.error").

## `api.test.ts` split (1890 lines → 9 files, 134 → 134 test-declaring calls)

| New file | Covers | `it(`/`it.each(` |
|----------|--------|-------------------|
| `web/src/sessions/permission.test.ts` (new) | `PERMISSION_MODES`, `permissionModeToCheck` | 6 / 1 |
| `web/src/api/launch.test.ts` (new) | `launchSession`, `fetchRepos`, `browse` | 19 / 0 |
| `web/src/api/prefs.test.ts` (new) | `putPrefs`, `refreshUsage` | 15 / 0 |
| `web/src/api/update.test.ts` (new) | `applyUpdate`, `fetchRestartImpact` | 18 / 0 |
| `web/src/api/reader.test.ts` (new) | `fetchReaderListing`, `fetchReaderFile` | 15 / 0 |
| `web/src/api/sessions.test.ts` (new) | `endSession`, `resumeSession`, `removeSession`, `createShell`, `fetchPane` | 26 / 0 |
| `web/src/api/issue.test.ts` (new) | `captureIssueSnapshot`, `fileIssue` | 20 / 0 |
| `web/src/api/terminal.test.ts` (new) | `locateDroppedFile` | 12 / 0 |
| `web/src/api/http.test.ts` (new) | cross-module `network_error` short-circuit table (20 cases, one `it(` per case + 1 closing test) | 2 (`for` loop + 1 closing) / 0 |
| `web/src/api.test.ts` | deleted (superseded by the 9 files above) | — |

Verified equal: `grep -o '\bit(' <files> \| wc -l` = 133 both before (old `api.test.ts`) and after
(summed across the new files), `grep -o '\bit\.each(' … \| wc -l` = 1 both before and after.

`putTitle`, `pinSession` and `putSessionOrder`'s decode paths, and `checkForUpdate` entirely, had
no dedicated describe block in the original `api.test.ts` either (only `pinSession`/
`putSessionOrder` appear, via the network-error table) — a pre-existing gap from before this unit,
not something this split introduced or was asked to fill.

## Decisions

- **`web/src/api/testfakes.ts` (new, not a `.test.ts`)**: holds `fakeResponse`,
  `fakeResponseThatThrows`, `fakeStatusResponse`, `fakeTextResponse` — the four `Response` fakes
  every split `api/*.test.ts` file needs. `api.test.ts` defined each once for the whole file; without
  a shared module, 6+ of the split files would each redeclare an identical 3-8 line function.
  `vitest.config.ts`'s `include: ["src/**/*.test.ts"]` doesn't pick it up as a suite. Grepped first:
  `grep -rl "testutil\|fixtures" web/src` and `grep -rl "fakeResponse\b" web/src` — no existing shared
  test-fake module anywhere in the tree to reuse instead.
- **`validSession` duplicated, not shared**, across `api/launch.test.ts` and `api/sessions.test.ts`:
  matches this codebase's existing convention of each test file declaring its own local
  `Session`/fixture builder (`sessions/card.test.ts`'s `makeSession`, `render/dead.test.ts`'s two
  separate `makeSession` functions in different describe blocks) rather than a shared fixture
  module — there is no precedent to break here, and `make size-warn` (run after) raised no `dupl`
  warning on either file.
- **The network-error table (20 cases) → `api/http.test.ts`, not split per module**: it exists to
  prove one cross-cutting property of `http.ts`'s `safeFetch` choke point ("every endpoint routes a
  rejected fetch to the same `network_error` shape"), regardless of which `api/*.ts` file each
  function now lives in. Splitting it 8 ways would turn one assertion about shared plumbing into
  8 partial ones and lose the "swept, not just the cited functions" framing the original comment
  states. It imports from every other `api/*.ts` module — the one file in this split allowed to do
  that, since it's testing the seam between them.
- **No new table test added for `http.ts`'s own exported helpers** (`requestJson`/`requestEmpty`/
  `requestText`/`requestFormData`): grepped first — every branch of all four (success decode, JSON
  parse failure, non-matching status/shape, network rejection) is already exercised through the
  concrete endpoints that call them (e.g. `requestJson` via `api/sessions.test.ts`'s `endSession`
  cases, `requestEmpty` via `api/prefs.test.ts`'s `putPrefs` cases, `requestText` via
  `api/reader.test.ts`'s `fetchReaderFile` cases, `requestFormData` via `api/terminal.test.ts`'s
  `locateDroppedFile` cases). Nothing uncovered to add a table for.
- **7 GET-request assertions fixed as test bugs, not implementation bugs**: `fetchRepos`, `browse`
  (×2), `fetchReaderListing`, `fetchReaderFile`, `fetchPane`, `fetchRestartImpact` each had an
  assertion pinning the exact `fetch(url, {...})` options object with no `method` field (verified
  against the pre-split `api.ts` at `git show HEAD:web/src/api.ts` — every GET call there omitted
  `method` entirely). `http.ts`'s new `requestInit`/`requestText` always set `method` explicitly
  (`api/http.ts:59-67,153-154`), including for GET. This is not an observable behaviour change —
  `fetch(url, {method:"GET"})` and `fetch(url, {})` send an identical HTTP request, and GET is
  `fetch`'s documented default — so it's within the plan's "no user-visible string, status code,
  wire field or timing changes" bound, and squarely the "refactor that breaks an in-package test…
  sanctioned" case the plan's Rules name for impl agents. Fixed by adding `method: "GET"` to each
  assertion rather than reporting an implementation bug.

## Comments

Two pre-existing test comments named the old `api.ts` path and were corrected to the file the
described behaviour now lives in: `features/surfaces.test.ts`'s and `render/dead.test.ts`'s header
comments ("Mocking ../api" → "Mocking ../api/sessions"), and `api/issue.test.ts`'s
`captureIssueSnapshot` test title ("W3's api.ts seam" → "api/issue.ts's seam"). No plan-ID citations
were added or removed elsewhere (X1's sweep explicitly excludes test-file comments — left as-is).

## Gate Output

`npx tsc --noEmit` (from `web/`): clean, no output.

`make web-lint web-test web-build`:

```
cd web && npm run -s lint
Checked 204 files in 192ms. No fixes applied.
cd web && npm test

> muster-web@0.0.0 test
> vitest run


 RUN  v5.0.0 /Users/damian/Documents/code/Projects/muster-maintainability/web


 Test Files  54 passed (54)
      Tests  1843 passed (1843)
   Start at  21:30:38
   Duration  2.68s (transform 60%, import 18%, tests 17%, worker 4%)

cd web && npm run build

> muster-web@0.0.0 build
> tsc --noEmit && vite build

vite v8.3.0 building client environment for production...
✓ 2203 modules transformed.
✓ built in 1.73s
```

(The build's "chunks larger than 500 kB" note is the pre-existing mermaid bundle, unrelated to this
unit.)

`python3 .claude/skills/orchestrate/scripts/dead-refs.py`: `39 references checked, 0 missing`.

`make size-warn` (informational, not a required gate for this unit): no `dupl`/`funlen`/`filelen`
hits on any file touched or added here. The one `web/src/api.ts: No such file or directory` line is
the pre-existing artifact of the deletion not yet being staged (`git ls-files` still lists it) —
noted in `web-implementation-W2.md`'s own Handoff, resolves once committed, not a defect from this
pass.

## Constraints observed

No implementation file edited (`web/src/api/*.ts`, `web/src/sessions/permission.ts`, and every
other production file are untouched — only `*.test.ts` files and the new `api/testfakes.ts` test
utility changed). No `git add`/commit performed.

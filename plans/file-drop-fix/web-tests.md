# Web Tests: file-drop-fix

**Plan**: file-drop-fix
**Verdict**: pass

## Summary

Tests created: 56 (44 from the initial pass + 12 new `classifyApiFailure` cases in this
re-run) | Passing: 56 | Failing: 0 (711/711 total suite, up from 699/699 before this step)

## Re-run note (after web-impl fix attempt 1, commit a05b3b4)

web-impl moved `classifyApiFailure(error: ApiErrorBody): LocateFailure` verbatim out of
`web/src/terminal/pane.ts` into `web/src/terminal/drop.ts` and exported it (confirmed:
`grep -n "^export function classifyApiFailure" web/src/terminal/drop.ts` →
`export function classifyApiFailure(error: ApiErrorBody): LocateFailure {`). This closes
the one gap named in the previous pass — the function is now reachable from a pure unit
test with no DOM/xterm/socket harness. Added a `classifyApiFailure` describe block to
`web/src/terminal/drop.test.ts` pinning the wire-code -> `LocateFailure` mapping directly:
every code the daemon actually sends (`not_located`, `too_large`, `ambiguous`), the
`ambiguous` count's three shapes (populated `paths`, absent `paths` via the `?? 0`
fallback, and an explicitly empty `paths` array), and the default-to-`"other"` catch-all
across every other code this client can see (`invalid_request`/400, `internal_error`/500,
`unknown_session`/404, the client-synthesised `network_error`, and an unrecognised future
code) — plus a defensive case confirming a stray `paths` field on a non-`ambiguous` code
is ignored. All other tests from the previous pass are unchanged and still green. No
further implementation gaps found; verdict flips from `implementation-bug` to `pass`.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `terminal/drop.test.ts` | escapes a space | REQ-4 | pass |
| `terminal/drop.test.ts` | escapes every character in the required set, once each, in order | REQ-4 (independent char-list check) | pass |
| `terminal/drop.test.ts` | leaves path separators/dots/hyphens/underscores unchanged | REQ-4 | pass |
| `terminal/drop.test.ts` | escapes ':', '@', '+', '=' per REQ-4's explicit examples | REQ-4 | pass |
| `terminal/drop.test.ts` | does not escape digits or letters | REQ-4 | pass |
| `terminal/drop.test.ts` | does not escape non-ASCII characters | REQ-4 | pass |
| `terminal/drop.test.ts` | escapes a filename containing a single quote (edge case 12) | REQ-4 | pass |
| `terminal/drop.test.ts` | escapes a backslash itself | REQ-4 | pass |
| `terminal/drop.test.ts` | empty string unchanged / no-escape-needed path unchanged | REQ-4 | pass |
| `terminal/drop.test.ts` | MAX_DROP_BYTES is exactly 50 MiB | REQ-7 | pass |
| `terminal/drop.test.ts` | classifyDrop: 'files' for 1+ files, even alongside text/plain | REQ-2/REQ-10, edge case 15 | pass |
| `terminal/drop.test.ts` | classifyDrop: 'text' with no files but text/plain present | REQ-10 | pass |
| `terminal/drop.test.ts` | classifyDrop: 'none' with neither | — | pass |
| `terminal/drop.test.ts` | classifyDrop: 'none' for the internal reorder drag's own MIME | INV-3 seam | pass |
| `terminal/drop.test.ts` | classifyDrop: fileCount 0 wins over 'Files' in types | dragover-time visibility | pass |
| `terminal/drop.test.ts` | locatingText: verbatim basename + trailing U+2026, not ASCII dots, unescaped | REQ-6 | pass |
| `terminal/drop.test.ts` | noticeForFailure: not_located / ambiguous (count 2, 5, 0) / too_large / other / not_connected (name ignored) | REQ-6, REQ-3, REQ-8, Testable UI Elements | pass |
| `terminal/drop.test.ts` | noticeForFailure uses literal em dash (U+2014), not hyphen | Testable UI Elements | pass |
| `api.test.ts` | locateDroppedFile posts multipart/form-data under 'file', decodes 200 path | REQ-2/REQ-3, §3.14 | pass |
| `api.test.ts` | locateDroppedFile sends no explicit Content-Type (boundary left to FormData) | §3.14 | pass |
| `api.test.ts` | decodes 404 not_located / 409 ambiguous (with paths) / 413 too_large / 400 invalid_request / 404 unknown_session / 500 internal_error | REQ-3, §3.14 error map | pass |
| `api.test.ts` | falls back to generic error on a malformed 200 body (missing path) | — | pass |
| `api.test.ts` | parseApiError ignores non-array `paths`, and an array with a non-string element, while keeping code/message | ApiErrorBody parsing | pass |
| `api.test.ts` | never throws on a non-JSON response body | — | pass |
| `api.test.ts` | locateDroppedFile added to the network_error short-circuit table | REQ-13 pattern | pass |
| `render/dropguard.test.ts` | prevents default + sets dropEffect 'none' on an unclaimed dragover | REQ-1 | pass |
| `render/dropguard.test.ts` | prevents default on an unclaimed drop | REQ-1 | pass |
| `render/dropguard.test.ts` | tolerates a dragover with no dataTransfer | defensive | pass |
| `render/dropguard.test.ts` | does not re-touch dropEffect on an already-claimed dragover (e.g. terminal surface set 'copy') | REQ-9/INV-3 | pass |
| `render/dropguard.test.ts` | does not call preventDefault again on an already-claimed drop | REQ-9/INV-3 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: maps 'not_located' | §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: maps 'too_large' | §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: maps 'ambiguous' counting a 2-element paths array | REQ-3, §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: maps 'ambiguous' counting a 1-element paths array | REQ-3, §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: 'ambiguous' with no paths field falls back to count 0 (`?? 0`) | REQ-3, §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: 'ambiguous' with an explicitly empty paths array is count 0 | REQ-3, §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: 'invalid_request' (400) -> 'other' catch-all | §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: 'internal_error' (500) -> 'other' catch-all | §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: 'unknown_session' (404, distinct from not_located) -> 'other' catch-all | §3.14 | pass |
| `terminal/drop.test.ts` | classifyApiFailure: client-synthesised 'network_error' -> 'other' catch-all | REQ-13 pattern | pass |
| `terminal/drop.test.ts` | classifyApiFailure: unrecognised/future code -> 'other' catch-all, no throw | defensive | pass |
| `terminal/drop.test.ts` | classifyApiFailure: a stray paths field on a non-ambiguous code is ignored | defensive | pass |

## Implementation Bugs

None. The one gap from the previous pass (`classifyApiFailure` unexported and tangled
into `pane.ts`) was fixed in web-impl's fix attempt 1 (commit a05b3b4): the function moved
to `web/src/terminal/drop.ts` and is now exported. Verified: `grep -n "^export function
classifyApiFailure" web/src/terminal/drop.ts` → `export function classifyApiFailure(error:
ApiErrorBody): LocateFailure {`. All 12 new cases above exercise it directly.

**Evidence**: `grep -n "^export\|^function\|^class" web/src/terminal/pane.ts | grep -i classify` → `37:function classifyApiFailure(error: ApiErrorBody): LocateFailure` (no `export` keyword). Confirmed this is the only such gap: every other new/modified symbol in this plan's Affected Files (`escapePath`, `classifyDrop`, `locatingText`, `noticeForFailure`, `MAX_DROP_BYTES` in `drop.ts`; `locateDroppedFile`, `parseApiError`'s `paths` handling in `api.ts`; `installDropGuard` in `dropguard.ts`) is exported and is covered above.

**Suggested fix** (for web-impl, not applied here — test agents may not edit implementation): export `classifyApiFailure` from `pane.ts`, or move it into `terminal/drop.ts` alongside `LocateFailure`/`noticeForFailure` (its natural home, since it produces the exact type `noticeForFailure` consumes) and import it back into `pane.ts`. Either is a small, low-risk change; once done, a handful of additional `drop.test.ts` (or `pane.test.ts`) cases can assert the `not_located`/`ambiguous`(+count fallback)/`too_large`/`default->other` mapping directly.

**Distinguishing test-bug vs. implementation-bug**: this is not a test bug — there is no test to fix; the function is structurally unreachable from `web/src/terminal/pane.test.ts` or any new test file without an `export`. It is not a functional/behavioral defect either (the mapping's *effects*, observed through `api.test.ts` and `drop.test.ts`, are correct) — it is a convention violation (logic tangled into a DOM module instead of a pure one), which this agent's operating instructions explicitly classify as `implementation-bug` to report rather than route around.

## Test Run Output (re-run, after web-impl fix attempt 1)

```
$ npx tsc --noEmit
(no output — clean)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  24 passed (24)
      Tests  711 passed (711)
   Start at  23:59:38
   Duration  1.30s (transform 1.87s, setup 0ms, import 2.78s, tests 517ms, environment 4ms)

$ npm run build
> tsc --noEmit && vite build
✓ 38 modules transformed.
../internal/webui/assets/index.html                  14.14 kB │ gzip:   3.46 kB
../internal/webui/assets/assets/index-ykrhKYMZ.css   27.55 kB │ gzip:   5.83 kB
../internal/webui/assets/assets/index-VsUDH8og.js   391.22 kB │ gzip: 101.36 kB │ map: 1,012.92 kB
✓ built in 228ms
```

All three gates (type-check, unit tests, build) are green. No implementation gaps
remain — verdict is `pass`.

## Fix Attempt (review cycle 1, wave 2)

Two `[web-tests]` issues from `plans/file-drop-fix/review.md`, both confined to
`web/src/terminal/drop.test.ts`. No implementation code was touched (none was in scope
this wave — the impl agents were tagged only with Minors).

**Major 1 — W4's character table omitted `*`.** The literal `raw` string in "escapes
every character in the required set, once each, in order" jumped from `)` straight to
`,`, skipping `*`, even though the implementation's `ESCAPED_CHARS` set
(`web/src/terminal/drop.ts:10-36`) includes it between `)` and `,`. Read the source set
to confirm the full 25-character list before editing (space, backslash, and 24 punctuation
marks including both `*` and `~`, excluding `:` `@` `+`). Fixed by inserting `*` into
`raw` in the same position as the implementation's set, and `\\*` into `expected` in the
matching position:
- `raw`: `` ` \\!"#$&'()*,;<=>?[]^\`{|}~` `` (was missing `*` between `)` and `,`)
- `expected`: adds `\\*` between `\\)` and `\\,`

Only this one code path reaches the defect — the table is a single hand-typed literal
pair with no derived variants, so there is nothing else to close.

**Minor 6 — two misleading test titles.**
1. The title on the path-separators/dots/hyphens/underscores test claimed to also cover
   "tildes-within-a-name-that-arent-standalone", but its fixture
   (`/Users/damian/my-file_v2.final.txt`) contains no tilde at all. Per the orchestrator's
   parallel correction to REQ-4 prose (Minor 7), `~` **is** in the escape set and is
   already independently pinned by the W4 table above — this test was never about tildes.
   Retitled to "leaves path separators, dots, hyphens and underscores unchanged where not
   in the escape set", dropping the false tilde claim.
2. The title on the `a:b@c+d=e` test claimed "escapes ':', '@', '+', '=' per REQ-4's
   explicit examples," but the assertion (`"a:b@c+d\\=e"`) shows only `=` gets escaped —
   `:` `@` `+` are correctly left alone per the authoritative character list. Retitled to
   "escapes '=' but leaves ':', '@' and '+' unescaped (REQ-4: only '=' of these four is in
   the escape set)" so the title matches the assertion instead of contradicting it. The
   assertion itself was already correct and is unchanged.

**Gate evidence** (all from `web/`, after the edits):

```
$ npx tsc --noEmit
(no output — clean)

$ npm test   # via `make web-test`
 Test Files  24 passed (24)
      Tests  711 passed (711)

$ npm run build   # via `make web-build`
✓ 38 modules transformed.
✓ built in 202ms
```

Test count is unchanged at 711 (both fixes edited existing test bodies/titles, no tests
added or removed). Verdict remains `pass`.

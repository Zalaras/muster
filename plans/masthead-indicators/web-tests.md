# Web Tests: masthead-indicators

**Plan**: masthead-indicators
**Verdict**: pass
**Pack**: kb: pack 11262 words (budget 30000)

## Summary

Tests created: 2 new files, 6 existing files brought up to the contract | Full suite: 2492 passing, 0 failing (91 files)

Gates, run from `web/`: `npx tsc --noEmit` exit 0, `npm test` 91 files / 2492 tests passed, `npm run build` built, `npm run -s lint` clean. The plan's X1/X2/X4 greps over `web/src web/index.html web/e2e` print nothing. `make size-warn` names no test file.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/features/connectionhealth.test.ts` | every status x override combination (9 rows) | W4/W5: `describeConnectionHealth` returns ok/pending/down with the table's exact word and title | pass |
| `src/features/connectionhealth.test.ts` | INV-1 against the real update-restart override (12 rows + 2) | the dot's health for status x {no restart, restart in window, past 30 s fallback, confirmation} using the real `computeBannerOverride` | pass |
| `src/style.test.ts` | health dot tokens (W6, REQ-10) | each of the 3 theme blocks declares `--health-ok/-pending/-down` as a hex colour; declared exactly 3 times each; dot rules paint only through the tokens (no raw colour) | pass |
| `src/render/masthead.test.ts` | renderConnectionStatus (health dot) | writes the hidden `.sr-only` word, `data-health` and `title`; writes nothing on an unchanged repeat; rewrites only changed fields; throws when `.sr-only` is missing | pass |
| `src/render/masthead.test.ts` | renderUsageBucket / renderUsageModelWeek resets | bracketed reset text and `title` on `.resets` for the plain buckets and the model-week bar | pass |
| `src/sessions/format.test.ts` | formatResets (W2) | `(HH:MM)` same day, `(HH:MM Ddd)` otherwise; padding, midnight edges, a week on, past, other month; no `resets` wording | pass |
| `src/sessions/format.test.ts` | formatResetsTitle (REQ-12) | `Resets <weekday day month>, HH:MM`; its clock equals the suffix's | pass |
| `src/sessions/usage.test.ts` | known / unknown bucket view model (W3) | no `· ` prefix, `resetsTitle` set when known and `null` when unknown | pass |
| `src/protocol/usage.test.ts` | ignores a stray usage.model (4 rows) | W1: object, null, malformed object and string `model` all parse, and the key is not exposed | pass |
| `src/protocol/messages.test.ts` | snapshot with a stray usage.model | the snapshot parses and drops the key | pass |
| `src/ws.test.ts` | dispatches a usage frame to onUsage | `Usage` fixture without `model` | pass |

## Handoff Received

- `web/src/render/masthead.test.ts`: deleted the `renderUsageModel` block and its import (and the now-unused `SessionModelInfo` import); rewrote the `renderConnectionStatus` cases for a `ConnectionHealthDescription` with a counting fake host; the three known-bucket resets expectations now assert the bracketed text and `title`; `FakeDomNode` gained a `title` field.
- `web/src/sessions/format.test.ts`: `resets ...` cases became tables over `(HH:MM)` / `(HH:MM Ddd)`; added `formatResetsTitle`.
- `web/src/sessions/usage.test.ts`: no `· ` prefix; `resetsTitle` asserted known and unknown.
- `web/src/protocol/usage.test.ts`, `web/src/protocol/messages.test.ts`: the `usage.model` parse and reject cases became "stray `model` key is ignored and not exposed".
- `web/src/ws.test.ts`: the `Usage` literal no longer carries `model`.
- New: `features/connectionhealth.test.ts` (W4/W5/INV-1) and `style.test.ts` (W6).

## Notes

- The reconnecting + neutral-confirmation pair is tested as `down`, as the impl log documents. The plan's INV-1 does not specify it (neither the unreachable text nor the updating text shows), so the row pins the implementation's choice rather than a plan requirement; the reviewer may want the plan to say so.
- `style.test.ts` reads the shipped `style.css` with `node:fs` (tsconfig already has node types) because W6 is a statement about that file; it asserts nothing about rendering.
- Not covered here, by design: REQ-11 (one-row masthead at 1512/1440px), the dot's 6px round shape and the `.resets` DOM `title` in a real browser are Playwright's (`masthead-layout.spec.ts`, `masthead-indicators.spec.ts`).

## Test Run Output

```
 Test Files  91 passed (91)
      Tests  2492 passed (2492)
```

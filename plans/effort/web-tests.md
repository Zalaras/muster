# Web Tests: Effort

**Plan**: effort
**Verdict**: pass
**Pack**: kb: pack 25316 words (budget 30000)

## Summary

Full suite: 95 files, 2702 tests | Passing: 2702 | Failing: 0. `npx tsc --noEmit`, `npm run -s lint` and `npm run build` are clean.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/effort.test.ts` (new) | effortToCheck / isEffortLevel | each level checks its radio; null, "", unknown, wrong case fall back to `default` (`""`) | pass |
| `sessions/effort.test.ts` | effortBrackets | level, alive-never-reported `(…)`, dead-never-reported none, no-effort-setting none | pass |
| `sessions/effort.test.ts` | effortStripParts | clamp and no-effort-setting sentences, bold runs, `the model` when unnamed | pass |
| `sessions/effort.test.ts` | effortReadout | bundle, warn flag, strip, `reservesBrackets` only for dead + never reported (INV-6) | pass |
| `render/effortstrip.test.ts` (new) | renderEffortStrip | hidden for null, bold runs as `<b>`, no rewrite while the signature is unchanged, rewrite on text/bold change | pass |
| `render/mainhead.test.ts` | the effort readout in `.model` | five readouts: `.eff` text/class (`eff`, `eff warn`), absent node when no brackets, `holds-eff`, stale node dropped | pass |
| `render/mainhead.test.ts` | the effort strip | hidden/shown with sentence; hides on clear and on the no-session pass | pass |
| `protocol/session.test.ts` | parseSession effort / effortWarning | tri-state effort, nullable warning fields, malformed shapes and missing keys reject | pass |
| `api/launch.test.ts` | fetchRepos lastEffort | null/level/unknown string decode; missing or non-string rejects | pass |
| `api/sessions.test.ts` | dismissEffortWarning | DELETE path, 204 as success, 404 envelope | pass |
| `features/launchrestore.test.ts` | initialRestore / repoRestore | 8 touched combinations, effort fallback to default radio, repoRestore effort | pass |

## Handoff Received

Brought up to the contract, per the impl log's Handoff:
- `effort: null, effortWarning: null` added to the Session builders: `sessions/testfixtures.ts`, `api/launch.test.ts`, `api/sessions.test.ts`, `sessions/live.test.ts`, `ws.test.ts`, `features/actionscopy.test.ts`, `render/dead.test.ts` (both), `render/mainhead.test.ts`, `render/sessions.test.ts`, `render/tiles.test.ts`, `sessions/card.test.ts`, `sessions/sort.test.ts`, `sessions/store.test.ts`.
- Not on the list but broken at runtime (untyped fixtures that now reject): `protocol/session.test.ts` and `protocol/messages.test.ts` fixtures got both keys.
- `features/launchrestore.test.ts`: `lastEffort` on the Repo, `effort` on every `Touched`; the four-combination table became eight, with effort cases.
- `render/mainhead.test.ts`: `effortStrip` element in the fixture; `FakeNode` gained `classList.toggle`, `replaceChildren`, `dataset`; the `document` stub (createElement and createTextNode) hoisted to file level because every `renderMainhead` call now reaches `renderModel`; the old model-slot test now passes `effort: { level: null }` so it still asserts the bare name.
- `api/launch.test.ts`: `lastEffort` on repo literals.

## Notes

- No `dupl` output was run for these files; repeated cases are tables (`it.each`).
- Not unit-testable and left to E2E: REQ-9's Dismiss click wiring (`features/effort.ts` is DOM controller code) and the strip's refit (REQ-13), covered by `web/e2e/effort-header.spec.ts`. The failing E2E specs listed in the impl Handoff (spec width list, model-id expectations, 404 message wording) are validate-mode and daemon-impl matters, not touched here.

## Test Run Output

```
 Test Files  95 passed (95)
      Tests  2702 passed (2702)
```

## Fix Wave (review cycle 1)

**Verdict**: pass. Full suite 95 files, 2713 tests, 0 failing; `npx tsc --noEmit` and `npm run build` exit 0.

- `render/mainhead.test.ts` fixture: `FakeNode.textContent` is now a derived getter (concatenation of kids, as the real DOM; a write replaces the children), plus `nodeType`, `nodeValue`, `firstChild`, a per-node `textWrites` counter, and a stubbed global `Node.TEXT_NODE`; `replaceChildren(string)` makes a real text node. This repaired the 3 sanctioned-broken cases.
- New "across render passes" tests (browser Major 1): unchanged passes keep the `.model` text node and `.eff` element identity with zero text writes and two children; a level change rewrites only `.eff` text; a cleared warning flips only the class; a model change rewrites only the name's text node.
- `protocol/decode.test.ts`: `isNullableString` table (string, empty string, null accepted; undefined, number, object, boolean rejected). It is also exercised through the `api/launch.test.ts` decode cases.
- Not unit-testable: `initEffort`'s `{dismiss(id)}` and the `focus.ts` click wiring are DOM-controller code, covered by `web/e2e/effort-header.spec.ts` Dismiss tests (as in the prior Notes).

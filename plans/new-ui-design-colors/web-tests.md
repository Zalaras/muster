# Web Tests: new-ui-design-colors

**Plan**: new-ui-design-colors
**Verdict**: pass

## Summary

Tests created: 42 new | Fixed (sanctioned pre-existing breakage): 13 | Passing: 653 | Failing: 0

## Fixes to sanctioned pre-existing breakage

Per web-implementation.md's Handoff, `web-impl` left two known-good breaks out of its edit
scope (impl agents never edit tests): `Prefs`/`Snapshot` became required fields carrying
`theme`/`claudeTheme`, and a batch of pre-plan test fixtures predated those fields.

- **`web/src/ws.test.ts`** — added `theme: "follow"` to the `snapshot` fixture's `prefs`
  and a top-level `claudeTheme: { family: "unknown" }`; added `theme: "dark"` to the
  `prefsMessage` fixture's `prefs`. This cleared the two `tsc --noEmit` errors blocking
  `make web-build`.
- **`web/src/protocol.test.ts`** — added `theme`/`claudeTheme` to `validSnapshot` and to
  every fixture object that constructs its own `prefs`/`snapshot` literal independently of
  `validSnapshot` (13 call sites across the snapshot, railSort, and prefs-message describe
  blocks), matching the existing `usageModel`/`railSort` defaulting pattern already
  documented in this file's own comments. This cleared all 12 pre-existing Vitest failures
  named in the Handoff (11 in `protocol.test.ts`, 1 in `ws.test.ts`).

Distinguishing test bug from implementation bug here: the daemon's own contract (docs/
protocol.md §5.2/§5.5, confirmed in `plan.md`'s Protocol Contract) makes `theme` and
`claudeTheme` always-present fields, and `parsePrefs`/`parseSnapshot` correctly implement
REQ-19's defaulting (verified by reading `protocol.ts:332-366` and `536-547`). The fixtures
were simply written before those fields existed — a test bug, not an implementation bug —
so I fixed the tests rather than reporting a defect.

One W4 grep hit remains and is **not mine to fix**: `web/e2e/sessions.spec.ts:351` has a
comment mentioning `--dim` in prose, inside `web/e2e/` (owned by e2e-specs). Already flagged
by web-impl in its Handoff; carrying the flag forward for the orchestrator.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `theme.test.ts` | `resolveTheme(%s, %s) -> %s` (12 cases) | INV-1's full pref×family table: each of `instrument`/`dark`/`light`/`follow` × `light`/`dark`/`unknown` | pass |
| `theme.test.ts` | an unrecognised pref name resolves the same as 'follow' when family is %s (×3 families) | edge case 6: unknown/renamed theme name, empty string, case-sensitivity | pass |
| `theme.test.ts` | every registered theme name round-trips regardless of family | a known name always wins over family | pass |
| `theme.test.ts` | `readThemeHint` — null on no hint / malformed JSON / non-object / unknown theme name / bad family / `"follow"` as theme / throwing storage | REQ-11, W10, edge cases 6 & 8 | pass |
| `theme.test.ts` | `writeThemeHint` — writes JSON, round-trips, swallows throwing storage | REQ-11/REQ-12, W10 | pass |
| `protocol.test.ts` | `parsePrefs — theme`: defaults missing key to `"follow"`, parses an opaque name unchanged, rejects non-string, rejects null | W7 | pass |
| `protocol.test.ts` | `parseSnapshot — claudeTheme`: defaults missing key to `{family:"unknown"}`, parses each known family, rejects unknown family / non-object / missing field | W8 | pass |
| `protocol.test.ts` | `parseMessage — claudeTheme`: decodes, decodes each family, ignores unknown top-level fields, rejects unrecognized/missing/non-string family | W9 | pass |
| `ws.test.ts` | routes a `claudeTheme` message to `onClaudeTheme`, not `onSnapshot` (dispatch + each family) | wire-to-handler routing for the new message type | pass |
| `ws.test.ts` | dispatches a `claudeTheme` frame (full socket lifecycle) to `onClaudeTheme` | end-to-end socket→dispatch path | pass |

(Table trimmed to the new coverage; the 606 pre-existing tests plus the 13 fixed fixtures
are unchanged in intent and still pass — full names in the run output below.)

## Not unit-tested (by design, not an implementation bug)

- **`web/src/render/settings.ts`** — DOM/wiring only (dialog open/close/setChecked, radio
  change listener). `web/vitest.config.ts` runs in Node (no jsdom), matching this repo's
  existing pattern: `render/confirm.ts`, the structurally identical prior dialog
  controller, also has no `.test.ts`. Its only extractable pure logic is an unexported
  three-way string-literal guard (`isThemeChoice`), not worth a seam of its own.
  Interaction (radio click → PUT, dialog open/close, INV-7's checked-radio behavior) is
  Playwright's job per `docs/conventions.md` and is covered by `web/e2e/theme.spec.ts`.
- **`main.ts`'s `applyThemeAttributes`/`requestTheme`** — these orchestrate DOM writes
  (`dataset.theme`, `surfaces` fan-out) around the pure `resolveTheme` call; the plan
  already extracted the actual decision logic into `theme.ts` (tested above), which is
  the correct split per conventions ("Unit-test logic... interaction and rendering are
  Playwright's job") — not a violation to report.

## Test Run Output

```
$ cd web && npx tsc --noEmit
(clean, no output)

$ cd web && npm test
 Test Files  22 passed (22)
      Tests  653 passed (653)

$ make web-build
✓ built in 188ms

$ make web-test
 Test Files  22 passed (22)
      Tests  653 passed (653)

$ make contrast
instrument: 43 pairs, 0 failures
dark: 43 pairs, 0 failures
light: 43 pairs, 0 failures
```

# Web Tests: usage-model-bar

**Plan**: usage-model-bar
**Verdict**: pass

## Summary

Tests created: 36 | Passing: 488 (full suite) | Failing: 0

Also fixed 2 tsc compile errors + 7 runtime assertion failures in pre-existing fixtures
(`ws.test.ts`, `protocol.test.ts`) that web-impl flagged as sanctioned breakage from
REQ-8 (`Prefs.usageModel` now required) — these gated `make web-build`/`make web-test`
before any new test could run.

## Fixture Fixes (sanctioned breakage, REQ-8)

| File | Fix |
|------|-----|
| `web/src/ws.test.ts` | Added `usageModel: "Fable"` / `"Opus"` to the two `Prefs` literals (lines 16, 19) that failed `tsc` with TS2741. |
| `web/src/protocol.test.ts` | Added `usageModel: "Fable"` to `validSnapshot.prefs`; updated 6 tests whose expected objects lacked `usageModel` (the parser now always adds the default) — `parses prefs.density '3x2'` (split into an explicit-value test + a new default-value test), `ignores unknown fields inside usage and prefs`, `parses a fully-populated prefs message`, `ignores unknown fields inside prefs`, `parses a snapshot with multiple valid sessions`. |

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `protocol.test.ts` | parses a fully-populated modelScoped list with modelScopedAt/Error/Source | REQ-4/REQ-14 full round-trip | pass |
| `protocol.test.ts` | treats a fully-absent set of the four keys as absent, not synthesized null | additive evolution / pre-plan daemon payload | pass |
| `protocol.test.ts` | parses explicit nulls for all four fields the same as boot state | INV-1 shape | pass |
| `protocol.test.ts` | parses an empty modelScoped list as distinct from null | edge case 4 | pass |
| `protocol.test.ts` | parses each modelScopedError enum value (×3, `it.each`) | REQ-6 | pass |
| `protocol.test.ts` | rejects an unrecognized modelScopedError string | W5 | pass |
| `protocol.test.ts` | rejects the whole message when one modelScoped element is missing displayName | W5 | pass |
| `protocol.test.ts` | rejects the whole message when one modelScoped element has a non-numeric usedPct | W5 | pass |
| `protocol.test.ts` | rejects the whole message when one modelScoped element has a non-string resetsAt | W5 | pass |
| `protocol.test.ts` | rejects the whole message when modelScoped is a non-array, non-null value | W5 | pass |
| `protocol.test.ts` | rejects a non-string modelScopedAt (epoch number) | REQ-4 (client decode is string-only; daemon does epoch/RFC3339) | pass |
| `protocol.test.ts` | rejects a non-string modelScopedSource | REQ-4 | pass |
| `protocol.test.ts` | ignores unknown fields inside one modelScoped element | additive evolution | pass |
| `protocol.test.ts` | parses prefs.density '3x2' alongside an explicit usageModel | REQ-8 | pass |
| `protocol.test.ts` | defaults a missing prefs.usageModel to 'Fable' | REQ-8 default | pass |
| `protocol.test.ts` | rejects a prefs.usageModel that is not a string | REQ-8 | pass |
| `render/masthead.test.ts` | renders unknown with a disabled single-option select when modelScoped is null | REQ-10, no-data-yet state | pass |
| `render/masthead.test.ts` | renders unknown with a disabled select when modelScoped is undefined | pre-plan daemon payload | pass |
| `render/masthead.test.ts` | renders unknown with a disabled select when modelScoped is an empty list | edge case 4 | pass |
| `render/masthead.test.ts` | renders the selected model's bar/percent/resets when present in a non-null list | REQ-9, child order `lbl,bar,num,resets` | pass |
| `render/masthead.test.ts` | applies the warn modifier at or above 60% and omits it below | design-system §5 threshold, boundary 59.9/60 | pass |
| `render/masthead.test.ts` | renders unknown with zero track markup when the pref names an absent model | REQ-10/INV-2 | pass |
| `render/masthead.test.ts` | adds .stale and title = error word while keeping the last-good bar | REQ-11/INV-3 | pass |
| `render/masthead.test.ts` | clears .stale and title on the next error-free render | self-healing | pass |
| `render/masthead.test.ts` | uses each error kind verbatim as the title (×3, `it.each`) | REQ-11 | pass |
| `render/masthead.test.ts` | invokes onSelectModel with the new value on a select change event | REQ-12 | pass |
| `render/masthead.test.ts` | rebuilds from scratch every render pass — known→unknown leaves no stale bar/resets | INV-2 self-healing | pass |
| `api.test.ts` | sends a usageModel-only PUT as its own single field | REQ-8 | pass |
| `api.test.ts` | can send usageModel alongside view/density in one request | REQ-8 | pass |
| `api.test.ts` | decodes a 400 invalid_request for out-of-range usageModel | REQ-8 validation | pass |
| `api.test.ts` | decodes a bare 202 with no body as success (refreshUsage) | REQ-7 | pass |
| `api.test.ts` | decodes a 404 not_found when polling is disabled | REQ-7, edge case 14 | pass |
| `api.test.ts` | decodes a 401 unauthorized error envelope | REQ-7 auth | pass |
| `api.test.ts` | falls back to generic error on malformed error body | REQ-7 | pass |
| `api.test.ts` | never throws on non-JSON error body | REQ-7 | pass |

## Untested by design (per docs/conventions.md's Vitest/Playwright split)

- The `<select>`'s live DOM rendering (actual browser `combobox` role, `aria-busy` timer
  clearing, the refresh button's click wiring in `main.ts`) is Playwright's job —
  covered by `web/e2e/usage-model.spec.ts` (E1-E7, INV-6), already authored.
- `main.ts`'s `requestUsageModel`/refresh-button wiring is glue code, not logic; nothing
  in it met the bar for a pure-module unit test beyond what `api.test.ts` already covers
  at the `refreshUsage`/`putPrefs` call boundary.

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test  (npx vitest run)
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  18 passed (18)
      Tests  488 passed (488)
   Duration  967ms

$ npm run build
> tsc --noEmit && vite build
✓ 30 modules transformed.
dist/index.html                   9.43 kB │ gzip:  2.16 kB
dist/assets/index-wP9f5eDg.css   19.98 kB │ gzip:  4.42 kB
dist/assets/index-BoI-ocAT.js   374.39 kB │ gzip: 96.74 kB │ map: 905.51 kB
✓ built in 308ms
```

No `any` types in any new or edited test file (grepped; only the English word "any" in
prose test names).

## Fix Attempt 1

**Mode**: fix (attempt 1) — review cycle 1, wave 2

**Trigger**: web-impl's Fix Attempt 1 (Critical 1: `<select>` node reuse across render
ticks; Minor 3: disabled placeholder option for an absent pref name) in
`web/src/render/masthead.ts` changed `renderModelWeek`'s behavior in two ways that
required test reconciliation. No review issue was tagged `[web-tests]` directly; this
wave reconciles and extends coverage per the orchestrator's routing.

**Changes made** (`web/src/render/masthead.test.ts`):

1. **Sanctioned breakage fix** — "renders unknown with zero track markup when the
   selected pref names a model absent from a non-null list (REQ-10/INV-2)" (previously
   pinning `optionTexts()` to `["Fable", "Opus"]`) now expects
   `["Sonnet", "Fable", "Opus"]` (the placeholder for the absent pref "Sonnet",
   prepended), plus new assertions that the first option (`select.nodes()[0]`) is
   `disabled` and that `select.value` is `"Sonnet"` — the control shows the pref name
   instead of rendering blank at `selectedIndex -1`.
2. **New node-reuse coverage** — added a sibling describe block,
   `renderModelWeek — node reuse across render passes (review cycle 1, Critical 1)`,
   with five tests:
   - Same option list across two renders (different selection/bucket values) keeps the
     exact same `<select>`/`.num`/`.resets` node instances (`toBe` identity, not just
     `toEqual`), updating only `.value`/`.disabled` and the bucket text in place, with no
     duplicate nodes appended (`el.nodes().length` stays 4).
   - The loading -> loaded transition (`modelScoped: null` -> `modelScoped: [fable]`,
     same single-name option list `["Fable"]`) reuses the same select/num nodes and
     toggles `disabled` from `true` to `false` in place, while the newly-available
     bar/resets are appended without duplicating the select/num.
   - Three consecutive renders of an unchanged bucket leave all four nodes
     (select/bar/num/resets) at the same instances — no duplication under repeated
     steady-state ticks.
   - A genuine option-list change (`["Fable"]` -> `["Fable", "Opus"]`) does replace the
     `<select>` node (`not.toBe`) — the one path still allowed to rebuild.
   - After such a rebuild, the `change` listener is re-wired onto the new node: a stale
     callback captured before the rebuild is never invoked, and the new callback fires
     with the new value.
3. Renamed one pre-existing test title from "rebuilds from scratch every render pass" to
   "rebuilds when the option list changes" — Fix Attempt 1 changed the actual contract
   (rebuild is now conditional on the option-name sequence changing, not unconditional
   every pass); the test's own assertions were already exercising a genuine list change
   (`["Fable"]` -> `["Fable", "Opus"]` via the absent-pref placeholder) so no assertion
   changed, only the misleading title.

No implementation files were touched.

**Distinguishing test bug vs. implementation bug**: the only assertion change was the
one explicitly flagged as sanctioned breakage in web-impl's Fix Attempt 1 log (a direct,
unavoidable consequence of the requested Minor 3 fix — there is no way to show the pref
name instead of a blank control without adding a rendered option for it). All other
changes are additive new coverage; nothing here indicated a mismatch between the
implementation and the plan's requirements.

**Gate**:
- `npx tsc --noEmit` — exits 0, no output.
- `npm test` (`vitest run`) — `Test Files 18 passed (18)`, `Tests 493 passed (493)`
  (488 prior + 5 new node-reuse tests; the sanctioned-breakage test's assertions changed
  in place rather than adding a test). `masthead.test.ts` alone: 45/45 passing, including
  all 5 new node-reuse tests and the updated placeholder test.
- `npm run build` — exits 0, `dist/` produced (30 modules, no tsc errors).

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  18 passed (18)
      Tests  493 passed (493)
   Duration  1.07s

$ npx vitest run src/render/masthead.test.ts --reporter=verbose
 ✓ renderModelWeek (plan usage-model-bar REQ-9/REQ-10/REQ-11/REQ-12, INV-2/INV-3) > renders unknown with zero track markup when the selected pref names a model absent from a non-null list (REQ-10/INV-2)
 ✓ renderModelWeek — node reuse across render passes (review cycle 1, Critical 1) > keeps the same <select> node instance across a re-render with an unchanged option list, updating only .value/.disabled in place
 ✓ renderModelWeek — node reuse across render passes (review cycle 1, Critical 1) > toggles select.disabled in place (true -> false) across the loading -> loaded transition when the option list is unchanged
 ✓ renderModelWeek — node reuse across render passes (review cycle 1, Critical 1) > does not duplicate bar/num/resets nodes across repeated renders of an unchanged bucket
 ✓ renderModelWeek — node reuse across render passes (review cycle 1, Critical 1) > rebuilds a brand-new <select> node when the option list actually changes
 ✓ renderModelWeek — node reuse across render passes (review cycle 1, Critical 1) > re-wires the change listener onto the rebuilt node so onSelectModel still fires after an option-list rebuild
 Test Files  1 passed (1)
      Tests  45 passed (45)

$ npm run build
> tsc --noEmit && vite build
✓ 30 modules transformed.
dist/index.html                   9.43 kB │ gzip:  2.16 kB
dist/assets/index-wP9f5eDg.css   19.98 kB │ gzip:  4.42 kB
dist/assets/index-DkGvWxo1.js   375.31 kB │ gzip: 97.04 kB │ map: 912.81 kB
✓ built in 198ms
```

## Fix Attempt 2

**Verdict**: pass

Review cycle 2, Major 1: the node-reuse cache in `web/src/render/masthead.ts` used to key
on the option-*name* sequence alone. A placeholder-state flip (whether the pref's model is
itself present in the fetched list) can leave the name sequence identical — pref `"Fable"`
against list `[Opus]` (placeholder needed, `names = ["Fable","Opus"]`) collides with pref
`"Fable"` against list `[Fable, Opus]` (no placeholder, `names = ["Fable","Opus"]`) — so
the reuse branch took it for "unchanged" and never re-synced the stale option's `disabled`
flag, permanently locking a live, listed model out of the control. web-impl fixed this by
adding `placeholderNeeded` to the cached `ModelWeekState` and forcing a rebuild whenever it
flips, even when `names` itself is unchanged (`web/src/render/masthead.ts` — `ModelWeekState`,
`renderModelWeek`'s `reuse` check).

Per the review issue (`[web-tests]` item 2) and the orchestrator's fix-mode instructions,
added two cases to the existing "node reuse across render passes" `describe` block in
`web/src/render/masthead.test.ts`, plus the reverse direction:

1. **Forward flip (list gains the pref model)**: render pref `"Fable"` with
   `modelScoped: [opus]` (placeholder needed — `optionTexts()` is `["Fable","Opus"]` with
   the `Fable` option `disabled: true`), then re-render with `modelScoped: [fable, opus]`
   (placeholder no longer needed, same `optionTexts()`). Asserts the select node is
   **rebuilt** (`select2` is `not.toBe(select1)` — identity change, since a placeholder
   flip is being treated as a genuine list change) and that the `Fable` option is now
   `disabled: false` — the fix, verified directly.
2. **Reverse flip (list loses the pref model)**: the same transition run backwards — start
   with `[fable, opus]` (`Fable` option live, `disabled: false`), then drop to `[opus]`
   alone (placeholder now needed again). Asserts the node is again rebuilt (`not.toBe`) and
   the `Fable` option is once more the disabled placeholder (`disabled: true`) — covers the
   direction the review comment's own Edge-Cases-5/6 callout implies but didn't spell out
   verbatim, and confirms the fix isn't one-directional.

Both tests assert node identity (`not.toBe`) alongside the `disabled` value, per the
orchestrator's explicit ask to also cover "a placeholder flip rebuilds the select node" —
matching the existing block's established pattern of checking identity, not just value
equality, for exactly this reason (a value-only assertion wouldn't have caught Major 1 in
the first place, since the bug was that a value was never updated after a **wrongly
reused** node).

Did not touch any implementation file. No test bugs found in the process — both new cases
passed on first run against the already-fixed `masthead.ts`.

**Gate**:
- `npx tsc --noEmit` — exits 0, no output.
- `npm test` (`vitest run`) — `Test Files 18 passed (18)`, `Tests 495 passed (495)` (493
  prior + 2 new placeholder-flip tests).
- `npm run build` — exits 0, `dist/` produced (30 modules, no tsc errors).

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  18 passed (18)
      Tests  495 passed (495)
   Duration  965ms

$ npm run build
> tsc --noEmit && vite build
✓ 30 modules transformed.
dist/index.html                   9.43 kB │ gzip:  2.16 kB
dist/assets/index-wP9f5eDg.css   19.98 kB │ gzip:  4.42 kB
dist/assets/index-Batl3qEh.js   375.36 kB │ gzip: 97.06 kB │ map: 914.18 kB
✓ built in 173ms
```

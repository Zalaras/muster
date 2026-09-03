# Web Tests: fix-auto-mode-select

**Plan**: fix-auto-mode-select
**Verdict**: pass

## Summary

Tests created: 5 | Passing: 5 | Failing: 0
Full web suite: 24 files / 716 tests, all passing (711 pre-existing + 5 new).

**Update (review cycle 1 fix wave)**: see Fix Attempt 1 below — 7 more cases were added for
REQ-6's `permissionModeToCheck`, bringing the suite to 24 files / 723 tests.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `api.test.ts` | `is exactly the four accepted wire values in dialog/cycle order (REQ-1)` | `PERMISSION_MODES` tuple content/order — the single source `api.ts` and `render/launch.ts` share | pass |
| `api.test.ts` | `serialises permissionMode: 'auto' on the request body (REQ-2)` | `launchSession` POST body carries the new value | pass |
| `api.test.ts` | `decodes a 201 Session whose permissionMode was seeded 'auto' (REQ-2/D3)` | response decoding of `{ value: "auto", source: "seed" }` | pass |
| `api.test.ts` | `decodes the 400 invalid_request naming all four accepted values for an unknown permissionMode (D4)` | error envelope decoding for the widened validation message | pass |
| `api.test.ts` | `decodes lastPermissionMode: 'auto' (REQ-4)` | `fetchRepos`/`parseRepo` round-trips the new value through the open-string field | pass |

## REQ-6 unit-testability (explicit call, per team-lead's ask)

**Not covered here — routed to E4 (Playwright), as the plan's own footnote anticipated.**

`selectedPermissionMode()` and `setPermissionMode()` (`web/src/render/launch.ts:103-118`) are
unexported closures inside `initLaunchModal`, operating directly on
`readonly HTMLInputElement[]` via the module-private `checkRadio`/`checkedValue` helpers.
There is no pure module boundary here comparable to `render/crumbs.ts`'s
`splitCrumbs`/`renderCrumbs` split (that file's own test-file comment: *"the DOM half
(renderCrumbs) is Playwright's job... no jsdom is configured here"*) — the REQ-6 fallback
logic (unrecognised/`null` stored value → check `manual`) is only reachable by exercising
real `HTMLInputElement.checked`/`.value` state through `initLaunchModal`'s internal
`resetForm()`/`initOpen()`/click-handler flow, which is interaction+rendering, not logic.

I considered the `FakeDomNode` precedent in `render/masthead.test.ts` (a minimal DOM stand-in
built specifically because, per that file's comment, *"E2E has no test for the [boundary]
asserted below"*). That precedent doesn't apply here: this plan's `E4` acceptance criterion
(`web/e2e/launch.spec.ts`, per the plan's Acceptance Criteria and Testable UI Elements)
already exercises exactly REQ-6's four cases — each stored `lastPermissionMode` in
`default | acceptEdits | plan | auto`, plus the `null`/unrecognised case — pre-selecting the
correct radio. Building a bespoke DOM harness to duplicate that coverage in Vitest would be
the DOM-simulation test suite I was told not to build, with no coverage gain to justify it.

Conclusion: not an implementation bug (the plan's own Affected Files line calls this
"web-tests' call; otherwise E4 covers it," and E4 covers it) — this is the pre-existing
`setModel`/`checkRadio` architecture from an earlier plan, extended in place, not a
regression introduced here. Flagging for the record per the team-lead's request, not as a
blocker.

## Test Run Output

```
> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  24 passed (24)
      Tests  716 passed (716)
   Start at  10:29:34
   Duration  1.33s (transform 2.03s, setup 0ms, import 2.91s, tests 584ms, environment 6ms)
```

`npx tsc --noEmit`: exit 0, no output.
`npm run build`: exit 0 (`tsc --noEmit && vite build`, 38 modules transformed).

## Fix Attempt 1 (review cycle 1)

**Failure addressed**: review.md's `[web-tests]` Major 2 — REQ-6 had zero automated
coverage, and this file's original REQ-6 section (above) was itself wrong. It claimed E4
(`web/e2e/launch.spec.ts`) "already exercises exactly REQ-6's four cases … plus the
`null`/unrecognised case." That is false: e2e-specs independently verified E4 covers only
the four *recognised* `lastPermissionMode` values, and no honest E2E path to an
unrecognised value exists — `POST /api/sessions` validates the enum and
`repos.last_permission_mode` is only ever written from that validated field (review.md
Notes item 4), so the daemon can never hand the browser a value outside
`PERMISSION_MODES`. The plan's routing line ("web-tests' call; otherwise E4 covers it")
therefore resolved to nobody, and I own that miss: I should have checked whether E4 could
actually reach an unrecognised value before citing it as coverage, not just that its loop
existed. **Correcting the record**: the REQ-6 section above (originally written before this
fix wave) is left as-is per the team-lead's instruction not to silently rewrite history;
this Fix Attempt section is the correction.

**What changed**: review.md's Major 1 (`[web-impl]`, landed commit 90a0fc0) extracted the
REQ-6 fallback decision out of the unexported DOM closure into a pure, exported function,
`permissionModeToCheck(stored: string | null): PermissionMode` in `web/src/api.ts:58-60`.
`render/launch.ts`'s `setPermissionMode` (line 105) and `selectedPermissionMode` (line 116)
both now call it directly — no DOM, no fake `HTMLInputElement`, needed to exercise the
decision. That closes the "no pure module boundary" objection the original REQ-6 section
raised (comparing unfavorably to `render/crumbs.ts`'s `splitCrumbs`/`renderCrumbs` split) —
the split now exists.

**Test added**: `web/src/api.test.ts`, new `describe("api — permissionModeToCheck (REQ-6)")`
block (imports `permissionModeToCheck` alongside the existing `PERMISSION_MODES` import):

- `it.each(PERMISSION_MODES)` — each of the four recognised values (`default`,
  `acceptEdits`, `plan`, `auto`) round-trips to itself (4 cases).
- an unrecognised string (`"someFutureMode"`) falls back to `"default"`.
- `null` falls back to `"default"`.
- the empty string falls back to `"default"`.

7 new test cases (4 from `it.each` + 3 fallback cases), matching web-impl's Fix Attempt 1
"For web-tests" handoff verbatim (`api.ts`, four round-trips, unrecognised string, `null`,
empty string).

**Every code path reaching the defect, and how each is now closed**:

1. `setPermissionMode(value)` (`render/launch.ts:104-106`), called from
   `buildRecentButton`'s click handler (`render/launch.ts:162`,
   `setPermissionMode(repo.lastPermissionMode)`) and from `initOpen`'s first-recent
   auto-select (`render/launch.ts:325`, `setPermissionMode(first.lastPermissionMode)`) —
   both pass a `Repo.lastPermissionMode: string | null` straight from the daemon (or, in
   a hand-stubbed `GET /api/repos` response, any string at all) into
   `permissionModeToCheck`. Closed: the round-trip and all-three-fallback cases above
   cover every value this call site can produce, since `setPermissionMode` has no logic of
   its own beyond forwarding to `permissionModeToCheck` then `checkRadio`.
2. `resetForm`'s literal `setPermissionMode("default")` (`render/launch.ts:344`) — always a
   recognised value, covered by the `"default"` case of the `it.each` round-trip.
3. `selectedPermissionMode()` (`render/launch.ts:115-117`), called by `submit()` to build
   the `LaunchRequest` body — reads `checkedValue(elements.permissionModeRadios)` (always
   one of the four radio `value`s, or `null` if none is checked, which cannot happen once
   `setPermissionMode` has run at least once) through the same
   `permissionModeToCheck`. Closed by the same cases: the function has exactly one
   input/output contract regardless of caller.
4. No other call site exists — confirmed by web-impl's Fix Attempt 1 grep
   (`web-implementation.md` lines 58-76), re-run here to check it's still accurate:
   `grep -rn "lastPermissionMode\|permissionModeRadios\|PERMISSION_MODES\|checkRadio" web/src --include="*.ts" | grep -v test` — same four production references as recorded, no drift.

Since `permissionModeToCheck` is now the single decision point for both directions (stored
value → checked radio, checked radio → outgoing `PermissionMode`), testing it directly
covers every caller by construction — no DOM harness needed, and none was built.

**Verification**:
```
$ cd web && npx tsc --noEmit && echo TSC_OK
TSC_OK
$ make web-test
...
 Test Files  24 passed (24)
      Tests  723 passed (723)
$ make web-build
✓ built in 199ms
```

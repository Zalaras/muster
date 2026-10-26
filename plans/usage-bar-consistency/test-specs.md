# E2E Test Specs: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Mode**: validate (attempt 1)
**Pack**: kb: pack 20518 words (budget 30000)
**Verdict**: pass
**Tests created**: 5 new (web/e2e/usage-reset.spec.ts); 1 existing spec adapted (usage-model.spec.ts, 8 tests)
**Live run**: usage-reset.spec.ts 5/5 passing; usage-model.spec.ts 8/8 passing (rebuilt tree)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/usage-reset.spec.ts | pressing Refresh usage makes the 5h and 7d readouts show the endpoint's percentages, not the last status post's (E1) | REQ-1, REQ-2, E1 | Status post puts 5h/7d at 61/23 after the start-up call; endpoint now says 38/52 (+ model 70); clicking Refresh usage shows 38%/52%/70% | ran-green (validate) - 5 passed (14.7s); soak x10: 50 passed (1.3m) |
| web/e2e/usage-reset.spec.ts | Refresh usage activated from the keyboard keeps focus on the same button node while the 5h and 7d readouts update and across a tick (E1, focus) | REQ-1, E1; focusable-control rule | Focus the button, tag the node, press Enter; readouts show endpoint values; after a >1 s hold activeElement is the tagged node | ran-green (validate) - 5 passed (14.7s); soak x10: 50 passed (1.3m) |
| web/e2e/usage-reset.spec.ts | a 100% 5h bar reads unknown the moment its reset passes, then shows the endpoint's value from the reset-time call with no click (E2) | REQ-4, REQ-5, REQ-6, REQ-2, E2 | Start-up call fills 30/40 (REQ-6); status post 100% with reset +8 s, `-usage-poll 1h`; endpoint held; after the reset the 5h readout is unknown (no track, no suffix, 7d untouched), the endpoint saw a call at/after the reset instant with no click; released, 5h 12% and 7d 41% | ran-green (validate) - 5 passed (14.7s); soak x10: 50 passed (1.3m) |
| web/e2e/usage-reset.spec.ts | when the reset-time call fails the 5h bar stays unknown and never goes back to 100%, and the 7d bar keeps its value (E3) | REQ-4, REQ-5, REQ-7, E3 | As E2 with the endpoint answering 500; call made after the reset; model readout carries `unreachable`; 5h still unknown over a 1.5 s hold, never 100%; 7d 55% | ran-green (validate) - 5 passed (14.7s); soak x10: 50 passed (1.3m) |
| web/e2e/usage-reset.spec.ts | a restarted daemon reads unknown until its start-up usage call answers, then shows the endpoint's 5h and 7d with no status post sent (E4) | REQ-6, E4 (+ kb:adr/usage-no-hydration-across-restart) | Restart with the start-up call held: both bars unknown (nothing hydrated from the first run's row); released, 44%/55% with no status post | ran-green (validate) - 5 passed (14.7s); soak x10: 50 passed (1.3m) |
| web/e2e/usage-model.spec.ts | all 8 existing tests (E1, E3–E7, INV-6, Major 1 regression) | usage-model-bar REQ-1..14 (unchanged) | Per-model window journeys, now fed a future reset (see Repairs) | ran-green (validate) - 8 passed (4.9s); soak x10: 80 passed (32.9s) |

## Deleted Tests

None.

## Fixture Changes

- `web/e2e/helpers/usageapi.ts` (additive): `weeklyScopedUsageResponse(windows, buckets?)` takes optional `five_hour`/`seven_day` buckets (`{utilization, resetsAt}`; `null` yields a JSON null window); default unchanged (the capture's 2026-08-30 past-reset pair). New `FAR_FUTURE_RESETS_AT` (2099, measured string form). `FakeUsageAPI.requestTimes` records each request's arrival. Shape traces to kb:fact/usage-api-oauth-shape (`five_hour`/`seven_day`: `{utilization: float, resets_at: RFC3339 with micros and +00:00}`).
- Status posts reuse `envelopedStatusLineFull` (kb:fact/rate-limits-wire-shape: epoch-integer `resets_at`, float `used_percentage`), posted as the measured close pair. No payload builder added.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (call feeds 5h/7d) | E1, E1 (focus), E2 |
| REQ-2 (newest arrival wins per bucket) | E1 (status over start-up call, then call over status), E2 |
| REQ-3 (past-reset never adopted) | not E2E (D3); existing usage-model.spec.ts originally ran with refused past buckets |
| REQ-4 (call at reset) | E2, E3 |
| REQ-5 (past reset reads unknown) | E2, E3; E4 for the post-restart unknown |
| REQ-6 (start-up call fills bars) | E2 (setup assertion), E4 |
| REQ-7 (failed call changes nothing) | E3 |
| REQ-8, REQ-9 (rows, de-dup) | daemon tests D6–D9 (no row oracle exposes `source`/model to E2E) |
| Plan E1–E4 | the five tests above |

## Repairs

Authoring mode; one sanctioned adaptation of an existing spec, not a repair of a red test.

| # | Test | Symptom | Root cause | Fix | Assertion still covers |
|---|------|---------|-----------|-----|------------------------|
| 1 | every test in usage-model.spec.ts using `RESETS_AT` | Would go red under REQ-5: the constant is 2026-09-01, already past against today's clock (2026-10-26), so the per-model readout would read `unknown` | The plan's Existing-tests note says none of usage-model.spec.ts is expected to break, reasoning only about the 5h/7d buckets; REQ-5 explicitly extends past-reset `unknown` to per-model windows | `RESETS_AT` moved to `2099-09-01T13:59:59.522599+00:00` (same measured string form, still an other-day instant so `RESETS_OTHER_DAY` and `expectedResetsText` assertions are unchanged) | All usage-model-bar assertions unchanged (values, suffix, title, stale, select); the delta is REQ-5 / kb:adr/usage-past-reset-reads-unknown |

No assertion was deleted, skipped, or weakened.

## Handoff

- **Plan defect (Existing tests this breaks)**: the plan says `usage-model.spec.ts` is "none expected to break"; its per-model windows carried a 2026-09-01 reset, which REQ-5 renders `unknown`. Fixed in the spec as in Repairs #1; the plan's note is wrong for the per-model bar.
- **Wall clock**: E2 and E3 read `Date.now()` once to place a reset 8 s ahead (the plan's own design: "a few seconds ahead"); no other clock use. E2 relies on `api.hold()` to keep the held-call window observable; the held request must not block the daemon's own shutdown (the fake releases on `stop()`).
- **Focus on Refresh usage**: E1 (focus) asserts the button node and focus survive a keyboard activation, the update and a >1 s tick. Not pinned by the plan beyond "existing, unchanged"; if it red-flags at validate it is a `[web-impl]` finding, not a locator repair.
- No harness-file change is needed (`fixtures.ts`, `daemon.ts` already expose `usagePoll`, `usageApiURL`, `usageTokenContent`, `restart()`).
- No wire shape is unmeasured: `five_hour`/`seven_day` use the capture-faithful `{utilization, resets_at}` form; no `/interface-probe` needed.

## Test Run Output

```
npx playwright test --list: Total: 649 tests in 60 files (usage-reset.spec.ts: 5 tests)
e2e-lint: clean
usage-model.spec.ts: 8 passed (2.8m)
```

## Notes

- All five new tests assert new behaviour and are `collection-only`; E4 and the initial parts of E2/E3 contain assertions true today (unknown), but each ends on an assertion that fails against the current tree (5h/7d percentages from the call, the reset-time call).
- Plan E1 says "5h and 7d readouts show the endpoint's percentages"; the test also asserts the per-model readout (User Flow 2).

## Validate Attempt 1

Rebuilt (`make web-build build`), then ran both specs live from `web/`. No repairs were needed: every test passed on the first run, so no debugging runs were used and no spec edit was made.

- `npm run e2e -- e2e/usage-reset.spec.ts`: `5 passed (14.7s)`
- `npm run e2e -- e2e/usage-model.spec.ts`: `8 passed (4.9s)`
- `npx playwright test --list`: `Total: 649 tests in 60 files`
- `make e2e-soak SPEC=web/e2e/usage-reset.spec.ts N=10`: `50 passed (1.3m)`
- `make e2e-soak SPEC=web/e2e/usage-model.spec.ts N=10`: `80 passed (32.9s)`

No assertion was deleted, skipped, or weakened. No E2E implementation bugs. Handoff items from authoring stand (plan's "none expected to break" note was wrong for the per-model bar; fixed at authoring in usage-model.spec.ts).

## Fix Attempt 1 (review cycle 1)

**Mode**: fix (attempt 1) — coverage task, no `[e2e-specs]` issue tagged. **Verdict**: pass.

Cycle 1's daemon fix rounds every usage-call `resets_at` up to the whole second (kb:adr/usage-call-resets-rounded-up-to-the-second, REQ-9 *Amended*). The gate's two reds (E1, E5 in `web/e2e/usage-model.spec.ts`) computed the expected reset text from the raw instant `2099-09-01T13:59:59.522599+00:00` (expected `15:59 Tue`, product correctly showed `16:00 Tue`).

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | E1 resets suffix; E5 stale keeps last-good reset | Expected `(15:59 Tue)`, received `(16:00 Tue)` | Expectation derived from the unrounded instant; the approved rule shows it rounded up | New `RESETS_INSTANT_ROUNDED = new Date(Math.ceil(Date.parse(RESETS_AT)/1000)*1000)` feeds `expectedResetsText` and the title `clockText` | REQ-9 / masthead-indicators REQ-4/12: still the exact bracketed text and hover HH:MM for the call's instant, now the rounded one (13:59:59.52 -> 14:00:00, so a missing round-up reads 15:59 and fails) |

`usage-reset.spec.ts` and every other spec use whole-second reset instants (`FAR_FUTURE_RESETS_AT` ends `.000000`); the only other fractional value (`MEASURED_PAST_BUCKET`, 2026) is a past reset asserted as unknown, not as text. No new user-facing behaviour was added by web-impl's fix attempts (only an internal `remainingSeconds` reuse).

- `make e2e SPECS='e2e/usage-model.spec.ts e2e/usage-reset.spec.ts'`: `13 passed (16.5s)`
- `npx playwright test --list`: `Total: 649 tests in 60 files`

No assertion was deleted, skipped, or weakened.
